# Five-minute Playtest Protocol

**Version:** 2026-07-19 Decide-selects / Act-executes lesson

**Purpose:** Collect honest Education-track evidence for manual acceptance M1 without coaching the solution.

## Test setup

- Use the final deployed URL in a fresh Chromium profile at 1280×720 or larger.
- Confirm no prior AgentVille local storage.
- Do not show the tester source code or this protocol before the run.
- Start a five-minute timer when the tester presses **Start mission**.
- Do not explain the language, the failure, or the repair during the timed run.
- Record only observed behavior and the tester's own words.

## Run 1 — First-time comprehension

1. Ask: “Please finish this lesson. Think aloud if you are comfortable.”
2. Observe whether the player notices the **IRRIGATION** sign and dry tomato beds before the UI names the obstruction.
3. Before Bert speaks, record whether the tester identifies him as a person/farmhand rather than an object, robot block, or UI marker; do not supply the answer.
4. Record whether they enter `observe irrigation` before using **Hint this line**, whether Bert's walk/Aha helps them form Decide, and whether they understand that Decide chooses a response while Act carries it out.
5. Record whether they understand that each accepted line is a rehearsal and that only **Run full program** can change the farm.
6. After the first run, record whether they read verification before editing.
7. Stop the timer when the PASS receipt becomes visible or at five minutes.
8. Ask whether the interface felt like one game world or separate web panels, and whether any text or control was hard to read.
9. Ask whether the Lesson 02 weather signal makes them want to continue; do not imply that Mission 01 failed.
10. Open **Give feedback** and confirm the displayed session ID matches the receipt.

## Run 2 — Repair clarity

Repeat the same clean-browser setup with a different first-time tester. Focus observation on the failure-to-repair handoff:

1. Does the tester distinguish a compiler success from a mission success?
2. Can they identify line 2 as the decision that caused the failed result without verbal help?
3. Do they replace only the decision while preserving Observe, Act, and Verify?
4. Can they explain why choosing blockage removal addresses the cause while choosing direct watering addresses only the symptom?
5. Record time to FAIL and time from FAIL to repaired compile.

## Run 3 — Proof and transfer

Repeat with a third first-time tester. After the PASS receipt, ask without prompting an answer:

1. “What did `verify` do that `act` did not?”
2. “If the tomatoes were still dry, which evidence would you inspect first?”
3. “Where else could observe, decide, act, and verify help?”
4. Confirm they can find the receipt session ID and export feedback.
5. “Who chose Bert's goal, tools, and limits in this mission?”
6. “What do you think the weather signal will ask you to do next?”

## Evidence record template

Save one consented record as `artifacts/evidence/playtest-YYYY-MM-DD-<tester-code>.json`:

```json
{
  "schema": "agentville.playtest.v1",
  "testerCode": "T01",
  "startedAt": "ISO-8601",
  "completedAt": "ISO-8601 or null",
  "receiptSessionId": "AVBW-... or null",
  "completedWithinFiveMinutes": false,
  "secondsToFirstFailure": null,
  "secondsFailureToRepair": null,
  "noticedIrrigationSign": false,
  "recognizedBertAsFarmhand": false,
  "interfaceFeltLikeOneGame": false,
  "authoredObserveBeforeDraftHint": false,
  "usedDraftHint": false,
  "understoodRehearsalVsExecution": false,
  "understoodDecideVsAct": false,
  "repairedDecisionLineOnly": false,
  "explainedHumanAgentBoundary": false,
  "wantedLessonTwo": false,
  "visualConfusions": [],
  "verbalCoachingGiven": false,
  "observations": [],
  "testerExplanationOfVerify": "",
  "evidenceConsent": false
}
```

## Pass rule

M1 passes only if at least two of three first-time testers reach the PASS receipt within five minutes without verbal coaching. A missing time, coached run, developer run, or fabricated record does not count.
