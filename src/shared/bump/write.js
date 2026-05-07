/**
 * @fileoverview Writing to `.nice/bump.md` — append, clear, and timestamp.
 *
 * @module bump/write
 */

const fs = require('fs');
const path = require('path');
const { BUMP_DIR, VALID_LEVELS, bumpFilePath } = require('./constants');

/**
 * Formats a Date as `[YYYY-MM-DD HH:MM]` using local time.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `[${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}]`;
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

module.exports = { formatTimestamp, appendBumpIntent, clearBumpIntent };
