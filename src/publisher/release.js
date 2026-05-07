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

const { log, info, success, warn, fail } = require("../logger")
const { runShell, pkgDir } = require("./helpers")
const { createOtpManager, isOtpError } = require("./otp")

const MAX_OTP_RETRIES = 3

/**
 * Publishes a single package, retrying on OTP errors up to
 * MAX_OTP_RETRIES times. On retry, the OTP manager is invalidated so the
 * user is re-prompted.
 *
 * Three terminal outcomes:
 * - `{ ok: true }` — publish succeeded
 * - `{ ok: false, fatal: false }` — non-OTP error; caller should record
 *   the failure and continue with the next package
 * - `{ ok: false, fatal: true }` — OTP retries exhausted; auth is broken
 *   so the caller should halt the entire publish phase
 *
 * @param {object} pkg - Built package to publish (`{ name, newVersion }`)
 * @param {ReturnType<typeof createOtpManager>} otp - OTP manager
 * @returns {Promise<{ ok: true } | { ok: false, fatal: boolean }>}
 */
async function publishOnce(pkg, otp) {
  const dir = pkgDir(pkg.name)
  let attempts = 0

  while (attempts <= MAX_OTP_RETRIES) {
    // Force a new prompt on retries (attempts > 0)
    const code = await otp.get(attempts > 0)

    try {
      // --ignore-scripts skips rebuild — packages are already built in the build phase
      runShell(`npm publish --otp=${code} --ignore-scripts --access public`, { cwd: dir })
      success(`Published ${pkg.name}@${pkg.newVersion}`)
      return { ok: true }
    } catch (e) {
      const errMsg = e.message || ""

      if (!isOtpError(errMsg)) {
        fail(`Publish failed for ${pkg.name}: ${errMsg}`)
        return { ok: false, fatal: false }
      }

      attempts++
      otp.invalidate()

      if (attempts > MAX_OTP_RETRIES) {
        fail(`OTP failed ${MAX_OTP_RETRIES} times for ${pkg.name}. Stopping publish phase.`)
        return { ok: false, fatal: true }
      }

      warn(`OTP rejected for ${pkg.name} (attempt ${attempts}/${MAX_OTP_RETRIES}), requesting new code...`)
    }
  }

  // Unreachable — the while-loop returns on every path. This satisfies
  // static analyzers that don't track the exhaustive returns above.
  return { ok: false, fatal: true }
}

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
    const pkg = publishable[pkgIndex]
    const result = await publishOnce(pkg, otp)

    if (result.ok) {
      published.push(pkg.name)
      continue
    }

    failed.push(pkg.name)

    if (result.fatal) {
      // Auth is broken — skip the rest of the queue and surface them as failed.
      const remaining = publishable.slice(pkgIndex + 1)
      for (const r of remaining) {
        warn(`Skipped ${r.name} (publish phase halted)`)
        failed.push(r.name)
      }
      return { published, failed }
    }
  }

  return { published, failed }
}

module.exports = { releasePackages }
