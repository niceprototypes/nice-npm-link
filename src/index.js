/**
 * @fileoverview Main entry point for nice-npm-link
 *
 * Orchestrates the CLI workflow by combining all modules:
 * - Argument parsing
 * - Package manager detection
 * - Package discovery
 * - Conflict cleaning
 * - Linking/unlinking
 *
 * @module nice-npm-link
 */

const path = require('path');
const { DEFAULT_CONFLICTING_PACKAGES, PEER_ENFORCE } = require('./config');
const { log, info, success, warn, fail, cyan, gray } = require('./logger');
const { showUsage, parseArgs } = require('./args');
const { detectPM, isWorkspaceRoot } = require('./pm');
const { pathExists, readJSON } = require('./fs-utils');
const { findAllLinkedPackages, readPkgName, validatePackageDir } = require('./discovery');
const { ensurePeerDeps } = require('./peer-deps');
const { removeConflictsInDir, cleanAllLinkedPackages } = require('./cleaner');
const { linkPackage, unlinkPackages } = require('./linker');
const { startWatching, TRIGGER_FILE_NAME } = require('./watcher');
const { startDevRunner } = require('./dev-runner');
const { publish } = require('./publisher');

// ──────────────────────────────────────────────────────────────────────────────
// CLI Orchestration
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Displays CRA-specific advice if react-scripts is detected
 *
 * @param {string} projectDir - Project directory
 * @private
 */
function showCRAAdvice(projectDir) {
  try {
    const pkgJsonPath = path.join(projectDir, 'package.json');
    const pkg = readJSON(pkgJsonPath);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps['react-scripts']) {
      info('CRA detected. If module resolution errors occur, try:');
      info('  export NODE_OPTIONS=--preserve-symlinks  (bash/zsh)');
      info('  setx NODE_OPTIONS "--preserve-symlinks"  (Windows)');
      return true;
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Shows next steps after successful linking
 *
 * @param {string} resolvedPkgPath - Absolute path to linked package
 * @param {boolean} isCRA - Whether the project uses Create React App
 * @private
 */
function showNextSteps(resolvedPkgPath, isCRA) {
  const pkg = readJSON(path.join(resolvedPkgPath, 'package.json'));
  const hasDevScript = pkg.scripts?.dev;
  const hasWatchScript = pkg.scripts?.['build:watch'];

  log('\nNext steps:');

  if (hasDevScript || hasWatchScript) {
    const watchCmd = hasDevScript ? 'npm run dev' : 'npm run build:watch';
    log(`Run ${cyan(watchCmd)} in ${gray(path.basename(resolvedPkgPath))} for live rebuilding`);
    log(`Edit files in ${gray(path.basename(resolvedPkgPath))} → auto-rebuild → changes appear in your app`);
  } else {
    log(`Run ${cyan('npm run build')} in ${gray(path.basename(resolvedPkgPath))} after making changes`);
  }

  if (isCRA) {
    log(`Restart your dev server with: ${cyan('NODE_OPTIONS=--preserve-symlinks npm start')}`);
  } else {
    log('Restart your dev server if needed');
  }

  log(`To unlink: run ${cyan('npx nice-npm-link --unlink')}`);
}

/**
 * Main entry point for the nice-npm-link CLI tool
 *
 * Orchestrates the entire workflow:
 * 1. Parses command-line arguments
 * 2. Detects or uses specified package manager
 * 3. Routes to appropriate operation (link, unlink, clean-all, clean-only)
 * 4. Provides feedback and next steps
 *
 * @returns {void}
 */
function main() {
  const projectDir = process.cwd();

  // Detect package manager first (needed for arg parsing defaults)
  const detectedPM = detectPM(projectDir);

  // Parse arguments
  const options = parseArgs(process.argv.slice(2), {
    conflictingPackages: DEFAULT_CONFLICTING_PACKAGES,
    pm: detectedPM,
  });

  // Handle help
  if (options.showHelp) {
    showUsage();
    process.exit(0);
  }

  // Log package manager info
  if (options.forcedPM) {
    info(`Using forced package manager: ${cyan(options.pm)}`);
  } else {
    info(`Detected package manager: ${cyan(options.pm)}`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Handle --unlink mode
  // ────────────────────────────────────────────────────────────────────────────
  if (options.unlink) {
    unlinkPackages(options.pm, { dryRun: options.dryRun });
    process.exit(0);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Handle --publish mode
  // ────────────────────────────────────────────────────────────────────────────
  if (options.publish || options.dryPublish) {
    const packages = options.publishPackages
      ? options.publishPackages.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    publish({ packages, dryRun: options.dryPublish || options.dryRun })
      .then(() => process.exit(0))
      .catch((e) => {
        fail(e.message);
        process.exit(1);
      });
    return;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Handle --dev and/or --watch mode
  // ────────────────────────────────────────────────────────────────────────────
  if (options.dev || options.watch) {
    let devController = null;
    let watchController = null;

    // Start dev runner if --dev flag is set
    if (options.dev) {
      devController = startDevRunner(projectDir, { verbose: true });
    }

    // Start watcher if --watch flag is set
    if (options.watch) {
      watchController = startWatching(projectDir, {
        watchDir: options.watchDir,
        verbose: true,
      });
    }

    // Handle graceful shutdown
    const shutdown = () => {
      console.log('');
      if (watchController) watchController.stop();
      if (devController) devController.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep the process running
    return;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Handle --clean-all mode
  // ────────────────────────────────────────────────────────────────────────────
  if (options.cleanAll) {
    cleanAllLinkedPackages(projectDir, options.packagesToRemove, {
      dryRun: options.dryRun,
      skipPeerCheck: options.skipPeerCheck,
      peerEnforce: PEER_ENFORCE,
    });
    process.exit(0);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Handle --clean-only mode
  // ────────────────────────────────────────────────────────────────────────────
  if (options.cleanOnly) {
    if (!options.pkgPath) {
      fail('Provide the linked package path to clean its node_modules');
      process.exit(1);
    }

    const validation = validatePackageDir(options.pkgPath);
    if (!validation.valid) {
      fail(validation.error);
      process.exit(1);
    }

    const resolvedPath = path.resolve(options.pkgPath);

    if (!options.skipPeerCheck) {
      ensurePeerDeps(resolvedPath, PEER_ENFORCE, { dryRun: options.dryRun });
    }

    removeConflictsInDir(resolvedPath, options.packagesToRemove, {
      dryRun: options.dryRun,
    });

    success('Cleanup completed');
    process.exit(0);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Full link flow
  // ────────────────────────────────────────────────────────────────────────────

  // Require package path for linking
  if (!options.pkgPath) {
    fail('Please provide a path to the package you want to link');
    showUsage();
    process.exit(1);
  }

  // Validate package directory
  const validation = validatePackageDir(options.pkgPath);
  if (!validation.valid) {
    fail(validation.error);
    process.exit(1);
  }

  const resolvedPath = path.resolve(options.pkgPath);

  // Warn about workspaces
  if (isWorkspaceRoot(projectDir) && !options.forcedPM) {
    warn('Workspaces detected. Consider using "workspace:" or local file deps instead of linking.');
  }

  // 1. Enforce peer dependencies
  if (!options.skipPeerCheck) {
    ensurePeerDeps(resolvedPath, PEER_ENFORCE, { dryRun: options.dryRun });
  }

  // 2. Remove conflicts from linked package
  removeConflictsInDir(resolvedPath, options.packagesToRemove, {
    dryRun: options.dryRun,
  });

  // 3. Link the package
  const pkgName = readPkgName(resolvedPath);
  linkPackage(options.pm, resolvedPath, pkgName, { dryRun: options.dryRun });

  // 4. Check for CRA and show advice
  const isCRA = showCRAAdvice(projectDir);

  // 5. Clean again (npm install may have reinstalled conflicts)
  removeConflictsInDir(resolvedPath, options.packagesToRemove, {
    dryRun: options.dryRun,
  });

  // 6. Success message and next steps
  success(`Successfully linked ${cyan(pkgName)}!`);
  showNextSteps(resolvedPath, isCRA);
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Main CLI
  main,

  // Re-export commonly used functions for programmatic use
  detectPM,
  findAllLinkedPackages,
  cleanAllLinkedPackages,
  removeConflictsInDir,
  ensurePeerDeps,
  linkPackage,
  unlinkPackages,
  startWatching,
  startDevRunner,

  // Config
  DEFAULT_CONFLICTING_PACKAGES,
  PEER_ENFORCE,
  TRIGGER_FILE_NAME,
};
