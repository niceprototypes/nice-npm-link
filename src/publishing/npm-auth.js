/**
 * @fileoverview npm authentication verification
 * @module npm-auth
 */

const { execSync } = require('child_process');
const { info, fail, cyan } = require('../shared/logger');

/**
 * Verifies the user is authenticated with npm.
 * Logs the authenticated username on success, or an error on failure.
 *
 * @returns {boolean} True if authenticated, false if not
 */
function verifyNpmAuth() {
  try {
    const npmUser = execSync('npm whoami 2>/dev/null', { encoding: 'utf8' }).trim();
    info(`npm authenticated as ${cyan(npmUser)}`);
    return true;
  } catch {
    fail('Not logged in to npm. Run `npm login` first.');
    return false;
  }
}

module.exports = {
  verifyNpmAuth,
};