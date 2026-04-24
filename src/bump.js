/**
 * @fileoverview Bump-intent storage
 *
 * Each Nice ecosystem package records pending semver intent in a plain-text
 * file at `.nice/bump.md` under the package root. One line per entry, in the
 * form `{level}: {summary}`. Writers append; `nnl --publish` reads and then
 * clears after a successful publish.
 *
 * Plain text was chosen over JSON so merges between branches conflict at the
 * line level rather than on JSON structure, and so `cat`/`grep` trivially
 * surface the pending state.
 *
 * @module bump
 */

const fs = require('fs');
const path = require('path');

const BUMP_DIR = '.nice';
const BUMP_FILE = 'bump.md';

const VALID_LEVELS = ['major', 'minor', 'patch'];

/**
 * Resolves the absolute path to a package's bump file, creating parent
 * directory on demand.
 *
 * @param {string} packageDir - Package root (contains package.json)
 * @returns {string} Absolute path to .nice/bump.md
 */
function bumpFilePath(packageDir) {
  return path.join(packageDir, BUMP_DIR, BUMP_FILE);
}

/**
 * Reads the pending bump intent for a package.
 *
 * @param {string} packageDir - Package root
 * @returns {{ entries: Array<{level: string, summary: string}>, level: string|null }}
 *   entries in file order (oldest first); level is the max across entries
 *   ("major" > "minor" > "patch"), or null if no entries.
 */
function readBumpIntent(packageDir) {
  const filePath = bumpFilePath(packageDir);
  if (!fs.existsSync(filePath)) return { entries: [], level: null };

  const raw = fs.readFileSync(filePath, 'utf8');
  const entries = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(major|minor|patch)\s*:\s*(.+)$/i);
      if (!match) return null;
      return { level: match[1].toLowerCase(), summary: match[2].trim() };
    })
    .filter(Boolean);

  return { entries, level: computeBumpLevel(entries) };
}

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

/**
 * Appends an entry to the package's bump file. Creates the .nice/ folder if
 * missing.
 *
 * @param {string} packageDir - Package root
 * @param {string} level - "major" | "minor" | "patch"
 * @param {string} summary - Short description
 */
function appendBumpIntent(packageDir, level, summary) {
  if (!VALID_LEVELS.includes(level)) {
    throw new Error(`Invalid bump level "${level}". Expected one of: ${VALID_LEVELS.join(', ')}`);
  }
  const trimmed = (summary || '').trim();
  if (!trimmed) {
    throw new Error('Bump summary is required and cannot be empty');
  }

  const dir = path.join(packageDir, BUMP_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = bumpFilePath(packageDir);
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  const line = `${level}: ${trimmed}\n`;
  fs.writeFileSync(filePath, `${existing}${needsNewline ? '\n' : ''}${line}`);
}

/**
 * Clears the bump file (truncates to empty, keeps file present so publishers
 * can detect that the feature was in use).
 *
 * @param {string} packageDir - Package root
 */
function clearBumpIntent(packageDir) {
  const filePath = bumpFilePath(packageDir);
  if (fs.existsSync(filePath)) fs.writeFileSync(filePath, '');
}

/**
 * Returns the relative path (e.g. `.nice/bump.md`) used for git operations and
 * display — callers pass this to `git add`.
 *
 * @returns {string}
 */
function bumpFileRelativePath() {
  return path.join(BUMP_DIR, BUMP_FILE);
}

module.exports = {
  readBumpIntent,
  appendBumpIntent,
  clearBumpIntent,
  computeBumpLevel,
  bumpFilePath,
  bumpFileRelativePath,
  VALID_LEVELS,
};