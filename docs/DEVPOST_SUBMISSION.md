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

The player opens a compact voxel farm and sees a small **IRRIGATION** sign beside the channel, upstream water, debris, and three dry tomato beds. The sign gives a beginner enough vocabulary to infer `observe irrigation` without revealing what Bert should do. In the typed Agent Workbench they write four safe instructions: observe, decide, act, and verify.

Their first program compiles. Bert executes it. It still fails because `act water tomatoes` treats the dry crops instead of the blockage. The execution trace and deterministic Codex Coach connect that failed verification to line 3. The player changes one instruction to `act clear blockage`, recompiles, and watches Bert clear the debris. Water travels downstream, the tomato beds visibly recover, and the verifier issues a receipt containing the before state, action, after state, session ID, and PASS verdict.

The mission closes with a field-note debrief that explains the four lines as Look, Choose, Change, and Check. It also credits the learner directly: they used an honest failure as evidence, repaired behavior rather than syntax, reran the plan, and proved the result—the core act of debugging an agent.

The same receipt ID is carried to `/feedback`, where a playtest response can be exported as JSON for evidence.

## How we built it

The game is a static HTML, CSS, and JavaScript application. Canvas 2D draws the entire isometric voxel farm procedurally; there are no downloaded game assets.

The Workbench language is an explicit allowlist, not arbitrary scripting. The compiler creates an immutable four-step plan. A pure deterministic simulator owns the blocked channel, released water, and three tomato-bed states. The visual timeline consumes that evidence but cannot decide the verdict.

Node's built-in test runner covers the parser, sandbox rejections, state transitions, receipt, learning recap, reset, determinism, and public-smoke arguments. The current suite passes 26/26. A Playwright smoke types into the real editor and validates the complete production flow from the visible irrigation landmark through invalid syntax, failure, repair, debrief, receipt, feedback continuity, reset, responsive layout, and same-origin-only networking; the updated local production run passes 122/122 assertions. The latest deployed proof remains at 117/117 until this clue release is published.

GitHub Pages deploys the static `dist/` artifact only after that local production smoke passes. The first deployment succeeded in Actions run `29554682024` at commit `cb57621`; the learner-debrief release succeeded in Actions run `29618190795` at commit `8d2f0b5`, then passed the full 117/117 flow against the public URL.

## GPT-5.6 / Codex collaboration

Codex/GPT-5.6 worked as an engineering and curriculum collaborator: it helped bound the five-minute acceptance contract, design the four-phase teaching language, author line-specific feedback, design the causal failure, implement the clean-room game, review the visual state, and build the automated evidence harness.

The shipped Codex Coach is deterministic and locally authored from that collaboration. There is no live model dependency in the critical path, so every learner can complete the mission without a key and no model can hallucinate a PASS. The world verifier remains authoritative.

## Challenges

- Making a valid program fail for an educational reason without making the learner feel tricked
- Keeping the language safe while still making its phases feel like real agent engineering
- Synchronizing visible Bert movement, trace evidence, water travel, and authoritative state
- Fitting farm, editor, compiler, coach, and proof into one readable 1280×720 screen
- Making screenshots and automated time deterministic even though CSS and browser painting use real time
- Preserving a clean-room boundary and evidence chain on a macOS external volume that creates AppleDouble files

## Accomplishments

- One coherent mission that makes planning, execution, failure, repair, and proof visible
- A real typed editor with safe line-level diagnostics and no evaluation seam
- A procedural voxel farm with one readable causal conflict
- A verification receipt generated from before/after world state
- A plain-language mission debrief that explains all four lines and the learner's repair
- A feedback route that preserves the exact mission session ID
- Automated unit and browser coverage plus submission-ready evidence frames
- A static artifact deployed on GitHub Pages without a backend or secret

## What we learned

Verification is clearest when a learner can see the target state before writing code and watch the causal chain unfold afterward. A useful teaching failure should preserve agency: the learner's syntax was valid, the evidence was available, and one understandable decision caused the mismatch.

We also learned that model-assisted education benefits from a hard authority boundary. Explanations can be flexible, but the game's PASS must come from deterministic evidence.

## What's next

After three first-time learner sessions and the Build Week feedback review, the next bounded step is one additional mission that reuses the same four phases without adding loops or multiple agents. Live model coaching would remain optional and could only explain compiler/world evidence; it would never mutate the farm or issue receipts.

## Technologies

JavaScript · HTML · CSS · Canvas 2D · Node.js test runner · Playwright · Codex / GPT-5.6 · GitHub Actions · GitHub Pages

## Submission fields still requiring genuine external evidence

- Demo video URL
- Three recorded first-time playtest outcomes
- `/feedback` Build Week session ID if the event tooling provides one
