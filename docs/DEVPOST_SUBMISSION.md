# Devpost Submission Draft

**Project:** AgentVille: Build Week Edition

**Track:** Education

**Tagline:** Three five-minute voxel missions where a beginner programs Bert, learns from an honest failure, repairs one line, and proves the farm changed.

**Public URL:** [https://b33fydan.github.io/agentville-build-week/](https://b33fydan.github.io/agentville-build-week/)

**Source:** [https://github.com/b33fydan/agentville-build-week](https://github.com/b33fydan/agentville-build-week)

> Submission-evidence note, 2026-07-20: the three-mission course passes 58/58 Node tests and 735/735 production-browser assertions with empty diagnostics; all 15 current-release captures were inspected. Commit, public deployment, and a fresh public smoke are still pending. The live URL currently demonstrates the preceding release and must not yet be cited as proof of all three missions.

## Inspiration

Agent tutorials often explain planning with abstract boxes and arrows. Beginner coding lessons often stop as soon as code runs. We wanted a small, tactile experience that teaches the missing idea between them: an agent's intention is not proof of a correct outcome.

Farming makes that visible. A plan can be syntactically valid and still water the wrong thing, react too late, or look in the wrong place. The world does not care how confident the plan sounds; it changes only when the evidence, decision, and action line up.

## What it does

AgentVille is a three-lesson course built around one humanoid voxel farmhand named Bert and one typed Agent Workbench. Every mission follows the same safe shape:

```text
observe the <subject>
decide <response> when <full condition clause>
act on the decision
verify <goal clause>
```

The learner enters one instruction at a time. Bert responds with movement, questions, “Aha” moments, and visible planning cues, but those partial rehearsals cannot change the world or create proof. Once all four lines compile, Bert replays the complete plan against an authoritative deterministic simulation. A valid guided program fails for one understandable reason. The learner repairs exactly one line, reruns it, watches the payoff, and receives a receipt derived from before/after state.

### Mission 01 — Repair the East Channel

The opening farm contains three dry tomato beds and an **IRRIGATION** sign. It gives a beginner enough vocabulary to infer `observe the east channel` without revealing the repair.

The guided program chooses `decide water the tomatoes when the beds are dry`. That condition is true, and shared line 3—`act on the decision`—faithfully executes direct watering. But the East Channel is blocked, so Verify reports that 0 of 3 beds were watered. The Codex Coach points to line 2: the plan treated the symptom rather than the cause.

The learner changes only line 2 to `decide clear the blockage when the water is blocked`. Bert clears the debris, water travels downstream, all three beds recover, and Verify issues a PASS receipt.

### Mission 02 — Storm Watch

Mission 01's PASS unlocks a real second mission, not a teaser. Uncovered seedling beds sit near covers by the shed while dark clouds build around a **WEATHER** vane.

The guided program observes the sky but waits to `decide cover the beds when rain falls`. The observation contains rain evidence, and rain is currently false, so Decide selects no response and Act makes no change. The simulator advances a fixed 60 Hz timeline; at tick 150 the scripted storm reaches the uncovered beds. Verify reports battered seedlings, and the Coach explains that the rain trigger fired after the harm.

The learner changes only line 2 to `decide cover the beds when clouds gather`. The leading signal is already true in the observed evidence, Bert covers all three beds before the same deterministic storm event, and Verify proves the seedlings stayed safe.

### Mission 03 — The Hungry Hens

Storm Watch's PASS unlocks the final lesson. Three hungry hens wait at an empty tray beneath a full feeder with a jammed chute and a **FEEDER** sign.

The guided program begins with `observe the feeder` and later asks whether the hens are hungry. The feeder observation reports the jam but contains no hen-hunger fact. Decide evaluates only evidence actually gathered by line 1—never a hidden global snapshot—so it records the condition as unsupported rather than false. No response is selected, Act makes no change, and Verify reports that no hen ate. The Coach points to line 1: the program looked in the wrong place.

The learner changes only line 1 to `observe the hens`. That observation supplies the missing hunger evidence; Decide selects chute repair; Bert unjams the feeder; grain drops; every hen eats; and Verify completes the course.

### The payoff

Each PASS opens a field-note debrief that translates the program into **Look → Choose → Change → Check** and names what the learner repaired: a decision, a timing trigger, or an observation. A successful receipt unlocks the next mission in order. After Mission 03, the course explicitly celebrates all three verified lessons.

The receipt's mission ID and session ID travel together to `/feedback`, where the learner can save and export a local JSON response tied to the correct proof.

## How we built it

The game is a static HTML, CSS, and JavaScript application. Canvas 2D draws the isometric voxel farm procedurally; there are no downloaded game assets. The clean-room **Voxel Field Rig** combines a layered terrain diorama, irrigation, shed, waterworks, fences, crops, seedlings, weather props, feeder, hens, trees, and small farm details with one block-built HUD and Workbench. Bert is assembled from separately rendered humanoid anatomy and action poses rather than a single mascot block.

### A mission registry instead of three hardcoded games

`src/mission-registry.js` is the course's single source of lesson truth. Every immutable mission definition owns:

- identity, order, prerequisite, objective, and unlock;
- initial state, normalization, snapshots, and deterministic keys;
- exact allowlisted commands and Decide-to-Act bindings;
- observation collectors and their scoped fact records;
- condition evaluators, state transitions, and verification predicate;
- fixed-tick events;
- Coach, debrief, UI, and voxel-world metadata.

The compiler, simulator, app, debrief, and course-progress reducer consume the active definition. That keeps the language and world behavior aligned while still allowing each lesson to teach a different failure.

### Safe programs and scoped evidence

The Workbench is an explicit allowlist, not arbitrary scripting. A frozen prefix checker can validate lesson steps but cannot emit an executable plan. The full compiler privately mints a deeply frozen, mission-bound four-step plan. A cloned, forged, cross-mission, source-mismatched, or inconsistently bound plan fails closed. There is no `eval`, `Function`, shell, filesystem, network primitive, loop, or user-defined function reachable from a player program.

The simulator privately mints line 1's observation evidence for the exact plan. Decide may inspect only that evidence. This creates an important educational distinction:

- **Supported and false:** the observation contains the fact, but it is currently false, as in Storm Watch before rain.
- **Unsupported:** the observation never established the fact, as in the feeder observation that says nothing about hen hunger.

Shared `act on the decision` carries out only the selected response. Verify alone judges the final registered goal.

### Deterministic events and proof

Mission 02 uses a simulator-owned event at tick 150 on a fixed 60 Hz timeline. It never consults wall-clock time or randomness. The guided run and repaired run receive the same storm; only the learner's earlier decision changes whether the beds are protected.

Execution receipts use `agentville.receipt.v2`. Each stores the mission and session identity, exact source, before/after state, observation scope, condition support/truth/reason, selected and executed action, scripted events, and verdict. Feedback uses `agentville.feedback.v2` and composite mission/session storage keys so one lesson's response cannot attach to another lesson's receipt.

The canvas and Coach consume simulator evidence but cannot mutate the farm, unlock a lesson, or award PASS.

## GPT-5.6 / Codex collaboration

Codex/GPT-5.6 worked as an engineering, curriculum, visual-design, and verification collaborator. Human feedback shaped the key educational moments: give a novice a diegetic observation noun, reward each accepted line, make Decide choose a response rather than repeat a fact, explain the learner's accomplishment at the end, and turn the weather cliffhanger into a real sequence.

Codex helped convert that direction into:

- a bounded five-minute-per-mission acceptance contract;
- the four-phase plain-English safe language;
- three distinct causal failures and single-line repairs;
- a mission registry and ordered unlock reducer;
- observation-scoped evidence with unsupported-versus-false semantics;
- the deterministic fixed-tick storm;
- line-specific Coach and debrief copy;
- the Voxel Field Rig and humanoid Bert;
- compiler, simulator, renderer, browser, receipt, feedback, and submission evidence.

The shipped **Codex Coach** is deterministic prose authored during that collaboration. There is no live GPT or OpenAI API dependency in the critical path, so every learner can complete the course without a key and no model can hallucinate a PASS. The compiler and world verifier remain authoritative.

## Challenges

- Designing three failures that feel fair and teach different concepts rather than repeating the same repair
- Explaining the difference between a condition that is false and evidence that was never observed
- Keeping `act on the decision` generic while binding it safely to a mission-specific response
- Making a fixed-tick storm visible without allowing animation timing to determine truth
- Synchronizing Bert movement, trace evidence, world events, unlocks, and receipts
- Fitting farm, editor, Coach, debrief, and proof into a readable 1280×720 judging view
- Keeping Bert unmistakably humanoid while every visible asset remains procedural
- Preserving a clean-room boundary and evidence chain on a macOS external volume that creates AppleDouble files

## Accomplishments

- Three coherent five-minute missions with one recognizable agent and one shared language
- Three honest failures: wrong response, late trigger, and missing observation evidence
- A real typed editor with mission-aware diagnostics and no evaluation seam
- A registry-driven course with ordered PASS-only unlocks
- One generic Act instruction across every mission
- A deterministic simulator-owned storm at fixed 60 Hz tick 150
- Observation evidence that distinguishes unsupported from supported-false conditions
- Mission-bound `agentville.receipt.v2` proof and `agentville.feedback.v2` continuity
- Progressive Bert reactions that reward authoring without granting partial programs authority
- A substantial clean-room voxel farm and cohesive Voxel Field Rig with no external art assets
- Local unit, production-browser, sequential interaction, generic-client, and renderer proof
- A static artifact that requires no backend, key, account, or runtime network

## Validation status

Current verified worktree evidence on 2026-07-20:

- **58/58 Node tests passed.**
- The production `dist/` browser smoke passed **735/735 assertions** with empty console, page, external-request, request-failure, response, dialog, and runner diagnostics.
- All **15/15** current-release captures were generated and visually inspected.
- A local manual sequential Playwright run completed Mission 01 → Mission 02 → Mission 03.
- Direct renderer proof passed **16/16** checks.
- The provided generic web-game client completed successfully; its state and canvas output were inspected.

Still pending before the three-mission release can be claimed complete:

- GitHub Pages deployment of this worktree;
- `npm run test:public` against that deployment;
- three genuine first-time learner sessions;
- the demo video;
- any separate event-issued `/feedback` session ID.

Earlier public and browser results remain historical evidence for their exact commits; they are not being reused as proof of this worktree.

## What we learned

The four words are a useful map, but the learning lives in the relationships between them. Observe establishes a scope. Decide selects a bounded response only from evidence inside that scope. Act executes the response instead of deciding again. Verify checks the resulting world instead of trusting intention.

We also learned that a useful failure should preserve agency. The learner's syntax can be valid while the behavior is wrong; the evidence should make the cause legible; and one small repair should produce a visible, satisfying payoff.

Model-assisted educational design benefits from a hard authority boundary. Explanations can become richer, but proof must remain deterministic.

## What's next

The immediate next step is evidence, not another feature: commit and publish the verified static artifact, prove GitHub Pages serves that exact SHA, rerun the complete course at the public URL, record the demo, and conduct genuine novice playtests.

After submission, an optional live coaching seam could offer more ways to explain already-produced compiler and simulator evidence. It would remain unable to create plans, change the farm, unlock missions, or issue receipts.

## Technologies

JavaScript · HTML · CSS · Canvas 2D · Node.js test runner · Playwright · Codex / GPT-5.6 · GitHub Actions · GitHub Pages
