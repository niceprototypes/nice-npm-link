/**
 * @fileoverview Read-only queries over the registry — name lists, tier
 * lookups, group filters, and the linked-package path map.
 *
 * @module registry/query
 */

const path = require('path');
const os = require('os');
const { VALID_TYPES, VALID_GROUPS } = require('./constants');
const { readRegistry } = require('./read');

/**
 * Returns all package entries as a flat array.
 *
 * @returns {object[]}
 */
function getAllPackages() {
  return readRegistry().tiers.flat();
}

/**
 * Returns all package names as a flat array, in tier order.
 * Backward compatible with the old ALL_PACKAGES constant.
 *
 * @returns {string[]}
 */
function getPackageNames() {
  return getAllPackages().map(e => e.name);
}

/**
 * Returns tiers as string[][] for backward compatibility with PUBLISH_TIERS.
 *
 * @returns {string[][]}
 */
function getTiers() {
  return readRegistry().tiers.map(tier => tier.map(e => e.name));
}

/**
 * Returns a Map from package name → tier index, derived from the
 * registry tiers. O(1) tier lookup for callers that group or sort by
 * tier (e.g. publisher/display.js).
 *
 * @returns {Map<string, number>}
 */
function getTierIndexMap() {
  const tierIndexByName = new Map();
  const tiers = readRegistry().tiers;
  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
    for (const entry of tiers[tierIndex]) {
      tierIndexByName.set(entry.name, tierIndex);
    }
  }
  return tierIndexByName;
}

/**
 * Returns all entries matching a specific type.
 *
 * @param {string} type - One of VALID_TYPES
 * @returns {object[]}
 */
function getByType(type) {
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Invalid type "${type}". Valid types: ${VALID_TYPES.join(', ')}`);
  }
  return getAllPackages().filter(e => e.type === type);
}

/**
 * Returns entries matching a predefined group.
 *
 * Groups:
 * - "all" — every package
 * - "react" / "component" — all react-component type packages
 * - "foundation" — all foundation type packages
 * - "linkable" — packages that get file:-linked into consumers (excludes cli, plugin)
 * - "source-aliasable" — packages where sourceAliasable is true
 *
 * @param {string} group - Group name
 * @returns {object[]}
 */
function getByGroup(group) {
  if (!VALID_GROUPS.includes(group)) {
    throw new Error(`Invalid group "${group}". Valid groups: ${VALID_GROUPS.join(', ')}`);
  }

  const all = getAllPackages();

  switch (group) {
    case 'all':
      return all;
    case 'react':
    case 'component':
      return all.filter(e => e.type === 'react-component');
    case 'foundation':
      return all.filter(e => e.type === 'foundation');
    case 'linkable':
      return all.filter(e => e.type !== 'cli' && e.type !== 'plugin');
    case 'source-aliasable':
      return all.filter(e => e.sourceAliasable === true);
    default:
      return [];
  }
}

/**
 * Returns a package-name-to-absolute-path map for all linkable packages.
 * Used by storybook main.ts and vite configs.
 *
 * @param {string} [basePath] - Override base path. Defaults to registry basePath resolved via homedir.
 * @returns {Record<string, string>}
 */
function getLinkedPackageMap(basePath) {
  const registry = readRegistry();

  // Replace ~ with homedir
  const resolvedBase = basePath || registry.basePath.replace('~', os.homedir());

  const linkable = registry.tiers.flat().filter(e => e.type !== 'cli' && e.type !== 'plugin');
  const map = {};

  for (const entry of linkable) {
    // Folder name drops the "nice-" prefix from the npm package name
    map[entry.name] = path.join(resolvedBase, entry.name.replace(/^nice-/, ''));
  }

  return map;
}

/**
 * Returns an array of package names where sourceAliasable is true.
 * Used by storybook main.ts for Vite source alias configuration.
 *
 * @returns {string[]}
 */
function getSourceAliasableNames() {
  return getAllPackages().filter(e => e.sourceAliasable).map(e => e.name);
}

module.exports = {
  getAllPackages,
  getPackageNames,
  getTiers,
  getTierIndexMap,
  getByType,
  getByGroup,
  getLinkedPackageMap,
  getSourceAliasableNames,
};
