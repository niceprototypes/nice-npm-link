/**
 * @fileoverview Publish workflow for Nice ecosystem packages
 *
 * Handles the full publish lifecycle:
 * 1. Discover which packages have changed since last npm publish
 * 2. Prompt for version bump decisions
 * 3. Swap file: deps to semver ranges
 * 4. Build and publish in dependency order
 * 5. Restore file: deps for local development
 *
 * @module publisher
 */

const path = require('path');
const { execSync } = require('child_process');
const { readJSON, writeJSON, clearCache } = require('./fs-utils');
const { log, info, success, warn, fail, cyan, gray, green, yellow } = require('./logger');
const readline = require('readline');

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Publish order based on dependency chain (bottom to top).
 * Packages at the same tier can be published in any order.
 *
 * @constant {string[][]}
 */
const PUBLISH_TIERS = [
  ['nice-styles', 'nice-icons', 'nice-configuration', 'nice-npm-link', 'nice-vite-watcher'],
  ['nice-react-styles'],
  ['nice-react-flex', 'nice-react-typography'],
  ['nice-react-icon', 'nice-react-tile'],
  ['nice-react-button'],
  ['nice-react-scroll', 'nice-react-slider', 'nice-react-device-detector', 'nice-react-lightbox'],
];

/**
 * All publishable package names in dependency order
 * @constant {string[]}
 */
const ALL_PACKAGES = PUBLISH_TIERS.flat();

/**
 * Base directory for all nice-* packages
 * @constant {string}
 */
const NICE_BASE = path.join(require('os').homedir(), 'Code');

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Prompts the user for input via stdin
 *
 * @param {string} question - Prompt text
 * @returns {Promise<string>} User's response
 */
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Runs a shell command and returns trimmed stdout
 *
 * @param {string} cmd - Command to execute
 * @param {object} [options] - execSync options
 * @returns {string} Trimmed stdout
 */
function run(cmd, options = {}) {
  return execSync(cmd, { encoding: 'utf8', ...options }).trim();
}

/**
 * Runs a shell command, inheriting stdio for interactive use (e.g., OTP prompts)
 *
 * @param {string} cmd - Command to execute
 * @param {object} [options] - execSync options
 * @returns {void}
 */
function runInteractive(cmd, options = {}) {
  execSync(cmd, { stdio: 'inherit', ...options });
}

/**
 * Gets the directory path for a package
 *
 * @param {string} name - Package name
 * @returns {string} Absolute path
 */
function pkgDir(name) {
  return path.join(NICE_BASE, name);
}

/**
 * Gets the published npm version of a package, or null if unpublished
 *
 * @param {string} name - Package name
 * @returns {string|null} Published version or null
 */
function getNpmVersion(name) {
  try {
    return run(`npm view ${name} version 2>/dev/null`);
  } catch {
    return null;
  }
}

/**
 * Gets the local version from package.json
 *
 * @param {string} name - Package name
 * @returns {string} Local version
 */
function getLocalVersion(name) {
  const pkg = readJSON(path.join(pkgDir(name), 'package.json'), { useCache: false });
  return pkg.version;
}

/**
 * Checks if a package has unpushed commits or dirty files
 *
 * @param {string} name - Package name
 * @returns {{ unpushed: number, dirty: number }}
 */
function getChangeStatus(name) {
  const dir = pkgDir(name);
  const unpushed = parseInt(run(`cd "${dir}" && git log origin/main..HEAD --oneline 2>/dev/null | wc -l`), 10);
  const dirty = parseInt(run(`cd "${dir}" && git status --porcelain 2>/dev/null | wc -l`), 10);
  return { unpushed, dirty };
}

/**
 * Bumps the version in package.json
 *
 * @param {string} name - Package name
 * @param {string} newVersion - New version string
 */
function bumpVersion(name, newVersion) {
  const pkgPath = path.join(pkgDir(name), 'package.json');
  const pkg = readJSON(pkgPath, { useCache: false });
  pkg.version = newVersion;
  writeJSON(pkgPath, pkg);
  clearCache();
}

/**
 * Calculates a new version based on bump type
 *
 * @param {string} current - Current semver version
 * @param {string} type - "patch", "minor", or "major"
 * @returns {string} New version
 */
function calcVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: return current;
  }
}

/**
 * Swaps file: deps to semver ranges for publishing.
 * Returns the original deps so they can be restored.
 *
 * @param {string} name - Package name
 * @returns {Object<string, string>} Original dependency values (file: refs)
 */
function swapFileDepsTfSemver(name) {
  const pkgPath = path.join(pkgDir(name), 'package.json');
  const pkg = readJSON(pkgPath, { useCache: false });
  const originals = {};

  for (const depType of ['dependencies', 'devDependencies']) {
    const deps = pkg[depType];
    if (!deps) continue;

    for (const [depName, depVersion] of Object.entries(deps)) {
      if (typeof depVersion === 'string' && depVersion.startsWith('file:')) {
        originals[`${depType}.${depName}`] = depVersion;
        // Read the target package's current version
        const targetVersion = getLocalVersion(depName);
        deps[depName] = `^${targetVersion}`;
      }
    }
  }

  if (Object.keys(originals).length > 0) {
    writeJSON(pkgPath, pkg);
    clearCache();
  }

  return originals;
}

/**
 * Restores file: deps after publishing
 *
 * @param {string} name - Package name
 * @param {Object<string, string>} originals - Original dependency values from swapFileDepsTfSemver
 */
function restoreFileDeps(name, originals) {
  if (Object.keys(originals).length === 0) return;

  const pkgPath = path.join(pkgDir(name), 'package.json');
  const pkg = readJSON(pkgPath, { useCache: false });

  for (const [key, value] of Object.entries(originals)) {
    const [depType, depName] = key.split('.');
    if (pkg[depType] && pkg[depType][depName]) {
      pkg[depType][depName] = value;
    }
  }

  writeJSON(pkgPath, pkg);
  clearCache();
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Publish Flow
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full publish workflow
 *
 * @param {object} options
 * @param {string[]} [options.packages] - Specific packages to publish (default: all changed)
 * @param {boolean} [options.dryRun=false] - Preview mode
 * @returns {Promise<void>}
 */
async function publish({ packages: requestedPackages, dryRun = false } = {}) {
  log('Scanning packages...\n');

  // ── 1. Discover which packages need publishing ────────────────────────────
  const candidates = [];

  const targetPackages = requestedPackages && requestedPackages.length > 0
    ? requestedPackages
    : ALL_PACKAGES;

  for (const name of targetPackages) {
    const dir = pkgDir(name);
    try {
      require('fs').statSync(dir);
    } catch {
      continue; // Package directory doesn't exist locally
    }

    const localVersion = getLocalVersion(name);
    const npmVersion = getNpmVersion(name);
    const { unpushed, dirty } = getChangeStatus(name);
    const hasChanges = unpushed > 0 || dirty > 0 || localVersion !== npmVersion;

    if (hasChanges || !npmVersion) {
      candidates.push({
        name,
        localVersion,
        npmVersion,
        unpushed,
        dirty,
        isNew: !npmVersion,
      });
    }
  }

  if (candidates.length === 0) {
    info('No packages have changes to publish.');
    return;
  }

  // ── 2. Display candidates and prompt for version bumps ────────────────────
  console.log('');
  log('Packages with changes:\n');

  for (const c of candidates) {
    const status = c.isNew ? yellow('NEW') : `${c.npmVersion} → ${cyan(c.localVersion)}`;
    const changes = [];
    if (c.unpushed > 0) changes.push(`${c.unpushed} unpushed`);
    if (c.dirty > 0) changes.push(`${c.dirty} dirty`);
    console.log(`  ${cyan(c.name)}  ${status}  ${gray(changes.join(', '))}`);
  }

  console.log('');

  const toPublish = [];

  for (const c of candidates) {
    const bumpPrompt = c.isNew
      ? `  ${cyan(c.name)} ${gray(`(${c.localVersion})`)} — publish as-is? [Y/n/q]: `
      : `  ${cyan(c.name)} ${gray(`(${c.localVersion})`)} — [p]atch / [m]inor / [M]ajor / [s]kip / [q]uit: `;

    const answer = await prompt(bumpPrompt);

    if (answer === 'q' || answer === 'quit') {
      info('Aborted.');
      return;
    }

    if (c.isNew) {
      if (answer === 'n') continue;
      toPublish.push({ ...c, newVersion: c.localVersion });
      continue;
    }

    let bumpType;
    switch (answer.toLowerCase()) {
      case 'p': case 'patch': bumpType = 'patch'; break;
      case 'm': case 'minor': bumpType = 'minor'; break;
      case 'major': bumpType = 'major'; break;
      case 's': case 'skip': case '': continue;
      default:
        // Check for uppercase M = major
        if (answer === 'M') { bumpType = 'major'; break; }
        warn(`Unknown option "${answer}", skipping ${c.name}`);
        continue;
    }

    const newVersion = calcVersion(c.localVersion, bumpType);
    toPublish.push({ ...c, newVersion, bumpType });
  }

  if (toPublish.length === 0) {
    info('Nothing to publish.');
    return;
  }

  // ── 3. Sort by dependency order ───────────────────────────────────────────
  const orderMap = new Map();
  let orderIndex = 0;
  for (const tier of PUBLISH_TIERS) {
    for (const name of tier) {
      orderMap.set(name, orderIndex);
    }
    orderIndex++;
  }
  toPublish.sort((a, b) => (orderMap.get(a.name) || 99) - (orderMap.get(b.name) || 99));

  // ── 4. Confirm ────────────────────────────────────────────────────────────
  console.log('');
  log('Publish plan:\n');
  for (const p of toPublish) {
    console.log(`  ${cyan(p.name)}  ${p.localVersion} → ${green(p.newVersion)}`);
  }
  console.log('');

  if (dryRun) {
    info('Dry run — no changes made.');
    return;
  }

  const confirm = await prompt('Proceed? [Y/n]: ');
  if (confirm === 'n' || confirm === 'N') {
    info('Aborted.');
    return;
  }

  // ── 5. Bump versions ─────────────────────────────────────────────────────
  for (const p of toPublish) {
    if (p.newVersion !== p.localVersion) {
      bumpVersion(p.name, p.newVersion);
      info(`Bumped ${p.name} to ${p.newVersion}`);
    }
  }

  // ── 6. Build, swap deps, publish, restore ─────────────────────────────────
  const published = [];
  const failed = [];

  for (const p of toPublish) {
    const dir = pkgDir(p.name);
    console.log('');
    log(`Publishing ${cyan(p.name)}@${p.newVersion}...`);

    // Build
    try {
      const pkg = readJSON(path.join(dir, 'package.json'), { useCache: false });
      if (pkg.scripts && pkg.scripts.build) {
        info('Building...');
        run('npm run build', { cwd: dir });
      }
    } catch (e) {
      fail(`Build failed for ${p.name}: ${e.message}`);
      failed.push(p.name);
      continue;
    }

    // Swap file: deps to semver
    const originals = swapFileDepsTfSemver(p.name);

    // Publish (interactive — allows npm to prompt for OTP)
    try {
      runInteractive('npm publish --ignore-scripts', { cwd: dir });
      published.push(p.name);
      success(`Published ${p.name}@${p.newVersion}`);
    } catch (e) {
      fail(`Publish failed for ${p.name}`);
      failed.push(p.name);
    }

    // Restore file: deps
    restoreFileDeps(p.name, originals);
  }

  // ── 7. Commit and push ────────────────────────────────────────────────────
  console.log('');
  if (published.length > 0) {
    log('Committing version changes...');
    for (const name of published) {
      const dir = pkgDir(name);
      const version = getLocalVersion(name);
      try {
        run(`cd "${dir}" && git add -A && git commit -m "${version}" 2>/dev/null`);
        run(`cd "${dir}" && git push origin main 2>/dev/null`);
        info(`Pushed ${name}@${version}`);
      } catch {
        warn(`Could not commit/push ${name} — commit manually`);
      }
    }
  }

  // ── 8. Summary ────────────────────────────────────────────────────────────
  console.log('');
  if (published.length > 0) {
    success(`Published ${published.length} package(s): ${published.join(', ')}`);
  }
  if (failed.length > 0) {
    fail(`Failed ${failed.length} package(s): ${failed.join(', ')}`);
  }
}

module.exports = {
  publish,
  ALL_PACKAGES,
  PUBLISH_TIERS,
};