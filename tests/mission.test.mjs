import test from "node:test";
import assert from "node:assert/strict";

import { compileProgram } from "../src/compiler.js";
import {
  applyMissionStep,
  createInitialMissionState,
  executeMission,
  resetMission,
  runMission,
  snapshotMissionState,
} from "../src/mission.js";
import {
  MISSION_IDS,
  getMissionDefinition,
} from "../src/mission-registry.js";

const EXPECTED_FAILURES = Object.freeze({
  "repair-east-channel": {
    decisionOutcome: "SYMPTOM_SELECTED",
    conditionSupported: true,
    conditionMet: true,
    executedAction: "water tomatoes",
    coachLine: 2,
  },
  "storm-watch": {
    decisionOutcome: "CONDITION_NOT_MET",
    conditionSupported: true,
    conditionMet: false,
    executedAction: null,
    coachLine: 2,
  },
  "hungry-hens": {
    decisionOutcome: "EVIDENCE_UNAVAILABLE",
    conditionSupported: false,
    conditionMet: null,
    executedAction: null,
    coachLine: 1,
  },
});

function programLines(mission, repaired = false) {
  return mission.language.guidedProgram.map((command, index) =>
    repaired && index === mission.language.repair.line - 1
      ? mission.language.repair.to
      : command,
  );
}

function planFor(missionId, repaired = false) {
  const mission = getMissionDefinition(missionId);
  const result = compileProgram(programLines(mission, repaired).join("\n"), {
    missionId,
  });
  assert.equal(result.ok, true);
  return result.plan;
}

test("every initial mission is fresh, frozen, and bound to its registry schema", () => {
  for (const missionId of MISSION_IDS) {
    const first = createInitialMissionState(missionId);
    const second = createInitialMissionState(missionId);
    const snapshot = snapshotMissionState(first);

    assert.equal(first.missionId, missionId);
    assert.equal(snapshot.missionId, missionId);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(snapshot), true);
  }

  const east = snapshotMissionState(createInitialMissionState("repair-east-channel"));
  assert.equal(east.irrigationBlocked, true);
  assert.equal(east.tomatoBedsDry, 3);

  const storm = snapshotMissionState(createInitialMissionState("storm-watch"));
  assert.equal(storm.cloudsGathering, true);
  assert.equal(storm.rainFalling, false);
  assert.equal(storm.seedlingBedsCovered, 0);

  const hens = snapshotMissionState(createInitialMissionState("hungry-hens"));
  assert.equal(hens.feederFull, true);
  assert.equal(hens.chuteJammed, true);
  assert.equal(hens.hensHungry, 3);
});

test("each guided program fails honestly for its distinct causal reason", () => {
  for (const missionId of MISSION_IDS) {
    const mission = getMissionDefinition(missionId);
    const expected = EXPECTED_FAILURES[missionId];
    const result = runMission(planFor(missionId), {
      sessionId: `FAIL-${missionId}`,
    });

    assert.equal(result.receipt.missionId, missionId);
    assert.equal(result.receipt.mission, mission.name);
    assert.equal(result.receipt.verdict, "FAIL");
    assert.deepEqual(result.trace.map((entry) => entry.phase), [
      "observe",
      "decide",
      "act",
      "verify",
    ]);
    assert.equal(result.trace[1].outcome, expected.decisionOutcome);
    assert.equal(result.trace[1].conditionSupported, expected.conditionSupported);
    assert.equal(result.trace[1].conditionMet, expected.conditionMet);
    assert.equal(result.trace[2].executedAction, expected.executedAction);
    assert.equal(result.receipt.executedAction, expected.executedAction);
    assert.equal(
      mission.teaching.coach.guidedFailure.line,
      expected.coachLine,
    );
    assert.match(mission.teaching.coach.guidedFailure.explanation, /blockage|harm|wrong place/u);
  }
});

test("repairing exactly one declared line passes all three missions", () => {
  for (const missionId of MISSION_IDS) {
    const mission = getMissionDefinition(missionId);
    const guidedLines = programLines(mission);
    const repairedLines = programLines(mission, true);
    const changed = repairedLines
      .map((line, index) => (line === guidedLines[index] ? null : index + 1))
      .filter(Boolean);
    const result = runMission(planFor(missionId, true), {
      sessionId: `PASS-${missionId}`,
    });

    assert.deepEqual(changed, [mission.language.repair.line]);
    assert.equal(result.receipt.verdict, "PASS");
    assert.equal(result.receipt.missionId, missionId);
    assert.equal(result.trace[1].conditionSupported, true);
    assert.equal(result.trace[1].conditionMet, true);
    assert.equal(result.trace[2].outcome, "WORLD_CHANGED");
    assert.equal(result.receipt.executedAction, result.receipt.selectedAction);
    assert.equal(result.receipt.program[2], "act on the decision");
    assert.equal(result.receipt.beforeKey === result.receipt.afterKey, false);
  }
});

test("already-satisfied worlds select no action and still verify PASS", () => {
  for (const missionId of MISSION_IDS) {
    const plan = planFor(missionId, true);
    const first = runMission(plan, { sessionId: `FIRST-${missionId}` });
    const rerun = runMission(plan, {
      sessionId: `AGAIN-${missionId}`,
      state: first.state,
    });

    assert.equal(first.receipt.verdict, "PASS");
    assert.equal(rerun.trace[1].conditionSupported, true);
    assert.equal(rerun.trace[1].conditionMet, false);
    assert.equal(rerun.trace[1].selectedAction, null);
    assert.equal(rerun.trace[2].outcome, "NO_ACTION_SELECTED");
    assert.equal(rerun.trace[2].executedAction, null);
    assert.equal(rerun.receipt.verdict, "PASS");
    assert.equal(rerun.receipt.beforeKey, rerun.receipt.afterKey);
  }
});

test("Storm Watch applies one fixed-60Hz event after Act and before Verify", () => {
  const originalDateNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => {
    throw new Error("Date.now must not drive Storm Watch");
  };
  Math.random = () => {
    throw new Error("Math.random must not drive Storm Watch");
  };

  try {
    const failure = runMission(planFor("storm-watch"), {
      sessionId: "STORM-LATE",
    });
    const success = runMission(planFor("storm-watch", true), {
      sessionId: "STORM-EARLY",
    });

    assert.equal(failure.timeline.length, 1);
    assert.equal(failure.timeline[0].tickRateHz, 60);
    assert.equal(failure.timeline[0].tick, 150);
    assert.equal(failure.timeline[0].outcome, "HARM_OCCURRED");
    assert.equal(failure.timeline[0].before.rainFalling, false);
    assert.equal(failure.timeline[0].before.seedlingBedsBattered, 0);
    assert.equal(failure.timeline[0].after.rainFalling, true);
    assert.equal(failure.timeline[0].after.seedlingBedsBattered, 3);
    assert.match(failure.timeline[0].message, /rain arrived after/u);
    assert.equal(failure.trace[1].conditionMet, false);
    assert.equal(failure.trace[3].outcome, "FAIL");

    assert.equal(success.timeline[0].outcome, "PROTECTED");
    assert.equal(success.timeline[0].before.seedlingBedsCovered, 3);
    assert.equal(success.timeline[0].after.seedlingBedsBattered, 0);
    assert.equal(success.trace[3].outcome, "PASS");
  } finally {
    Date.now = originalDateNow;
    Math.random = originalRandom;
  }
});

test("Hungry Hens uses only line-one observation evidence", () => {
  const initial = createInitialMissionState("hungry-hens");
  const feederPlan = planFor("hungry-hens");
  const hensPlan = planFor("hungry-hens", true);

  const feederObservation = applyMissionStep(initial, feederPlan.steps[0], {
    plan: feederPlan,
  });
  const unsupportedDecision = applyMissionStep(initial, feederPlan.steps[1], {
    plan: feederPlan,
    observation: feederObservation.observation,
  });
  assert.equal(feederObservation.observation.scope, "feeder");
  assert.equal("hensHungry" in feederObservation.observation.facts, false);
  assert.equal(unsupportedDecision.decision.conditionSupported, false);
  assert.equal(unsupportedDecision.decision.conditionMet, null);
  assert.equal(unsupportedDecision.decision.selectedAction, null);
  assert.match(unsupportedDecision.decision.reason, /no evidence.*hens.*hungry/u);

  const hensObservation = applyMissionStep(initial, hensPlan.steps[0], {
    plan: hensPlan,
  });
  const supportedDecision = applyMissionStep(initial, hensPlan.steps[1], {
    plan: hensPlan,
    observation: hensObservation.observation,
  });
  assert.equal(hensObservation.observation.scope, "hens");
  assert.equal(hensObservation.observation.facts.hensHungry, true);
  assert.equal(supportedDecision.decision.conditionSupported, true);
  assert.equal(supportedDecision.decision.conditionMet, true);
  assert.equal(supportedDecision.decision.selectedAction, "unjam chute");
});

test("observation and decision provenance is exact-plan and cannot be forged", () => {
  for (const missionId of MISSION_IDS) {
    const state = createInitialMissionState(missionId);
    const firstPlan = planFor(missionId, true);
    const secondPlan = planFor(missionId, true);
    const observed = applyMissionStep(state, firstPlan.steps[0], {
      plan: firstPlan,
    });
    const decided = applyMissionStep(state, firstPlan.steps[1], {
      plan: firstPlan,
      observation: observed.observation,
    });
    const acted = applyMissionStep(state, firstPlan.steps[2], {
      plan: firstPlan,
      decision: decided.decision,
    });

    assert.equal(Object.isFrozen(observed.observation), true);
    assert.equal(Object.isFrozen(decided.decision), true);
    assert.equal(acted.evidence.executedAction, decided.decision.selectedAction);

    assert.throws(
      () =>
        applyMissionStep(state, secondPlan.steps[1], {
          plan: secondPlan,
          observation: observed.observation,
        }),
      /exact plan/u,
    );
    assert.throws(
      () =>
        applyMissionStep(state, secondPlan.steps[2], {
          plan: secondPlan,
          decision: decided.decision,
        }),
      /exact plan/u,
    );
    assert.throws(
      () =>
        applyMissionStep(state, firstPlan.steps[1], {
          plan: firstPlan,
          observation: structuredClone(observed.observation),
        }),
      /scoped observation evidence/u,
    );
  }
});

test("cross-mission plans, states, forged plans, and missing sessions fail closed", () => {
  const eastPlan = planFor("repair-east-channel", true);
  const stormState = createInitialMissionState("storm-watch");
  assert.throws(
    () => runMission(eastPlan, { sessionId: "X", state: stormState }),
    /belong to repair-east-channel/u,
  );
  assert.throws(
    () => runMission(structuredClone(eastPlan), { sessionId: "X" }),
    /allowlisted compiler plan/u,
  );
  assert.throws(() => runMission(eastPlan), /sessionId/u);
  assert.throws(
    () => runMission(eastPlan, { sessionId: " ", missionId: "repair-east-channel" }),
    /sessionId/u,
  );
  assert.throws(
    () => runMission(eastPlan, { sessionId: "X", missionId: "storm-watch" }),
    /allowlisted compiler plan/u,
  );
});

test("receipts are immutable complete causal records with mission identity", () => {
  for (const missionId of MISSION_IDS) {
    const result = runMission(planFor(missionId, true), {
      sessionId: `RECEIPT-${missionId}`,
    });
    const { receipt } = result;

    assert.equal(receipt.schema, "agentville.receipt.v2");
    assert.equal(receipt.missionId, missionId);
    assert.equal(receipt.sessionId, `RECEIPT-${missionId}`);
    assert.equal(receipt.program.length, 4);
    assert.equal(receipt.observationCommand, receipt.program[0]);
    assert.equal(receipt.decision, receipt.program[1]);
    assert.equal(receipt.action, receipt.program[2]);
    assert.equal(receipt.verify, receipt.program[3]);
    assert.equal(receipt.conditionSupported, true);
    assert.equal(receipt.conditionMet, true);
    assert.equal(receipt.verdict, "PASS");
    assert.equal(Object.isFrozen(receipt), true);
    assert.equal(Object.isFrozen(receipt.before), true);
    assert.equal(Object.isFrozen(receipt.program), true);
    assert.throws(() => { receipt.verdict = "FAIL"; }, TypeError);
  }
});

test("replay is deterministic and aliases/reset preserve mission boundaries", () => {
  for (const missionId of MISSION_IDS) {
    const plan = planFor(missionId, true);
    const first = runMission(plan, { sessionId: "SAME" });
    const replay = executeMission(plan, { sessionId: "SAME" });
    assert.deepEqual(first, replay);
    assert.equal(executeMission, runMission);

    const firstReset = resetMission(missionId);
    const secondReset = resetMission(missionId);
    assert.deepEqual(firstReset, secondReset);
    assert.notEqual(firstReset, secondReset);
    assert.equal(firstReset.missionId, missionId);
  }
});
