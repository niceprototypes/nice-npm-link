/**
 * @fileoverview Mutating registry operations — currently just addPackage.
 *
 * @module registry/write
 */

const fs = require('fs');
const { REGISTRY_PATH } = require('./constants');
const { readRegistry, validateEntry } = require('./read');

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

module.exports = { addPackage };
