/**
 * @fileoverview Bump-level computation across a list of entries.
 *
 * @module bump/level
 */

/**
 * Computes the max bump level across entries.
 *
 * @param {Array<{level: string}>} entries
 * @returns {string|null} "major" | "minor" | "patch" | null
 */
function computeBumpLevel(entries) {
  if (!entries.length) return null;
  if (entries.some((e) => e.level === 'major')) return 'major';
  if (entries.some((e) => e.level === 'minor')) return 'minor';
  return 'patch';
}

module.exports = { computeBumpLevel };
