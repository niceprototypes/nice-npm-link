/**
 * @fileoverview In-memory package.json cache shared by readJSON / writeJSON.
 *
 * Avoids redundant disk reads when traversing the dependency tree —
 * particularly important across the Nice ecosystem where many packages
 * have overlapping `file:` dependencies.
 *
 * @module fs-utils/cache
 */

/**
 * In-memory cache for parsed package.json files.
 *
 * Key: absolute file path
 * Value: parsed JSON object
 *
 * @type {Map<string, object>}
 */
const packageJsonCache = new Map();

/**
 * Clears the package.json cache.
 *
 * Call this after operations that modify package.json files to ensure
 * subsequent reads get fresh data.
 *
 * @returns {void}
 * @example
 * writeJSON('/path/to/package.json', updatedPkg);
 * clearCache(); // Ensure next read gets fresh data
 */
function clearCache() {
  packageJsonCache.clear();
}

module.exports = { packageJsonCache, clearCache };