/**
 * @fileoverview Version bump prompting
 *
 * Two-stage flow driven by recorded bump intent in `.nice/bump.md`:
 *
 *   Stage 1 — recommendation digest:
 *     Shows every changed package with its recommended bump level
 *     (derived from the max level across `.nice/bump.md` entries).
 *     Prompt: [A]ccept all / [P]er-package / [V]iew entries / [C]ancel.
 *
 *   Stage 2 — only if the user picks [P]er-package:
 *     For each changed candidate, prompt with the recommended default:
 *     [y] accept recommendation / [p] patch / [m] minor / [M] major /
 *     [s] skip / [v] view entries.
 *
 * Packages with no `.nice/bump.md` entries fall back to a patch default
 * and are surfaced in the digest with "(no intent recorded)".
 *
 * Dependents (auto-patched) are never prompted for.
 *
 * @module publisher/prompts
 */

const { info, warn, cyan, gray } = require("../logger")
const { prompt, pkgDir } = require("./helpers")
const { calcVersion } = require("./versioning")
const { readBumpIntent } = require("../bump")

/**
 * Reads bump intent for every changed candidate and attaches:
 *   - `intentLevel`: "major" | "minor" | "patch" | null
 *   - `intentEntries`: raw entry list for [V]iew
 *
 * @param {object[]} candidates
 * @returns {object[]}
 */
function enrichWithIntent(candidates) {
  return candidates.map((c) => {
    const { entries, level } = readBumpIntent(pkgDir(c.name))
    return { ...c, intentLevel: level, intentEntries: entries }
  })
}

/**
 * Resolves a bump type into a new version string. "as-is" keeps the current
 * version (for new unpublished packages).
 *
 * @param {object} candidate
 * @param {string} bumpType
 * @returns {object}
 */
function resolveVersion(candidate, bumpType) {
  if (bumpType === "as-is") {
    return { ...candidate, newVersion: candidate.localVersion }
  }
  const newVersion = calcVersion(candidate.localVersion, bumpType)
  return { ...candidate, newVersion, bumpType }
}

/**
 * Prints the Stage 1 recommendation digest.
 *
 * @param {object[]} enriched
 */
function printDigest(enriched) {
  info("Recommended bumps (from .nice/bump.md):")
  for (const c of enriched) {
    if (c.isNew) {
      info(`  ${cyan(c.name)} — new package (${c.localVersion})`)
      continue
    }
    const recLevel = c.intentLevel || "patch"
    const nextVersion = calcVersion(c.localVersion, recLevel)
    const count = c.intentEntries.length
    const tag = c.intentLevel
      ? `${count} ${count === 1 ? "entry" : "entries"}`
      : ""
    info(`  ${cyan(c.name.padEnd(24))} ${c.localVersion} → ${nextVersion}   (${recLevel})   ${gray(tag)}`)
  }
}

/**
 * Prints every intent entry, grouped by package.
 *
 * @param {object[]} enriched
 */
function printEntries(enriched) {
  for (const c of enriched) {
    if (!c.intentEntries.length) continue
    info(`  ${cyan(c.name)}:`)
    for (const e of c.intentEntries) {
      info(`    ${e.level}: ${e.summary}`)
    }
  }
}

/**
 * Per-package prompt when the user picks [P]er-package.
 *
 * @param {object} c - Enriched candidate
 * @returns {Promise<{bumpType: string}|null>} null to skip
 */
async function promptPerPackage(c) {
  if (c.isNew) {
    const answer = await prompt(`  ${cyan(c.name)} ${gray(`(${c.localVersion})`)} — new package, [Y/n]: `)
    if (answer === "n") return null
    return { bumpType: "as-is" }
  }

  const rec = c.intentLevel || "patch"
  const answer = await prompt(
    `  ${cyan(c.name)} ${gray(`(${c.localVersion})`)} — rec ${cyan(rec)}: [y] accept / [p]atch / [m]inor / [M]ajor / [s]kip / [v]iew: `
  )

  if (answer === "v" || answer === "view") {
    for (const e of c.intentEntries) info(`    ${e.level}: ${e.summary}`)
    return promptPerPackage(c)
  }

  if (answer === "y" || answer === "") return { bumpType: rec }
  if (answer === "M" || answer === "major") return { bumpType: "major" }

  switch (answer.toLowerCase()) {
    case "p": case "patch": return { bumpType: "patch" }
    case "m": case "minor": return { bumpType: "minor" }
    case "s": case "skip": return null
    default:
      warn(`Unknown option "${answer}", skipping ${c.name}`)
      return null
  }
}

/**
 * Entry point — runs Stage 1 and, if needed, Stage 2.
 *
 * @param {object[]} changedCandidates - Packages the user explicitly changed
 * @param {object[]} dependentCandidates - Packages added by graph resolution
 * @returns {Promise<object[]|null>} Packages to publish with newVersion, or null if aborted
 */
async function promptVersionBumps(changedCandidates, dependentCandidates) {
  const enriched = enrichWithIntent(changedCandidates)

  // Stage 1: digest and top-level prompt
  printDigest(enriched)
  const action = (await prompt("[A]ccept all / [P]er-package / [V]iew entries / [C]ancel: ")).trim()

  if (action === "" || action === "C" || action.toLowerCase() === "c") {
    info("Aborted.")
    return null
  }

  if (action === "V" || action.toLowerCase() === "v") {
    printEntries(enriched)
    return promptVersionBumps(changedCandidates, dependentCandidates)
  }

  const toPublish = []

  if (action === "A" || action.toLowerCase() === "a") {
    // Accept all: new packages as-is, existing packages use recommended level
    for (const c of enriched) {
      const bumpType = c.isNew ? "as-is" : (c.intentLevel || "patch")
      toPublish.push(resolveVersion(c, bumpType))
    }
  } else if (action === "P" || action.toLowerCase() === "p") {
    // Per-package
    for (const c of enriched) {
      const parsed = await promptPerPackage(c)
      if (!parsed) continue
      toPublish.push(resolveVersion(c, parsed.bumpType))
    }
  } else {
    warn(`Unknown option "${action}"`)
    return null
  }

  // Dependents are always auto-patched — their only change is a rebuilt dep
  for (const c of dependentCandidates) {
    toPublish.push(resolveVersion(c, "patch"))
  }

  return toPublish
}

module.exports = { promptVersionBumps }