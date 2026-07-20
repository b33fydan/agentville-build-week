import test from "node:test";
import assert from "node:assert/strict";

import { compileProgram } from "../src/compiler.js";
import { createLearningRecap } from "../src/debrief.js";
import { runMission } from "../src/mission.js";
import {
  MISSION_IDS,
  getMissionDefinition,
} from "../src/mission-registry.js";

function linesFor(mission, repaired = false) {
  return mission.language.guidedProgram.map((command, index) =>
    repaired && index === mission.language.repair.line - 1
      ? mission.language.repair.to
      : command,
  );
}

function run(missionId, repaired, sessionId, state) {
  const mission = getMissionDefinition(missionId);
  return runMission(
    compileProgram(linesFor(mission, repaired).join("\n"), { missionId }),
    {
      sessionId,
      ...(state ? { state } : {}),
    },
  );
}

test("every repair recap explains the actual single-line learner change", () => {
  for (const missionId of MISSION_IDS) {
    const mission = getMissionDefinition(missionId);
    const sessionId = `RECAP-${missionId}`;
    const failure = run(missionId, false, sessionId);
    const success = run(missionId, true, sessionId);
    const recap = createLearningRecap(success.receipt, {
      failedReceipt: failure.receipt,
    });

    assert.equal(recap.missionId, missionId);
    assert.equal(recap.path, "repair");
    assert.equal(recap.learner.diagnosedFailure, true);
    assert.equal(recap.learner.changedLine, mission.language.repair.line);
    assert.equal(recap.learner.changedPhase, mission.language.repair.phase);
    assert.equal(recap.learner.from, mission.language.repair.from);
    assert.equal(recap.learner.to, mission.language.repair.to);
    assert.equal(
      recap.phases[mission.language.repair.line - 1].command,
      mission.language.repair.to,
    );
    assert.deepEqual(
      recap.phases.map(({ phase }) => phase),
      ["observe", "decide", "act", "verify"],
    );
    assert.match(recap.summary, /Observe/u);
    assert.match(recap.takeaway.title, /debugged an agent/u);
    assert.equal(Object.isFrozen(recap), true);
    assert.equal(Object.isFrozen(recap.phases), true);
  }
});

test("direct success never invents a guided failure or repair", () => {
  for (const missionId of MISSION_IDS) {
    const mission = getMissionDefinition(missionId);
    const receipt = run(missionId, true, `DIRECT-${missionId}`).receipt;
    const recap = createLearningRecap(receipt);

    assert.equal(recap.path, "direct");
    assert.equal(recap.learner.diagnosedFailure, false);
    assert.equal(recap.learner.changedLine, null);
    assert.equal(recap.learner.from, null);
    assert.equal(
      recap.learner.to,
      mission.language.repair.to,
    );
    assert.doesNotMatch(recap.summary, /failed attempt/u);
  }
});

test("already-satisfied recaps explain false conditions and no action", () => {
  for (const missionId of MISSION_IDS) {
    const completed = run(missionId, true, `DONE-${missionId}`);
    const rerun = run(
      missionId,
      true,
      `DONE-${missionId}`,
      completed.state,
    );
    const recap = createLearningRecap(rerun.receipt);

    assert.equal(rerun.receipt.selectedAction, null);
    assert.equal(rerun.receipt.executedAction, null);
    assert.equal(recap.path, "already-satisfied");
    assert.equal(recap.title, "The goal was already satisfied.");
    assert.match(recap.summary, /condition was false/u);
    assert.match(recap.phases[1].explanation, /false.*no response/u);
    assert.match(recap.phases[2].explanation, /unchanged/u);
    assert.equal(
      recap.takeaway.title,
      "You verified before changing anything.",
    );
  }
});

test("repair history requires the same mission, session, baseline, and programs", () => {
  const eastFailure = run("repair-east-channel", false, "MATCH").receipt;
  const eastSuccess = run("repair-east-channel", true, "MATCH").receipt;
  const stormFailure = run("storm-watch", false, "MATCH").receipt;

  assert.equal(
    createLearningRecap(eastSuccess, { failedReceipt: stormFailure }).path,
    "direct",
  );
  assert.equal(
    createLearningRecap(eastSuccess, {
      failedReceipt: { ...eastFailure, sessionId: "OTHER" },
    }).path,
    "direct",
  );
  assert.equal(
    createLearningRecap(eastSuccess, {
      failedReceipt: { ...eastFailure, beforeKey: "forged" },
    }).path,
    "direct",
  );
  assert.equal(
    createLearningRecap(eastSuccess, {
      failedReceipt: {
        ...eastFailure,
        program: [...eastFailure.program].reverse(),
      },
    }).path,
    "direct",
  );
});

test("learning recap renders only for a registry-backed PASS receipt", () => {
  assert.equal(createLearningRecap(null), null);
  assert.equal(createLearningRecap({ verdict: "FAIL" }), null);
  assert.equal(
    createLearningRecap({ verdict: "PASS", missionId: "unknown" }),
    null,
  );
});
