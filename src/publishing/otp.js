/**
 * @fileoverview Reactive OTP management
 *
 * Holds an OTP code and reuses it until npm rejects it.
 * No timer — re-prompts are driven by actual publish failures.
 *
 * @module publisher/otp
 */

const { prompt } = require('./helpers');

/**
 * Manages OTP lifecycle reactively.
 * Prompts once, reuses the code until invalidated by a publish rejection.
 *
 * @returns {{ get: (forceNew?: boolean) => Promise<string>, invalidate: () => void }}
 */
function createOtpManager() {
  let code = null;

  return {
    /**
     * Returns the current OTP code, prompting if not set or if forceNew is true.
     *
     * @param {boolean} [forceNew=false] - Force a new prompt (after rejection)
     * @returns {Promise<string>}
     */
    async get(forceNew = false) {
      if (!code || forceNew) {
        const label = forceNew ? 'OTP expired, new code' : 'OTP code';
        code = await prompt(`  ${label}: `);
      }
      return code;
    },

    /**
     * Clears the stored code so the next get() will prompt.
     */
    invalidate() {
      code = null;
    },
  };
}

/**
 * Checks whether an npm error message indicates an OTP rejection.
 *
 * @param {string} msg - Error message from npm publish
 * @returns {boolean}
 */
function isOtpError(msg) {
  return msg.includes('429') || msg.includes('EOTP') || msg.includes('one-time password');
}

module.exports = {
  createOtpManager,
  isOtpError,
};