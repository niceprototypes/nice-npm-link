/**
 * @fileoverview Reverse dependency graph resolution
 *
 * Given explicitly changed packages, resolves all packages that must
 * also be updated by walking the reverse dependency graph (BFS).
 *
 * @module publisher/graph
 */

const path = require('path');
const fs = require('fs');
const { readJSON } = require('../fs-utils');
const { ALL_PACKAGES } = require('./constants');
const { pkgDir } = require('./helpers');

/**
 * Builds a reverse dependency map from all publishable packages.
 * Key = package name, Value = Set of packages that depend on it.
 *
 * Reads each package's package.json and checks dependencies + devDependencies
 * for file: references to other nice-* packages.
 *
 * @returns {Map<string, Set<string>>}
 */
function buildReverseDependencyMap() {
  const reverseMap = new Map();

  for (const name of ALL_PACKAGES) {
    const dir = pkgDir(name);
    try {
      fs.statSync(dir);
    } catch {
      continue;
    }

    try {
      const pkg = readJSON(path.join(dir, 'package.json'), { useCache: false });
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const [depName, depVersion] of Object.entries(allDeps)) {
        if (typeof depVersion !== 'string' || !depVersion.startsWith('file:')) continue;
        if (!ALL_PACKAGES.includes(depName)) continue;

        if (!reverseMap.has(depName)) reverseMap.set(depName, new Set());
        reverseMap.get(depName).add(name);
      }
    } catch {
      // Package has no readable package.json
    }
  }

  return reverseMap;
}

/**
 * Given explicitly changed packages, resolves all packages that must also
 * be updated by walking the reverse dependency graph (BFS).
 *
 * @param {string[]} changedPackages - Packages with actual source changes
 * @returns {{ changed: Set<string>, dependents: Set<string> }}
 */
function resolveAffected(changedPackages) {
  const reverseMap = buildReverseDependencyMap();
  const changed = new Set(changedPackages);
  const all = new Set(changedPackages);
  const queue = [...changedPackages];

  while (queue.length > 0) {
    const current = queue.shift();
    const dependents = reverseMap.get(current) || new Set();

    for (const dep of dependents) {
      if (!all.has(dep)) {
        all.add(dep);
        queue.push(dep);
      }
    }
  }

  const dependents = new Set([...all].filter(p => !changed.has(p)));
  return { changed, dependents };
}

module.exports = {
  buildReverseDependencyMap,
  resolveAffected,
};