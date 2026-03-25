/**
 * @fileoverview Version bump prompting
 *
 * Walks through changed candidates and prompts for version bump type.
 * Supports accept-all shortcuts and auto-patching of dependents.
 *
 * Flow per candidate:
 * 1. If accept-all is active, use stored bump type (no prompt)
 * 2. Otherwise, prompt the user for a bump type
 * 3. Parse the answer into a bump type or control action (skip/quit)
 * 4. Compute the new version and add to the publish list
 *
 * @module publisher/prompts
 */

const { info, warn, cyan, gray } = require("../logger")
const { prompt } = require("./helpers")
const { calcVersion } = require("./versioning")

/**
 * Parses user input into a bump type and optional accept-all flag.
 *
 * Returns null for skip/unknown, or an object with the resolved bump type
 * and whether accept-all was activated.
 *
 * Input mapping:
 *   p, patch       → patch
 *   m, minor       → minor
 *   M, major       → major
 *   a              → patch  (accept all)
 *   am             → minor  (accept all)
 *   aM             → major  (accept all)
 *   s, skip, ""    → null   (skip this package)
 *
 * @param {string} answer - Raw user input
 * @param {string} packageName - Package name for warning messages
 * @returns {{ bumpType: string, acceptAll: string|null }|null} Parsed result or null to skip
 */
function parseAnswer(answer, packageName) {
  // Case-sensitive checks first — M and aM are major
  if (answer === "M") return { bumpType: "major", acceptAll: null }
  if (answer === "aM") return { bumpType: "major", acceptAll: "major" }

  switch (answer.toLowerCase()) {
    case "p": case "patch":
      return { bumpType: "patch", acceptAll: null }
    case "m": case "minor":
      return { bumpType: "minor", acceptAll: null }
    case "major":
      return { bumpType: "major", acceptAll: null }
    case "s": case "skip": case "":
      return null
    // Accept-all shortcuts — apply bump type to all remaining changed packages
    case "a":
      return { bumpType: "patch", acceptAll: "patch" }
    case "am":
      return { bumpType: "minor", acceptAll: "minor" }
    default:
      warn(`Unknown option "${answer}", skipping ${packageName}`)
      return null
  }
}

/**
 * Resolves a bump type into a new version string.
 *
 * "as-is" means the package is new and keeps its current version.
 * All other bump types (patch/minor/major) compute the next version
 * from the current local version.
 *
 * @param {object} candidate - Package candidate object
 * @param {string} bumpType - "as-is", "patch", "minor", or "major"
 * @returns {object} Candidate enriched with newVersion and bumpType
 */
function resolveVersion(candidate, bumpType) {
  // New packages keep their current version — no bump needed
  if (bumpType === "as-is") {
    return { ...candidate, newVersion: candidate.localVersion }
  }

  const newVersion = calcVersion(candidate.localVersion, bumpType)
  return { ...candidate, newVersion, bumpType }
}

/**
 * Handles prompting for a single new (unpublished) package.
 *
 * New packages only need accept/reject — there's no version to bump.
 * Returns the candidate with newVersion set, or null to skip.
 *
 * @param {object} candidate - Package candidate object
 * @param {string} answer - User's raw input
 * @returns {{ result: object|null, acceptAll: string|null }}
 */
function handleNewPackage(candidate, answer) {
  if (answer === "n") return { result: null, acceptAll: null }

  // "a" on a new package means accept all remaining as-is
  const acceptAll = answer === "a" ? "as-is" : null
  const result = { ...candidate, newVersion: candidate.localVersion }
  return { result, acceptAll }
}

/**
 * Prompts for version bumps on changed packages and auto-patches dependents.
 *
 * For each changed candidate, the user chooses patch/minor/major/skip/quit.
 * The "accept all" shortcut (a, am, aM) applies a bump type to all remaining
 * changed packages without further prompts. Dependents are always auto-patched.
 *
 * @param {object[]} changedCandidates - Packages the user explicitly changed
 * @param {object[]} dependentCandidates - Packages added by graph resolution
 * @returns {Promise<object[]|null>} Packages to publish with newVersion, or null if aborted
 */
async function promptVersionBumps(changedCandidates, dependentCandidates) {
  const toPublish = []
  let acceptAll = null

  for (const c of changedCandidates) {
    // Accept-all active — skip prompting, use stored bump type
    if (acceptAll) {
      toPublish.push(resolveVersion(c, acceptAll))
      continue
    }

    // Prompt format differs for new vs existing packages
    const bumpPrompt = c.isNew
      ? `  ${cyan(c.name)} ${gray(`(${c.localVersion})`)} — [a]ccept all / [Y/n] / [q]uit: `
      : `  ${cyan(c.name)} ${gray(`(${c.localVersion})`)} — [a]ccept all / [p]atch / [m]inor / [M]ajor / [s]kip / [q]uit: `

    const answer = await prompt(bumpPrompt)

    // Quit aborts the entire publish workflow
    if (answer === "q" || answer === "quit") {
      info("Aborted.")
      return null
    }

    // New packages have a simpler accept/reject flow
    if (c.isNew) {
      const { result, acceptAll: newAcceptAll } = handleNewPackage(c, answer)
      if (newAcceptAll) acceptAll = newAcceptAll
      if (result) toPublish.push(result)
      continue
    }

    // Parse answer into bump type for existing packages
    const parsed = parseAnswer(answer, c.name)
    if (!parsed) continue

    if (parsed.acceptAll) acceptAll = parsed.acceptAll
    toPublish.push(resolveVersion(c, parsed.bumpType))
  }

  // Dependents are always auto-patched — their only change is a rebuilt dependency
  for (const c of dependentCandidates) {
    toPublish.push(resolveVersion(c, "patch"))
  }

  return toPublish
}

module.exports = { promptVersionBumps }