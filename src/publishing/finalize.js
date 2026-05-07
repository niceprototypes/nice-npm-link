/**
 * @fileoverview Post-publish finalization
 *
 * Restores file: deps, commits version changes, creates git tags
 * for publish tracking, pushes to remote, and prints summary.
 *
 * @module publisher/finalize
 */

const fs = require("fs")
const path = require("path")
const { log, info, success, warn, fail } = require("../shared/logger")
const { removeFile } = require("../shared/fs-utils")
const { runShell, pkgDir, getLocalVersion } = require("./helpers")
const { restoreFileDeps } = require("./deps")
const { clearBumpIntent, readBumpIntent, composeCommitMessage } = require("../shared/bump")

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
 * Reads pending bump entries (if any) and clears the file. Returns the
 * composed commit-message body, or an empty string when there are no
 * entries. Errors reading or clearing the file are intentionally
 * swallowed — the publish commit can still proceed with just the
 * version line.
 *
 * @param {string} dir - Package root
 * @returns {string} Bump narrative or ""
 */
function consumeBumpIntent(dir) {
  let bumpMessage = ""
  try {
    const { entries } = readBumpIntent(dir)
    if (entries.length > 0) bumpMessage = composeCommitMessage(entries)
  } catch { /* no bump file or unreadable — fall through */ }

  try { clearBumpIntent(dir) } catch { /* no-op if the file never existed */ }

  return bumpMessage
}

/**
 * Writes the commit message to a tmp file inside `.git/`, runs
 * `git commit -F` against it, and removes the tmp file afterward.
 *
 * The tmp-file path is used (rather than `git commit -m`) so multi-line
 * messages preserve their formatting without shell-quoting hazards.
 *
 * @param {string} dir - Package root
 * @param {string} commitMessage - Final commit subject + body
 */
function commitWithMessageFile(dir, commitMessage) {
  const tmpFile = path.join(dir, ".git", "COMMIT_EDITMSG_NTK")
  fs.writeFileSync(tmpFile, commitMessage)
  try {
    runShell(`cd "${dir}" && git add -A && git commit -F "${tmpFile}" 2>/dev/null`)
  } finally {
    try { removeFile(tmpFile) } catch { /* best-effort cleanup */ }
  }
}

/**
 * Commits version changes for one package, tags the commit, and pushes
 * commit + tag to origin/main. Errors are caught so a single package
 * failure doesn't halt the rest of the loop.
 *
 * @param {string} name - Package name
 */
function commitAndTagPackage(name) {
  const dir = pkgDir(name)
  const version = getLocalVersion(name)
  const tag = `v${version}`

  const bumpMessage = consumeBumpIntent(dir)

  // Compose final commit message: version line on top, bump narrative below.
  // The version stays as the first line so existing `git log --oneline`
  // habits continue to work; the body adds the user-visible context.
  const commitMessage = bumpMessage
    ? `${version}\n\n${bumpMessage}`
    : version

  try {
    commitWithMessageFile(dir, commitMessage)

    runShell(`cd "${dir}" && git tag "${tag}"`)
    runShell(`cd "${dir}" && git push origin main --tags 2>/dev/null`)

    info(`Pushed ${name}@${version} (tagged ${tag})`)
  } catch {
    warn(`Could not commit/push ${name} — commit manually`)
  }
}

/**
 * Commits version changes, tags the commit, and pushes to remote
 * for every successfully published package.
 *
 * @param {string[]} published - Names of successfully published packages
 */
function commitAndTag(published) {
  if (published.length === 0) return

  log("Committing version changes...")
  for (const name of published) {
    commitAndTagPackage(name)
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
