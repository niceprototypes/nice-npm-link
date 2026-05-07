/**
 * @fileoverview Query service for the Nice ecosystem package registry
 *
 * Single entry point for reading and querying registry.json. All consumers
 * (publisher, creator, storybook) import from this module instead of
 * reading the raw JSON directly.
 *
 * @module registry
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Path to registry.json
 * @constant {string}
 */
const REGISTRY_PATH = path.join(__dirname, '..', 'registry.json');

/**
 * Valid package type values
 * @constant {string[]}
 */
const VALID_TYPES = ['foundation', 'react-component', 'cli', 'plugin'];

/**
 * Group name aliases that map to filter logic
 * @constant {string[]}
 */
const VALID_GROUPS = ['all', 'react', 'component', 'foundation', 'linkable', 'source-aliasable'];

// ──────────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Validates a single registry entry. Throws on invalid data.
 *
 * @param {object} entry - Registry entry to validate
 * @param {number} tierIndex - Tier index for error context
 * @throws {Error} If the entry is malformed
 */
function validateEntry(entry, tierIndex) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`registry.json tier ${tierIndex}: entry must be an object, got ${typeof entry}`);
  }

  if (typeof entry.name !== 'string' || !entry.name.startsWith('nice-')) {
    throw new Error(`registry.json tier ${tierIndex}: "name" must be a string starting with "nice-", got "${entry.name}"`);
  }

  if (!VALID_TYPES.includes(entry.type)) {
    throw new Error(`registry.json tier ${tierIndex}: "${entry.name}" has invalid type "${entry.type}". Valid types: ${VALID_TYPES.join(', ')}`);
  }

  if (typeof entry.sourceAliasable !== 'boolean') {
    throw new Error(`registry.json tier ${tierIndex}: "${entry.name}" has invalid sourceAliasable "${entry.sourceAliasable}". Must be a boolean.`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Core Read
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reads and validates registry.json. Returns the raw parsed object.
 * Bypasses require() cache so edits during a session are picked up.
 *
 * @returns {{ basePath: string, tiers: object[][] }}
 * @throws {Error} If any entry fails validation
 */
function readRegistry() {
  const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));

  for (let tierIndex = 0; tierIndex < raw.tiers.length; tierIndex++) {
    for (const entry of raw.tiers[tierIndex]) {
      validateEntry(entry, tierIndex);
    }
  }

  return raw;
}

// ──────────────────────────────────────────────────────────────────────────────
// Query Functions
// ──────────────────────────────────────────────────────────────────────────────

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
 * - "react" — all react-component type packages
 * - "component" — alias for "react"
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

  // Resolve basePath — replace ~ with homedir
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

// ──────────────────────────────────────────────────────────────────────────────
// Write Functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Adds a package entry to the last tier in registry.json.
 * Validates the entry before writing.
 *
 * @param {object} entry - Package entry { name, type, sourceAliasable }
 * @param {number} [tierIndex] - Target tier. Defaults to the last tier.
 * @throws {Error} If the entry is invalid or the package already exists
 */
function addPackage(entry, tierIndex) {
  validateEntry(entry, tierIndex ?? -1);

  const registry = readRegistry();
  const allNames = registry.tiers.flat().map(e => e.name);

  if (allNames.includes(entry.name)) {
    throw new Error(`${entry.name} is already registered in registry.json`);
  }

  const targetTier = tierIndex ?? registry.tiers.length - 1;

  if (targetTier < 0 || targetTier >= registry.tiers.length) {
    throw new Error(`Tier index ${targetTier} is out of range (0-${registry.tiers.length - 1})`);
  }

  registry.tiers[targetTier].push(entry);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  REGISTRY_PATH,
  VALID_TYPES,
  VALID_GROUPS,

  // Core
  readRegistry,
  validateEntry,

  // Query
  getAllPackages,
  getPackageNames,
  getTiers,
  getTierIndexMap,
  getByType,
  getByGroup,
  getLinkedPackageMap,
  getSourceAliasableNames,

  // Write
  addPackage,
};