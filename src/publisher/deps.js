/**
 * @fileoverview Dependency swapping for publish (file: ↔ semver)
 * @module publisher/deps
 */

const path = require('path');
const { readJSON, writeJSON, clearCache } = require('../fs-utils');
const { pkgDir, getLocalVersion } = require('./helpers');

/**
 * Swaps file: deps to semver ranges for publishing.
 * Returns the original deps so they can be restored.
 *
 * @param {string} name - Package name
 * @returns {Object<string, string>} Original dependency values (file: refs)
 */
function swapFileDepsToSemver(name) {
  const pkgPath = path.join(pkgDir(name), 'package.json');
  const pkg = readJSON(pkgPath, { useCache: false });
  const originals = {};

  for (const depType of ['dependencies', 'devDependencies']) {
    const deps = pkg[depType];
    if (!deps) continue;

    for (const [depName, depVersion] of Object.entries(deps)) {
      if (typeof depVersion === 'string' && depVersion.startsWith('file:')) {
        originals[`${depType}.${depName}`] = depVersion;
        // Read the target package's current version
        const targetVersion = getLocalVersion(depName);
        deps[depName] = `^${targetVersion}`;
      }
    }
  }

  if (Object.keys(originals).length > 0) {
    writeJSON(pkgPath, pkg);
    clearCache();
  }

  return originals;
}

/**
 * Restores file: deps after publishing
 *
 * @param {string} name - Package name
 * @param {Object<string, string>} originals - Original dependency values from swapFileDepsToSemver
 */
function restoreFileDeps(name, originals) {
  if (Object.keys(originals).length === 0) return;

  const pkgPath = path.join(pkgDir(name), 'package.json');
  const pkg = readJSON(pkgPath, { useCache: false });

  for (const [key, value] of Object.entries(originals)) {
    const [depType, depName] = key.split('.');
    if (pkg[depType] && pkg[depType][depName]) {
      pkg[depType][depName] = value;
    }
  }

  writeJSON(pkgPath, pkg);
  clearCache();
}

module.exports = {
  swapFileDepsToSemver,
  restoreFileDeps,
};