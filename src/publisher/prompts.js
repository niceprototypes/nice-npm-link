/**
 * @fileoverview Version bump prompting
 *
 * Per-package walkthrough driven by recorded bump intent in `.nice/bump.md`.
 * For each iteration, the full candidate table is re-rendered with the
 * current package highlighted, and a 5-option menu is shown:
 *
 *   [1] Accept current      Apply the recommended level, advance
 *   [2] Edit current        Prompt for a specific level, advance
 *   [3] Accept remaining    Apply recommendations to this and every
 *                           remaining pending package, finish
 *   [4] View logs           Print .nice/bump.md entries for current,
 *                           re-prompt (does not advance)
 *   [5] Cancel              Abort the publish
 *
 * Accepted rows replace their entry-count tag with a green ✓ + derived
 * version. Dependents (auto-patched) are never part of this walk.
 *
 * @module publisher/prompts
 */

const { info, warn, cyan, gray, green, yellow } = require("../logger")
const { prompt, promptKey, pkgDir } = require("./helpers")
const { calcVersion } = require("./versioning")
const { readBumpIntent } = require("../bump")

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function enrichWithIntent(candidates) {
  return candidates.map((c) => {
    const { entries, level } = readBumpIntent(pkgDir(c.name))
    return { ...c, intentLevel: level, intentEntries: entries }
  })
}

function recommendedLevel(c) {
  if (c.isNew) return "as-is"
  return c.intentLevel || "patch"
}

function derivedVersion(c, bumpType) {
  if (bumpType === "as-is") return c.localVersion
  return calcVersion(c.localVersion, bumpType)
}

function renderTable(enriched, decisions, currentIdx) {
  info("Publish candidates:")
  for (let i = 0; i < enriched.length; i++) {
    const c = enriched[i]
    const d = decisions.get(c.name)
    const isCurrent = i === currentIdx

    const prefix = isCurrent ? yellow("▶ ") : "  "
    const name = (isCurrent ? yellow : cyan)(c.name.padEnd(24))

    const chosen = d && d.status === "accepted" ? d.bumpType : recommendedLevel(c)
    const next = derivedVersion(c, chosen)
    const arrow = c.isNew ? `${c.localVersion} (new)` : `${c.localVersion} → ${next}`
    const levelTag = c.isNew ? "" : `(${chosen})`

    let trailing
    if (d && d.status === "accepted") {
      trailing = green(`✓ ${next}`)
    } else {
      const count = c.intentEntries.length
      trailing = c.intentLevel
        ? gray(`${count} ${count === 1 ? "entry" : "entries"}`)
        : ""
    }

    info(`${prefix}${name} ${arrow}   ${levelTag}   ${trailing}`)
  }
}

/**
 * Inner prompt for [2] Edit current — asks for a specific level.
 *
 * @param {object} c - Current candidate
 * @returns {Promise<string|null>} bumpType or null to skip
 */
async function promptEditLevel(c) {
  if (c.isNew) {
    const answer = (await promptKey(
      `  ${cyan(c.name)} — new package, [y] accept / [n] skip: `,
      ["y", "Y", "n", "N"]
    )).trim().toLowerCase()
    if (answer === "n") return null
    return "as-is"
  }
  const rec = recommendedLevel(c)
  const answer = (await promptKey(
    `  ${cyan(c.name)} — [p]atch / [m]inor / [M]ajor / [s]kip (rec: ${cyan(rec)}): `,
    ["p", "m", "M", "s"]
  )).trim()
  if (answer === "M") return "major"
  switch (answer) {
    case "": return rec
    case "p": return "patch"
    case "m": return "minor"
    case "s": return null
    default:
      warn(`Unknown option "${answer}"`)
      return null
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Walks the user through each changed candidate with a 5-option menu.
 *
 * @param {object[]} changedCandidates - Packages the user explicitly changed
 * @param {object[]} dependentCandidates - Packages added by graph resolution (auto-patched)
 * @returns {Promise<object[]|null>} Packages to publish with newVersion, or null if aborted
 */
async function promptVersionBumps(changedCandidates, dependentCandidates) {
  const enriched = enrichWithIntent(changedCandidates)
  const decisions = new Map() // name → { status: "pending" | "accepted", bumpType }

  for (const c of enriched) decisions.set(c.name, { status: "pending" })

  let currentIdx = 0

  while (currentIdx < enriched.length) {
    const current = enriched[currentIdx]
    renderTable(enriched, decisions, currentIdx)

    const action = (await promptKey(
      "[1] Accept current  [2] Edit current  [3] Accept remaining  [4] View logs  [5] Cancel: ",
      ["1", "2", "3", "4", "5"]
    )).trim()

    if (action === "5" || action.toLowerCase() === "c" || action.toLowerCase() === "cancel") {
      info("Aborted.")
      return null
    }

    if (action === "4" || action.toLowerCase() === "v") {
      if (current.intentEntries.length > 0) {
        for (const e of current.intentEntries) info(`    ${e.level}: ${e.summary}`)
      }
      continue
    }

    if (action === "3" || action.toLowerCase() === "r") {
      for (let i = currentIdx; i < enriched.length; i++) {
        const c = enriched[i]
        if (decisions.get(c.name).status === "accepted") continue
        decisions.set(c.name, { status: "accepted", bumpType: recommendedLevel(c) })
      }
      currentIdx = enriched.length
      renderTable(enriched, decisions, -1)
      break
    }

    if (action === "2" || action.toLowerCase() === "e") {
      const bumpType = await promptEditLevel(current)
      if (bumpType !== null) {
        decisions.set(current.name, { status: "accepted", bumpType })
      }
      currentIdx++
      continue
    }

    if (action === "1" || action === "" || action.toLowerCase() === "a") {
      decisions.set(current.name, { status: "accepted", bumpType: recommendedLevel(current) })
      currentIdx++
      continue
    }

    warn(`Unknown option "${action}"`)
  }

  // Build the toPublish list from accepted decisions
  const toPublish = []
  for (const c of enriched) {
    const d = decisions.get(c.name)
    if (!d || d.status !== "accepted") continue
    toPublish.push({ ...c, newVersion: derivedVersion(c, d.bumpType), bumpType: d.bumpType })
  }

  // Dependents always auto-patched
  for (const c of dependentCandidates) {
    toPublish.push({ ...c, newVersion: calcVersion(c.localVersion, "patch"), bumpType: "patch" })
  }

  return toPublish
}

module.exports = { promptVersionBumps }