# Devpost Evidence Ledger

**Created:** 2026-07-16

**Three-mission audit:** 2026-07-20

**Current release status:** The three-mission course passes its Node and production-dist browser gates, and all current-release captures were inspected. Commit/deployment evidence and a fresh public smoke are still pending. Historical one-mission evidence below must not be presented as proof of this release.

**Codex development task ID:** `019f6e24-76bc-71f2-b326-0b13c9eafd04` — preserved for Build Week `/feedback` traceability.

## Root release placeholders

Replace every `PENDING` value below only from an actual successful command, committed artifact, or deployed provider record.

| Release fact | Authoritative value |
| --- | --- |
| `FINAL_THREE_MISSION_COMMIT` | `PENDING` |
| `FINAL_LOCAL_NODE_SUITE` | `58/58 PASS` |
| `FINAL_LOCAL_BROWSER_SMOKE` | `735/735 PASS` |
| `FINAL_LOCAL_SMOKE_REPORT` | `artifacts/evidence/latest-smoke.json` — `agentville.browser-smoke.v3`, production `dist/`, empty diagnostics |
| `FINAL_CANONICAL_CAPTURE_REVIEW` | `15/15 PASS` — visually inspected 2026-07-20 |
| `FINAL_PAGES_ACTION_RUN` | `PENDING` |
| `FINAL_DEPLOYED_COMMIT` | `PENDING` |
| `FINAL_PUBLIC_BROWSER_SMOKE` | `PENDING` |
| `FINAL_PUBLIC_SMOKE_REPORT` | `artifacts/evidence/latest-public-smoke.json` — predecessor proof until refreshed |
| `FINAL_EVENT_FEEDBACK_ID` | `PENDING` — use only an ID actually issued by the Build Week event |
| `FINAL_DEMO_VIDEO_URL` | `PENDING` |
| `FINAL_HUMAN_PLAYTEST_PACKET` | `PENDING` |

`COPYFILE_DISABLE=1 npm run smoke` completed successfully on 2026-07-20 at `2026-07-20T22:26:32.763Z`: 58/58 Node tests and 735/735 production-browser assertions passed, all diagnostic collections were empty, and the 15 report-owned screenshots were visually inspected.

## Three-mission evidence obligations

| Gate | Required proof | Current status |
| --- | --- | --- |
| Safe language and authority | `npm test`: registry, compiler branding/allowlists, scoped observation provenance, simulator-owned verdicts, receipts, unlocks, debrief, and feedback identity | **PASS — 58/58** on 2026-07-20 |
| Mission 01 causal loop | Guided symptom response FAIL, Coach line 2, one-line cause repair PASS, already-satisfied no-action, invalid-line rejection | **PASS — 735-assertion production browser report** |
| Mission 02 causal loop | Supported-false rain trigger, fixed 60 Hz storm at tick 150, battered-seedling FAIL, Coach line 2, cloud-trigger repair PASS | **PASS — 735-assertion production browser report** |
| Mission 03 causal loop | Feeder scope lacks hunger fact, unsupported condition, Coach line 1, hens-observation repair PASS | **PASS — 735-assertion production browser report** |
| Ordered course | Mission 01 PASS unlocks Mission 02; Mission 02 PASS unlocks Mission 03; final receipt reports course complete | **PASS — 735-assertion production browser report** |
| Static/network boundary | Production `dist/`, same-origin request guard, empty console/page/request/response/dialog diagnostics | **PASS — all diagnostic collections empty** |
| Visual proof | Inspected course selector; M1/M2/M3 authoring, failure, and PASS; feedback; judging and mobile containment frames | **PASS — 15/15 current-release captures inspected** |
| Public proof | Pages workflow for `FINAL_THREE_MISSION_COMMIT`, live root and feedback HTTP 200, fresh `npm run test:public` PASS | Pending deployment |

## Mission-bound receipt and feedback identity

The deterministic browser smoke reserves these test-mode identities for its one-page course run:

| Mission | Expected smoke receipt/session | Expected feedback query |
| --- | --- | --- |
| `repair-east-channel` | `AVBW-TEST-0001` | `mission_id=repair-east-channel&session_id=AVBW-TEST-0001` |
| `storm-watch` | `AVBW-TEST-0002` | `mission_id=storm-watch&session_id=AVBW-TEST-0002` |
| `hungry-hens` | `AVBW-TEST-0003` | `mission_id=hungry-hens&session_id=AVBW-TEST-0003` |

These are automation IDs, not human responses and not the separate event-issued `/feedback` ID. A normal successful run creates an ID in the form `AVBW-<date>-<token>`. Every `agentville.receipt.v2` record and `/feedback/` link must preserve its exact `missionId` plus `sessionId`; `agentville.feedback.v2` storage and downloads must preserve the same pair.

Expected composite browser keys are:

```text
agentville:receipt:<mission-id>:<session-id>
agentville:feedback:<mission-id>:<session-id>
```

The final smoke report must record the exact tested identities. Any genuine playtest evidence must retain its own real receipt/session identity without substituting one of the automation IDs.

## Canonical three-mission capture set

The expanded smoke owns these release filenames. A checked state requires both a successful capture and human visual inspection of that exact current-release image.

- [x] `artifacts/screenshots/agentville-build-week-course-selector-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-responsive-1600x900.png`
- [x] `artifacts/screenshots/agentville-build-week-responsive-1280x720.png`
- [x] `artifacts/screenshots/agentville-build-week-responsive-390x844.png`
- [x] `artifacts/screenshots/agentville-build-week-m01-authoring-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-m01-failure-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-m01-pass-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-m02-authoring-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-m02-failure-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-m02-pass-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-m03-authoring-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-m03-failure-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-m03-pass-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-m03-reset-1280.png`
- [x] `artifacts/screenshots/agentville-build-week-feedback-m03-1280.png`

Existing images with older generic names such as `agentville-build-week-hero.png`, `agentville-build-week-failure.png`, and `agentville-build-week-receipt.png` are historical predecessor evidence unless they are deliberately recaptured from `FINAL_THREE_MISSION_COMMIT` and recorded as such.

## Submission artifacts

- [x] Public repository URL: [github.com/b33fydan/agentville-build-week](https://github.com/b33fydan/agentville-build-week)
- [x] Public playable route exists: [b33fydan.github.io/agentville-build-week](https://b33fydan.github.io/agentville-build-week/)
- [ ] Public route proven to serve `FINAL_THREE_MISSION_COMMIT`
- [x] Final local production browser smoke and machine-readable report
- [ ] Final public browser smoke and machine-readable report
- [x] Current three-mission canonical screenshots inspected
- [ ] Two-to-three-minute uncut three-mission demo
- [ ] Three genuine first-time playtest records and completion times
- [x] Clean-room source/assets disclosure in `docs/SOURCE_MANIFEST.md`
- [x] Dated Codex/GPT-5.6 collaboration disclosure in `docs/COLLABORATION.md`
- [ ] Separate event-issued `/feedback` ID, if the event supplies one

## Historical predecessor evidence — do not use as current proof

The following records remain valuable provenance for the earlier East Channel release, but they do not verify Storm Watch, The Hungry Hens, the mission registry, ordered unlocks, receipt schema v2, or feedback schema v2.

| Historical release | Evidence |
| --- | --- |
| First Pages deployment | Actions run `29554682024`, commit `cb57621` |
| Learner debrief | Actions run `29618190795`, commit `8d2f0b5`, 117/117 public browser assertions |
| Irrigation clue | Actions run `29621501693`, commit `8c01c21`, 122/122 public browser assertions |
| Progressive lesson | Actions run `29650610214`, commit `1c6c9eb`, 214/214 public browser assertions |
| Voxel Field Rig | Actions run `29670780954`, commit `c8ab4db`, 266/266 public browser assertions |
| Decision semantics | Actions run `29690596219`, commit `7f04f10`, 302/302 public browser assertions |
| Grid alignment | Commit `053911f`, 34/34 Node and 304/304 local browser assertions; predecessor public smoke artifact preserved |

Historical screenshots and `artifacts/evidence/latest-public-smoke.json` remain attributable to their recorded commits. The final release ledger must add, not infer, the new commit, Actions run, assertion count, diagnostics, and public session continuity.

## Manual evidence still requiring people

- Run the consent-first protocol in `docs/PLAYTEST_PROTOCOL.md`; automated and developer sessions are not human evidence.
- Preserve genuine playtest JSON under `artifacts/evidence/` only when a participant actually completes it.
- Record the uncut demo URL only after it visibly covers all three guided failures, repairs, world changes, receipts, unlocks, and feedback continuity.
- Record an event-issued `/feedback` ID exactly as issued; do not substitute the Codex task ID or an `AVBW-TEST-*` automation session.

## Final public verification checklist

1. Confirm branch, remote, clean diff scope, and `FINAL_THREE_MISSION_COMMIT`.
2. Run `COPYFILE_DISABLE=1 npm run smoke`; require a PASS report and empty diagnostics.
3. Inspect every canonical capture listed above and record `FINAL_CANONICAL_CAPTURE_REVIEW`.
4. Push the validated commit and record the successful Pages Actions run.
5. Confirm the deployed Pages SHA matches `FINAL_DEPLOYED_COMMIT`.
6. Run `COPYFILE_DISABLE=1 npm run test:public`; require the complete three-mission PASS and empty diagnostics.
7. Preserve the refreshed public report before claiming the course is live.
