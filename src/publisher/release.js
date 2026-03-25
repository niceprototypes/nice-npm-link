/**
 * @fileoverview Publish phase
 *
 * Publishes built packages to npm in rapid succession with OTP management.
 * This is the fast phase — packages are already built and deps swapped,
 * so each publish only runs npm publish with --ignore-scripts.
 *
 * @module publisher/release
 */

const { log, info, success, warn, fail, cyan } = require("../logger")
const { run, pkgDir } = require("./helpers")
const { createOtpManager } = require("./otp")

/**
 * Publishes packages to npm with OTP management.
 *
 * Prompts for an OTP code once, then publishes all packages in rapid
 * succession. If the OTP expires mid-run, the user is re-prompted.
 * Failed publishes get one retry with a fresh OTP before being marked failed.
 *
 * @param {object[]} publishable - Built packages ready to publish
 * @param {number} otpWindow - Seconds before re-prompting for OTP
 * @param {boolean} doPublish - Whether to actually publish to npm
 * @returns {Promise<{ published: string[], failed: string[] }>}
 */
async function releasePackages(publishable, otpWindow, doPublish) {
  const published = []
  const failed = []

  if (!doPublish) {
    info("--no-npm: skipping npm publish.")
    for (const p of publishable) {
      published.push(p.name)
    }
    return { published, failed }
  }

  log(`\nPublishing ${publishable.length} package(s)...\n`)

  const otp = createOtpManager(otpWindow)

  for (const p of publishable) {
    const dir = pkgDir(p.name)
    const code = await otp.get()

    try {
      // --ignore-scripts skips rebuild — packages are already built in build phase
      run(`npm publish --otp=${code} --ignore-scripts --access public`, { cwd: dir })
      published.push(p.name)
      success(`Published ${p.name}@${p.newVersion}`)
    } catch (e) {
      const errMsg = e.message || ""

      // OTP expired or rate limited — invalidate and retry with fresh code
      if (errMsg.includes("429") || errMsg.includes("EOTP") || errMsg.includes("one-time password")) {
        otp.invalidate()
        warn(`OTP expired for ${p.name}, requesting new code...`)
        const retryCode = await otp.get()
        try {
          run(`npm publish --otp=${retryCode} --ignore-scripts --access public`, { cwd: dir })
          published.push(p.name)
          success(`Published ${p.name}@${p.newVersion}`)
        } catch (retryErr) {
          fail(`Publish failed for ${p.name}: ${retryErr.message}`)
          failed.push(p.name)
        }
      } else {
        fail(`Publish failed for ${p.name}: ${errMsg}`)
        failed.push(p.name)
      }
    }
  }

  return { published, failed }
}

module.exports = { releasePackages }