# Devpost Evidence Ledger

**Created:** 2026-07-16

**Status:** Automated local and public production evidence captured; video, human playtests, and any separate event-issued `/feedback` ID remain genuine external gates.

**Codex development task ID:** `019f6e24-76bc-71f2-b326-0b13c9eafd04` — preserved for `/feedback` traceability.

## Required submission artifacts

- [x] Public playable URL and declared supported browser
- [x] Source repository URL and first deployed commit hash
- [ ] Two-to-three-minute uncut critical-flow demo
- [x] Hero screenshot showing the farm and Agent Workbench
- [x] Welcome screenshot showing the farm before Start
- [x] Dedicated 2× humanoid Bert detail capture
- [x] Composited teaching capture showing Bert unobscured beside his bubble and world evidence
- [x] Compiler-error screenshot with line number and fix suggestion
- [x] Observe success and Decide/lightbulb teaching screenshots at 1280×720
- [x] Failed-verification screenshot with blocked water visible
- [x] Passing receipt screenshot with session ID visible
- [x] `/feedback/` screenshot showing the same session ID
- [x] 390px mobile Workbench screenshot and containment assertions
- [x] 390px mobile feedback screenshot with readable 44px rating and consent targets
- [x] Automated production smoke log
- [ ] Three genuine first-time playtest records and completion times
- [x] Clean-room source/assets disclosure
- [x] Codex/GPT-5.6 collaboration disclosure

## Acceptance evidence index

| Criterion | Artifact or command | Status |
| --- | --- | --- |
| A1 | `npm run test:public` against [GitHub Pages](https://b33fydan.github.io/agentville-build-week/) | PASS — Voxel Field Rig 266/266 public browser assertions |
| A2–A23 | `npm run smoke` Voxel Field Rig release | PASS — 28/28 Node tests + 266/266 production-dist browser assertions |
| Welcome frame | `artifacts/screenshots/agentville-build-week-welcome.png` | Captured and inspected; composited edge luminance/color proof confirms the layered farm remains visible before Start |
| Hero frame | `artifacts/screenshots/agentville-build-week-hero.png` | Captured and inspected; larger layered farm, block-built HUD, humanoid Bert |
| Irrigation clue at judging viewport | `artifacts/screenshots/agentville-build-week-irrigation-cue-1280.png` | Captured and inspected at 1280×720; sign readable, canvas visible, no page overflow |
| Observe error at judging viewport | `artifacts/screenshots/agentville-build-week-observe-error-1280.png` | Captured and inspected at 1280×720; Bert question visible, no repair disclosed |
| Observe reward at judging viewport | `artifacts/screenshots/agentville-build-week-observe-success-1280.png` | Captured and inspected at 1280×720; stopped-flow evidence and Aha response visible |
| Humanoid Bert detail | `artifacts/screenshots/agentville-build-week-bert-detail.png` | Captured and inspected as a 2× nearest-neighbor crop; face, torso, paired limbs, hands, boots, overalls, hat, and wrench readable |
| Humanoid Bert in lesson | `artifacts/screenshots/agentville-build-week-bert-teaching.png` | Captured from the composited page; Bert, speech, and stopped-flow evidence are adjacent with zero measured overlay coverage of his geometry-derived bounds |
| Decide reward at judging viewport | `artifacts/screenshots/agentville-build-week-decide-aha-1280.png` | Captured and inspected at 1280×720; lightbulb, agent-boundary note, and controls contained |
| Grand repaired payoff | `artifacts/screenshots/agentville-build-week-grand-payoff-1280.png` | Captured and inspected at 1280×720 before the receipt; channel clear, 3/3 beds watered, Verify visible |
| Compiler error | `artifacts/screenshots/agentville-build-week-compiler-error.png` | Captured and inspected |
| Failure frame | `artifacts/screenshots/agentville-build-week-failure.png` | Captured and inspected; failed Act line and Codex Coach are fully inside the visible trace viewport |
| Receipt frame | `artifacts/screenshots/agentville-build-week-receipt.png` | Captured and inspected |
| Debrief at judging viewport | `artifacts/screenshots/agentville-build-week-debrief-1280.png` | Captured and inspected at 1280×720; no clipping or scroll |
| Feedback continuity | `artifacts/screenshots/agentville-build-week-feedback.png` | Captured and inspected |
| Mobile Workbench | `artifacts/screenshots/agentville-build-week-mobile-390.png` | Captured and inspected at 390×844; two-column language slots, 44px actions, no horizontal overflow |
| Mobile feedback | `artifacts/screenshots/agentville-build-week-feedback-mobile-390.png` | Captured and inspected at 390×844; rating captions remain visible and rating/consent targets meet 44px |
| Local machine evidence | `artifacts/evidence/latest-smoke.json` | PASS against production `dist/`, 266/266; diagnostics empty |
| Public mission smoke | `artifacts/evidence/latest-public-smoke.json` via `npm run test:public` | PASS — 266/266; console, page, request, response, and dialog diagnostics empty |
| Human evidence | `artifacts/evidence/playtest-YYYY-MM-DD-<tester>.json` | Pending genuine sessions |
| Source evidence | [github.com/b33fydan/agentville-build-week](https://github.com/b33fydan/agentville-build-week) | PUBLIC repository; first deployed commit `cb57621` |
| Deployment evidence | [b33fydan.github.io/agentville-build-week](https://b33fydan.github.io/agentville-build-week/) | PASS — HTTP 200; Voxel Field Rig [Actions run 29670780954](https://github.com/b33fydan/agentville-build-week/actions/runs/29670780954) succeeded at `c8ab4db` on 2026-07-18 |

## Deployment snapshot

- **Supported judging browser:** Chromium desktop, 1280×720 or larger
- **Source:** [https://github.com/b33fydan/agentville-build-week](https://github.com/b33fydan/agentville-build-week)
- **Playable build:** [https://b33fydan.github.io/agentville-build-week/](https://b33fydan.github.io/agentville-build-week/)
- **First successful deployment:** Actions run `29554682024` at commit `cb57621`
- **Learner-debrief deployment:** Actions run `29618190795` at commit `8d2f0b5`
- **Irrigation-clue deployment:** Actions run `29621501693` at commit `8c01c21`
- **Latest predecessor proof deployment:** Actions run `29621632492` at commit `5290b08`
- **Progressive lesson deployment:** Actions run `29650610214` at commit `1c6c9eb`
- **Voxel Field Rig deployment:** Actions run `29670780954` at commit `c8ab4db`
- **Public verification:** HTTP 200 plus `npm run test:public` with 266/266 browser assertions and empty diagnostics
- **Still pending:** three genuine playtests, demo video URL, and any separate Build Week `/feedback` ID

## `/feedback` continuity contract

The successful mission creates a receipt ID in the form `AVBW-<date>-<token>`. The feedback link must carry it as the `session_id` query parameter. The feedback page must display the ID, preserve it on reload, and include it unchanged in the exported feedback JSON. A missing or rewritten ID is a submission-blocking failure.
