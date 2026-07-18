# Bounded Acceptance Specification

**Product:** AgentVille: Build Week Edition

**Track:** OpenAI Build Week — Education

**Specified:** 2026-07-16

**Progressive revision:** 2026-07-18

**Mission:** Repair the East Channel

## Definition of done

A first-time player can open the game in a desktop browser and complete one deterministic learning mission in five minutes: teach Bert a sandboxed `observe → decide → act → verify` program one instruction at a time, compile the complete loop, watch Bert execute it, diagnose a blocked-irrigation failure, repair the program, and receive a verification receipt derived from the resulting world state.

## Automated acceptance

| ID | Pass condition | Evidence target |
| --- | --- | --- |
| A1 | The production build opens in Chromium with no install, account, or API key. | **PASS** — `npm run test:public`, 122/122 assertions at the live Pages URL |
| A2 | **Start mission** loads the same compact farm and blocked East Channel on every reset. | Mission-state unit test + browser state hook |
| A3 | The Workbench guides one player-authored instruction at a time in `observe`, `decide`, `act`, `verify` order, while still accepting a complete allowlisted four-line program. | Prefix/compiler tests + browser smoke |
| A4 | Invalid syntax cannot mutate the farm and reports the offending line with a concrete repair suggestion. | Compiler sandbox tests + UI smoke |
| A5 | A valid draft compiles into a visible, human-readable four-step plan. | Browser smoke + screenshot |
| A6 | Bert visibly walks to the irrigation during the Observe rehearsal, reacts to each accepted line, then replays the complete program while the authoritative trace advances. | Deterministic browser smoke + screenshots |
| A7 | The guided first complete draft honestly fails because `act water tomatoes` does not remove the obstruction; a learner who independently uses the causal action may succeed directly. | Mission transition test + browser smoke |
| A8 | The coach connects the failed verification to line 3 and suggests the allowlisted repair `act clear blockage`. | Browser smoke |
| A9 | The repaired program clears the obstruction, releases water, changes the tomato beds to watered, and verifies the state. | Mission transition test + browser smoke |
| A10 | Success produces a receipt with session ID, mission, observation, decision, action, before/after state, and `PASS`. | Receipt unit test + browser smoke |
| A11 | **Give feedback** opens `/feedback/?session_id=<id>` and the feedback export preserves that exact receipt ID. | Browser smoke |
| A12 | Reset restores the obstruction, clears execution state, and creates a new session without reloading the page. | Browser smoke |
| A13 | Replaying the same accepted program against the same seed produces the same world transitions, excluding session metadata. | Determinism unit test |
| A14 | Arbitrary JavaScript, network/file primitives, loops, extra phases, and unsupported actions are rejected before execution. | Compiler sandbox tests |
| A15 | The production build contains no external game assets or copied reference-repo material. | Source manifest + clean-room disclosure |
| A16 | PASS opens a readable mission debrief that explains what happened, why all four phases worked, and what the learner changed; reset removes it and restores focus. | Debrief unit tests + 1280×720 browser smoke + screenshot |
| A17 | The authoring view visibly labels the channel **IRRIGATION** so a novice can infer `observe irrigation` without exposing the repair action; the same landmark is available to assistive technology and automation. | 1280×720 browser smoke + screenshot + canvas description |
| A18 | Observe, Decide, and Act prefix checks produce visible Bert rehearsals but cannot emit an executable plan, mutate the world hash, increment world revision, enable Run, or issue a receipt. | Prefix immutability tests + browser state assertions |
| A19 | The initial UI does not name the blockage; Observe reveals stopped flow, Decide names the blockage and explains accurately that people define an agent's goal, tools, and limits. | Accessible DOM assertions + 1280×720 screenshots |
| A20 | PASS preserves the authoritative receipt and adds a coherent locked Lesson 02 weather-window teaser without claiming that Mission 01 broke. | Receipt/debrief browser assertions + 1280×720 screenshot |

## Manual acceptance before submission

| ID | Pass condition | Evidence target | Status |
| --- | --- | --- | --- |
| M1 | At least two of three first-time testers reach the receipt within five minutes without verbal coaching. | Dated playtest records in `artifacts/evidence/` | Pending genuine sessions |
| M2 | The public deployment completes the same full mission in the declared judging browser. | [Live Pages URL](https://b33fydan.github.io/agentville-build-week/) + `npm run test:public` | Predecessor baseline **PASS** — 122/122 on 2026-07-17; progressive release pending deploy |
| M3 | The demo video shows the authored draft, failure, repair, world change, receipt, and feedback session continuity. | Timestamped Devpost evidence index | Pending video |

The progressive teaching release passes 28/28 Node tests and 214/214 production-dist browser assertions locally. The last deployed baseline passed 122/122 public assertions; the progressive public proof is recorded after deployment. M1 and M3 remain visibly incomplete until genuine human and video evidence exists.

## Non-goals for this build

- A playable second mission, free-play farming, procedural generation, progression, or an economy; Lesson 02 is a locked teaser only
- Loops, recursion, user-defined functions, or multi-agent orchestration
- Natural-language compilation, arbitrary code execution, accounts, multiplayer, or cloud saves
- A live model dependency in the mission-critical path
- Production analytics, mobile certification, or controller support
