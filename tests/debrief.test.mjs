import assert from "node:assert/strict";
import test from "node:test";

import { compileProgram } from "../src/compiler.js";
import { createLearningRecap } from "../src/debrief.js";
import { runMission } from "../src/mission.js";

const SYMPTOM_DECISION = "decide water the tomatoes when the beds are dry";
const CAUSE_DECISION = "decide clear the blockage when the water is blocked";
const program = (decision) =>
  [
    "observe the east channel",
    decision,
    "act on the decision",
    "verify every tomato bed is watered",
  ].join("\n");

function run(decision, sessionId, state) {
  return runMission(compileProgram(program(decision)), {
    sessionId,
    ...(state ? { state } : {}),
  });
}

function repairedReceipts() {
  const sessionId = "AVBW-DEBRIEF-REPAIR";
  const failure = run(SYMPTOM_DECISION, sessionId);
  const success = run(CAUSE_DECISION, sessionId, failure.state);
  return { failedReceipt: failure.receipt, receipt: success.receipt };
}

test("repair recap explains the line-2 decision change and actual execution", () => {
  const { receipt, failedReceipt } = repairedReceipts();
  const recap = createLearningRecap(receipt, { failedReceipt });

  assert.equal(recap.path, "repair");
  assert.equal(recap.title, "You changed the decision—and fixed the cause.");
  assert.match(recap.summary, /repaired line 2/u);
  assert.deepEqual(
    recap.phases.map(({ phase }) => phase),
    ["observe", "decide", "act", "verify"],
  );
  assert.equal(
    recap.phases[0].explanation,
    "Reported stopped water, visible debris, and 3 dry beds.",
  );
  assert.equal(recap.phases[1].command, CAUSE_DECISION);
  assert.match(recap.phases[1].explanation, /cause/u);
  assert.equal(recap.phases[2].command, "act on the decision");
  assert.match(recap.phases[2].explanation, /clearing debris/u);
  assert.equal(
    recap.phases[3].explanation,
    "Checked the farm: 3 of 3 beds watered.",
  );
  assert.equal(recap.takeaway.title, "You debugged an agent’s decision.");
  assert.match(recap.takeaway.explanation, /changed Bert’s response/u);
  assert.deepEqual(recap.learner, {
    diagnosedFailure: true,
    changedLine: 2,
    from: SYMPTOM_DECISION,
    to: CAUSE_DECISION,
    preservedPhases: ["observe", "act", "verify"],
  });
  assert.deepEqual(recap.result, {
    blockageBefore: true,
    blockageAfter: false,
    waterReleased: true,
    tomatoBedsWateredBefore: 0,
    tomatoBedsWateredAfter: 3,
    tomatoBedsTotal: 3,
  });
  assert.equal(Object.isFrozen(recap), true);
  assert.equal(Object.isFrozen(recap.phases), true);
  assert.equal(Object.isFrozen(recap.phases[0]), true);
});

test("direct success recap never invents a failed first decision", () => {
  const receipt = run(
    CAUSE_DECISION,
    "AVBW-DEBRIEF-DIRECT",
  ).receipt;
  const recap = createLearningRecap(receipt);

  assert.equal(recap.path, "direct");
  assert.equal(recap.title, "You chose the cause—and proved it.");
  assert.doesNotMatch(recap.summary, /failed|repaired/u);
  assert.equal(recap.takeaway.title, "You built a working agent loop.");
  assert.equal(recap.learner.diagnosedFailure, false);
  assert.equal(recap.learner.changedLine, null);
  assert.equal(recap.learner.from, null);
  assert.equal(recap.learner.to, CAUSE_DECISION);
});

test("already-satisfied recap truthfully explains a false condition and no action", () => {
  const completed = run(CAUSE_DECISION, "AVBW-ALREADY-COMPLETE");
  const rerun = run(
    CAUSE_DECISION,
    "AVBW-ALREADY-COMPLETE",
    completed.state,
  );
  const recap = createLearningRecap(rerun.receipt);

  assert.equal(rerun.receipt.selectedAction, null);
  assert.equal(rerun.receipt.executedAction, null);
  assert.equal(recap.path, "already-satisfied");
  assert.equal(recap.title, "The goal was already satisfied.");
  assert.match(recap.summary, /condition was false/u);
  assert.doesNotMatch(JSON.stringify(recap), /by null/u);
  assert.match(recap.phases[0].explanation, /already watered/u);
  assert.match(recap.phases[1].explanation, /no response was selected/u);
  assert.match(recap.phases[2].explanation, /left the farm unchanged/u);
  assert.equal(
    recap.takeaway.title,
    "You verified before changing anything.",
  );
  assert.equal(recap.learner.changedLine, null);
});

test("already-satisfied recap names the symptom decision's actual condition", () => {
  const completed = run(CAUSE_DECISION, "AVBW-ALREADY-DRY-CHECK");
  const rerun = run(
    SYMPTOM_DECISION,
    "AVBW-ALREADY-DRY-CHECK",
    completed.state,
  );
  const recap = createLearningRecap(rerun.receipt);

  assert.equal(rerun.receipt.selectedAction, null);
  assert.equal(recap.path, "already-satisfied");
  assert.match(recap.phases[1].explanation, /tomatoes dry/u);
  assert.doesNotMatch(recap.phases[1].explanation, /irrigation blocked/u);
});

test("an unrelated failure receipt cannot invent a repair history", () => {
  const receipt = run(CAUSE_DECISION, "AVBW-MATCH").receipt;
  const failedReceipt = run(SYMPTOM_DECISION, "AVBW-OTHER").receipt;
  const recap = createLearningRecap(receipt, { failedReceipt });

  assert.equal(recap.path, "direct");
  assert.equal(recap.learner.diagnosedFailure, false);

  const wrongExecution = structuredClone(
    run(SYMPTOM_DECISION, "AVBW-MATCH").receipt,
  );
  wrongExecution.executedAction = "clear blockage";
  const stricterRecap = createLearningRecap(receipt, {
    failedReceipt: wrongExecution,
  });
  assert.equal(stricterRecap.path, "direct");
  assert.equal(stricterRecap.learner.diagnosedFailure, false);
});

test("learning recap renders only for a passing receipt", () => {
  assert.equal(createLearningRecap(null), null);
  assert.equal(createLearningRecap({ verdict: "FAIL" }), null);
});
