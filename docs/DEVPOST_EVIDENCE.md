# Devpost Evidence Ledger

**Created:** 2026-07-16

**Status:** Automated production evidence captured; public deployment, video, remote source URL, and human playtests remain genuine external gates.

**Codex development task ID:** `019f6e24-76bc-71f2-b326-0b13c9eafd04` — preserved for `/feedback` traceability.

## Required submission artifacts

- [ ] Public playable URL and declared supported browser
- [ ] Source repository URL and final commit hash
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
| A1 | Production `dist/` boot in Chromium | Local PASS; public URL pending host authorization |
| A2–A15 | `npm run smoke` | PASS — 20 unit + 92 browser assertions |
| Hero frame | `artifacts/screenshots/agentville-build-week-hero.png` | Captured and inspected |
| Compiler error | `artifacts/screenshots/agentville-build-week-compiler-error.png` | Captured and inspected |
| Failure frame | `artifacts/screenshots/agentville-build-week-failure.png` | Captured and inspected |
| Receipt frame | `artifacts/screenshots/agentville-build-week-receipt.png` | Captured and inspected |
| Feedback continuity | `artifacts/screenshots/agentville-build-week-feedback.png` | Captured and inspected |
| Machine evidence | `artifacts/evidence/latest-smoke.json` | PASS against `dist/`; diagnostics empty |
| Human evidence | `artifacts/evidence/playtest-YYYY-MM-DD-<tester>.json` | Pending genuine sessions |
| Deployment evidence | Public URL + rehearsal date | Pending; Vercel and Netlify both unauthenticated locally |

## `/feedback` continuity contract

The successful mission creates a receipt ID in the form `AVBW-<date>-<token>`. The feedback link must carry it as the `session_id` query parameter. The feedback page must display the ID, preserve it on reload, and include it unchanged in the exported feedback JSON. A missing or rewritten ID is a submission-blocking failure.
