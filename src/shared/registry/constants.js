/**
 * @fileoverview Registry path + valid-value constants shared across read,
 * query, and write operations.
 *
 * @module registry/constants
 */

const path = require('path');

/**
 * Path to registry.json (lives at the toolkit package root).
 * @constant {string}
 */
const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'registry.json');

/**
 * Valid package type values.
 * @constant {string[]}
 */
const VALID_TYPES = ['foundation', 'react-component', 'cli', 'plugin'];

/**
 * Group name aliases that map to filter logic in getByGroup.
 * @constant {string[]}
 */
const VALID_GROUPS = ['all', 'react', 'component', 'foundation', 'linkable', 'source-aliasable'];

module.exports = { REGISTRY_PATH, VALID_TYPES, VALID_GROUPS };
