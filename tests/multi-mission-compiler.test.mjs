import test from "node:test";
import assert from "node:assert/strict";

import {
  compileProgram,
  isSafePlan,
  validateProgramPrefix,
} from "../src/compiler.js";
import {
  MISSION_IDS,
  SHARED_ACT_COMMAND,
  getMissionDefinition,
} from "../src/mission-registry.js";

function repairedProgram(mission) {
  return mission.language.guidedProgram.map((command, index) =>
    index === mission.language.repair.line - 1
      ? mission.language.repair.to
      : command,
  );
}

test("every mission compiles its exact plain-English guided and repaired program", () => {
  for (const missionId of MISSION_IDS) {
    const mission = getMissionDefinition(missionId);
    for (const lines of [mission.language.guidedProgram, repairedProgram(mission)]) {
      const result = compileProgram(`${lines.join("\r\n")}\r\n`, { missionId });
      assert.equal(result.ok, true, missionId);
      assert.equal(result.missionId, missionId);
      assert.equal(result.plan.missionId, missionId);
      assert.equal(result.plan.version, 3);
      assert.equal(result.plan.steps[2].command, SHARED_ACT_COMMAND);
      assert.equal(result.plan.bindings.observe.command, lines[0]);
      assert.equal(result.plan.bindings.decide.command, lines[1]);
      assert.equal(result.plan.bindings.verify.command, lines[3]);
      assert.equal(isSafePlan(result.plan, { missionId }), true);
    }
  }
});

test("plans and commands are bound to one mission and fail closed across missions", () => {
  for (const missionId of MISSION_IDS) {
    const mission = getMissionDefinition(missionId);
    const source = mission.language.guidedProgram.join("\n");
    const compiled = compileProgram(source, { missionId });
    assert.equal(compiled.ok, true);

    for (const otherMissionId of MISSION_IDS.filter((id) => id !== missionId)) {
      const rejected = compileProgram(source, { missionId: otherMissionId });
      assert.equal(rejected.ok, false, `${missionId} source in ${otherMissionId}`);
      assert.ok(
        rejected.errors.some((error) =>
          ["SYNTAX", "DECISION_NOT_ALLOWED"].includes(error.code),
        ),
      );
      assert.equal(isSafePlan(compiled.plan, { missionId: otherMissionId }), false);
    }
  }
});

test("all legacy shorthand and nonallowlisted lines are rejected without a plan", () => {
  const legacyLines = [
    ["repair-east-channel", 0, "observe irrigation"],
    ["repair-east-channel", 1, "decide water tomatoes when dry"],
    ["repair-east-channel", 1, "decide clear blockage when blocked"],
    ["storm-watch", 1, "decide cover beds when rain"],
    ["hungry-hens", 0, "observe chickens"],
    ["hungry-hens", 2, "act unjam chute"],
  ];

  for (const [missionId, lineIndex, badLine] of legacyLines) {
    const mission = getMissionDefinition(missionId);
    const lines = [...mission.language.guidedProgram];
    lines[lineIndex] = badLine;
    const result = compileProgram(lines.join("\n"), { missionId });
    assert.equal(result.ok, false, badLine);
    assert.equal("plan" in result, false);
    assert.equal(result.errors.some((error) => error.line === lineIndex + 1), true);
  }
});

test("prefix validation is mission-aware and never mints authority", () => {
  for (const missionId of MISSION_IDS) {
    const mission = getMissionDefinition(missionId);
    for (let count = 1; count <= 4; count += 1) {
      const result = validateProgramPrefix(
        mission.language.guidedProgram.slice(0, count).join("\n"),
        { missionId },
      );
      assert.equal(result.ok, true);
      assert.equal(result.missionId, missionId);
      assert.equal("plan" in result, false);
      assert.equal(isSafePlan(result, { missionId }), false);
    }
  }
});

test("unknown mission ids reject before source can be interpreted", () => {
  assert.throws(
    () => compileProgram("observe the sky", { missionId: "unknown" }),
    /Unknown mission id/u,
  );
  assert.throws(
    () => validateProgramPrefix("observe the sky", { missionId: "unknown" }),
    /Unknown mission id/u,
  );
});
