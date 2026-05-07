/**
 * @fileoverview JSON read/write helpers with optional caching.
 *
 * @module fs-utils/json
 */

const fs = require('fs');
const { packageJsonCache } = require('./cache');

/**
 * Reads and parses a JSON file synchronously with optional caching.
 *
 * When `useCache` is true (default), the parsed result is cached in memory.
 * Subsequent reads of the same file path will return the cached value,
 * avoiding redundant disk I/O.
 *
 * @param {string} filePath - Absolute path to JSON file
 * @param {object} [options] - Read options
 * @param {boolean} [options.useCache=true] - Whether to use/populate the cache
 * @returns {object} Parsed JSON object
 * @throws {Error} If file cannot be read or contains invalid JSON
 *
 * @example
 * // First read - hits disk and caches result
 * const pkg1 = readJSON('/path/to/package.json');
 *
 * // Second read - returns cached value (no disk I/O)
 * const pkg2 = readJSON('/path/to/package.json');
 *
 * @example
 * // Force fresh read, bypassing cache
 * const freshPkg = readJSON('/path/to/package.json', { useCache: false });
 */
function readJSON(filePath, { useCache = true } = {}) {
  if (useCache && packageJsonCache.has(filePath)) {
    return packageJsonCache.get(filePath);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(content);

  if (useCache) {
    packageJsonCache.set(filePath, parsed);
  }

  return parsed;
}

/**
 * Writes an object to a JSON file with 2-space indentation.
 *
 * Automatically invalidates the cache entry for the written file
 * to ensure subsequent reads get fresh data.
 *
 * @param {string} filePath - Absolute path to output JSON file
 * @param {object} obj - Object to serialize and write
 * @returns {void}
 * @throws {Error} If file cannot be written
 */
function writeJSON(filePath, obj) {
  packageJsonCache.delete(filePath);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

module.exports = { readJSON, writeJSON };