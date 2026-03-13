/**
 * @fileoverview Package linking and unlinking operations
 *
 * Provides functions for linking local packages using the file: protocol
 * and restoring original npm versions when unlinking.
 *
 * The file: protocol is preferred over npm link because:
 * - More reliable across package managers
 * - Works better with modern bundlers (webpack, vite)
 * - Easier to track which packages are linked
 * - Supports the Nice ecosystem's interconnected packages
 *
 * @module linker
 */

const path = require('path');
const {
  readJSON,
  writeJSON,
  pathExists,
  ensureDir,
  readDir,
  removeEmptyDir,
  removePath,
} = require('./fs-utils');
const { log, info, success, fail, cyan } = require('./logger');
const { run } = require('./pm');
const { BACKUP_DIR_NAME, BACKUP_FILE_NAME } = require('./config');

// ──────────────────────────────────────────────────────────────────────────────
// Version Backup
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Gets the backup file path for a project
 *
 * @param {string} projectDir - Project directory path
 * @returns {string} Path to the backup file
 * @private
 */
function getBackupPath(projectDir) {
  return path.join(projectDir, BACKUP_DIR_NAME, BACKUP_FILE_NAME);
}

/**
 * Stores the original package version before linking
 *
 * Saves the original npm version so it can be restored when unlinking.
 * Creates the backup directory if it doesn't exist.
 *
 * @param {string} projectDir - Project directory path
 * @param {string} pkgName - Package name being linked
 * @param {string} version - Original version from package.json
 * @returns {void}
 *
 * @example
 * storeOriginalVersion('/path/to/project', 'nice-react-button', '^3.2.0');
 */
function storeOriginalVersion(projectDir, pkgName, version) {
  const backupDir = path.join(projectDir, BACKUP_DIR_NAME);
  ensureDir(backupDir);

  const backupFile = getBackupPath(projectDir);
  let backup = {};

  if (pathExists(backupFile)) {
    backup = readJSON(backupFile, { useCache: false });
  }

  backup[pkgName] = version;
  writeJSON(backupFile, backup);

  info(`Stored original version: ${cyan(pkgName)}@${version}`);
}

/**
 * Retrieves stored original versions
 *
 * @param {string} projectDir - Project directory path
 * @returns {Object<string, string>|null} Map of package names to versions, or null if no backup
 */
function getStoredVersions(projectDir) {
  const backupFile = getBackupPath(projectDir);

  if (!pathExists(backupFile)) {
    return null;
  }

  return readJSON(backupFile, { useCache: false });
}

/**
 * Cleans up the backup directory after unlinking
 *
 * @param {string} projectDir - Project directory path
 * @private
 */
function cleanupBackup(projectDir) {
  const backupFile = getBackupPath(projectDir);
  const backupDir = path.join(projectDir, BACKUP_DIR_NAME);

  if (pathExists(backupFile)) {
    removePath(backupFile);
  }

  if (pathExists(backupDir) && readDir(backupDir).length === 0) {
    removeEmptyDir(backupDir);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Linking Operations
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Links a local package to the current project using the file: protocol
 *
 * This function:
 * 1. Backs up the original version (if any)
 * 2. Updates package.json with file: protocol
 * 3. Runs npm/yarn/pnpm install
 *
 * Using file: protocol is more reliable than npm link because:
 * - It's tracked in package.json (visible to team members)
 * - Works consistently across package managers
 * - Better bundler compatibility
 *
 * @param {string} pm - Package manager to use ('npm', 'yarn', or 'pnpm')
 * @param {string} pkgDir - Absolute path to the package directory to link
 * @param {string} pkgName - Name of the package being linked
 * @param {object} [options] - Options object
 * @param {boolean} [options.dryRun=false] - If true, only logs what would happen
 * @returns {void}
 * @throws {Error} If package.json is not found in the current directory
 *
 * @example
 * linkPackage('npm', '/path/to/nice-react-button', 'nice-react-button');
 */
function linkPackage(pm, pkgDir, pkgName, { dryRun = false } = {}) {
  if (dryRun) {
    info(`[dry-run] Would link ${cyan(pkgName)} via file: protocol`);
    return;
  }

  const projectDir = process.cwd();
  const packageJsonPath = path.join(projectDir, 'package.json');

  if (!pathExists(packageJsonPath)) {
    throw new Error('package.json not found in current directory');
  }

  const packageJson = readJSON(packageJsonPath, { useCache: false });
  const relativePath = path.relative(projectDir, pkgDir);

  // Store original version if it exists and isn't already a file: link
  const originalVersion =
    packageJson.dependencies?.[pkgName] || packageJson.devDependencies?.[pkgName];

  if (originalVersion && !originalVersion.startsWith('file:')) {
    storeOriginalVersion(projectDir, pkgName, originalVersion);
  }

  // Update package.json with file: protocol
  packageJson.dependencies = packageJson.dependencies || {};
  packageJson.dependencies[pkgName] = `file:${relativePath}`;

  writeJSON(packageJsonPath, packageJson);
  success(`Updated package.json with file: protocol for ${cyan(pkgName)}`);

  // Install the file dependency
  run(pm, ['install']);
  success(`Installed ${cyan(pkgName)} via file: protocol`);
}

/**
 * Unlinks packages and restores their original npm versions
 *
 * This function:
 * 1. Reads the backup file to find original versions
 * 2. Restores each package to its original version in package.json
 * 3. Runs npm install to fetch from registry
 * 4. Cleans up the backup file
 *
 * @param {string} pm - Package manager to use ('npm', 'yarn', or 'pnpm')
 * @param {object} [options] - Options object
 * @param {boolean} [options.dryRun=false] - If true, only logs what would happen
 * @returns {{ unlinkedCount: number }} Number of packages unlinked
 *
 * @example
 * unlinkPackages('npm');
 * // Restores all linked packages to their original npm versions
 */
function unlinkPackages(pm, { dryRun = false } = {}) {
  const projectDir = process.cwd();
  const packageJsonPath = path.join(projectDir, 'package.json');

  const backup = getStoredVersions(projectDir);
  if (!backup) {
    fail('No linked packages found. Nothing to unlink.');
    process.exit(1);
  }

  const packageJson = readJSON(packageJsonPath, { useCache: false });
  let unlinkedCount = 0;

  for (const [pkgName, originalVersion] of Object.entries(backup)) {
    const currentVersion =
      packageJson.dependencies?.[pkgName] || packageJson.devDependencies?.[pkgName];

    if (currentVersion && currentVersion.startsWith('file:')) {
      if (dryRun) {
        info(`[dry-run] Would restore ${pkgName} to ${originalVersion}`);
        unlinkedCount++;
      } else {
        // Restore to original version
        if (packageJson.dependencies?.[pkgName]) {
          packageJson.dependencies[pkgName] = originalVersion;
        } else if (packageJson.devDependencies?.[pkgName]) {
          packageJson.devDependencies[pkgName] = originalVersion;
        }
        success(`Restored ${cyan(pkgName)} to ${originalVersion}`);
        unlinkedCount++;
      }
    }
  }

  if (!dryRun && unlinkedCount > 0) {
    writeJSON(packageJsonPath, packageJson);
    success('Updated package.json');

    log('Installing packages from npm...');
    run(pm, ['install']);
    success('Installed packages from npm');

    // Clean up backup
    cleanupBackup(projectDir);

    success(`Unlinked ${unlinkedCount} package(s)`);
  } else if (!dryRun) {
    info('No linked packages to unlink');
  }

  return { unlinkedCount };
}

module.exports = {
  storeOriginalVersion,
  getStoredVersions,
  linkPackage,
  unlinkPackages,
};
