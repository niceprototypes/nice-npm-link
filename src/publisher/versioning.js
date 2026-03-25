/**
 * @fileoverview Version bump utilities
 * @module publisher/versioning
 */

const path = require('path');
const { readJSON, writeJSON, clearCache } = require('../fs-utils');
const { pkgDir } = require('./helpers');

/**
 * Bumps the version in package.json
 *
 * @param {string} name - Package name
 * @param {string} newVersion - New version string
 */
function bumpVersion(name, newVersion) {
  const pkgPath = path.join(pkgDir(name), 'package.json');
  const pkg = readJSON(pkgPath, { useCache: false });
  pkg.version = newVersion;
  writeJSON(pkgPath, pkg);
  clearCache();
}

/**
 * Calculates a new version based on bump type
 *
 * @param {string} current - Current semver version
 * @param {string} type - "patch", "minor", or "major"
 * @returns {string} New version
 */
function calcVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: return current;
  }
}

module.exports = {
  bumpVersion,
  calcVersion,
};