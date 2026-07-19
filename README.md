# AgentVille: Build Week Edition

**A five-minute voxel lesson about building agents that prove their work.**

AgentVille: Build Week Edition is a clean-room browser game for OpenAI Build Week's Education track. A player teaches one humanoid voxel farmhand named Bert a tiny, safe program one instruction at a time; sees Bert react to each idea; compiles the complete loop; discovers that valid syntax can still produce the wrong result; repairs one line; and receives a verification receipt derived from the changed farm. A final mission debrief translates the four commands into plain language and tells the player exactly what they accomplished.

**Play:** [b33fydan.github.io/agentville-build-week](https://b33fydan.github.io/agentville-build-week/) · **Source:** [github.com/b33fydan/agentville-build-week](https://github.com/b33fydan/agentville-build-week)

![AgentVille Build Week Edition showing the layered voxel farm, humanoid Bert, and typed Agent Workbench](artifacts/screenshots/agentville-build-week-hero.png)

The whole lesson is one causal chain:

```text
observe the irrigation
        ↓
decide whether the evidence shows a blockage
        ↓
act on the cause, not the symptom
        ↓
verify the resulting world state
```

## Play locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). No account, API key, build tool, or runtime network request is required.

## The mission

The opening shows a layered voxel farm, humanoid Bert, three dry tomato beds, and a block-built **IRRIGATION** sign—but does not label the cause. The sign gives a first-time learner the missing noun for `observe ___` without revealing the blockage or its repair. The Workbench then checks exactly one new instruction at a time:

```agent
observe irrigation
decide if irrigation is blocked
act water tomatoes
verify tomatoes are watered
```

Each accepted prefix creates a small, non-authoritative rehearsal: Bert walks to the channel after Observe, names the evidence after Decide, and gets ready to test the chosen action. Those rewards never change the farm or create a plan. Only all four lines can pass the strict compiler and unlock **Run full program**.

The guided first complete draft is valid and safe, but it fails honestly: watering cannot pass the obstruction. The compiler trace connects the failed verification to line 3. The player repairs only the causal action:

```agent
act clear blockage
```

Bert replays all four instructions, clears the jam, releases water through the downstream channel, recovers all three beds, and verifies a receipt with before/after evidence. The closing debrief explains the loop as **Look → Choose → Change → Check**, names the learner's work as debugging an agent, and reveals a locked Lesson 02 weather signal: plant the east field before rain makes the soil muddy.

## Voxel Field Rig

The complete interface uses one clean-room material language: a sunlit hand-built farm diorama mounted inside a square, beveled spruce-and-metal field console. The procedural scene has two visible terrain layers, stepped distant fields, stone-lined irrigation, a bridge, reservoir and pump, shed, fences, crates, hay, rocks, flowers, trees, and crop beds that visibly recover during the repaired run.

Bert is constructed from rendered voxel anatomy rather than a single mascot block: two booted legs, torso and overalls, two arms and hands, head, face, hair, straw hat, and a blocky wrench. His silhouette changes for walking, inspection, thinking, repair, and verification. The renderer accumulates bounds from the voxel geometry and tool it actually drew, then exposes that evidence through `render_game_to_text()`. The browser smoke checks the visual contract and proves teaching overlays do not cover Bert without giving presentation code authority over the farm.

The surrounding Voxel Field Rig keeps the farm dominant while turning the mission rail, status plates, safe-language slots, editor, trace, buttons, receipt, and feedback page into one game-like system. Learner code remains at least 13px, learner guidance is 10–12px, core controls remain at least 44px tall, and the responsive smoke covers 1600×900, 1280×720, and a 390px mobile Workbench. During execution and failure, the trace follows the current evidence so the failed action and Codex Coach remain visibly together.

## Why this teaches agents

Most coding lessons stop at “the program ran.” AgentVille separates six ideas a beginning builder can see:

1. **Syntax:** Is the program inside the safe language?
2. **Plan:** What will each instruction ask the agent to do?
3. **Execution:** What did Bert actually attempt?
4. **Diagnosis:** Why did the world remain unchanged?
5. **Verification:** Does the resulting farm satisfy the goal?
6. **Reflection:** What did each line contribute, and what did the learner just do?

The failure is not a game-over screen. It is the lesson: an agent can follow a valid plan that addresses a symptom instead of a cause.

## Safe language boundary

The Workbench is an allowlisted parser, not an embedded scripting engine. A separate frozen prefix validator checks lesson lines without ever producing an executable plan. The full compiler accepts only four ordered lines and two possible actions for this bounded mission. Neither path calls `eval`, `Function`, a shell, the filesystem, or the network. Loops, comments, extra phases, JavaScript punctuation, browser globals, network primitives, and forged plans fail before world execution.

The compiler creates an immutable plan. The deterministic mission simulator is the only code allowed to mutate farm state. Canvas animation reflects that state; it cannot award a PASS.

## GPT-5.6 and Codex collaboration

This repository was created with Codex/GPT-5.6 as an engineering and curriculum collaborator on 2026-07-16. The collaboration produced:

- the bounded five-minute acceptance contract;
- the `observe → decide → act → verify` teaching language;
- line-specific compiler explanations and repair suggestions;
- the causal failure/repair script for Bert;
- the clean-room Voxel Field Rig art direction and humanoid Bert silhouette;
- sandbox, determinism, browser, and evidence tests;
- the Devpost evidence and `/feedback` continuity contract.

The in-game **Codex Coach** uses a small set of deterministic, locally shipped explanations authored during that collaboration. There is intentionally no live model call in the mission-critical path. A judge or learner can always finish without credentials or connectivity, and a model can never invent a passing receipt. A future live-coaching seam may expand explanations, but the local compiler and world verifier must remain authoritative.

No code, assets, screenshots, or generated artifacts were copied from `/Volumes/beefybackup/AgentVille`. That older project was treated as reference-only and was not inspected for implementation material during this build. Every visible game asset in this repository is drawn procedurally with Canvas 2D and CSS.

## Architecture

```text
real textarea
    │
    ▼
prefix validator ── safe rehearsal only; no world authority
    │
    ▼ all four lines
src/compiler.js ── immutable allowlisted plan
    │
    ▼
src/mission.js  ── deterministic before/after evidence + receipt
    │
    ├── src/debrief.js ── truthful plain-language learning recap
    ├── src/app.js      ── lesson state, trace, feedback continuity
    └── src/world.js    ── procedural isometric farm presentation
```

- `src/compiler.js` — non-executable prefix checks plus the strict four-line compiler and safety diagnostics
- `src/mission.js` — pure mission transitions and world-state receipt
- `src/debrief.js` — immutable end-of-mission explanation derived from the receipt
- `src/world.js` — layered procedural isometric farm, rendered presentation evidence, irrigation, crops, props, and humanoid Bert
- `src/app.js` — deterministic timeline, accessible Workbench, state hooks
- `feedback/` — session-preserving local feedback and JSON evidence export
- `tests/` — Node tests for the language and simulator
- `scripts/smoke-browser.mjs` — full production-browser mission validation
- `docs/ACCEPTANCE.md` — bounded automated and manual definition of done
- `docs/DEVPOST_EVIDENCE.md` — honest submission evidence ledger

## Validation

```bash
npm test              # compiler, sandbox, state transitions, receipts
npm run test:browser  # progressive teaching → full run → FAIL → repair → PASS
npm run test:public   # same full flow against the live Pages URL
npm run smoke         # unit tests + production build + browser flow
npm run capture       # refresh the canonical submission screenshots
```

The app also exposes two deterministic automation seams:

- `window.render_game_to_text()` returns the canonical visible/interactive mission state.
- `window.advanceTime(ms)` advances the animation at fixed 60 Hz steps.

The browser smoke rejects console/page errors, external requests, state/DOM disagreement, missing session continuity, and a false PASS. Machine-readable results are written to `artifacts/evidence/latest-smoke.json` for local production and `artifacts/evidence/latest-public-smoke.json` for the deployed build.

The Voxel Field Rig candidate passes 28/28 Node tests and 266/266 local production-dist browser assertions. The last deployed progressive release remains separately proven at 214/214 public assertions until this visual candidate is published and rerun against Pages.

## Production build and deployment

```bash
npm run build
node scripts/serve.mjs --root=dist --port=4173
```

`dist/` is a static site. The canonical deployment is [GitHub Pages](https://b33fydan.github.io/agentville-build-week/), published from `main` by `.github/workflows/pages.yml`. Each push installs Chromium, runs `npm run smoke`, uploads `dist/`, and deploys only after validation passes. The first successful deployment was [Actions run 29554682024](https://github.com/b33fydan/agentville-build-week/actions/runs/29554682024) at commit `cb57621` on 2026-07-17.

The live root and `/feedback/` route return HTTP 200. The progressive lesson deployed successfully in [Actions run 29650610214](https://github.com/b33fydan/agentville-build-week/actions/runs/29650610214) at commit `1c6c9eb` on 2026-07-18, then `npm run test:public` completed all 214 browser assertions with empty diagnostics. `vercel.json` and `netlify.toml` remain valid alternate-host declarations. No deployment path requires a server function or application secret.

## Submission evidence

The successful receipt ID is carried unchanged to:

```text
/feedback/?session_id=<receipt-session-id>
```

The feedback page displays that ID, matches it against the locally preserved receipt, and includes it unchanged in the downloadable JSON response. See [docs/DEVPOST_EVIDENCE.md](docs/DEVPOST_EVIDENCE.md) for the artifact ledger. Public deployment is proven; human playtests, the demo video, and any separate event-issued `/feedback` ID remain incomplete until genuine evidence exists.

## Scope

This edition is intentionally one playable mission, one farm, one agent, one failure, and one proof. Lesson 02 is a polished teaser, not another playable feature. The build does not include free play, multiple agents, procedural worlds, accounts, arbitrary scripting, or a live AI dependency. Coherence is the feature.

## License

MIT. See [LICENSE](LICENSE).
