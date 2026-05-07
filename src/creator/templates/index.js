/**
 * @fileoverview File templates for scaffolding new component packages.
 *
 * Sub-modules:
 * - helpers.js   — capitalize, toComponentName, toPrefix
 * - package.js   — packageJson, packageExportsJson, srcIndex
 * - config.js    — tsconfigJson, rollupConfig
 * - component.js — componentFile, typesFile, stylesFile, componentIndex
 * - tokens.js    — getTokenFile, stylesComponentFile, tokensIndex
 *
 * @module creator/templates
 */

const { capitalize, toComponentName, toPrefix } = require('./helpers');
const { packageJson, packageExportsJson, srcIndex } = require('./package');
const { tsconfigJson, rollupConfig } = require('./config');
const {
  componentFile,
  typesFile,
  stylesFile,
  componentIndex,
} = require('./component');
const {
  getTokenFile,
  stylesComponentFile,
  tokensIndex,
} = require('./tokens');

module.exports = {
  capitalize,
  toComponentName,
  toPrefix,
  packageJson,
  tsconfigJson,
  rollupConfig,
  srcIndex,
  componentFile,
  typesFile,
  stylesFile,
  componentIndex,
  getTokenFile,
  stylesComponentFile,
  tokensIndex,
  packageExportsJson,
};
