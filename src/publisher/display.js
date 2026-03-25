/**
 * @fileoverview Candidate display formatting
 *
 * Prints discovered package candidates grouped by publish tier,
 * with aligned columns. Package name color signals readiness:
 * - Green: all changes committed, ready to publish
 * - Yellow: has uncommitted changes, needs attention
 *
 * @module publisher/display
 */

const { cyan, gray, green, yellow } = require("../logger")
const { PUBLISH_TIERS } = require("./constants")

/**
 * Pads a string to a fixed width.
 * ANSI escape codes are excluded from the width calculation
 * so colored strings align correctly.
 *
 * @param {string} str - String to pad (may contain ANSI codes)
 * @param {number} width - Target visible width
 * @returns {string} Padded string
 */
function pad(str, width) {
  // Strip ANSI codes to measure visible length
  const visible = str.replace(/\x1b\[\d+m/g, "")
  const diff = width - visible.length
  return diff > 0 ? str + " ".repeat(diff) : str
}

/**
 * Prints candidates grouped by their publish tier with aligned columns.
 *
 * Package name color indicates readiness:
 * - Green name: all changes committed, ready to publish
 * - Yellow name: uncommitted changes exist, needs attention
 *
 * Additional columns:
 * - Version: "New" or npm → local
 * - Uncommitted count (yellow, only shown when > 0)
 * - Dependent tag (gray, for graph-resolved packages)
 *
 * @param {object[]} candidates - Package candidate objects from scan
 */
function displayCandidates(candidates) {
  // Compute column widths from data for alignment
  const maxName = Math.max(...candidates.map(c => c.name.length))
  const maxVersion = Math.max(...candidates.map(c => {
    if (c.isNew) return 3 // "New"
    return `${c.npmVersion} → ${c.localVersion}`.length
  }))

  // Build tier lookup: package name → tier index
  const tierMap = new Map()
  for (let t = 0; t < PUBLISH_TIERS.length; t++) {
    for (const name of PUBLISH_TIERS[t]) {
      tierMap.set(name, t)
    }
  }

  // Group candidates by tier, preserving tier order
  const byTier = new Map()
  for (const c of candidates) {
    const tier = tierMap.get(c.name) ?? 99
    if (!byTier.has(tier)) byTier.set(tier, [])
    byTier.get(tier).push(c)
  }

  for (const [tier, pkgs] of [...byTier.entries()].sort((a, b) => a[0] - b[0])) {
    const label = `Tier ${tier}`
    console.log(`  ${gray(`── ${label} ──`)}`)
    for (const c of pkgs) {
      // Name color signals readiness — green if clean, yellow if uncommitted
      const nameColor = c.dirty > 0 ? yellow : green
      const name = pad(nameColor(c.name), maxName)

      // Version column
      const versionRaw = c.isNew
        ? "New"
        : `${c.npmVersion} → ${c.localVersion}`
      const version = c.isNew
        ? pad(yellow(versionRaw), maxVersion)
        : pad(`${c.npmVersion} → ${cyan(c.localVersion)}`, maxVersion)

      // Status column — show state only when version has changed
      const versionChanged = c.localVersion !== c.npmVersion
      let status = ""
      if (c.dirty > 0) {
        status = yellow(`${c.dirty} uncommitted`)
      } else if (versionChanged) {
        status = green("committed")
      }

      const dependent = c.isDependent ? gray(" (dependent)") : ""

      console.log(`  ${name}  ${version}  ${status}${dependent}`)
    }
    console.log("")
  }
}

module.exports = { displayCandidates }