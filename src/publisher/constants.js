/**
 * @fileoverview Constants for the publish workflow
 *
 * Reads package registry via the registry query service — the single
 * source of truth for which packages belong to the Nice ecosystem.
 *
 * @module publisher/constants
 */

const path = require('path');
const { getTiers, getPackageNames, REGISTRY_PATH } = require('../registry');

/**
 * Base directory for all nice-* packages
 * @constant {string}
 */
const NICE_BASE = path.join(require('os').homedir(), 'Code');

/**
 * Publish order based on dependency chain (bottom to top).
 * Packages at the same tier can be published in any order.
 *
 * @constant {string[][]}
 */
const PUBLISH_TIERS = getTiers();

/**
 * All registered package names in dependency order
 * @constant {string[]}
 */
const ALL_PACKAGES = getPackageNames();

module.exports = {
  PUBLISH_TIERS,
  ALL_PACKAGES,
  NICE_BASE,
  REGISTRY_PATH,
};