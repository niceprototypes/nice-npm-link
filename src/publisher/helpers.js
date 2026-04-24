/**
 * @fileoverview Shared helper functions for the publish workflow
 * @module publisher/helpers
 */

const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const { readJSON } = require('../fs-utils');
const { NICE_BASE } = require('./constants');

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
 * Prompts for a single keystroke from a fixed accept set. Submits
 * immediately when any `acceptKeys` character is pressed (no Enter
 * needed). Enter alone submits an empty string.
 *
 * Falls back to the line-based `prompt()` when stdin is not a TTY
 * (e.g. piped input in CI) so non-interactive callers still work.
 *
 * @param {string} question - Prompt text
 * @param {string[]} acceptKeys - Keys that auto-submit on first press
 * @returns {Promise<string>} Pressed key, or "" for Enter
 */
function promptKey(question, acceptKeys) {
  const stdin = process.stdin;
  if (!stdin.isTTY) return prompt(question);

  process.stdout.write(question);

  return new Promise((resolve) => {
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = () => {
      stdin.setRawMode(wasRaw || false);
      stdin.removeListener('data', onData);
      stdin.pause();
    };

    const onData = (key) => {
      // Ctrl+C exits the process
      if (key === '\u0003') {
        cleanup();
        process.stdout.write('\n');
        process.exit(130);
      }
      // Enter submits empty string (treated as "recommendation")
      if (key === '\r' || key === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve('');
        return;
      }
      // Matched key — submit immediately
      if (acceptKeys.includes(key)) {
        cleanup();
        process.stdout.write(`${key}\n`);
        resolve(key);
      }
      // Any other key is ignored (no echo, no advance)
    };

    stdin.on('data', onData);
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
 * Checks if a package has changes since its last published version tag.
 * Uses git tag v{npmVersion} as the baseline. If no tag exists, the
 * package is treated as having changes so it isn't invisible to the scanner.
 *
 * @param {string} name - Package name
 * @param {string|null} npmVersion - Currently published npm version
 * @returns {{ commitsSincePublish: number, dirty: number, hasTag: boolean }}
 */
function getChangeStatus(name, npmVersion) {
  const dir = pkgDir(name);
  const dirty = parseInt(run(`cd "${dir}" && git status --porcelain 2>/dev/null | wc -l`), 10);

  // No published version — everything is new
  if (!npmVersion) {
    return { commitsSincePublish: 1, dirty, hasTag: false };
  }

  const tag = `v${npmVersion}`;

  // Check if the tag exists
  try {
    run(`cd "${dir}" && git rev-parse "${tag}" 2>/dev/null`);
  } catch {
    // Tag doesn't exist — treat as changed so the package isn't invisible
    return { commitsSincePublish: 1, dirty, hasTag: false };
  }

  const commitsSincePublish = parseInt(
    run(`cd "${dir}" && git rev-list "${tag}"..HEAD --count 2>/dev/null`),
    10
  );

  return { commitsSincePublish, dirty, hasTag: true };
}

module.exports = {
  prompt,
  promptKey,
  run,
  pkgDir,
  getNpmVersion,
  getLocalVersion,
  getChangeStatus,
};