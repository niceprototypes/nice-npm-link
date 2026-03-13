/**
 * @fileoverview Package manager detection and command execution
 *
 * Provides utilities for detecting which package manager is used in a project
 * (npm, yarn, or pnpm) and executing package manager commands.
 *
 * @module pm
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { pathExists } = require('./fs-utils');

// ──────────────────────────────────────────────────────────────────────────────
// Package Manager Detection
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lock file names for each supported package manager
 * @constant {Object<string, string>}
 */
const LOCKFILES = {
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  npm: 'package-lock.json',
};

/**
 * Auto-detects the package manager used in a project
 *
 * Detection is based on the presence of lock files in this priority order:
 * 1. pnpm-lock.yaml → pnpm
 * 2. yarn.lock → yarn
 * 3. package-lock.json or no lockfile → npm (default)
 *
 * @param {string} [cwd=process.cwd()] - Directory to check for lockfiles
 * @returns {'pnpm'|'yarn'|'npm'} Detected package manager (defaults to 'npm')
 *
 * @example
 * // In a project with yarn.lock
 * detectPM('/path/to/project')
 * // => 'yarn'
 *
 * @example
 * // In a project with no lockfile
 * detectPM('/path/to/new-project')
 * // => 'npm'
 */
function detectPM(cwd = process.cwd()) {
  // Check in priority order: pnpm, yarn, then default to npm
  if (pathExists(path.join(cwd, LOCKFILES.pnpm))) {
    return 'pnpm';
  }
  if (pathExists(path.join(cwd, LOCKFILES.yarn))) {
    return 'yarn';
  }
  return 'npm';
}

// ──────────────────────────────────────────────────────────────────────────────
// Command Execution
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Executes a package manager command synchronously
 *
 * Runs the command with inherited stdio (output goes directly to terminal).
 * Throws an error if the command fails.
 *
 * Platform considerations:
 * - On Windows, uses shell mode for proper command resolution
 * - On Unix, runs directly for better performance
 *
 * @param {string} pm - Package manager command ('npm', 'yarn', or 'pnpm')
 * @param {string[]} argv - Command arguments (e.g., ['install'])
 * @param {object} [opts={}] - Additional spawn options
 * @param {string} [opts.cwd] - Working directory for the command
 * @returns {void}
 * @throws {Error} If the command fails or returns a non-zero exit code
 *
 * @example
 * // Run npm install
 * run('npm', ['install']);
 *
 * @example
 * // Run yarn add with options
 * run('yarn', ['add', 'react', '--peer']);
 *
 * @example
 * // Run in a specific directory
 * run('npm', ['install'], { cwd: '/path/to/project' });
 */
function run(pm, argv, opts = {}) {
  const isWindows = process.platform === 'win32';

  const result = spawnSync(pm, argv, {
    stdio: 'inherit',
    shell: isWindows, // Use shell on Windows for .cmd resolution
    ...opts,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const cmd = `${pm} ${argv.join(' ')}`;
    throw new Error(`Command failed with exit code ${result.status}: ${cmd}`);
  }
}

/**
 * Checks if the current directory is a workspace root (monorepo)
 *
 * Workspaces are detected by the presence of a "workspaces" field in package.json.
 * This is used to warn users that they may not need manual linking.
 *
 * Supports:
 * - npm/yarn workspaces (package.json workspaces field)
 * - pnpm workspaces (pnpm-workspace.yaml) - checked separately
 *
 * @param {string} [cwd=process.cwd()] - Directory to check
 * @returns {boolean} True if the directory is a workspace root
 *
 * @example
 * // In a monorepo root
 * isWorkspaceRoot('/path/to/monorepo')
 * // => true
 */
function isWorkspaceRoot(cwd = process.cwd()) {
  const { readJSON } = require('./fs-utils');

  try {
    const pkgJsonPath = path.join(cwd, 'package.json');
    if (!pathExists(pkgJsonPath)) {
      return false;
    }

    const pkg = readJSON(pkgJsonPath);
    return Boolean(pkg.workspaces);
  } catch {
    return false;
  }
}

module.exports = {
  LOCKFILES,
  detectPM,
  run,
  isWorkspaceRoot,
};
