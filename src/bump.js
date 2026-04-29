/**
 * @fileoverview Bump-intent storage
 *
 * Each Nice ecosystem package records pending semver intent in a plain-text
 * file at `.nice/bump.md` under the package root. One line per entry, in the
 * form `[ts] {level}: {commit-message}` (the `[ts]` prefix is filled in by
 * the writers below). `ntk --publish` reads every entry, derives the
 * publish commit's subject/body from them, and clears the file on success.
 *
 * The text after the level is treated as a commit message — imperative,
 * user-facing, and self-contained — because `ntk --publish` uses it
 * verbatim as the publish-commit subject (single entry) or as the subject
 * + body bullets (multiple entries).
 *
 * The optional `✓` marker on a line is parsed for backward compatibility
 * with files written by an earlier `ntk --commit` flow; nothing in the
 * current toolkit writes it.
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

// [YYYY-MM-DD HH:MM]?  ✓?  level  :  message
// The ✓ group is parsed for backward compatibility with files written by an
// earlier --commit flow; nothing in the toolkit writes it anymore.
const ENTRY_RE = /^(?:\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s+)?(✓\s+)?(major|minor|patch)\s*:\s*(.+)$/i;

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `[${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}]`;
}

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
    .map((line) => {
      const match = line.match(ENTRY_RE);
      if (!match) return null;
      return {
        timestamp: match[1] || null,
        consumed: Boolean(match[2]),
        level: match[3].toLowerCase(),
        message: match[4].trim(),
      };
    })
    .filter(Boolean);

  return {
    entries,
    level: computeBumpLevel(entries),
  };
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
 * Composes a git commit message from a list of bump entries.
 *
 * Single entry → entry's message becomes the commit subject. No level prefix,
 * because the level is bump intent (consumed at `--publish`), not commit
 * metadata.
 *
 * Multiple entries → first entry's message is the subject, remaining entries
 * become a bulleted body. The blank line between subject and body is required
 * by git's commit message conventions.
 *
 * Used by the publisher to derive the publish-commit's subject + body from
 * the entries that ship in a release.
 *
 * @param {Array<{level: string, message: string}>} entries
 * @returns {string} Commit message ready to pass to `git commit -F`
 */
function composeCommitMessage(entries) {
  if (!entries.length) return '';
  if (entries.length === 1) return entries[0].message;

  const [head, ...rest] = entries;
  const body = rest.map((e) => `- ${e.message}`).join('\n');
  return `${head.message}\n\n${body}`;
}

/**
 * Appends an entry to the package's bump file. Creates the .nice/ folder if
 * missing.
 *
 * @param {string} packageDir - Package root
 * @param {string} level - "major" | "minor" | "patch"
 * @param {string} message - Commit message for this entry
 */
function appendBumpIntent(packageDir, level, message) {
  if (!VALID_LEVELS.includes(level)) {
    throw new Error(`Invalid bump level "${level}". Expected one of: ${VALID_LEVELS.join(', ')}`);
  }
  const trimmed = (message || '').trim();
  if (!trimmed) {
    throw new Error('Bump message is required and cannot be empty');
  }

  const dir = path.join(packageDir, BUMP_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = bumpFilePath(packageDir);
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  const line = `${formatTimestamp(new Date())} ${level}: ${trimmed}\n`;
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
  composeCommitMessage,
  bumpFilePath,
  bumpFileRelativePath,
  formatTimestamp,
  VALID_LEVELS,
};