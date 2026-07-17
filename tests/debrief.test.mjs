import assert from "node:assert/strict";
import test from "node:test";

import { compileProgram } from "../src/compiler.js";
import { createLearningRecap } from "../src/debrief.js";
import { runMission } from "../src/mission.js";

const REPAIRED_PROGRAM = [
  "observe irrigation",
  "decide if irrigation is blocked",
  "act clear blockage",
  "verify tomatoes are watered",
].join("\n");

function passingReceipt() {
  const result = runMission(compileProgram(REPAIRED_PROGRAM), { sessionId: "AVBW-DEBRIEF-TEST" });
  return result.receipt;
}

test("repair recap explains the four phases and learner accomplishment", () => {
  const recap = createLearningRecap(passingReceipt(), { failureSeen: true });

  assert.equal(recap.path, "repair");
  assert.equal(recap.title, "You fixed the cause—and proved it.");
  assert.match(recap.summary, /changed line 3/u);
  assert.deepEqual(recap.phases.map(({ phase }) => phase), ["observe", "decide", "act", "verify"]);
  assert.equal(recap.phases[0].explanation, "Found a blocked channel and 3 dry beds.");
  assert.equal(recap.phases[2].command, "act clear blockage");
  assert.equal(recap.phases[3].explanation, "Checked the farm: 3 of 3 beds watered.");
  assert.equal(recap.takeaway.title, "You just debugged an agent.");
  assert.match(recap.takeaway.explanation, /look, choose, do, check/u);
  assert.deepEqual(recap.learner, {
    diagnosedFailure: true,
    changedLine: 3,
    from: "act water tomatoes",
    to: "act clear blockage",
    preservedPhases: ["observe", "decide", "verify"],
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

test("direct success recap never invents a failed first plan", () => {
  const recap = createLearningRecap(passingReceipt());

  assert.equal(recap.path, "direct");
  assert.doesNotMatch(recap.summary, /failed/u);
  assert.equal(recap.takeaway.title, "You built a working agent loop.");
  assert.equal(recap.learner.diagnosedFailure, false);
  assert.equal(recap.learner.from, null);
});

test("learning recap renders only for a passing receipt", () => {
  assert.equal(createLearningRecap(null), null);
  assert.equal(createLearningRecap({ verdict: "FAIL" }), null);
});
