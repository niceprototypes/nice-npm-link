/**
 * @fileoverview Scaffolds a new nice-react-* component package
 *
 * Creates the full directory structure, token wrapper, and
 * registers the component token in nice-styles/src/tokens/component.json.
 *
 * Directory structure created:
 *   {packageName}/
 *   ├── package.json
 *   ├── package.exports.json
 *   ├── tsconfig.json
 *   ├── rollup.config.js
 *   └── src/
 *       ├── index.ts
 *       ├── components/{Component}/
 *       │   ├── {Component}.tsx
 *       │   ├── types.ts
 *       │   ├── styles.ts
 *       │   └── index.ts
 *       └── tokens/
 *           ├── get{Component}Token.ts
 *           ├── {Component}Styles.ts
 *           └── index.ts
 *
 * @module creator/component
 */

const path = require('path');
const fs = require('fs');
const { log, info, success, fail, cyan } = require('../shared/logger');
const { NICE_BASE } = require('../publishing/constants');
const templates = require('./templates');

/**
 * Defines the file tree for a component package.
 * Each entry is [relativePath, templateFunction].
 * The component name is interpolated into paths at generation time.
 *
 * @param {string} componentName - PascalCase component name
 * @returns {[string, string][]} Array of [path, content] pairs
 */
function buildFileTree(componentName) {
  return [
      // Root config files
      ["package.json", "packageJson"],
      ["package.exports.json", "packageExportsJson"],
      ["tsconfig.json", "tsconfigJson"],
      ["rollup.config.js", "rollupConfig"],

      // Package entry — initial content matches nice-generate-exports output
      ["src/index.ts", "srcIndex"],
    
      // Component files
      [`src/components/${componentName}/${componentName}.tsx`, "componentFile"],
      [`src/components/${componentName}/types.ts`, "typesFile"],
      [`src/components/${componentName}/styles.ts`, "stylesFile"],
      [`src/components/${componentName}/index.ts`, "componentIndex"],
    
      // Token wrapper files
      [`src/tokens/get${componentName}Token.ts`, "getTokenFile"],
      [`src/tokens/${componentName}Styles.ts`, "stylesComponentFile"],
      ["src/tokens/index.ts", "tokensIndex"],
    ];
}

/**
 * Scaffolds a component package at ~/nice/{folderName} (folder = packageName without "nice-" prefix)
 *
 * Steps:
 *   1. Validate the directory doesn't already exist
 *   2. Derive the PascalCase component name from the package name
 *   3. Generate all directories and files from templates
 *   4. Register an empty token entry in nice-styles/src/tokens/component.json
 *   5. Initialize a git repository
 *
 * @param {string} packageName - Full package name (e.g., "nice-react-lightbox")
 * @returns {boolean} True if successful
 */
function scaffoldComponent(packageName) {
  const componentName = templates.toComponentName(packageName);
  const prefix = templates.toPrefix(componentName);
  // Folder name drops the "nice-" prefix from the npm package name
  const pkgDir = path.join(NICE_BASE, packageName.replace(/^nice-/, ''));

  // Guard — prevent overwriting existing packages
  if (fs.existsSync(pkgDir)) {
    fail(`Directory already exists: ${pkgDir}`);
    return false;
  }

  info(`Scaffolding ${cyan(packageName)} (component: ${componentName})...`);

  // Generate file tree from templates
  const fileTree = buildFileTree(componentName);

  for (const [relativePath, templateName] of fileTree) {
    const fullPath = path.join(pkgDir, relativePath);

    // Ensure parent directory exists — handles nested paths like src/components/X/
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    // Template functions that need the package name receive it,
    // all others receive the component name
    const content = templateName === 'packageJson'
      ? templates[templateName](packageName)
      : templates[templateName](componentName);

    fs.writeFileSync(fullPath, content, 'utf-8');
    info(`  ${relativePath}`);
  }

  // Register the component prefix in nice-styles so getComponentToken() works
  registerComponentToken(prefix);

  // Initialize git — non-fatal if it fails
  try {
    const { execSync } = require('child_process');
    execSync('git init', { cwd: pkgDir, stdio: 'ignore' });
    info('Initialized git repository');
  } catch {
    // git not available or init failed — not blocking
  }

  success(`Created ${cyan(packageName)} at ${pkgDir}`);
  return true;
}

/**
 * Adds an empty token object to nice-styles/src/tokens/component.json
 * under the "day" key. This registers the component prefix so that
 * getComponentToken() can resolve tokens for this component.
 *
 * The entry starts empty — token keys are added as the component
 * defines its design token needs (e.g., zIndex, size, color).
 *
 * Does not modify the "night" key. Night overrides are added manually
 * when mode-aware tokens are needed.
 *
 * @param {string} prefix - Lowercase component prefix (e.g., "lightbox")
 */
function registerComponentToken(prefix) {
  const componentJsonPath = path.join(NICE_BASE, 'styles', 'src', 'tokens', 'component.json');

  if (!fs.existsSync(componentJsonPath)) {
    fail('nice-styles/src/tokens/component.json not found — skipping token registration');
    return;
  }

  const componentJson = JSON.parse(fs.readFileSync(componentJsonPath, 'utf-8'));

  // Only add if not already registered — idempotent
  if (componentJson.day[prefix]) {
    info(`${cyan(prefix)} already exists in component tokens`);
    return;
  }

  componentJson.day[prefix] = {};
  fs.writeFileSync(componentJsonPath, JSON.stringify(componentJson, null, 2) + '\n', 'utf-8');
  info(`Registered ${cyan(prefix)} in nice-styles component tokens`);
}

module.exports = {
  scaffoldComponent,
  registerComponentToken,
};