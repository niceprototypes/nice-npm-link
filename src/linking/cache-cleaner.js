/**
 * @fileoverview Build-tool cache removal across consumer projects
 *
 * Webpack (CRA) and Vite cache their dependency analysis in
 * node_modules/.cache and node_modules/.vite respectively. After source
 * changes in linked nice-* packages, these caches keep serving stale
 * resolutions until invalidated. Manual `rm -rf` is the existing
 * workaround; this module wraps it.
 *
 * @module cache-cleaner
 */

const path = require('path');
const fs = require('fs');
const { pathExists, removePath, readDir } = require('../shared/fs-utils');
const { log, info, success, gray } = require('../shared/logger');

// Cache directories created by webpack (CRA) and Vite under node_modules
const CACHE_DIRS = ['.cache', '.vite'];

/**
 * Cleans build-tool caches in a single project directory.
 *
 * @param {string} dir - Project directory containing node_modules
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false]
 * @returns {string[]} Paths that were removed (or would be in dry run)
 */
function cleanCachesInDir(dir, { dryRun = false } = {}) {
  const nodeModules = path.join(dir, 'node_modules');
  if (!pathExists(nodeModules)) return [];

  const removed = [];
  for (const cacheName of CACHE_DIRS) {
    const target = path.join(nodeModules, cacheName);
    if (!pathExists(target)) continue;
    if (!dryRun) removePath(target);
    removed.push(target);
  }
  return removed;
}

/**
 * Walks every immediate subdirectory of the workspace base path and
 * cleans build-tool caches wherever it finds them. nice-* package
 * node_modules normally do not have these caches; only consumer
 * projects (CRA, Vite, etc.) do.
 *
 * @param {string} baseDir - Workspace root (e.g. ~/nice)
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false]
 */
function cleanAllCaches(baseDir, { dryRun = false } = {}) {
  if (!pathExists(baseDir)) {
    log(`Workspace base not found: ${baseDir}`);
    return;
  }

  const entries = readDir(baseDir);
  let totalRemoved = 0;

  for (const entry of entries) {
    const dir = path.join(baseDir, entry);
    if (!fs.statSync(dir).isDirectory()) continue;

    const removed = cleanCachesInDir(dir, { dryRun });
    for (const target of removed) {
      const verb = dryRun ? 'would remove' : 'removed';
      info(`${verb} ${gray(target)}`);
      totalRemoved++;
    }
  }

  if (totalRemoved === 0) {
    log('No build-tool caches found.');
  } else {
    const verb = dryRun ? 'would clean' : 'cleaned';
    success(`${verb} ${totalRemoved} cache director${totalRemoved === 1 ? 'y' : 'ies'}`);
  }
}

module.exports = {
  cleanCachesInDir,
  cleanAllCaches,
};
