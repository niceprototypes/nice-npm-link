/**
 * @fileoverview Version bump prompting
 *
 * Per-package walkthrough driven by recorded bump intent in `.nice/bump.md`.
 * For each iteration, the full candidate table is re-rendered with the
 * current package highlighted, and a 5-option menu is shown:
 *
 *   [1] Accept current      Apply the recommended level, advance
 *   [2] Edit current        Prompt for a specific level, advance
 *   [3] Accept remaining    Apply recommendations to this and every
 *                           remaining pending package, finish
 *   [4] View logs           Print .nice/bump.md entries for current,
 *                           re-prompt (does not advance)
 *   [5] Cancel              Abort the publish
 *
 * Accepted rows replace their entry-count tag with a green ✓ + derived
 * version. Dependents (auto-patched) are never part of this walk.
 *
 * Input: digits `1`–`5` and the letter aliases `a` (accept), `e` (edit),
 * `r` (remaining), `v` (view), `c` (cancel) are all accepted at the main
 * menu. Pressing Enter at the main menu is equivalent to `[1] Accept
 * current`. The inner edit prompt accepts `p` / `m` / `M` / `s`, with
 * Enter falling back to the recommended level.
 *
 * @module publisher/prompts
 *
 * @typedef {object} Decision
 * @property {"pending"|"accepted"} status - lifecycle state for a candidate
 * @property {string} [bumpType] - "major"|"minor"|"patch"|"as-is" — set when status="accepted"
 */

const { info, warn, cyan, gray, green, yellow } = require("../shared/logger")
const { prompt, promptKey, pkgDir } = require("./helpers")
const { calcVersion } = require("./versioning")
const { readBumpIntent } = require("../shared/bump")

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reads each candidate's `.nice/bump.md` and attaches the parsed entries +
 * computed level. Read once up front (not lazily inside the render loop) so
 * the same parsed data drives the table, the [4] View logs output, and the
 * recommendation logic without re-reading the file on every keystroke.
 *
 * @param {object[]} candidates
 * @returns {object[]} candidates with `intentLevel` and `intentEntries` added
 */
function enrichWithIntent(candidates) {
  return candidates.map((c) => {
    const { entries, level } = readBumpIntent(pkgDir(c.name))
    return { ...c, intentLevel: level, intentEntries: entries }
  })
}

/**
 * Default bump level for a candidate.
 *
 * New packages have no prior version, so no bump applies — they ship at
 * `localVersion` and are tagged `as-is`. Existing packages prefer the level
 * recorded in `.nice/bump.md`; if none is recorded, fall back to `patch` so
 * a publish is never blocked by a missing intent file.
 *
 * @param {object} c
 * @returns {"major"|"minor"|"patch"|"as-is"}
 */
function recommendedLevel(c) {
  if (c.isNew) return "as-is"
  return c.intentLevel || "patch"
}

/**
 * Resolves the version string a candidate will publish at, given a bump
 * choice. `as-is` is a no-op (used for first publishes of new packages).
 *
 * @param {object} c
 * @param {"major"|"minor"|"patch"|"as-is"} bumpType
 * @returns {string} resolved version
 */
function derivedVersion(c, bumpType) {
  if (bumpType === "as-is") return c.localVersion
  return calcVersion(c.localVersion, bumpType)
}

/**
 * Prints the candidate table with the current row highlighted. Called once
 * per iteration of the main loop so progressive ✓ marks become visible as
 * the user advances through the walk.
 *
 * @param {object[]} enriched - candidates with intent attached
 * @param {Map<string, Decision>} decisions - per-candidate lifecycle map
 * @param {number} currentIdx - index of the row being prompted on (-1 to
 *   render with no row highlighted, used after [3] Accept remaining)
 */
// Column widths used by both the header and each body row. Kept as constants
// so the two stay in lock-step — change one, change the other implicitly.
// Widths are sized for the worst-case content each column can hold:
//   NAME    = `nice-react-device-detector` etc. (longest current package)
//   VERSION = `999.999.999 → 999.999.999` plus the unicode arrow glyph
//   LEVEL   = `(major)` / `(as-is)` / blank — 8 with one trailing space
//   STATUS  = `✓ 999.999.999` / `10 entries` / blank
//   LAST    = `YYYY-MM-DD HH:MM`
const COL_NAME = 24
const COL_VERSION = 28
const COL_LEVEL = 9
const COL_STATUS = 14

function renderTable(enriched, decisions, currentIdx) {
  info("Publish candidates:")

  // Header row in gray. The leading two spaces match the row marker width
  // (`▶ ` or `  `) so headers align with the body underneath them.
  const header =
    `  ${"Package".padEnd(COL_NAME)} ` +
    `${"Version".padEnd(COL_VERSION)} ` +
    `${"Level".padEnd(COL_LEVEL)} ` +
    `${"Status".padEnd(COL_STATUS)} ` +
    `Last entry`
  info(gray(header))

  for (let rowIndex = 0; rowIndex < enriched.length; rowIndex++) {
    const candidate = enriched[rowIndex]
    const decision = decisions.get(candidate.name)
    const isCurrent = rowIndex === currentIdx

    // Arrow marker + yellow name for the row currently being prompted.
    const prefix = isCurrent ? yellow("▶ ") : "  "
    const name = (isCurrent ? yellow : cyan)(candidate.name.padEnd(COL_NAME))

    // `chosen` is whatever the row will publish at: the user's accepted
    // decision if present, otherwise the file-derived recommendation. This
    // lets accepted rows display their final version even after the cursor
    // has moved past them.
    const chosen = decision && decision.status === "accepted" ? decision.bumpType : recommendedLevel(candidate)
    const next = derivedVersion(candidate, chosen)
    // New packages render `1.0.0 (new)` — no arrow, no level tag, since
    // there is no prior version to bump from.
    const versionText = candidate.isNew ? `${candidate.localVersion} (new)` : `${candidate.localVersion} → ${next}`
    const version = versionText.padEnd(COL_VERSION)
    const levelTag = (candidate.isNew ? "" : `(${chosen})`).padEnd(COL_LEVEL)

    // Status column — three mutually exclusive shapes, padded to a uniform
    // visible width before color is applied so trailing columns line up:
    //   accepted              → green check + resolved version
    //   pending + has intent  → gray "{n} entries" hint
    //   pending + no intent   → blank (recommendation defaulted to patch)
    let status
    if (decision && decision.status === "accepted") {
      status = green(`✓ ${next}`.padEnd(COL_STATUS))
    } else {
      const count = candidate.intentEntries.length
      const text = candidate.intentLevel
        ? `${count} ${count === 1 ? "entry" : "entries"}`
        : ""
      status = candidate.intentLevel ? gray(text.padEnd(COL_STATUS)) : text.padEnd(COL_STATUS)
    }

    // Last entry timestamp. Entries are file-order (oldest first) so the
    // newest is the last element. Empty string for new packages and any
    // package whose `.nice/bump.md` has no parsed entries — keeps the
    // column visually clean rather than printing a placeholder.
    const lastEntry = candidate.intentEntries[candidate.intentEntries.length - 1]
    const lastDate = lastEntry?.timestamp || ""

    info(`${prefix}${name} ${version} ${levelTag} ${status} ${gray(lastDate)}`)
  }
}

/**
 * Inner prompt for [2] Edit current — asks for a specific level.
 *
 * For new packages, only `[y]/[n]` makes sense: the version is fixed at
 * `localVersion`, so accepting returns `as-is` and skipping returns null.
 *
 * For existing packages, the prompt shows `[p]atch / [m]inor / [M]ajor /
 * [s]kip` with the recommendation in parentheses. Pressing Enter (empty
 * answer) accepts the recommendation — this is intentional but not visible
 * from the prompt text, so the empty-string case below is a fallback to
 * `rec`, not a no-op.
 *
 * @param {object} c - Current candidate
 * @returns {Promise<string|null>} bumpType or null to skip
 */
async function promptEditLevel(c) {
  if (c.isNew) {
    const answer = (await promptKey(
      `  ${cyan(c.name)} — new package, [y] accept / [n] skip: `,
      ["y", "Y", "n", "N"]
    )).trim().toLowerCase()
    if (answer === "n") return null
    // Default (Enter or `y`) accepts at the existing version.
    return "as-is"
  }
  const rec = recommendedLevel(c)
  const answer = (await promptKey(
    `  ${cyan(c.name)} — [p]atch / [m]inor / [M]ajor / [s]kip (rec: ${cyan(rec)}): `,
    ["p", "m", "M", "s"]
  )).trim()
  // `M` (capital) is intentional — `m` would be ambiguous with minor.
  if (answer === "M") return "major"
  switch (answer) {
    // Enter / empty answer falls back to the recommendation, matching the
    // main menu's `[1] Accept current` shortcut behavior.
    case "": return rec
    case "p": return "patch"
    case "m": return "minor"
    case "s": return null
    default:
      warn(`Unknown option "${answer}"`)
      return null
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Walks the user through each changed candidate with a 5-option menu.
 *
 * @param {object[]} changedCandidates - Packages the user explicitly changed
 * @param {object[]} dependentCandidates - Packages added by graph resolution (auto-patched)
 * @returns {Promise<object[]|null>} Packages to publish with newVersion, or null if aborted
 */
async function promptVersionBumps(changedCandidates, dependentCandidates) {
  const enriched = enrichWithIntent(changedCandidates)

  // `decisions` is the source of truth for what each candidate will publish
  // at. Every candidate begins `pending` and transitions to `accepted`
  // exactly once. Skipping a row in [2] Edit current leaves it `pending`
  // and it is dropped from `toPublish` at the end.
  /** @type {Map<string, Decision>} */
  const decisions = new Map()
  for (const c of enriched) decisions.set(c.name, { status: "pending" })

  let currentIdx = 0

  while (currentIdx < enriched.length) {
    const current = enriched[currentIdx]
    // Re-render every iteration so accepted ✓ marks appear progressively as
    // the user advances. The cost is trivial (a few lines of console output
    // per keystroke).
    renderTable(enriched, decisions, currentIdx)

    const action = (await promptKey(
      "[1] Accept current  [2] Edit current  [3] Accept remaining  [4] View logs  [Esc] Cancel: ",
      ["1", "2", "3", "4", ""]
    )).trim()

    // [Esc] / c / cancel — abort the entire publish, returning null to the
    // caller so no version bumps are committed. `c`/`cancel` remain
    // accepted for the non-TTY fallback path (full-line prompt).
    if (action === "" || action.toLowerCase() === "c" || action.toLowerCase() === "cancel") {
      info("Aborted.")
      return null
    }

    // [4] / v — print this candidate's bump entries and re-prompt. Uses
    // `continue` (not currentIdx++) so the cursor stays on the same row.
    if (action === "4" || action.toLowerCase() === "v") {
      if (current.intentEntries.length > 0) {
        for (const e of current.intentEntries) {
          const ts = e.timestamp ? `[${e.timestamp}] ` : ""
          const mark = e.consumed ? "✓ " : ""
          info(`    ${ts}${mark}${e.level}: ${e.message}`)
        }
      }
      continue
    }

    // [3] / r — accept the current row and every subsequent pending row at
    // their recommended levels in one shot. Already-accepted rows (reached
    // via earlier [2] backtracking, hypothetically) are skipped so a
    // user-edited level is never overwritten. `currentIdx` is jumped to the
    // end and the loop is broken — no more prompts will fire.
    if (action === "3" || action.toLowerCase() === "r") {
      for (let i = currentIdx; i < enriched.length; i++) {
        const c = enriched[i]
        if (decisions.get(c.name).status === "accepted") continue
        decisions.set(c.name, { status: "accepted", bumpType: recommendedLevel(c) })
      }
      currentIdx = enriched.length
      // Final render with no current row highlighted (-1) so the user sees
      // the completed walk before control returns.
      renderTable(enriched, decisions, -1)
      break
    }

    // [2] / e — open the inner level prompt. A null return means the user
    // chose [s]kip; the row stays `pending` and the cursor still advances.
    if (action === "2" || action.toLowerCase() === "e") {
      const bumpType = await promptEditLevel(current)
      if (bumpType !== null) {
        decisions.set(current.name, { status: "accepted", bumpType })
      }
      currentIdx++
      continue
    }

    // [1] / Enter / a — accept the recommendation and advance. Empty input
    // is treated as `[1]` here, so the most common path (Enter through a
    // batch) requires zero modifier keys.
    if (action === "1" || action === "" || action.toLowerCase() === "a") {
      decisions.set(current.name, { status: "accepted", bumpType: recommendedLevel(current) })
      currentIdx++
      continue
    }

    warn(`Unknown option "${action}"`)
  }

  // Materialize the publish list. Only `accepted` rows ship — anything left
  // `pending` (skipped via [2]→s) is intentionally dropped.
  const toPublish = []
  for (const c of enriched) {
    const d = decisions.get(c.name)
    if (!d || d.status !== "accepted") continue
    toPublish.push({ ...c, newVersion: derivedVersion(c, d.bumpType), bumpType: d.bumpType })
  }

  // Dependents are auto-patched unconditionally — they never appear in the
  // walk above. The assumption is that a dependent only needs republishing
  // because one of its `file:` deps changed, and a patch bump is enough to
  // signal "rebuild against the new dependency."
  for (const c of dependentCandidates) {
    toPublish.push({ ...c, newVersion: calcVersion(c.localVersion, "patch"), bumpType: "patch" })
  }

  return toPublish
}

module.exports = { promptVersionBumps }