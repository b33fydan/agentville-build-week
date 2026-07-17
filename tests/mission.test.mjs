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

const program = (action) =>
  [
    "observe irrigation",
    "decide if irrigation is blocked",
    action,
    "verify tomatoes are watered",
  ].join("\n");

function planFor(action) {
  const result = compileProgram(program(action));
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

test("first valid action traces all phases and truthfully fails verification", () => {
  const result = runMission(planFor("act water tomatoes"), {
    sessionId: "AVBW-2026-07-16-FIRST",
  });

  assert.deepEqual(
    result.trace.map(({ line, phase, command, outcome }) => ({
      line,
      phase,
      command,
      outcome,
    })),
    [
      {
        line: 1,
        phase: "observe",
        command: "observe irrigation",
        outcome: "BLOCKED",
      },
      {
        line: 2,
        phase: "decide",
        command: "decide if irrigation is blocked",
        outcome: "CLEAR_BLOCKAGE_REQUIRED",
      },
      {
        line: 3,
        phase: "act",
        command: "act water tomatoes",
        outcome: "NO_CHANGE",
      },
      {
        line: 4,
        phase: "verify",
        command: "verify tomatoes are watered",
        outcome: "FAIL",
      },
    ],
  );
  assert.equal(result.state.irrigation.blocked, true);
  assert.equal(result.state.irrigation.waterReleased, false);
  assert.equal(result.state.tomatoBeds.every((bed) => !bed.watered), true);
  assert.match(result.trace[2].message, /blocked irrigation released no water/u);
  assert.match(result.trace[3].message, /0 of 3/u);
  assert.equal(result.receipt.verdict, "FAIL");
  assert.equal(result.receipt.action, "act water tomatoes");
  assert.equal(result.receipt.sessionId, "AVBW-2026-07-16-FIRST");
  assert.deepEqual(result.receipt.before, result.receipt.after);
});

test("repair after failure clears the block, releases water, waters three beds, and passes", () => {
  const failure = runMission(planFor("act water tomatoes"), {
    sessionId: "AVBW-FAIL",
  });
  const repaired = runMission(planFor("act clear blockage"), {
    sessionId: "AVBW-2026-07-16-REPAIRED",
    state: failure.state,
  });

  assert.equal(repaired.trace.length, 4);
  assert.deepEqual(
    repaired.trace.map((entry) => entry.phase),
    ["observe", "decide", "act", "verify"],
  );
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
  assert.equal(repaired.receipt.sessionId, "AVBW-2026-07-16-REPAIRED");
});

test("receipt contains the complete immutable causal record", () => {
  const result = runMission(planFor("act clear blockage"), {
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
    "action",
    "verdict",
  ]);
  assert.equal(receipt.sessionId, "  AVBW-preserve-exactly  ");
  assert.equal(receipt.mission, "Repair the East Channel");
  assert.match(receipt.observation, /blocked/u);
  assert.match(receipt.decision, /cleared before/u);
  assert.equal(receipt.action, "act clear blockage");
  assert.equal(receipt.verdict, "PASS");
  assert.equal(receipt.before.irrigationBlocked, true);
  assert.equal(receipt.after.irrigationBlocked, false);
  assert.equal(receipt.after.waterReleased, true);
  assert.equal(receipt.after.tomatoBedsWatered, 3);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.before), true);
  assert.equal(Object.isFrozen(receipt.after), true);
  assert.throws(
    () => {
      receipt.verdict = "FAIL";
    },
    TypeError,
  );
});

test("step transitions are pure and expose before/after evidence", () => {
  const initial = createInitialMissionState();
  const beforeJson = JSON.stringify(initial);
  const actionStep = planFor("act clear blockage").steps[2];
  const transition = applyMissionStep(initial, actionStep);

  assert.equal(JSON.stringify(initial), beforeJson);
  assert.notEqual(transition.state, initial);
  assert.equal(initial.irrigation.blocked, true);
  assert.equal(transition.state.irrigation.blocked, false);
  assert.equal(transition.evidence.line, 3);
  assert.equal(transition.evidence.phase, "act");
  assert.equal(transition.evidence.before.irrigationBlocked, true);
  assert.equal(transition.evidence.after.irrigationBlocked, false);
  assert.equal(Object.isFrozen(transition), true);
  assert.equal(Object.isFrozen(transition.evidence), true);
});

test("replay is deterministic and session metadata cannot affect the farm", () => {
  const plan = planFor("act clear blockage");
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
  const completed = runMission(planFor("act clear blockage"), {
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

test("runtime accepts compile results directly and exposes an execution alias", () => {
  const compiled = compileProgram(program("act clear blockage"));
  assert.equal(compiled.ok, true);

  const direct = runMission(compiled, { sessionId: "AVBW-DIRECT" });
  const aliased = executeMission(compiled.plan, {
    sessionId: "AVBW-DIRECT",
  });
  assert.deepEqual(direct, aliased);
  assert.equal(executeMission, runMission);
});

test("forged plans, invalid steps, bad state, and missing sessions fail closed", () => {
  const plan = planFor("act clear blockage");
  const forged = structuredClone(plan);
  forged.steps[2].command = "act fetch tomatoes";
  const initial = createInitialMissionState();
  const before = JSON.stringify(initial);

  assert.throws(
    () => runMission(forged, { sessionId: "AVBW-FORGED" }),
    /allowlisted compiler plan/u,
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
