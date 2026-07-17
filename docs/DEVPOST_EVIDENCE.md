# Devpost Evidence Ledger

**Created:** 2026-07-16

**Status:** Automated local and public production evidence captured; video, human playtests, and any separate event-issued `/feedback` ID remain genuine external gates.

**Codex development task ID:** `019f6e24-76bc-71f2-b326-0b13c9eafd04` — preserved for `/feedback` traceability.

## Required submission artifacts

- [x] Public playable URL and declared supported browser
- [x] Source repository URL and first deployed commit hash
- [ ] Two-to-three-minute uncut critical-flow demo
- [x] Hero screenshot showing the farm and Agent Workbench
- [x] Compiler-error screenshot with line number and fix suggestion
- [x] Failed-verification screenshot with blocked water visible
- [x] Passing receipt screenshot with session ID visible
- [x] `/feedback/` screenshot showing the same session ID
- [x] Automated production smoke log
- [ ] Three genuine first-time playtest records and completion times
- [x] Clean-room source/assets disclosure
- [x] Codex/GPT-5.6 collaboration disclosure

## Acceptance evidence index

| Criterion | Artifact or command | Status |
| --- | --- | --- |
| A1 | `npm run test:public` against [GitHub Pages](https://b33fydan.github.io/agentville-build-week/) | PASS — 92/92 public browser assertions |
| A2–A15 | `npm run smoke` | PASS — 23/23 Node tests + 92/92 local browser assertions |
| Hero frame | `artifacts/screenshots/agentville-build-week-hero.png` | Captured and inspected |
| Compiler error | `artifacts/screenshots/agentville-build-week-compiler-error.png` | Captured and inspected |
| Failure frame | `artifacts/screenshots/agentville-build-week-failure.png` | Captured and inspected |
| Receipt frame | `artifacts/screenshots/agentville-build-week-receipt.png` | Captured and inspected |
| Feedback continuity | `artifacts/screenshots/agentville-build-week-feedback.png` | Captured and inspected |
| Local machine evidence | `artifacts/evidence/latest-smoke.json` | PASS against `dist/`; diagnostics empty |
| Public mission smoke | `artifacts/evidence/latest-public-smoke.json` via `npm run test:public` | PASS — 92/92; console, page, request, response, and dialog diagnostics empty |
| Human evidence | `artifacts/evidence/playtest-YYYY-MM-DD-<tester>.json` | Pending genuine sessions |
| Source evidence | [github.com/b33fydan/agentville-build-week](https://github.com/b33fydan/agentville-build-week) | PUBLIC repository; first deployed commit `cb57621` |
| Deployment evidence | [b33fydan.github.io/agentville-build-week](https://b33fydan.github.io/agentville-build-week/) | PASS — HTTP 200; [Actions run 29554682024](https://github.com/b33fydan/agentville-build-week/actions/runs/29554682024) succeeded on 2026-07-17 |

## Deployment snapshot

- **Supported judging browser:** Chromium desktop, 1280×720 or larger
- **Source:** [https://github.com/b33fydan/agentville-build-week](https://github.com/b33fydan/agentville-build-week)
- **Playable build:** [https://b33fydan.github.io/agentville-build-week/](https://b33fydan.github.io/agentville-build-week/)
- **First successful deployment:** Actions run `29554682024` at commit `cb57621`
- **Public verification:** HTTP 200 plus `npm run test:public` with 92/92 browser assertions
- **Still pending:** three genuine playtests, demo video URL, and any separate Build Week `/feedback` ID

## `/feedback` continuity contract

The successful mission creates a receipt ID in the form `AVBW-<date>-<token>`. The feedback link must carry it as the `session_id` query parameter. The feedback page must display the ID, preserve it on reload, and include it unchanged in the exported feedback JSON. A missing or rewritten ID is a submission-blocking failure.
