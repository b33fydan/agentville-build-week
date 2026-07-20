# Clean-room Source and Asset Manifest

**Audited:** 2026-07-20

**Release scope:** Three-mission Build Week course in the current worktree

## Clean-room boundary

`/Volumes/beefybackup/AgentVille` is reference-only. No implementation file, art asset, screenshot, generated artifact, or documentation passage from that repository is included here. All shipped runtime code, interface copy, Canvas 2D geometry, and CSS in this repository were authored inside `/Volumes/beefybackup/agentville-build-week`.

## Shipped runtime

| Path | Purpose | Provenance |
| --- | --- | --- |
| `index.html` | Shared game shell, mission roster, typed Agent Workbench, trace, unlock card, and receipt/debrief markup | Authored clean-room for this repository |
| `src/mission-registry.js` | Deeply frozen source of truth for all three mission IDs, order, prerequisites, states, allowlists, bindings, scoped observations, conditions, actions, fixed-tick events, verification, Coach/debrief copy, UI metadata, and world metadata | Authored clean-room for this repository |
| `src/compiler.js` | Mission-aware prefix validator and strict four-line allowlisted compiler that privately mints immutable executable plans | Authored clean-room for this repository |
| `src/mission.js` | Deterministic, registry-driven simulator; privately binds Observe evidence and Decide results to the exact plan, applies actions/events, owns verification, and issues `agentville.receipt.v2` records | Authored clean-room for this repository |
| `src/course-progress.js` | Pure ordered unlock reducer for Repair the East Channel → Storm Watch → The Hungry Hens | Authored clean-room for this repository |
| `src/debrief.js` | Receipt-derived learning recap for repair, direct-success, and already-satisfied paths; it cannot award PASS | Authored clean-room for this repository |
| `src/app.js` | Progressive Bert lesson state, mission selection/unlocks, fixed-60 Hz presentation timeline, receipt preservation, feedback routing, and automation hooks | Authored clean-room for this repository |
| `src/world.js` | Procedural Canvas 2D renderer for the shared voxel farm, humanoid Bert, irrigation, weather/seedlings, feeder/hens, clue signs, and renderer-derived presentation evidence | Authored clean-room for this repository |
| `src/styles.css` | Voxel Field Rig material system and responsive game/debrief layout | Authored clean-room for this repository |
| `feedback/index.html` | Local-first feedback view displaying mission, session, and matching-receipt identity | Authored clean-room for this repository |
| `feedback/feedback.js` | Composite mission/session receipt lookup, `agentville.feedback.v2` persistence/export, and feedback automation state | Authored clean-room for this repository |
| `feedback/styles.css` | Feedback-only responsive layout and identity presentation | Authored clean-room for this repository |

## Mission-bound proof identity

Every simulator receipt carries both `missionId` and `sessionId`. The game stores successful proof under:

```text
agentville:receipt:<mission-id>:<session-id>
```

The feedback route carries the same two values as `mission_id` and `session_id`, and feedback is stored under:

```text
agentville:feedback:<mission-id>:<session-id>
```

The feedback code will not treat a receipt as matching unless both identity fields match. These records remain local browser data unless the player explicitly downloads a JSON artifact.

## Development and validation sources

| Path | Purpose | Shipped to `dist/` |
| --- | --- | --- |
| `tests/compiler.test.mjs` | Mission 01 grammar, sandbox, immutability, and compiler-authority regression tests | No |
| `tests/multi-mission-compiler.test.mjs` | Exact language, mission separation, nonallowlisted rejection, and mission-bound plan tests across all three missions | No |
| `tests/mission-registry.test.mjs` | Registry completeness, deep freezing, Storm Watch tick-150 behavior, and Hungry Hens observation-scope tests | No |
| `tests/mission.test.mjs` | Guided FAIL, single-line repair PASS, already-satisfied no-action, provenance, deterministic replay, and receipt tests | No |
| `tests/course-progress.test.mjs` | PASS-only ordered unlock and locked-selection tests | No |
| `tests/debrief.test.mjs` | Mission-specific repair, direct, and already-satisfied recap tests | No |
| `tests/feedback-identity.test.mjs` | Composite receipt/feedback identity and export-record tests | No |
| `tests/smoke-args.test.mjs` | Local, production-dist, headed, and public smoke argument parsing | No |
| `scripts/smoke-browser.mjs` | Independent-oracle Chromium course smoke, same-origin request guard, screenshots, and machine-readable evidence report | No |
| `scripts/build.mjs` | Static production build and mission metadata generation | No |
| `scripts/serve.mjs` | Local static preview server | No |

The only development dependency is Playwright `1.61.1`, used for automated Chromium validation and evidence capture. It is not copied into the static build.

## Runtime assets

The shipped game has no external image, model, texture, font, audio, or video assets. Terrain, stepped sky, fields, water, channel stones, bridge, shed, covers, weather vane, fences, crops, feeder, grain, hens, trees, props, clue signs, routes, and Bert are rendered from local Canvas 2D geometry and color values. Bert's anatomy, clothing, hat, wrench, and poses are procedural drawing operations in `src/world.js`.

The Voxel Field Rig grain/grid treatments are local CSS and inline procedural SVG treatments. Evidence PNGs under `artifacts/screenshots/` are test outputs, not runtime inputs, and `npm run build` does not copy them.

## Build manifest

`npm run build` removes and regenerates ignored `dist/`, then copies only:

```text
index.html
src/
feedback/
build-meta.json
```

No `.env`, API key, test dependency, source-control metadata, evidence response, or unrelated external-volume file enters `dist/`. The built mission does not require an account, backend, runtime model call, or cross-origin request.

## Evidence status at this audit

- The current worktree's Node suite passed **58/58** on 2026-07-20.
- The production `dist/` browser smoke passed **735/735** assertions with empty diagnostics, and all **15/15** report-owned three-mission screenshots were visually inspected on 2026-07-20. The authoritative local report is `artifacts/evidence/latest-smoke.json`.
- The public GitHub Pages URL still represents the preceding release until the current commit is deployed and `npm run test:public` produces a fresh PASS report.
- Historical screenshots and smoke reports remain valid evidence only for the commits that produced them; they are not proof of this three-mission worktree.
