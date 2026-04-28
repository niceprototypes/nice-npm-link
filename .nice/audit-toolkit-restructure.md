# Toolkit Restructure Audit

Date: 2026-04-26
Scope: `nice-npm-link` as it exists at HEAD on `main`
Author: Claude (Opus 4.7) at user request

---

## What this document is

The user observed that `nice-npm-link` was assembled across many sessions and many Claude instances and asked for an audit treating it as a toolkit defined by its umbrellas of functionality, plus a name suggestion. This document captures:

1. The umbrellas of functionality that actually live in this package
2. A priority-sorted list of structural findings (1–10 scale)
3. A comparison against prior art for similar tools, surfacing structural elements that are missing or implemented in non-standard ways
4. Renaming options, ranked

Logical-correctness audits (whether algorithms are right) are out of scope. This is a structural audit only.

---

## Umbrellas of functionality

| # | Umbrella | Files | CLI surface |
|---|---|---|---|
| 1 | Linking + singleton hygiene | `linker.js`, `cleaner.js`, `peer-deps.js`, `discovery.js`, `pm.js`, `config.js` | `<path>`, `--clean-all`, `--clean-only`, `--unlink`, `--exclude`, `--add-exclude`, `--skip-peer-check`, `--manager` |
| 2 | Dev-loop reload | `dev-runner.js`, `watcher.js` | `--dev`, `--watch`, `--watch-dir` |
| 3 | Package scaffolding | `creator/index.js`, `creator/component.js`, `creator/templates.js` | `--create <name>`, `--type component` |
| 4 | Publishing pipeline | `publisher/{index,scan,graph,versioning,deps,build,release,finalize,display,prompts,otp,helpers,constants}.js`, `npm-auth.js` | `--publish`, `--no-npm`, `--dry-publish` |
| 5 | Bump-intent record-keeping | `bump.js` | `--bump <level> <summary>` |
| 6 | Ecosystem registry | `registry.json`, `registry.js` | (none directly; queried by other umbrellas and by storybook) |
| — | Foundation utilities | `fs-utils.js`, `logger.js`, `args.js`, `index.js`, `nice-npm-link` | — |

Only umbrella #1 is described by the package name. Umbrellas #3, #4, #5, #6 have no relationship to `npm link`.

---

## Comparison to prior art

Tools surveyed and the structural patterns relevant to this audit:

| Tool | Pattern that's relevant here |
|---|---|
| **changesets** | One markdown file *per change*, in `.changeset/`, with YAML frontmatter mapping package names to bump types. Versions and CHANGELOG.md are generated from these files. The files survive long enough to produce changelogs. |
| **turborepo** | `turbo.json` at workspace root, optional per-package `turbo.json` overrides, `$schema` reference, package discovery via `package.json#workspaces`. |
| **release-it / np / semantic-release** | Interactive OTP prompt, structured release plan, mandatory `--ci` flag for non-interactive runs, global `--dry-run`. Auto-detects current branch. |
| **manypkg** | `manypkg check` lints package.json shape across the monorepo: alphabetical ordering, internal/external version mismatches, invalid peer/dev relationships, invalid names. Designed to run in `postinstall`. |
| **syncpack** | Verb-style subcommands (`lint`, `fix`, `update`, `format`, `list`) and a per-repo config file at the workspace root. |

The patterns this codebase adopts cleanly: cached JSON IO, peer-dep enforcement, file:↔semver swap, reverse-dep BFS, OTP retry. The patterns that are missing or non-standard are listed in the priority table below.

---

## Priority table (sorted high → low)

Each row is scored on two independent 1–10 axes:

- **Priority** — value × correctness. 10 = safety/correctness, 1 = polish.
- **Complexity** — work × blast radius. 1 = one-line change in one file. 10 = multi-package migration that touches every consumer in the ecosystem.

The two together give a rough quadrant: high-priority + low-complexity = quick win; high-priority + high-complexity = strategic project.

| Priority | Complexity | Finding | Current state | Prior-art reference | Suggested fix |
|---|---|---|---|---|---|
| **10** | **8** | **Package mutates 17 sibling repos with zero tests** | `"test": "node nice-npm-link --help"` in `package.json`. No unit, integration, or smoke tests. The publisher rewrites `package.json` in every linked package, swaps `file:`↔semver, and pushes git tags. | turbo / changesets / manypkg all maintain substantial test suites; manypkg recommends running `check` in `postinstall` for safety. | Add at minimum: snapshot test for `swapFileDepsTfSemver`/`restoreFileDeps` round-trip; smoke test for `--dry-publish` on a fixture; unit tests for `bump.js` parser, `args.js` parsing, `discovery.js` cycle handling. |
| **9** | **2** | **`finalize.js` hardcodes `git push origin main`** | `publisher/finalize.js:55` runs `git push origin main --tags`. Repos with `master`, `trunk`, or feature-branch publish flows silently fail and the warning is `"Could not commit/push {name}"`. | release-it / np auto-detect HEAD's branch via `git rev-parse --abbrev-ref HEAD`. | Detect the current branch per-package; fall back to `HEAD` if detached. |
| **9** | **4** | **README describes only umbrella #1** | `README.md` is the v1 linking story. Nothing about `--publish`, `--create`, `--bump`, `--dev`, `--watch`, the registry, or `.nice/bump.md`. `package.json#description` and `keywords` reinforce the same. | Every comparable tool README opens with a feature inventory. | Replace README with a six-umbrella overview; move the original "why this exists" essay to `docs/linking.md`. |
| **9** | **3** | **Manifest is stale relative to code** | `nice-manifest/edit/configuration.md` and `publish/npm.md` document `--otp-window <n>` with a 30s default. `publisher/otp.js` was rewritten to be reactive (no timer); `args.js` does not parse `--otp-window`. The flag is unreachable. The manifest's `nice-npm-link` structure tree is also stale (publisher subfolder is documented as 6 files; it's 13). | n/a — internal docs drift. | Update both manifest files; remove `--otp-window` references; relist the publisher submodules. |
| **8** | **9** | **Name describes 1/6 of the surface** | `nice-npm-link` covers only the linking umbrella. The package is the orchestrator for the entire `~/Code/nice-*` ecosystem. | `manypkg`, `syncpack`, `turbo` — each name advertises the actual scope. | Rename. Options at the bottom of this file. Blast radius: package.json, repo URL, registry entry, README, every manifest reference, every consuming project's `file:` dep, npm publish chain. |
| **8** | **7** | **Registry is the actual hub but is buried** | `registry.json` + `registry.js` is the source of truth for the ecosystem. Storybook reads it, the publisher reads it, the creator writes to it. | turbo's `turbo.json` and changesets' `.changeset/config.json` live at workspace root, not inside a CLI's repo. | If kept inside the CLI: name the package to advertise this (`nice` / `nice-cli`). If externalized: lift `registry.json` to `~/Code/nice-registry.json` (or per-package `nice.json`) and have the CLI consume it. Touches every consumer that imports from `registry.js`. |
| **8** | **4** | **No `--ci` / non-interactive mode for publish** | `--publish` always prompts for OTP and bump levels. There is no flag that fails fast when a prompt would block. Anyone running this from a script gets a hung process. | release-it `--ci`, np `--no-tests`, semantic-release no-prompt by default. | Add `--ci`. In `--ci`: read `--otp` from CLI, fail if any candidate has uncommitted work, fail if any candidate has no recommended level in `.nice/bump.md`. |
| **7** | **5** | **No `check` / `doctor` / `status` command** | The closest thing is `--publish`'s scan output. There is no read-only "what's the state of the ecosystem" command. | manypkg's `check` is the canonical pattern. | Add `nnl status` (or `nice status`): list each package, current local version, npm version, dirty count, pending bump intent, peerDep correctness, file:-link parity vs. registry. |
| **7** | **3** | **No CHANGELOG.md generation from bump intent** | `.nice/bump.md` is the perfect input source. `finalize.js:46` clears it after publish; the entries are discarded. | changesets writes a CHANGELOG.md per package from the same input. | Before clearing, append entries to `CHANGELOG.md` keyed by the published version. Implementation is ~30 lines. |
| **7** | **5** | **`creator/component.js` reaches into a sibling package** | `creator/component.js:140-158` opens `~/Code/nice-styles/src/tokens/component.json` and edits it. This is the right outcome but a lateral side effect from the wrong umbrella. | Tools like turbo and manypkg never mutate sibling packages directly — they emit changes via documented APIs or codegen. | Expose the registration step from `nice-styles` (e.g., `nice-styles register-component <prefix>`) and have the creator shell out. Or at minimum gate behind `--register-token` so callers can opt out. |
| **7** | **2** | **Cross-umbrella import inversion** | `creator/index.js:17` and `creator/component.js:31` import `NICE_BASE` from `publisher/constants.js`. `NICE_BASE` is ecosystem-wide, not publisher-specific. | n/a — internal layering. | Move `NICE_BASE` (and `REGISTRY_PATH`) to `registry.js`; make `publisher/constants.js` re-export them. |
| **6** | **6** | **`.nice/bump.md` is one rolling file, not per-change** | A single appended file per package. Loses the per-change identity. Merge conflicts collapse rationale. | changesets uses one markdown file per change with YAML frontmatter; this lets each entry survive into CHANGELOG.md. | Optional: migrate to `.nice/bump/{slug}.md`. Lower priority because the current file is single-author and lightweight. Worth doing only if CHANGELOG generation (priority 7) is implemented. Format change + parser rewrite + migration of existing entries + prompt-rendering update. |
| **6** | **2** | **No `$schema` on `registry.json` despite a schema being possible** | `package.exports.json` (in scaffolded packages) has `$schema`; `registry.json` does not. | turbo's `turbo.json`, changesets' `config.json` both ship JSON schemas. | Author `registry.schema.json`, reference it from `registry.json`, and document the path in the manifest. |
| **6** | **1** | **Late `require()` inside `cleanAllLinkedPackages`** | `cleaner.js:144-146` does `require('./discovery')`/`require('./peer-deps')`/`require('./logger')` inside the function "to avoid a circular dependency." There is no actual cycle — the late-require pattern hides a layering smell. | Standard JS modules use top-of-file imports. | Hoist to top of file. If a real cycle exists later, untangle it instead of working around. |
| **6** | **7** | **Subcommand structure is flag-routed via mutually-exclusive booleans** | `index.js:main()` is a 90-line if/else chain over flags. There is no subcommand parser. `--bump` summary parsing in `args.js:findBumpSummary` is hand-rolled and fragile. | turbo, syncpack, manypkg, changesets all use `commander` or `yargs` with verb subcommands. | Optional but recommended at rename time: convert to `nice <verb> [args]` style with `commander`. Costs ~150 lines, replaces ~250 lines of hand parsing. Auto-generated subcommand help is the major upside. |
| **5** | **1** | **`dev-runner.js` hardcodes `npm run dev`** | `dev-runner.js:96` always spawns `npm run dev`, even when `pm.js` detected `pnpm` or `yarn`. | turbo / nx use the detected pm consistently. | Pass the detected pm into `startDevRunner`; spawn `${pm} run dev`. |
| **5** | **1** | **Logger has no `NO_COLOR` / TTY detection** | `logger.js` always emits ANSI escape codes. Piping output to a file embeds escape sequences. | The `NO_COLOR` env var is a de facto standard (https://no-color.org). All comparable tools honor it. | Wrap the color helpers in `process.stdout.isTTY && !process.env.NO_COLOR`. |
| **5** | **3** | **No global `--verbose` / `--quiet` / `--silent`** | Some functions accept `verbose: true` programmatically; there is no global log level flag. | turbo, nx, npm itself all expose log levels. | Add three flags wired to a single `LOG_LEVEL` checked in `logger.js`. |
| **5** | **1** | **`watcher.js` and `dev-runner.js` duplicate `getPackageName`** | `watcher.js:154` and `dev-runner.js:46` are the same function. | n/a — minor DRY. | Move to `discovery.js` or a new `pkg.js`. |
| **4** | **1** | **`package.json#engines.node` says 14** | The code uses `fs.rmSync({recursive,force})` (14+) and `fs.watch(..., {recursive:true})` (14+). Modern syntax already in use is fine on 14, but 14 is end-of-life. | Most current tools target 18 or 20. | Bump to `>=18.0.0`. |
| **4** | **2** | **Several exports are dead or internal** | `peer-deps.js:validatePeerDeps` (unused), `watcher.js:cleanupTriggerFile` (unused), `linker.js:storeOriginalVersion`/`getStoredVersions` (internal), `discovery.js:isFileLink` (internal), `args.js` parsing helpers (internal), `pm.js:LOCKFILES` (internal). | n/a. | Stop exporting. Add jsdoc `@private`. |
| **3** | **2** | **Quote-style drift between sessions** | `publisher/*` uses double quotes; older modules (`cleaner`, `linker`, `peer-deps`, `watcher`, `dev-runner`, `bump`) use single quotes. Reads as several authors. | n/a — pure style. | Add Prettier with a single config; format the repo once. |
| **3** | **2** | **`swapFileDepsTfSemver` typo** | `publisher/deps.js:17` — `Tf` should be `To`. | n/a. | Rename the export, keep a re-export shim for one release. |
| **3** | **2** | **`creator/templates.js` doesn't generate a README for the new package** | The component-package convention from `nice-manifest/edit/component.md` mentions README under `files`/audit, but `creator` doesn't scaffold one. | n/a — minor. | Add a `readme(componentName)` template emitting a 6-line stub. |
| **3** | **1** | **`package.json#scripts.test` is `node nice-npm-link --help`** | Not a real test. | n/a. | Replace once tests exist (priority 10). |
| **2** | **4** | **No `--json` output mode for `--publish` scan or `--clean-all`** | All output is human-formatted text. | turbo, npm, pnpm offer `--json`. | Add only if a CI use case appears. Touches every output point in publisher and clean. |
| **2** | **1** | **`index.js` re-exports an inconsistent slice of the surface** | `linkPackage`, `cleanAllLinkedPackages`, `startWatching`, `startDevRunner` are exported. `publish`, `create`, the bump API, and the registry are not. Programmatic consumers can't reach half the toolkit. | n/a. | Either export everything intentionally, or stop pretending the package has a programmatic API and remove the existing re-exports. |

### Quick wins (Priority ≥ 7, Complexity ≤ 3)

- P9 / C2 — Hardcoded `git push origin main`
- P9 / C3 — Manifest stale (remove `--otp-window`, relist publisher submodules)
- P7 / C3 — CHANGELOG.md generation from bump intent
- P7 / C2 — Move `NICE_BASE`/`REGISTRY_PATH` to `registry.js`

### Strategic projects (Priority ≥ 7, Complexity ≥ 7)

- P10 / C8 — Test suite
- P8 / C9 — Rename
- P8 / C7 — Externalize the registry (typically paired with the rename)

---

## Naming options

The honest description is: **a CLI control plane for the local `~/Code/nice-*` ecosystem** — link, clean, watch, dev, scaffold, publish, record bump intent, query the registry. Ranked options:

| Rank | Name | Bin | CLI shape | Cost | Upside |
|---|---|---|---|---|---|
| 1 | `nice` | `nice` | `nice link <path>`, `nice clean`, `nice dev`, `nice watch`, `nice create <name>`, `nice publish`, `nice bump <level> <summary>`, `nice status`, `nice registry list/add` | High — every doc/manifest reference updates; the flag-routed CLI converts to verb-routed | Umbrellas become first-class verbs; `nnl` alias retires; CLI legibility is dramatically better; matches how every comparable tool reads (`turbo run`, `nx affected`, `manypkg check`) |
| 2 | `nice-cli` | `nice` (or keep `nnl`) | Same flag-routed CLI as today | Low — package rename + repo rename + registry update | Matches the `type: "cli"` already recorded for this entry in `registry.json`; honest about scope; minimal disruption |
| 3 | `nice-toolkit` | `nice` | Either flag- or verb-routed | Low | Communicates "plural tools" without prescribing a structure |
| — | `nice-monorepo` | — | — | — | **Rejected** — this isn't a monorepo; it's a directory of sibling repos with `file:` deps |
| — | `nice-orchestrator` | — | — | — | **Rejected** — accurate but heavy |
| — | `nice-workspace` | — | — | — | **Rejected** — implies workspace protocol support which does not exist |

The `nnl` muscle-memory alias should be retained as an alias of whatever new bin name is chosen, to keep existing automation working through the rename.

---

## Sources

Research sources used for the prior-art comparison:

- [@changesets/cli on npm](https://www.npmjs.com/package/@changesets/cli)
- [Changesets — adding-a-changeset.md](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md)
- [Changesets — detailed-explanation.md](https://github.com/changesets/changesets/blob/main/docs/detailed-explanation.md)
- [Configuring turbo.json](https://turborepo.dev/docs/reference/configuration)
- [Turborepo — Configuring tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks)
- [Turborepo — Package configurations](https://turborepo.dev/docs/reference/package-configurations)
- [release-it — npm.md](https://github.com/release-it/release-it/blob/main/docs/npm.md)
- [npm Docs — Requiring 2FA for package publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)
- [Thinkmill/manypkg](https://github.com/Thinkmill/manypkg)
- [manypkg — packages/cli/README.md](https://github.com/Thinkmill/manypkg/blob/main/packages/cli/README.md)
- [JamieMason/syncpack](https://github.com/JamieMason/syncpack/)
- [syncpack on npm](https://www.npmjs.com/package/syncpack)
