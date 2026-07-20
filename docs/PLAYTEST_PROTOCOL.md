# Five-minute-per-mission Playtest Protocol

**Version:** 2026-07-20 three-mission course

**Purpose:** Collect honest Education-track evidence without coaching a solution, and test whether novice learners can distinguish a wrong response, a late trigger, and missing observation evidence.

The local and public three-mission production browser smokes have passed against runtime commit `f40613c`; formal sessions may now use the deployed URL. Developer runs, automated runs, and the earlier single-mission public release do not count as human evidence.

## Test setup

- Use the final deployed URL in a fresh Chromium profile at 1280×720 or larger.
- Confirm there is no prior AgentVille local storage for Mission 01 or the assigned receipt.
- Do not show the tester source code or this protocol before the run.
- Start a five-minute timer when the tester presses **Start mission** for the assigned lesson.
- Stop the timer when that mission's PASS receipt becomes visible or at five minutes.
- Do not explain the language, failure, Coach, repair, or answer during the timed run.
- Record only observed behavior and the tester's own words.
- If testing Mission 02 or Mission 03 in isolation, a facilitator may complete prerequisite missions before the tester arrives, then select and reset the assigned mission. Record that preparation and do not expose prerequisite solutions.
- Open feedback only from the tested mission's receipt. Confirm both `mission_id` and `session_id`, not the session alone.

## Session A — Mission 01: cause versus symptom

Ask: “Please finish this farm lesson. Think aloud if you are comfortable.”

During the timed run, record:

1. Whether the tester identifies Bert as a person or farmhand.
2. Whether they notice the **IRRIGATION** sign and infer `observe the east channel` before opening **Hint this line**.
3. Whether Bert's Observe walk and response make the stopped water, debris, and dry beds understandable.
4. Whether they understand that Decide selects a response while `act on the decision` carries it out.
5. Whether they distinguish successful compilation from successful verification.
6. Whether they inspect the failed Verify evidence before editing.
7. Whether they identify line 2 as the causal repair without verbal coaching.
8. Whether they change only `decide water the tomatoes when the beds are dry` to `decide clear the blockage when the water is blocked`.
9. Whether the cleared channel, flowing water, recovered beds, and PASS receipt feel like a satisfying payoff.

After the timer, ask:

1. “Why did watering the dry beds fail?”
2. “What did Decide do that Act did not?”
3. “What did Verify prove?”

Do not count a paraphrase as correct unless it distinguishes the dry-bed symptom from the blocked-channel cause.

## Session B — Mission 02: leading versus lagging signals

Prepare Storm Watch as described above, then ask the same neutral opening prompt.

During the timed run, record:

1. Whether the tester notices the **WEATHER** vane, clouds, uncovered seedlings, and covers by the shed.
2. Whether they enter `observe the sky` before opening the hint.
3. Whether they understand the initial evidence: clouds are gathering, but rain has not started.
4. Whether the trace makes it clear that `rain falls` is a supported condition that is currently false.
5. Whether they notice that Act has no selected response before the fixed storm event.
6. Whether the storm and battered seedlings make the timing failure understandable.
7. Whether they identify line 2, not Observe or Act, as the repair.
8. Whether they change only `decide cover the beds when rain falls` to `decide cover the beds when clouds gather`.
9. Whether seeing the beds covered before the identical storm makes the value of a leading signal clear.

After the timer, ask:

1. “Why was waiting for rain too late?”
2. “What earlier evidence did you choose instead?”
3. “Did Bert fail to follow the plan, or did the plan choose the wrong timing?”

Do not count “the storm was random” as correct. Record whether the tester recognizes that the same scripted event occurs in both runs.

## Session C — Mission 03: observation scope

Prepare The Hungry Hens as described above, then ask the same neutral opening prompt.

During the timed run, record:

1. Whether the tester notices the **FEEDER** sign, full feeder, jammed chute, empty tray, and hens.
2. Whether they enter `observe the feeder` before opening the hint.
3. Whether they understand what the feeder observation did report.
4. Whether the trace makes it clear that the observation did **not** establish whether the hens were hungry.
5. Whether they distinguish missing evidence from evidence that says “not hungry.”
6. Whether they identify line 1, not the Decide response, as the repair.
7. Whether they change only `observe the feeder` to `observe the hens`.
8. Whether the repaired observation, chute action, falling grain, fed hens, and PASS receipt form a clear causal chain.

After the timer, ask:

1. “Why could Bert not use the hunger condition after observing the feeder?”
2. “Was the condition false, or was the evidence missing?”
3. “What new fact did observing the hens provide?”

Count the second answer as correct only if the learner says, in their own words, that line 1 had not supplied hunger evidence.

## Session D — Course transfer and unlock chain

Use a separate consenting tester or a returning tester. This is an untimed course-level probe and does not replace the five-minute-per-mission samples.

1. Start from a fresh profile and verify only Mission 01 is unlocked.
2. Complete Mission 01 and confirm its PASS exposes a real **Start Storm Watch** action.
3. Complete Mission 02 and confirm its PASS unlocks **The Hungry Hens**.
4. Complete Mission 03 and confirm the UI reports all three field missions verified.
5. Ask the tester to compare the failures:
   - Mission 01 chose the wrong response to available evidence.
   - Mission 02 chose a signal that became true too late.
   - Mission 03 never observed the fact its decision needed.
6. Ask: “Who defined Bert's goals, tools, allowed responses, and success checks?”
7. Ask: “What did `verify` do that `act` did not?”
8. Open feedback from each available receipt and confirm that mission and session identity never cross.

## Interface and accessibility probes

For every session, record:

- whether the farm, Workbench, trace, Coach, and receipt felt like one game rather than disconnected panels;
- whether any learner text, evidence, control, clue, or Bert reaction was hard to see or understand;
- whether the active repair line stayed visible when Coach appeared;
- whether the tester could navigate the editor, actions, debrief, next-mission control, and feedback route with their preferred input;
- whether any world animation appeared to contradict the text trace or receipt.

## Feedback identity check

From the tested receipt:

1. Record `receipt.missionId` and `receipt.sessionId`.
2. Activate **Give feedback**.
3. Confirm the URL contains both `mission_id=<missionId>` and `session_id=<sessionId>`.
4. Confirm the page displays the same mission ID, mission name, session ID, and matching receipt verdict.
5. Save one response and export JSON.
6. Confirm the export schema is `agentville.feedback.v2` and both IDs match the receipt exactly.

Do not repair or manually combine a partial identity. A missing or mismatched ID is a product failure.

## Evidence record template

Save one consented record as `artifacts/evidence/playtest-YYYY-MM-DD-<tester-code>-<mission-id>.json`:

```json
{
  "schema": "agentville.playtest.v2",
  "testerCode": "T01",
  "missionId": "repair-east-channel",
  "missionName": "Repair the East Channel",
  "prerequisitesPreparedByFacilitator": false,
  "startedAt": "ISO-8601",
  "completedAt": "ISO-8601 or null",
  "receiptSessionId": "AVBW-... or null",
  "receiptMissionIdMatched": false,
  "feedbackIdentityMatched": false,
  "completedWithinFiveMinutes": false,
  "secondsToFirstFailure": null,
  "secondsFailureToRepair": null,
  "recognizedBertAsFarmhand": false,
  "noticedMissionClue": false,
  "authoredObserveBeforeHint": false,
  "usedHint": false,
  "understoodRehearsalVsExecution": false,
  "understoodDecideVsAct": false,
  "readVerifyBeforeEditing": false,
  "repairedDeclaredLineOnly": false,
  "explainedMissionFailure": false,
  "distinguishedUnsupportedFromFalse": null,
  "understoodDeterministicEvent": null,
  "explainedHumanAgentBoundary": false,
  "interfaceFeltLikeOneGame": false,
  "visualConfusions": [],
  "verbalCoachingGiven": false,
  "observations": [],
  "testerExplanationOfVerify": "",
  "evidenceConsent": false
}
```

Use `null` for probes that do not apply to the assigned mission. Preserve the learner's wording in `observations` rather than translating it into a stronger claim.

## Pass rules

- A mission's novice gate passes only if at least two of three first-time testers complete that assigned mission within five minutes without verbal coaching.
- Course transfer passes only if a tester follows the PASS-only unlock chain and can distinguish all three failure types in their own words.
- A missing time, coached run, developer run, automated run, prior exposure to the solution, fabricated record, or absent evidence consent does not count.
- Human evidence does not replace the production browser smoke, and automation does not replace human comprehension evidence.
