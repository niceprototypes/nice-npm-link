/**
 * @fileoverview Package-metadata helpers — currently just package-name lookup.
 *
 * @module fs-utils/package
 */

const fs = require('fs');
const path = require('path');

/**
 * Reads the npm package name from a package directory.
 *
 * Falls back to the directory basename when package.json is missing or
 * unreadable, so callers always get something meaningful for logging.
 *
 * @param {string} pkgPath - Absolute path to a package directory
 * @returns {string} The `name` field from package.json, or the directory basename
 */
function getPackageName(pkgPath) {
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf-8')
    );
    return pkgJson.name || path.basename(pkgPath);
  } catch {
    return path.basename(pkgPath);
  }
}

module.exports = { getPackageName };