/**
 * @fileoverview Publish phase
 *
 * Publishes built packages to npm in rapid succession with reactive OTP management.
 * Packages are already built and deps swapped — each publish only runs
 * npm publish with --ignore-scripts.
 *
 * OTP codes are reused until npm rejects them. On rejection, the user is
 * re-prompted up to MAX_OTP_RETRIES times per package. If retries are
 * exhausted, the remaining packages are skipped (the auth state is broken).
 *
 * @module publisher/release
 */

const { log, info, success, warn, fail, cyan } = require("../logger")
const { runShell, pkgDir } = require("./helpers")
const { createOtpManager, isOtpError } = require("./otp")

const MAX_OTP_RETRIES = 3

/**
 * Publishes packages to npm with reactive OTP management.
 *
 * @param {object[]} publishable - Built packages ready to publish
 * @param {boolean} doPublish - Whether to actually publish to npm
 * @returns {Promise<{ published: string[], failed: string[] }>}
 */
async function releasePackages(publishable, doPublish) {
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

  const otp = createOtpManager()

  for (let pkgIndex = 0; pkgIndex < publishable.length; pkgIndex++) {
    const p = publishable[pkgIndex]
    const dir = pkgDir(p.name)
    let attempts = 0
    let didPublish = false

    while (attempts <= MAX_OTP_RETRIES && !didPublish) {
      // Force a new prompt on retries (attempts > 0)
      const code = await otp.get(attempts > 0)

      try {
        // --ignore-scripts skips rebuild — packages are already built in build phase
        runShell(`npm publish --otp=${code} --ignore-scripts --access public`, { cwd: dir })
        published.push(p.name)
        success(`Published ${p.name}@${p.newVersion}`)
        didPublish = true
      } catch (e) {
        const errMsg = e.message || ""

        if (isOtpError(errMsg)) {
          attempts++
          otp.invalidate()

          if (attempts <= MAX_OTP_RETRIES) {
            warn(`OTP rejected for ${p.name} (attempt ${attempts}/${MAX_OTP_RETRIES}), requesting new code...`)
          } else {
            // Auth state is broken — skip remaining packages
            fail(`OTP failed ${MAX_OTP_RETRIES} times for ${p.name}. Stopping publish phase.`)
            failed.push(p.name)
            const remaining = publishable.slice(pkgIndex + 1)
            for (const r of remaining) {
              warn(`Skipped ${r.name} (publish phase halted)`)
              failed.push(r.name)
            }
            return { published, failed }
          }
        } else {
          fail(`Publish failed for ${p.name}: ${errMsg}`)
          failed.push(p.name)
          break
        }
      }
    }
  }

  return { published, failed }
}

module.exports = { releasePackages }