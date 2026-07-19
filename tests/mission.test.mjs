import test from "node:test";
import assert from "node:assert/strict";

import { compileProgram } from "../src/compiler.js";
import {
  MISSION_NAME,
  TOMATO_BED_COUNT,
  applyMissionStep,
  createInitialMissionState,
  executeMission,
  resetMission,
  runMission,
  snapshotMissionState,
} from "../src/mission.js";

const SYMPTOM_DECISION = "decide water tomatoes when dry";
const CAUSE_DECISION = "decide clear blockage when blocked";
const ACT_COMMAND = "act chosen repair";

const program = (decision) =>
  [
    "observe irrigation",
    decision,
    ACT_COMMAND,
    "verify tomatoes are watered",
  ].join("\n");

function planFor(decision) {
  const result = compileProgram(program(decision));
  assert.equal(result.ok, true);
  return result.plan;
}

test("initial mission is a frozen blocked and dry three-bed farm", () => {
  const state = createInitialMissionState();

  assert.equal(state.mission, MISSION_NAME);
  assert.equal(state.irrigation.channel, "East Channel");
  assert.equal(state.irrigation.blocked, true);
  assert.equal(state.irrigation.waterReleased, false);
  assert.equal(state.tomatoBeds.length, TOMATO_BED_COUNT);
  assert.equal(state.tomatoBeds.every((bed) => !bed.watered), true);
  assert.deepEqual(snapshotMissionState(state), {
    irrigationBlocked: true,
    waterReleased: false,
    tomatoBedsWatered: 0,
    tomatoBedsDry: 3,
    tomatoBedsTotal: 3,
  });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.irrigation), true);
  assert.equal(Object.isFrozen(state.tomatoBeds), true);
  assert.equal(Object.isFrozen(state.tomatoBeds[0]), true);
});

test("the symptom decision is carried out and truthfully fails verification", () => {
  const result = runMission(planFor(SYMPTOM_DECISION), {
    sessionId: "AVBW-2026-07-19-FIRST",
  });

  assert.deepEqual(
    result.trace.map(
      ({ line, phase, command, outcome, selectedAction, executedAction }) => ({
        line,
        phase,
        command,
        outcome,
        selectedAction,
        executedAction,
      }),
    ),
    [
      {
        line: 1,
        phase: "observe",
        command: "observe irrigation",
        outcome: "BLOCKED",
        selectedAction: undefined,
        executedAction: undefined,
      },
      {
        line: 2,
        phase: "decide",
        command: SYMPTOM_DECISION,
        outcome: "SYMPTOM_SELECTED",
        selectedAction: "water tomatoes",
        executedAction: undefined,
      },
      {
        line: 3,
        phase: "act",
        command: ACT_COMMAND,
        outcome: "NO_CHANGE",
        selectedAction: undefined,
        executedAction: "water tomatoes",
      },
      {
        line: 4,
        phase: "verify",
        command: "verify tomatoes are watered",
        outcome: "FAIL",
        selectedAction: undefined,
        executedAction: undefined,
      },
    ],
  );
  assert.equal(result.trace[1].condition, "tomatoes dry");
  assert.equal(result.trace[1].conditionMet, true);
  assert.equal(result.state.irrigation.blocked, true);
  assert.equal(result.state.irrigation.waterReleased, false);
  assert.equal(result.state.tomatoBeds.every((bed) => !bed.watered), true);
  assert.match(result.trace[2].message, /blocked irrigation released no water/u);
  assert.match(result.trace[3].message, /0 of 3/u);
  assert.equal(result.receipt.verdict, "FAIL");
  assert.equal(result.receipt.decision, SYMPTOM_DECISION);
  assert.equal(result.receipt.selectedAction, "water tomatoes");
  assert.equal(result.receipt.action, ACT_COMMAND);
  assert.equal(result.receipt.executedAction, "water tomatoes");
  assert.equal(result.receipt.sessionId, "AVBW-2026-07-19-FIRST");
  assert.deepEqual(result.receipt.before, result.receipt.after);
});

test("repairing only Decide clears the block, waters three beds, and passes", () => {
  const failure = runMission(planFor(SYMPTOM_DECISION), {
    sessionId: "AVBW-FAIL",
  });
  const repaired = runMission(planFor(CAUSE_DECISION), {
    sessionId: "AVBW-2026-07-19-REPAIRED",
    state: failure.state,
  });

  assert.deepEqual(
    repaired.trace.map((entry) => entry.phase),
    ["observe", "decide", "act", "verify"],
  );
  assert.equal(repaired.trace[1].outcome, "CAUSE_SELECTED");
  assert.equal(repaired.trace[1].selectedAction, "clear blockage");
  assert.equal(repaired.trace[2].command, ACT_COMMAND);
  assert.equal(repaired.trace[2].executedAction, "clear blockage");
  assert.equal(repaired.trace[2].outcome, "WORLD_CHANGED");
  assert.deepEqual(repaired.trace[2].before, {
    irrigationBlocked: true,
    waterReleased: false,
    tomatoBedsWatered: 0,
    tomatoBedsDry: 3,
    tomatoBedsTotal: 3,
  });
  assert.deepEqual(repaired.trace[2].after, {
    irrigationBlocked: false,
    waterReleased: true,
    tomatoBedsWatered: 3,
    tomatoBedsDry: 0,
    tomatoBedsTotal: 3,
  });
  assert.equal(repaired.state.irrigation.blocked, false);
  assert.equal(repaired.state.irrigation.waterReleased, true);
  assert.equal(repaired.state.tomatoBeds.every((bed) => bed.watered), true);
  assert.equal(repaired.trace[3].outcome, "PASS");
  assert.equal(repaired.receipt.verdict, "PASS");
  assert.equal(repaired.receipt.decision, CAUSE_DECISION);
  assert.equal(repaired.receipt.selectedAction, "clear blockage");
  assert.equal(repaired.receipt.action, ACT_COMMAND);
  assert.equal(repaired.receipt.executedAction, "clear blockage");
});

test("receipt contains the complete immutable causal record", () => {
  const result = runMission(planFor(CAUSE_DECISION), {
    sessionId: "  AVBW-preserve-exactly  ",
  });
  const { receipt } = result;

  assert.deepEqual(Object.keys(receipt), [
    "sessionId",
    "mission",
    "before",
    "after",
    "observation",
    "decision",
    "selectedAction",
    "action",
    "executedAction",
    "verdict",
  ]);
  assert.equal(receipt.sessionId, "  AVBW-preserve-exactly  ");
  assert.equal(receipt.mission, "Repair the East Channel");
  assert.match(receipt.observation, /visible debris/u);
  assert.equal(receipt.decision, CAUSE_DECISION);
  assert.equal(receipt.selectedAction, "clear blockage");
  assert.equal(receipt.action, ACT_COMMAND);
  assert.equal(receipt.executedAction, "clear blockage");
  assert.equal(receipt.verdict, "PASS");
  assert.equal(receipt.before.irrigationBlocked, true);
  assert.equal(receipt.after.irrigationBlocked, false);
  assert.equal(receipt.after.waterReleased, true);
  assert.equal(receipt.after.tomatoBedsWatered, 3);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.before), true);
  assert.equal(Object.isFrozen(receipt.after), true);
  assert.throws(() => { receipt.verdict = "FAIL"; }, TypeError);
});

test("step transitions carry the frozen Decide result into generic Act", () => {
  const initial = createInitialMissionState();
  const beforeJson = JSON.stringify(initial);
  const plan = planFor(CAUSE_DECISION);
  const decided = applyMissionStep(initial, plan.steps[1], {
    plan,
  });
  const transition = applyMissionStep(initial, plan.steps[2], {
    plan,
    decision: decided.decision,
  });

  assert.equal(JSON.stringify(initial), beforeJson);
  assert.equal(decided.decision.selectedAction, "clear blockage");
  assert.equal(Object.isFrozen(decided.decision), true);
  assert.notEqual(transition.state, initial);
  assert.equal(initial.irrigation.blocked, true);
  assert.equal(transition.state.irrigation.blocked, false);
  assert.equal(transition.evidence.line, 3);
  assert.equal(transition.evidence.phase, "act");
  assert.equal(transition.evidence.command, ACT_COMMAND);
  assert.equal(transition.evidence.executedAction, "clear blockage");
  assert.equal(transition.evidence.before.irrigationBlocked, true);
  assert.equal(transition.evidence.after.irrigationBlocked, false);
  assert.equal(Object.isFrozen(transition), true);
  assert.equal(Object.isFrozen(transition.evidence), true);
});

test("Decide evaluates its condition against the current world", () => {
  const plan = planFor(CAUSE_DECISION);
  const completed = runMission(plan, { sessionId: "AVBW-CLEAR" });
  const rerun = runMission(plan, {
    sessionId: "AVBW-CLEAR-AGAIN",
    state: completed.state,
  });

  assert.equal(rerun.trace[1].condition, "irrigation blocked");
  assert.equal(rerun.trace[1].conditionMet, false);
  assert.equal(rerun.trace[1].selectedAction, null);
  assert.equal(rerun.trace[2].outcome, "NO_ACTION_SELECTED");
  assert.equal(rerun.trace[2].executedAction, null);
  assert.deepEqual(rerun.receipt.before, rerun.receipt.after);
  assert.equal(rerun.receipt.verdict, "PASS");
});

test("replay is deterministic and session metadata cannot affect the farm", () => {
  const plan = planFor(CAUSE_DECISION);
  const first = runMission(plan, { sessionId: "AVBW-A" });
  const replay = runMission(plan, { sessionId: "AVBW-A" });
  const newSession = runMission(plan, { sessionId: "AVBW-B" });

  assert.deepEqual(first, replay);
  assert.deepEqual(first.state, newSession.state);
  assert.deepEqual(first.trace, newSession.trace);
  assert.deepEqual(first.receipt.before, newSession.receipt.before);
  assert.deepEqual(first.receipt.after, newSession.receipt.after);
  assert.equal(first.receipt.verdict, newSession.receipt.verdict);
  assert.notEqual(first.receipt.sessionId, newSession.receipt.sessionId);
});

test("reset returns a fresh deterministic blocked farm after success", () => {
  const completed = runMission(planFor(CAUSE_DECISION), {
    sessionId: "AVBW-COMPLETE",
  });
  assert.equal(completed.receipt.verdict, "PASS");

  const firstReset = resetMission();
  const secondReset = resetMission();
  assert.deepEqual(firstReset, createInitialMissionState());
  assert.deepEqual(firstReset, secondReset);
  assert.notEqual(firstReset, secondReset);
  assert.notEqual(firstReset.tomatoBeds, secondReset.tomatoBeds);
  assert.equal(firstReset.irrigation.blocked, true);
  assert.equal(firstReset.tomatoBeds.every((bed) => !bed.watered), true);
});

test("runtime accepts compiler results directly and exposes an execution alias", () => {
  const compiled = compileProgram(program(CAUSE_DECISION));
  assert.equal(compiled.ok, true);

  const direct = runMission(compiled, { sessionId: "AVBW-DIRECT" });
  const aliased = executeMission(compiled.plan, {
    sessionId: "AVBW-DIRECT",
  });
  assert.deepEqual(direct, aliased);
  assert.equal(executeMission, runMission);
});

test("forged plans, unbound Act steps, bad state, and missing sessions fail closed", () => {
  const plan = planFor(CAUSE_DECISION);
  const forged = structuredClone(plan);
  const initial = createInitialMissionState();
  const before = JSON.stringify(initial);

  assert.throws(
    () => runMission(forged, { sessionId: "AVBW-FORGED" }),
    /allowlisted compiler plan/u,
  );
  assert.throws(
    () => applyMissionStep(initial, plan.steps[2]),
    /compiler-minted plan/u,
  );
  assert.throws(
    () =>
      applyMissionStep(initial, {
        line: 3,
        phase: "act",
        command: "act eval",
        label: "Unsafe",
      }),
    /not allowlisted/u,
  );
  assert.throws(() => runMission(plan), /sessionId/u);
  assert.throws(
    () => runMission(plan, { sessionId: "   " }),
    /sessionId/u,
  );
  assert.throws(
    () => runMission(plan, { sessionId: "AVBW-X", state: {} }),
    /schema/u,
  );
  assert.equal(JSON.stringify(initial), before);
});

test("generic Act rejects forged or differently bound Decide results", () => {
  const initial = createInitialMissionState();
  const symptomPlan = planFor(SYMPTOM_DECISION);
  const causePlan = planFor(CAUSE_DECISION);
  const causeDecision = applyMissionStep(initial, causePlan.steps[1], {
    plan: causePlan,
  }).decision;
  const forgedCauseDecision = Object.freeze({
    command: CAUSE_DECISION,
    condition: "irrigation blocked",
    conditionMet: true,
    selectedAction: "clear blockage",
  });
  const before = JSON.stringify(initial);

  assert.throws(
    () =>
      applyMissionStep(initial, symptomPlan.steps[2], {
        plan: symptomPlan,
        decision: forgedCauseDecision,
      }),
    /allowlisted result selected by Decide/u,
  );
  assert.throws(
    () =>
      applyMissionStep(initial, symptomPlan.steps[2], {
        plan: symptomPlan,
        decision: causeDecision,
      }),
    /allowlisted result selected by Decide/u,
  );
  assert.throws(
    () =>
      applyMissionStep(initial, causePlan.steps[2], {
        plan: structuredClone(causePlan),
        decision: causeDecision,
      }),
    /compiler-minted plan/u,
  );
  assert.equal(JSON.stringify(initial), before);
});
