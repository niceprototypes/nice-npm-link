/**
 * @fileoverview Package directory + version lookups used by the
 * publisher (local + remote).
 *
 * @module publisher/helpers/package
 */

const path = require('path');
const { readJSON } = require('../../shared/fs-utils');
const { NICE_BASE } = require('../constants');
const { runShell } = require('./shell');

/**
 * Resolves the absolute filesystem path for a package.
 *
 * @param {string} name - Package name (e.g. "nice-react-button")
 * @returns {string}
 */
function pkgDir(name) {
  // Folder name drops the "nice-" prefix from the npm package name.
  return path.join(NICE_BASE, name.replace(/^nice-/, ''));
}

/**
 * Returns the published npm version of a package, or `null` when the
 * package has never been published (or `npm view` errors).
 *
 * @param {string} name - Package name
 * @returns {string|null}
 */
function getNpmVersion(name) {
  try {
    return runShell(`npm view ${name} version 2>/dev/null`);
  } catch {
    return null;
  }
}

/**
 * Returns the local version from the package's package.json.
 *
 * @param {string} name - Package name
 * @returns {string}
 */
function getLocalVersion(name) {
  const pkg = readJSON(path.join(pkgDir(name), 'package.json'), { useCache: false });
  return pkg.version;
}

module.exports = { pkgDir, getNpmVersion, getLocalVersion };
