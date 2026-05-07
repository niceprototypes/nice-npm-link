/**
 * @fileoverview Registry file reading + per-entry validation.
 *
 * @module registry/read
 */

const fs = require('fs');
const { REGISTRY_PATH, VALID_TYPES } = require('./constants');

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

module.exports = { readRegistry, validateEntry };
