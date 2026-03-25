/**
 * @fileoverview Package change discovery
 *
 * Scans registered packages to find which ones have changes since their
 * last published version. Supports two modes:
 * - Explicit: user provides package names, dependency graph resolves the rest
 * - Auto-scan: checks all registered packages against their publish tags
 *
 * @module publisher/scan
 */

const fs = require("fs")
const { ALL_PACKAGES } = require("./constants")
const { pkgDir, getNpmVersion, getLocalVersion, getChangeStatus } = require("./helpers")
const { resolveAffected } = require("./graph")

/**
 * Discovers which packages have publishable changes.
 *
 * When requestedPackages is provided, resolves the full dependency graph
 * and includes all affected packages. Otherwise scans every registered
 * package for commits since its last publish tag.
 *
 * @param {string[]} [requestedPackages] - Explicitly changed package names
 * @returns {{ candidates: object[], changedSet: Set<string>|null, dependentSet: Set<string>|null }}
 */
function scanPackages(requestedPackages) {
  const candidates = []
  let changedSet = null
  let dependentSet = null

  if (requestedPackages && requestedPackages.length > 0) {
    // Resolve dependency graph from explicitly changed packages
    const resolved = resolveAffected(requestedPackages)
    changedSet = resolved.changed
    dependentSet = resolved.dependents

    const allAffected = [...changedSet, ...dependentSet]

    for (const name of allAffected) {
      // Skip packages whose directory doesn't exist locally
      const dir = pkgDir(name)
      try {
        fs.statSync(dir)
      } catch {
        continue
      }

      const localVersion = getLocalVersion(name)
      const npmVersion = getNpmVersion(name)
      const { commitsSincePublish, dirty } = getChangeStatus(name, npmVersion)
      const isDependent = dependentSet.has(name)

      candidates.push({
        name,
        localVersion,
        npmVersion,
        commitsSincePublish,
        dirty,
        isNew: !npmVersion,
        isDependent,
      })
    }
  } else {
    // Auto-scan: check all packages for changes since last publish tag
    for (const name of ALL_PACKAGES) {
      const dir = pkgDir(name)
      try {
        fs.statSync(dir)
      } catch {
        continue
      }

      const localVersion = getLocalVersion(name)
      const npmVersion = getNpmVersion(name)
      const { commitsSincePublish, dirty } = getChangeStatus(name, npmVersion)

      // Package qualifies if it has commits since publish, uncommitted work, or is unpublished
      const hasChanges = commitsSincePublish > 0 || dirty > 0

      if (hasChanges || !npmVersion) {
        candidates.push({
          name,
          localVersion,
          npmVersion,
          commitsSincePublish,
          dirty,
          isNew: !npmVersion,
          isDependent: false,
        })
      }
    }
  }

  return { candidates, changedSet, dependentSet }
}

module.exports = { scanPackages }