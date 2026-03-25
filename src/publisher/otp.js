/**
 * @fileoverview OTP lifecycle management with configurable expiry
 * @module publisher/otp
 */

const { prompt } = require('./helpers');

/**
 * Manages OTP lifecycle with configurable expiry window.
 * Prompts for a new code when the current one is likely expired.
 *
 * @param {number} windowSeconds - Seconds before considering OTP expired
 * @returns {{ get: () => Promise<string>, invalidate: () => void }}
 */
function createOtpManager(windowSeconds = 30) {
  let code = null;
  let timestamp = 0;

  return {
    /**
     * Returns a valid OTP, prompting if expired or not yet set.
     * @returns {Promise<string>}
     */
    async get() {
      const elapsed = (Date.now() - timestamp) / 1000;
      if (!code || elapsed >= windowSeconds) {
        const label = code ? 'OTP expired, new code' : 'OTP code';
        code = await prompt(`  ${label}: `);
        timestamp = Date.now();
      }
      return code;
    },

    /**
     * Forces re-prompt on next get() (e.g., after a 429 rate limit).
     */
    invalidate() {
      code = null;
      timestamp = 0;
    },
  };
}

module.exports = {
  createOtpManager,
};