/**
 * @fileoverview Reading and parsing `.nice/bump.md` entries.
 *
 * @module bump/parse
 */

const fs = require('fs');
const { ENTRY_RE, bumpFilePath } = require('./constants');
const { computeBumpLevel } = require('./level');

/**
 * Parses one trimmed line into an entry object, or null when the line
 * doesn't match the expected format. Used by readBumpIntent below.
 *
 * @param {string} line
 * @returns {{ timestamp: string|null, consumed: boolean, level: string, message: string } | null}
 */
function parseEntryLine(line) {
  const match = line.match(ENTRY_RE);
  if (!match) return null;
  return {
    timestamp: match[1] || null,
    consumed: Boolean(match[2]),
    level: match[3].toLowerCase(),
    message: match[4].trim(),
  };
}

/**
 * Reads the bump intent for a package.
 *
 * @param {string} packageDir - Package root
 * @returns {{ entries: Array<{timestamp: string|null, level: string, message: string, consumed: boolean}>, level: string|null }}
 *   entries in file order (oldest first); level is the max across all entries
 *   ("major" > "minor" > "patch") — used by `--publish` to compute the version
 *   bump. timestamp is the `YYYY-MM-DD HH:MM` value from the line prefix, or
 *   null for legacy entries written before timestamps were added. consumed
 *   reflects the optional `✓` marker (set by an earlier `--commit` flow that
 *   no longer exists; preserved here so display layers can still surface it).
 */
function readBumpIntent(packageDir) {
  const filePath = bumpFilePath(packageDir);
  if (!fs.existsSync(filePath)) return { entries: [], level: null };

  const raw = fs.readFileSync(filePath, 'utf8');
  const entries = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseEntryLine)
    .filter(Boolean);

  return {
    entries,
    level: computeBumpLevel(entries),
  };
}

module.exports = { readBumpIntent, parseEntryLine };
