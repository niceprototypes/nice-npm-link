/**
 * @fileoverview File system utilities with caching for performance
 *
 * Provides JSON read/write operations with an in-memory cache to avoid
 * redundant disk reads when traversing the dependency tree. This is
 * particularly important for the Nice ecosystem where many packages
 * have overlapping file: dependencies.
 *
 * @module fs-utils
 */

const fs = require('fs');

// ──────────────────────────────────────────────────────────────────────────────
// Package.json Cache
// ──────────────────────────────────────────────────────────────────────────────

/**
 * In-memory cache for parsed package.json files
 *
 * Key: absolute file path
 * Value: parsed JSON object
 *
 * @type {Map<string, object>}
 * @private
 */
const packageJsonCache = new Map();

/**
 * Clears the package.json cache
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

// ──────────────────────────────────────────────────────────────────────────────
// JSON Operations
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reads and parses a JSON file synchronously with optional caching
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
  // Check cache first
  if (useCache && packageJsonCache.has(filePath)) {
    return packageJsonCache.get(filePath);
  }

  // Read from disk
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(content);

  // Cache the result
  if (useCache) {
    packageJsonCache.set(filePath, parsed);
  }

  return parsed;
}

/**
 * Writes an object to a JSON file with 2-space indentation
 *
 * Automatically invalidates the cache entry for the written file
 * to ensure subsequent reads get fresh data.
 *
 * @param {string} filePath - Absolute path to output JSON file
 * @param {object} obj - Object to serialize and write
 * @returns {void}
 * @throws {Error} If file cannot be written
 *
 * @example
 * const pkg = readJSON('/path/to/package.json');
 * pkg.version = '2.0.0';
 * writeJSON('/path/to/package.json', pkg);
 */
function writeJSON(filePath, obj) {
  // Invalidate cache before writing
  packageJsonCache.delete(filePath);

  // Write with consistent formatting
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

/**
 * Checks if a path exists on the filesystem
 *
 * Thin wrapper around fs.existsSync for consistency and potential
 * future enhancements (e.g., caching existence checks).
 *
 * @param {string} filePath - Path to check
 * @returns {boolean} True if path exists
 *
 * @example
 * if (pathExists('/path/to/package.json')) {
 *   const pkg = readJSON('/path/to/package.json');
 * }
 */
function pathExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Removes a file or directory recursively
 *
 * Equivalent to `rm -rf` on Unix systems. Safe to call on non-existent paths.
 *
 * @param {string} targetPath - Path to remove
 * @returns {void}
 * @throws {Error} If removal fails (e.g., permission denied)
 *
 * @example
 * // Remove a package from node_modules
 * removePath('/project/node_modules/react');
 */
function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

/**
 * Removes a single file
 *
 * Idempotent — missing files are not an error. Use removePath for
 * directories.
 *
 * @param {string} filePath - File path to remove
 * @returns {void}
 *
 * @example
 * removeFile('/project/.symlink-trigger.js');
 */
function removeFile(filePath) {
  fs.rmSync(filePath, { force: true });
}

/**
 * Creates a directory and all parent directories if they don't exist
 *
 * Equivalent to `mkdir -p` on Unix systems.
 *
 * @param {string} dirPath - Directory path to create
 * @returns {void}
 *
 * @example
 * ensureDir('/project/.nice-toolkit');
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Reads the contents of a directory
 *
 * @param {string} dirPath - Directory to read
 * @returns {string[]} Array of filenames in the directory
 * @throws {Error} If directory cannot be read
 */
function readDir(dirPath) {
  return fs.readdirSync(dirPath);
}

/**
 * Removes an empty directory
 *
 * @param {string} dirPath - Directory to remove
 * @returns {void}
 * @throws {Error} If directory is not empty or cannot be removed
 */
function removeEmptyDir(dirPath) {
  fs.rmdirSync(dirPath);
}

module.exports = {
  // Cache management
  clearCache,

  // JSON operations
  readJSON,
  writeJSON,

  // Path operations
  pathExists,
  removePath,
  removeFile,
  ensureDir,
  readDir,
  removeEmptyDir,
};
