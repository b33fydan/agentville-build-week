# Devpost Evidence Ledger

**Created:** 2026-07-16

**Status:** Collection scaffold — do not mark evidence complete without the artifact.

## Required submission artifacts

- [ ] Public playable URL and declared supported browser
- [ ] Source repository URL and final commit hash
- [ ] Two-to-three-minute uncut critical-flow demo
- [ ] Hero screenshot showing the farm and Agent Workbench
- [ ] Compiler-error screenshot with line number and fix suggestion
- [ ] Failed-verification screenshot with blocked water visible
- [ ] Passing receipt screenshot with session ID visible
- [ ] `/feedback/` screenshot showing the same session ID
- [ ] Automated smoke log from the final commit
- [ ] Three genuine first-time playtest records and completion times
- [ ] Clean-room source/assets disclosure
- [ ] Codex/GPT-5.6 collaboration disclosure

## Acceptance evidence index

| Criterion | Artifact or command | Status |
| --- | --- | --- |
| A1–A15 | `npm run smoke` | Pending implementation |
| Hero frame | `artifacts/screenshots/agentville-build-week-hero.png` | Pending capture |
| Failure frame | `artifacts/screenshots/agentville-build-week-failure.png` | Pending capture |
| Receipt frame | `artifacts/screenshots/agentville-build-week-receipt.png` | Pending capture |
| Feedback continuity | `artifacts/screenshots/agentville-build-week-feedback.png` | Pending capture |
| Machine evidence | `artifacts/evidence/latest-smoke.json` | Pending implementation |
| Human evidence | `artifacts/evidence/playtest-YYYY-MM-DD-<tester>.json` | Pending genuine sessions |
| Deployment evidence | Public URL + rehearsal date | Pending deployment |

## `/feedback` continuity contract

The successful mission creates a receipt ID in the form `AVBW-<date>-<token>`. The feedback link must carry it as the `session_id` query parameter. The feedback page must display the ID, preserve it on reload, and include it unchanged in the exported feedback JSON. A missing or rewritten ID is a submission-blocking failure.
