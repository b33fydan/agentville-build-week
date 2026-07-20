# Bounded Acceptance Specification

**Product:** AgentVille: Build Week Edition

**Track:** OpenAI Build Week — Education

**Specified:** 2026-07-16

**Three-mission revision:** 2026-07-20

**Course:** Repair the East Channel → Storm Watch → The Hungry Hens

## Definition of done

A first-time player can open the static game in a desktop browser and complete each deterministic mission in about five minutes. In every mission the learner teaches Bert one sandboxed `observe → decide → act → verify` program, runs a valid but behaviorally flawed guided draft, reads the resulting evidence, repairs exactly one line, reruns the complete program, and receives a mission-bound verification receipt derived from the resulting world state.

The three missions must form one ordered course:

1. Mission 01 teaches cause versus symptom.
2. Mission 02 teaches leading versus lagging signals.
3. Mission 03 teaches observation scope and evidence availability.

The critical path must remain static, deterministic, credential-free, and network-free. Compiler and simulator evidence is authoritative; Coach and canvas presentation are explanatory only.

## Exact safe-language contract

The only grammatical shape is:

```text
observe the <subject>
decide <response> when <full condition clause>
act on the decision
verify <goal clause>
```

Commands use lowercase letters and spaces only. `act on the decision` is identical in all three missions. The active mission's immutable registry entry supplies the exact allowlist; a command accepted for one mission must not gain authority in another.

| Mission | Guided program | Single-line repair |
| --- | --- | --- |
| `repair-east-channel` | `observe the east channel`<br>`decide water the tomatoes when the beds are dry`<br>`act on the decision`<br>`verify every tomato bed is watered` | Line 2 → `decide clear the blockage when the water is blocked` |
| `storm-watch` | `observe the sky`<br>`decide cover the beds when rain falls`<br>`act on the decision`<br>`verify the seedlings are safe` | Line 2 → `decide cover the beds when clouds gather` |
| `hungry-hens` | `observe the feeder`<br>`decide unjam the chute when the hens are hungry`<br>`act on the decision`<br>`verify every hen has eaten` | Line 1 → `observe the hens` |

## Automated acceptance

### Course, authority, and presentation

| ID | Pass condition | Evidence obligation |
| --- | --- | --- |
| A1 | Production opens in Chromium with no install beyond static assets, account, API key, backend, or runtime network dependency. | Production-dist browser smoke; same-origin request audit; empty console/page/request-failure diagnostics |
| A2 | One immutable registry owns each mission's ID, order, prerequisite, initial state, commands, Decide bindings, observations, condition evaluators, action transitions, verification predicate, Coach/debrief copy, timeline, UI metadata, and world metadata. Compiler, simulator, debrief, app, and progress consume the active definition. | Registry-schema Node tests; cross-module browser state assertions |
| A3 | The Workbench guides `observe`, `decide`, `act`, `verify` one line at a time while still accepting a complete allowlisted four-line program. Prefix checks may rehearse but cannot mint a plan, mutate state, advance revision, enable execution, or issue a receipt. | Prefix/compiler Node tests; browser world-hash and plan-authority assertions |
| A4 | Only a compiler-minted, deeply frozen, mission-bound plan can reach the simulator. Clones, forged bindings/evidence, cross-mission plans, source mismatch, unknown mission IDs, legacy shorthand, JavaScript, network/file primitives, loops, comments, punctuation, extra phases, and nonallowlisted commands fail closed. | Compiler sandbox, brand, provenance, and cross-mission Node tests; browser invalid-input flow |
| A5 | Observe privately mints scoped evidence for the exact plan. Decide evaluates only those facts, never an unobserved global snapshot. Evidence distinguishes `conditionSupported: false, conditionMet: null` from a supported but false condition. | Observation-provenance and Mission 03 Node tests; trace/state browser assertions |
| A6 | Decide binds one response; shared line 3 carries out that response without choosing again. If no response is selected, Act reports `NO_ACTION_SELECTED` and leaves the world unchanged. | Binding/provenance Node tests; receipt/trace browser assertions |
| A7 | Verify alone decides `PASS` or `FAIL` from the post-action, post-event world. Coach, debrief, UI, and canvas cannot award proof. | Simulator and verifier Node tests; false-PASS browser guard |
| A8 | Passing Mission 01 unlocks Mission 02; passing Mission 02 unlocks Mission 03; FAIL unlocks nothing; locked missions cannot be selected; completing Mission 03 reports course completion. | Course-progress Node tests; sequential M1→M2→M3 browser flow |
| A9 | Reset restores the active mission's exact registered initial state, clears its run evidence, creates a new session, and preserves only valid course unlocks without reloading the document. | Determinism/reset Node tests; browser reset assertions |
| A10 | Replaying the same program from the same registered state produces the same transitions, snapshots, events, and verdict apart from session metadata. Runtime behavior must not depend on `Date.now()` or `Math.random()`. | Determinism Node tests; fixed-time browser rerun |
| A11 | Every receipt uses `agentville.receipt.v2` and carries `missionId`, mission name, `sessionId`, source/program, before/after snapshots and keys, observation command/scope, condition support/truth/reason, selected and executed action, scripted events, and verdict. | Receipt-shape Node tests; DOM/text-state browser parity |
| A12 | **Give feedback** opens `/feedback/?mission_id=<mission-id>&session_id=<session-id>`. Storage and `agentville.feedback.v2` exports key and preserve both IDs, refuse partial identity mixing, and report whether the matching local receipt exists. | Feedback-identity Node tests; sequential browser feedback assertions |
| A13 | PASS opens a mission-specific debrief explaining Look, Choose, Change, and Check; it identifies the repaired line/phase from matching FAIL and PASS receipts and remains truthful for direct success and already-satisfied paths. | Debrief Node tests; browser debrief assertions |
| A14 | The initial farm and every reset are visually deterministic. Mission 01 exposes **IRRIGATION**, Mission 02 exposes a **WEATHER** vane, covers, shed, clouds, and seedlings, and Mission 03 exposes **FEEDER**, full feeder, jammed chute, empty tray, and hens without placing repair answers in the Workbench. | Renderer direct proof; browser screenshots and accessible canvas/state description |
| A15 | Bert remains recognizably humanoid and visibly rehearses and executes all four phases. The farm, mission rail, editor, trace, Coach, receipt, unlock card, and feedback view remain contained at 1600×900, 1280×720, and 390×844 with readable learner text and 44px controls. | Computed-style/layout browser assertions; canonical desktop/judging/mobile captures |
| A16 | Water, channel banks, fence rails, and posts follow the shared projected map axes; prior zero-gap channel and fence joins remain intact across Mission 01 states. | Renderer-derived geometry assertions; blocked/flowing screenshots |
| A17 | The production artifact contains no copied reference-repository material or downloaded game assets. All visuals are procedural Canvas 2D and CSS. | Source manifest, repository scan, clean-room declaration |

### Required causal evidence for every mission

These are release obligations, not optional examples. Each row requires both Node assertions at the compiler/simulator boundary and browser-smoke assertions through the real editor, trace, world, Coach, debrief, receipt, and reset.

| Mission | Guided FAIL and evidence | Causal Coach | One-line repair PASS | Already-satisfied no-action | Nonallowlisted rejection |
| --- | --- | --- | --- | --- | --- |
| Mission 01 — `repair-east-channel` | Guided line 2 is supported and true; selected/executed action is `water tomatoes`; the blocked channel prevents the goal; Verify reports 0/3 watered and FAIL. | Coach focuses line 2 and explains that direct watering treats dry beds while the blockage stops the channel. | Change only line 2 to `decide clear the blockage when the water is blocked`; Act executes `clear blockage`; channel clears, water releases, 3/3 beds are watered, Verify PASS. | Rerun the repaired program on its satisfied state; `waterBlocked` is supported and false, no action is selected/executed, state key is unchanged, Verify remains PASS. | Reject legacy shorthand, unsupported observations/decisions, concrete Act lines, cross-mission commands, and any extra line without minting a plan. |
| Mission 02 — `storm-watch` | `observe the sky` includes rain evidence; `rain falls` is supported and false, so no response runs. At fixed 60 Hz tick 150, simulator event `storm-arrives` batters all three uncovered beds before Verify, which reports FAIL. | Coach focuses line 2 and explicitly explains that the rain trigger fired after the harm. | Change only line 2 to `decide cover the beds when clouds gather`; the supported true leading signal selects `cover beds`, all three beds are covered before the same tick-150 event, no seedlings are battered, Verify PASS. | Rerun the repaired program on its satisfied state; `cloudsGathering` is supported and false, no action is selected/executed, the storm event causes no harm or state-key change, Verify remains PASS. | Reject shorthand, alternate weather conditions, concrete Act lines, cross-mission commands, and extra lines without minting a plan. |
| Mission 03 — `hungry-hens` | `observe the feeder` reports a full feeder/jammed chute but no `hensHungry` fact. Decide records `conditionSupported: false` and `conditionMet: null`, selects no response, Act makes no change, 0/3 hens eat, Verify FAIL. | Coach focuses line 1 and explains that the learner looked in the wrong place for hunger evidence. | Change only line 1 to `observe the hens`; the observation supplies `hensHungry: true`, Decide selects `unjam chute`, grain drops, 3/3 hens eat, Verify PASS. | Rerun the repaired program on its satisfied state; hunger evidence is supported and false, no action is selected/executed, state key is unchanged, Verify remains PASS. | Reject `observe chickens`, unsupported nouns/decisions, concrete `act unjam chute`, cross-mission commands, and extra lines without minting a plan. |

## Current evidence checkpoint — 2026-07-20

| Gate | Status |
| --- | --- |
| Node compiler/registry/simulator/debrief/progress/feedback suite | **PASS — 58/58** |
| Local manual sequential Playwright flow, Mission 01 → Mission 02 → Mission 03 | **PASS** |
| Direct renderer proof | **PASS — 16/16** |
| Provided generic web-game client and inspected state/canvas output | **PASS** |
| Expanded production-dist browser smoke for all acceptance rows | **PASS — 735/735; empty diagnostics** |
| Canonical three-mission screenshot set | **PASS — 15/15 generated and visually inspected** |
| Public deployment and `npm run test:public` for this three-mission release | **PASS — runtime commit `f40613c`, Actions run `29784537727`, 735/735; empty diagnostics** |

Previous one-mission public/browser evidence remains valid only for its historical release. Current proof is the deployed runtime commit `f40613c` plus the schema-v3 local and public 735-assertion reports.

## Manual acceptance before submission

| ID | Pass condition | Evidence target | Status |
| --- | --- | --- | --- |
| H1 | At least two of three first-time testers complete one assigned mission within five minutes without verbal coaching. | Dated consented records under `artifacts/evidence/` | Pending genuine sessions |
| H2 | At least one tester completes the unlock chain through all three missions and can distinguish wrong response, late signal, and missing evidence. | Sequential playtest record and learner's own explanation | Pending genuine session |
| H3 | The final public deployment completes the exact three-mission course in the declared judging browser with matching mission/session feedback identity. | Live Pages URL + `npm run test:public` artifact | **PASS — 735/735; M01/M02/M03 identities matched** |
| H4 | The demo video shows all three guided failures, their single-line repairs, visible world changes, mission-bound receipts, unlock transitions, and feedback continuity. | Timestamped Devpost evidence index | Pending video |

## Non-goals for this build

- A fourth mission, free-play farming, procedural generation, an economy, or open-ended progression
- Loops, recursion, user-defined functions, or multi-agent orchestration
- Natural-language compilation, arbitrary code execution, accounts, multiplayer, or cloud saves
- A live model dependency in the mission-critical path
- Production analytics, mobile certification, or controller support
