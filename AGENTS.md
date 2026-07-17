# AgentVille: Build Week Edition — Agent Instructions

## Product boundary

This repository is a clean-room browser game built for OpenAI Build Week's Education track. `/Volumes/beefybackup/AgentVille` is reference-only: never copy or adapt code, assets, screenshots, or generated artifacts from it.

The product is one coherent five-minute mission. The player writes a four-line `observe → decide → act → verify` program, compiles it, watches Bert encounter blocked irrigation, repairs the program after an honest failure, and receives a verification receipt proving the farm changed.

## Runtime rules

- Keep the core mission static-hostable and playable without an account, API key, or network request.
- Parse the teaching language with an explicit allowlist. Never use `eval`, `Function`, arbitrary JavaScript, filesystem access, or player-triggered network access.
- The deterministic compiler and simulator own world mutation. Educational model assistance may explain results but must never decide whether verification passes.
- Preserve `window.render_game_to_text()` and `window.advanceTime(ms)` for automation.
- New behavior requires a Node test or browser-smoke assertion.
- Generated evidence belongs under `artifacts/`; never fabricate human playtest results or a public deployment URL.

## Commands

```bash
npm run dev
npm test
npm run test:browser
npm run smoke
npm run build
```

## External-volume hygiene

Use `COPYFILE_DISABLE=1` for package and Git writes. Remove `._*` sidecars before staging and final verification. Do not touch unrelated repositories on `/Volumes/beefybackup`.
