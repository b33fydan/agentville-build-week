# Devpost Submission Draft

**Project:** AgentVille: Build Week Edition

**Track:** Education

**Tagline:** A five-minute voxel lesson where a learner programs one farm agent, diagnoses one honest failure, repairs the cause, and proves the world changed.

**Play:** [https://b33fydan.github.io/agentville-build-week/](https://b33fydan.github.io/agentville-build-week/)

**Source:** [https://github.com/b33fydan/agentville-build-week](https://github.com/b33fydan/agentville-build-week)

## Inspiration

Agent tutorials often explain planning in abstract boxes and arrows. Beginner coding lessons often stop when code runs. We wanted one small, tactile experience that teaches the missing idea between them: an agent's intention is not proof of a correct outcome.

Farming makes that idea visible. If water does not reach a tomato bed, the world remains dry no matter how confident the plan sounds.

## What it does

The player opens a layered voxel farm mounted inside a block-built field console. A humanoid voxel farmhand named Bert waits beside three dry tomato beds and an **IRRIGATION** sign. The cause is not labeled yet. The sign gives a beginner enough vocabulary to infer `observe irrigation` without revealing what Bert should do.

In the typed Agent Workbench they teach one safe instruction at a time: observe, decide, act, and verify. A wrong Observe gives Bert a whimsical question. The correct line makes him walk to the channel and report stopped flow. Decide produces a lightbulb and an accurate boundary lesson: agents can choose from evidence, but people define their goals, tools, and limits. These partial rehearsals are rewarding but deliberately non-authoritative; they cannot change the farm or create proof.

Their first program compiles. Bert executes it. It still fails because `act water tomatoes` treats the dry crops instead of the blockage. The execution trace and deterministic Codex Coach connect that failed verification to line 3. The player changes one instruction to `act clear blockage`, recompiles, and watches Bert clear the debris. Water travels downstream, the tomato beds visibly recover, and the verifier issues a receipt containing the before state, action, after state, session ID, and PASS verdict.

The mission closes with a field-note debrief that explains the four lines as Look, Choose, Change, and Check. It credits the learner directly: they used an honest failure as evidence, repaired behavior rather than syntax, reran the plan, and proved the result—the core act of debugging an agent. A final weather-window signal teases Lesson 02—plant the east field before rain makes the soil muddy—without pretending that the completed Mission 01 result broke.

The same receipt ID is carried to `/feedback`, where a playtest response can be exported as JSON for evidence.

## How we built it

The game is a static HTML, CSS, and JavaScript application. Canvas 2D draws the entire isometric voxel farm procedurally; there are no downloaded game assets. The clean-room Voxel Field Rig combines a two-layer terrain diorama, stepped sky and distant fields, stone-lined channel, bridge, waterworks, shed, fences, detailed crops, trees, and small farm props with a square beveled HUD and Workbench. Bert is assembled from separately rendered humanoid anatomy and action poses rather than a single mascot block.

The Workbench language is an explicit allowlist, not arbitrary scripting. A deeply frozen prefix checker can validate lesson steps but never emit an executable plan. The full compiler creates an immutable four-step plan. A pure deterministic simulator owns the blocked channel, released water, and three tomato-bed states. The visual timeline consumes that evidence but cannot decide the verdict.

Node's built-in test runner covers the parser, non-executable prefix records, sandbox rejections, state transitions, receipt, learning recap, reset, determinism, and public-smoke arguments. The suite passes 28/28. A Playwright smoke types into the real editor and validates the complete production flow from the visible irrigation landmark through Observe error and walk, Decide/lightbulb, staged Act/Verify construction, full execution, failure, repair, held grand payoff, debrief, weather teaser, receipt, feedback continuity, reset, responsive layout, and same-origin-only networking. It also checks the composited pre-Start farm, renderer-derived terrain/farm bounds and density, Bert's actually rendered anatomy and clear/tool pose, teaching-overlay clearance, visible failed-Act/coach guidance, learner type floors, untruncated receipt evidence, 44px controls, 1280 containment, and 390px game/feedback layouts. The visual candidate passes 266/266 local production-dist browser assertions with empty diagnostics; the deployed predecessor remains separately proven at 214/214 until publication.

GitHub Pages deploys the static `dist/` artifact only after that local production smoke passes. The first deployment succeeded in Actions run `29554682024` at commit `cb57621`; the progressive lesson succeeded in Actions run `29650610214` at commit `1c6c9eb`, then passed the full 214/214 flow against the public URL.

## GPT-5.6 / Codex collaboration

Codex/GPT-5.6 worked as an engineering, curriculum, and visual-design collaborator: it helped bound the five-minute acceptance contract, design the four-phase teaching language, author line-specific feedback, design the causal failure, implement the clean-room game, develop the Voxel Field Rig and humanoid Bert, review every major visual state, and build the automated evidence harness.

The shipped Codex Coach is deterministic and locally authored from that collaboration. There is no live model dependency in the critical path, so every learner can complete the mission without a key and no model can hallucinate a PASS. The world verifier remains authoritative.

## Challenges

- Making a valid program fail for an educational reason without making the learner feel tricked
- Keeping the language safe while still making its phases feel like real agent engineering
- Synchronizing visible Bert movement, trace evidence, water travel, and authoritative state
- Fitting farm, editor, compiler, coach, and proof into one readable 1280×720 screen
- Making Bert unmistakably humanoid at normal zoom while keeping every shape procedural and depth-sorted inside the isometric farm
- Turning a flat web surface into one robust voxel-game material system without weakening the established lesson hierarchy
- Making screenshots and automated time deterministic even though CSS and browser painting use real time
- Preserving a clean-room boundary and evidence chain on a macOS external volume that creates AppleDouble files

## Accomplishments

- One coherent mission that makes planning, execution, failure, repair, and proof visible
- Progressive Bert reactions that give each new learner instruction a payoff without granting partial programs world authority
- A real typed editor with safe line-level diagnostics and no evaluation seam
- A substantial layered voxel farm with one readable causal conflict and no external art assets
- A humanoid Bert with visible anatomy, tool use, gait, thinking, repair, and verification poses
- A cohesive square Voxel Field Rig UI spanning mission, Workbench, proof, feedback, and mobile layouts
- A verification receipt generated from before/after world state
- A plain-language mission debrief that explains all four lines and the learner's repair
- A feedback route that preserves the exact mission session ID
- Automated unit and browser coverage plus submission-ready evidence frames
- A static artifact deployed on GitHub Pages without a backend or secret

## What we learned

Verification is clearest when a learner can see the target state before writing code and watch the causal chain unfold afterward. A useful teaching failure should preserve agency: the learner's syntax was valid, the evidence was available, and one understandable decision caused the mismatch.

We also learned that model-assisted education benefits from a hard authority boundary. Explanations can be flexible, but the game's PASS must come from deterministic evidence.

## What's next

After three first-time learner sessions and the Build Week feedback review, the next bounded step is to turn the locked weather-window signal into Lesson 02 while reusing the same four phases and avoiding loops or multiple agents. Live model coaching would remain optional and could only explain compiler/world evidence; it would never mutate the farm or issue receipts.

## Technologies

JavaScript · HTML · CSS · Canvas 2D · Node.js test runner · Playwright · Codex / GPT-5.6 · GitHub Actions · GitHub Pages

## Submission fields still requiring genuine external evidence

- Demo video URL
- Three recorded first-time playtest outcomes
- `/feedback` Build Week session ID if the event tooling provides one
