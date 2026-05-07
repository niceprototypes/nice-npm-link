/**
 * @fileoverview Package creation orchestrator
 *
 * Entry point for `ntk --create`. Validates the package name,
 * scaffolds the package by type, and registers it in registry.json.
 *
 * Supported types:
 *   - "component" — nice-react-* package with tokens, types, styles
 *
 * @module creator
 */

const path = require('path');
const fs = require('fs');
const { log, info, success, warn, fail, cyan } = require('../shared/logger');
const { getPackageNames, addPackage, REGISTRY_PATH } = require('../shared/registry');
const { NICE_BASE } = require('../publishing/constants');
const { scaffoldComponent } = require('./component');

/**
 * Validates that a package name follows Nice conventions.
 *
 * Rules:
 *   - Must start with "nice-"
 *   - Component packages must start with "nice-react-"
 *   - Must not already be registered
 *
 * @param {string} name - Proposed package name
 * @param {string} type - Package type ("component")
 * @returns {{ valid: boolean, error?: string }}
 */
function validateName(name, type) {
  if (!name.startsWith('nice-')) {
    return { valid: false, error: 'Package name must start with "nice-"' };
  }

  if (type === 'component' && !name.startsWith('nice-react-')) {
    return { valid: false, error: 'Component packages must start with "nice-react-"' };
  }

  if (getPackageNames().includes(name)) {
    return { valid: false, error: `${name} is already registered in registry.json` };
  }

  // Check if directory already exists on disk — folder drops the "nice-" prefix
  const folderName = name.replace(/^nice-/, '');
  if (fs.existsSync(path.join(NICE_BASE, folderName))) {
    return { valid: false, error: `Directory ~/nice/${folderName} already exists` };
  }

  return { valid: true };
}

/**
 * Adds a package to registry.json in the appropriate tier.
 *
 * Component packages are added to the last tier (standalone)
 * since new components have no nice-react-* dependents by default.
 * The tier can be adjusted manually if the package later becomes
 * a dependency of other packages.
 *
 * @param {string} name - Package name to register
 * @param {string} type - Package type (e.g., "react-component", "foundation")
 * @param {boolean} [sourceAliasable=true] - Whether the package can be source-aliased in Vite
 */
function addToRegistry(name, type, sourceAliasable = true) {
  addPackage({ name, type, sourceAliasable });
  info(`Added ${cyan(name)} to registry.json`);
}

/**
 * Creates a new Nice ecosystem package.
 *
 * Full workflow:
 *   1. Validate the package name and type
 *   2. Scaffold the package directory with all boilerplate
 *   3. Register the package in registry.json
 *   4. Run npm install to resolve dependencies
 *
 * @param {object} options
 * @param {string} options.name - Package name (e.g., "nice-react-lightbox")
 * @param {string} options.type - Package type ("component")
 * @param {boolean} [options.dryRun=false] - Preview mode
 */
function create({ name, type, dryRun = false }) {
  log(`Creating ${cyan(name)} (${type})...\n`);

  // ── Validate ──────────────────────────────────────────────────────────────
  const validation = validateName(name, type);
  if (!validation.valid) {
    fail(validation.error);
    return;
  }

  if (dryRun) {
    info(`Would scaffold ${cyan(name)} as ${type}`);
    info(`Would add to registry.json`);
    info('Dry run — no changes made.');
    return;
  }

  // ── Scaffold ──────────────────────────────────────────────────────────────
  let scaffolded = false;

  switch (type) {
    case 'component':
      scaffolded = scaffoldComponent(name);
      break;
    default:
      fail(`Unknown package type: "${type}". Supported types: component`);
      return;
  }

  if (!scaffolded) return;

  // ── Register ──────────────────────────────────────────────────────────────
  addToRegistry(name, type === 'component' ? 'react-component' : type);

  // ── Install dependencies ──────────────────────────────────────────────────
  const pkgDir = path.join(NICE_BASE, name.replace(/^nice-/, ''));
  try {
    info('Installing dependencies...');
    const { execSync } = require('child_process');
    execSync('npm install', { cwd: pkgDir, stdio: 'ignore' });
    success('Dependencies installed');
  } catch (e) {
    warn(`npm install failed — run it manually in ${pkgDir}`);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('');
  success(`${cyan(name)} is ready`);
  log(`  cd ~/nice/${name.replace(/^nice-/, '')}`);
  log('  npm run dev');
}

module.exports = {
  create,
  validateName,
  addToRegistry,
};