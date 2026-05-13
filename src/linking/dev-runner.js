/**
 * @fileoverview Runs dev scripts in all linked packages concurrently
 *
 * Discovers all file: linked packages and runs their `npm run dev` scripts
 * in parallel. This rebuilds packages on source changes, enabling hot-reload
 * workflows for local development.
 *
 * @module dev-runner
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { findAllLinkedPackages } = require('./discovery');
const { getPackageName } = require('../shared/fs-utils');
const { log, info, success, warn, cyan, gray } = require('../shared/logger');

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ANSI color codes for terminal output
 * @constant {string[]}
 */
const COLORS = [
  '\x1b[36m', // cyan
  '\x1b[33m', // yellow
  '\x1b[35m', // magenta
  '\x1b[32m', // green
  '\x1b[34m', // blue
  '\x1b[31m', // red
];

const RESET = '\x1b[0m';

// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Checks if a package has a dev script
 *
 * @param {string} pkgPath - Absolute path to package
 * @returns {boolean} True if package has a dev script
 */
function hasDevScript(pkgPath) {
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf-8')
    );
    return Boolean(pkgJson.scripts?.dev);
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Dev Runner
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Spawns a dev process for a single package
 *
 * @param {string} pkgPath - Absolute path to package
 * @param {string} color - ANSI color code for output
 * @returns {{ name: string, process: ChildProcess } | null} Process info or null if failed
 */
function spawnDevProcess(pkgPath, color) {
  const pkgName = getPackageName(pkgPath);

  if (!hasDevScript(pkgPath)) {
    warn(`No dev script in ${pkgName} - skipping`);
    return null;
  }

  const label = pkgName.replace('nice-', '').padEnd(20);
  const prefix = `${color}[${label}]${RESET} `;

  // `detached: true` puts the child in its own process group so the
  // controller can signal the whole tree (npm + rollup -c -w) with one
  // call to `process.kill(-pid, ...)` on shutdown. Without it, SIGTERM
  // reaches only the immediate `npm` and the rollup watcher gets
  // reparented to launchd as a long-lived orphan.
  //
  // `shell: false` (default) makes npm the direct child instead of
  // putting `/bin/sh -c "..."` between us and it — eliminates one
  // signal-propagation layer.
  const child = spawn('npm', ['run', 'dev'], {
    cwd: pkgPath,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line) => process.stdout.write(`${prefix}${line}\n`));
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line) => process.stderr.write(`${prefix}${line}\n`));
  });

  child.on('error', (err) => {
    console.error(`${prefix}Failed to start: ${err.message}`);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`${prefix}Exited with code ${code}`);
    }
  });

  return { name: pkgName, process: child };
}

/**
 * Dev runner options
 * @typedef {object} DevRunnerOptions
 * @property {boolean} [verbose=false] - Log detailed information
 */

/**
 * Starts dev scripts in all linked packages
 *
 * @param {string} projectDir - Project root directory
 * @param {DevRunnerOptions} [options={}] - Runner configuration
 * @returns {{ stop: () => void, processes: Array }} Controller to stop all processes
 *
 * @example
 * const controller = startDevRunner('/path/to/my-app');
 * // Later...
 * controller.stop();
 */
function startDevRunner(projectDir, options = {}) {
  const { verbose = false } = options;

  // Find all linked packages
  const linkedPackages = findAllLinkedPackages(projectDir);

  if (linkedPackages.size === 0) {
    warn('No linked packages found. Nothing to run.');
    return { stop: () => {}, processes: [] };
  }

  // Filter to only packages with dev scripts
  const packages = Array.from(linkedPackages).filter((pkgPath) => {
    if (!hasDevScript(pkgPath)) {
      const pkgName = getPackageName(pkgPath);
      info(`Skipping ${pkgName} (no dev script)`);
      return false;
    }
    return true;
  });

  if (packages.length === 0) {
    warn('No packages have dev scripts. Nothing to run.');
    return { stop: () => {}, processes: [] };
  }

  // Log what we're running
  log(`Running dev scripts in ${cyan(packages.length)} linked packages:\n`);
  packages.forEach((pkgPath) => {
    const pkgName = getPackageName(pkgPath);
    console.log(`  ${gray('•')} ${pkgName}`);
  });
  console.log('');

  // Start dev processes
  const processes = [];

  packages.forEach((pkgPath, index) => {
    const color = COLORS[index % COLORS.length];
    const proc = spawnDevProcess(pkgPath, color);
    if (proc) {
      processes.push(proc);
    }
  });

  success(`Started ${processes.length} dev processes. Press Ctrl+C to stop.\n`);

  // Return controller
  return {
    processes,
    stop() {
      for (const { name, process: child } of processes) {
        if (verbose) {
          info(`Stopping ${name}...`);
        }
        // Negative pid signals the entire process group created by
        // `detached: true` — npm AND its rollup grandchild both receive
        // SIGTERM, so neither survives as an orphan.
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          // Already dead, or no group (race) — fall back to the direct
          // child kill so we still try.
          try { child.kill('SIGTERM'); } catch { /* gone */ }
        }
      }
      info('Stopped all dev processes');
    },
  };
}

module.exports = {
  startDevRunner,
  hasDevScript,
};
