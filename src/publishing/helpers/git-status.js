/**
 * @fileoverview Git-derived change status for the publisher scan.
 *
 * @module publisher/helpers/git-status
 */

const { runShell } = require('./shell');
const { pkgDir } = require('./package');

/**
 * Reports change status for a package against its last published tag.
 *
 * Uses `git tag v{npmVersion}` as the baseline. If no tag exists, the
 * package is treated as having changes so it isn't invisible to the
 * scanner.
 *
 * @param {string} name - Package name
 * @param {string|null} npmVersion - Currently published npm version
 * @returns {{ commitsSincePublish: number, dirty: number, hasTag: boolean }}
 */
function getChangeStatus(name, npmVersion) {
  const dir = pkgDir(name);
  const dirty = parseInt(runShell(`cd "${dir}" && git status --porcelain 2>/dev/null | wc -l`), 10);

  // Never published — every commit is "new" relative to the npm baseline.
  if (!npmVersion) {
    return { commitsSincePublish: 1, dirty, hasTag: false };
  }

  const tag = `v${npmVersion}`;

  // Tag must exist for a meaningful commit-count comparison.
  try {
    runShell(`cd "${dir}" && git rev-parse "${tag}" 2>/dev/null`);
  } catch {
    // Tag missing — treat as changed so the package surfaces in the scan.
    return { commitsSincePublish: 1, dirty, hasTag: false };
  }

  const commitsSincePublish = parseInt(
    runShell(`cd "${dir}" && git rev-list "${tag}"..HEAD --count 2>/dev/null`),
    10
  );

  return { commitsSincePublish, dirty, hasTag: true };
}

module.exports = { getChangeStatus };
