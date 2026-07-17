# Bounded Acceptance Specification

**Product:** AgentVille: Build Week Edition

**Track:** OpenAI Build Week — Education

**Specified:** 2026-07-16

**Mission:** Repair the East Channel

## Definition of done

A first-time player can open the game in a desktop browser and complete one deterministic learning mission in five minutes: author a sandboxed `observe → decide → act → verify` program, compile it, watch Bert execute it, diagnose a blocked-irrigation failure, repair the program, and receive a verification receipt derived from the resulting world state.

## Automated acceptance

| ID | Pass condition | Evidence target |
| --- | --- | --- |
| A1 | The production build opens in Chromium with no install, account, or API key. | Browser smoke against `dist/` |
| A2 | **Start mission** loads the same compact farm and blocked East Channel on every reset. | Mission-state unit test + browser state hook |
| A3 | The Workbench accepts a player-authored four-line program containing `observe`, `decide`, `act`, and `verify` in order. | Compiler tests + browser smoke |
| A4 | Invalid syntax cannot mutate the farm and reports the offending line with a concrete repair suggestion. | Compiler sandbox tests + UI smoke |
| A5 | A valid draft compiles into a visible, human-readable four-step plan. | Browser smoke + screenshot |
| A6 | Bert visibly moves while the execution trace advances through planning and execution. | Deterministic simulation test + browser smoke |
| A7 | The first valid draft honestly fails because `act water tomatoes` does not remove the obstruction. | Mission transition test + browser smoke |
| A8 | The coach connects the failed verification to line 3 and suggests the allowlisted repair `act clear blockage`. | Browser smoke |
| A9 | The repaired program clears the obstruction, releases water, changes the tomato beds to watered, and verifies the state. | Mission transition test + browser smoke |
| A10 | Success produces a receipt with session ID, mission, observation, decision, action, before/after state, and `PASS`. | Receipt unit test + browser smoke |
| A11 | **Give feedback** opens `/feedback/?session_id=<id>` and the feedback export preserves that exact receipt ID. | Browser smoke |
| A12 | Reset restores the obstruction, clears execution state, and creates a new session without reloading the page. | Browser smoke |
| A13 | Replaying the same accepted program against the same seed produces the same world transitions, excluding session metadata. | Determinism unit test |
| A14 | Arbitrary JavaScript, network/file primitives, loops, extra phases, and unsupported actions are rejected before execution. | Compiler sandbox tests |
| A15 | The production build contains no external game assets or copied reference-repo material. | Source manifest + clean-room disclosure |

## Manual acceptance before submission

| ID | Pass condition | Evidence target |
| --- | --- | --- |
| M1 | At least two of three first-time testers reach the receipt within five minutes without verbal coaching. | Dated playtest records in `artifacts/evidence/` |
| M2 | The public deployment completes the same full mission in the declared judging browser. | URL + clean-browser rehearsal |
| M3 | The demo video shows the authored draft, failure, repair, world change, receipt, and feedback session continuity. | Timestamped Devpost evidence index |

Manual gates remain visibly incomplete until genuine human or deployed evidence exists.

## Non-goals for this build

- Multiple missions, free-play farming, procedural generation, progression, or an economy
- Loops, recursion, user-defined functions, or multi-agent orchestration
- Natural-language compilation, arbitrary code execution, accounts, multiplayer, or cloud saves
- A live model dependency in the mission-critical path
- Production analytics, mobile certification, or controller support
