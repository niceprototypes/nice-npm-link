/**
 * @fileoverview Shared constants and the entry-line regex for the
 * bump-intent file format.
 *
 * @module bump/constants
 */

const path = require('path');

const BUMP_DIR = '.nice';
const BUMP_FILE = 'bump.md';

const VALID_LEVELS = ['major', 'minor', 'patch'];

// [YYYY-MM-DD HH:MM]?  ✓?  level  :  message
// The ✓ group is parsed for backward compatibility with files written by an
// earlier --commit flow; nothing in the toolkit writes it anymore.
const ENTRY_RE = /^(?:\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s+)?(✓\s+)?(major|minor|patch)\s*:\s*(.+)$/i;

/**
 * Resolves the absolute path to a package's bump file.
 *
 * @param {string} packageDir - Package root (contains package.json)
 * @returns {string} Absolute path to .nice/bump.md
 */
function bumpFilePath(packageDir) {
  return path.join(packageDir, BUMP_DIR, BUMP_FILE);
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
  BUMP_DIR,
  BUMP_FILE,
  VALID_LEVELS,
  ENTRY_RE,
  bumpFilePath,
  bumpFileRelativePath,
};
