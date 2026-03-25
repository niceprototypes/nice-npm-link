/**
 * @fileoverview Post-publish finalization
 *
 * Restores file: deps, commits version changes, creates git tags
 * for publish tracking, pushes to remote, and prints summary.
 *
 * @module publisher/finalize
 */

const { log, info, success, warn, fail } = require("../logger")
const { run, pkgDir, getLocalVersion } = require("./helpers")
const { restoreFileDeps } = require("./deps")

/**
 * Restores file: deps for all packages that had deps swapped.
 *
 * @param {Map<string, object>} swappedDeps - Map of package name → original dep values
 */
function restoreAllDeps(swappedDeps) {
  for (const [name, originals] of swappedDeps) {
    restoreFileDeps(name, originals)
  }
}

/**
 * Commits version changes, tags the commit, and pushes to remote.
 *
 * Each published package gets:
 * 1. All changes staged and committed with the version as the message
 * 2. A git tag v{version} for future change detection
 * 3. Commit and tag pushed to origin/main
 *
 * @param {string[]} published - Names of successfully published packages
 */
function commitAndTag(published) {
  if (published.length === 0) return

  log("Committing version changes...")
  for (const name of published) {
    const dir = pkgDir(name)
    const version = getLocalVersion(name)
    const tag = `v${version}`

    try {
      run(`cd "${dir}" && git add -A && git commit -m "${version}" 2>/dev/null`)

      // Tag the publish commit for future change detection
      run(`cd "${dir}" && git tag "${tag}"`)

      // Push commit and tag together
      run(`cd "${dir}" && git push origin main --tags 2>/dev/null`)
      info(`Pushed ${name}@${version} (tagged ${tag})`)
    } catch {
      warn(`Could not commit/push ${name} — commit manually`)
    }
  }
}

/**
 * Prints the publish summary — how many succeeded, how many failed.
 *
 * @param {string[]} published - Successfully published package names
 * @param {string[]} failed - Failed package names (build or publish failures)
 * @param {boolean} doPublish - Whether npm publish was enabled
 */
function printSummary(published, failed, doPublish) {
  console.log("")
  if (published.length > 0) {
    const verb = doPublish ? "Published" : "Bumped & built"
    success(`${verb} ${published.length} package(s): ${published.join(", ")}`)
  }
  if (failed.length > 0) {
    fail(`Failed ${failed.length} package(s): ${failed.join(", ")}`)
  }
}

module.exports = { restoreAllDeps, commitAndTag, printSummary }