# Five-minute Playtest Protocol

**Version:** 2026-07-16

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
2. Observe whether the player notices the **IRRIGATION** sign, upstream water, obstruction, dry downstream channel, and tomato beds.
3. Record whether they enter `observe irrigation` before using **Show draft**, then whether they type four lines and understand the plan preview.
4. After the first run, record whether they read verification before editing.
5. Stop the timer when the PASS receipt becomes visible or at five minutes.
6. Open **Give feedback** and confirm the displayed session ID matches the receipt.

## Run 2 — Repair clarity

Repeat the same clean-browser setup with a different first-time tester. Focus observation on the failure-to-repair handoff:

1. Does the tester distinguish a compiler success from a mission success?
2. Can they identify line 3 without verbal help?
3. Do they replace the action rather than rewriting all four lines?
4. Can they explain why clearing the blockage is causally different from watering the tomatoes?
5. Record time to FAIL and time from FAIL to repaired compile.

## Run 3 — Proof and transfer

Repeat with a third first-time tester. After the PASS receipt, ask without prompting an answer:

1. “What did `verify` do that `act` did not?”
2. “If the tomatoes were still dry, which evidence would you inspect first?”
3. “Where else could observe, decide, act, and verify help?”
4. Confirm they can find the receipt session ID and export feedback.

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
  "authoredObserveBeforeDraftHint": false,
  "usedDraftHint": false,
  "verbalCoachingGiven": false,
  "observations": [],
  "testerExplanationOfVerify": "",
  "evidenceConsent": false
}
```

## Pass rule

M1 passes only if at least two of three first-time testers reach the PASS receipt within five minutes without verbal coaching. A missing time, coached run, developer run, or fabricated record does not count.
