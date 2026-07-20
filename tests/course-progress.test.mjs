import test from "node:test";
import assert from "node:assert/strict";

import {
  COURSE_MISSION_IDS,
  createCourseProgress,
  isMissionUnlocked,
  nextMissionId,
  recordMissionReceipt,
  selectMission,
} from "../src/course-progress.js";

const EAST_CHANNEL = "repair-east-channel";
const STORM_WATCH = "storm-watch";
const HUNGRY_HENS = "hungry-hens";

function receipt(missionId, verdict) {
  return Object.freeze({ missionId, verdict });
}

test("course begins with only Repair the East Channel unlocked and active", () => {
  const progress = createCourseProgress();

  assert.deepEqual(COURSE_MISSION_IDS, [EAST_CHANNEL, STORM_WATCH, HUNGRY_HENS]);
  assert.deepEqual(progress, {
    activeMissionId: EAST_CHANNEL,
    unlockedMissionIds: [EAST_CHANNEL],
    passedMissionIds: [],
  });
  assert.equal(isMissionUnlocked(progress, EAST_CHANNEL), true);
  assert.equal(isMissionUnlocked(progress, STORM_WATCH), false);
  assert.equal(isMissionUnlocked(progress, HUNGRY_HENS), false);
  assert.equal(nextMissionId(progress, EAST_CHANNEL), null);
});

test("progress records and mission id lists are deeply frozen", () => {
  const initial = createCourseProgress();
  const unlocked = recordMissionReceipt(initial, receipt(EAST_CHANNEL, "PASS"));

  assert.equal(Object.isFrozen(COURSE_MISSION_IDS), true);
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(initial.unlockedMissionIds), true);
  assert.equal(Object.isFrozen(initial.passedMissionIds), true);
  assert.equal(Object.isFrozen(unlocked), true);
  assert.equal(Object.isFrozen(unlocked.unlockedMissionIds), true);
  assert.equal(Object.isFrozen(unlocked.passedMissionIds), true);
  assert.throws(() => unlocked.unlockedMissionIds.push(HUNGRY_HENS), TypeError);
  assert.throws(() => { unlocked.activeMissionId = HUNGRY_HENS; }, TypeError);
});

test("a FAIL receipt leaves progression unchanged", () => {
  const initial = createCourseProgress();
  const afterFailure = recordMissionReceipt(initial, receipt(EAST_CHANNEL, "FAIL"));

  assert.equal(afterFailure, initial);
  assert.deepEqual(afterFailure.unlockedMissionIds, [EAST_CHANNEL]);
  assert.deepEqual(afterFailure.passedMissionIds, []);
});

test("passing Mission 01 unlocks only Storm Watch", () => {
  const initial = createCourseProgress();
  const afterPass = recordMissionReceipt(initial, receipt(EAST_CHANNEL, "PASS"));

  assert.notEqual(afterPass, initial);
  assert.equal(afterPass.activeMissionId, EAST_CHANNEL);
  assert.deepEqual(afterPass.unlockedMissionIds, [EAST_CHANNEL, STORM_WATCH]);
  assert.deepEqual(afterPass.passedMissionIds, [EAST_CHANNEL]);
  assert.equal(isMissionUnlocked(afterPass, STORM_WATCH), true);
  assert.equal(isMissionUnlocked(afterPass, HUNGRY_HENS), false);
  assert.equal(nextMissionId(afterPass, EAST_CHANNEL), STORM_WATCH);
  assert.equal(nextMissionId(afterPass, STORM_WATCH), null);
});

test("passing Mission 02 unlocks Hungry Hens in course order", () => {
  const afterMissionOne = recordMissionReceipt(
    createCourseProgress(),
    receipt(EAST_CHANNEL, "PASS"),
  );
  const stormSelected = selectMission(afterMissionOne, STORM_WATCH);
  const afterMissionTwo = recordMissionReceipt(
    stormSelected,
    receipt(STORM_WATCH, "PASS"),
  );

  assert.equal(stormSelected.activeMissionId, STORM_WATCH);
  assert.deepEqual(afterMissionTwo.unlockedMissionIds, COURSE_MISSION_IDS);
  assert.deepEqual(afterMissionTwo.passedMissionIds, [EAST_CHANNEL, STORM_WATCH]);
  assert.equal(nextMissionId(afterMissionTwo, STORM_WATCH), HUNGRY_HENS);

  const hensSelected = selectMission(afterMissionTwo, HUNGRY_HENS);
  const courseComplete = recordMissionReceipt(
    hensSelected,
    receipt(HUNGRY_HENS, "PASS"),
  );
  assert.deepEqual(courseComplete.passedMissionIds, COURSE_MISSION_IDS);
  assert.equal(nextMissionId(courseComplete, HUNGRY_HENS), null);
});

test("replaying a receipt is idempotent", () => {
  const missionOnePass = receipt(EAST_CHANNEL, "PASS");
  const initial = createCourseProgress();
  const afterPass = recordMissionReceipt(initial, missionOnePass);

  assert.equal(recordMissionReceipt(afterPass, missionOnePass), afterPass);

  const stormSelected = selectMission(afterPass, STORM_WATCH);
  assert.equal(recordMissionReceipt(stormSelected, missionOnePass), stormSelected);

  const stormFailure = receipt(STORM_WATCH, "FAIL");
  assert.equal(recordMissionReceipt(stormSelected, stormFailure), stormSelected);
  assert.equal(recordMissionReceipt(stormSelected, stormFailure), stormSelected);
});

test("locked and out-of-order mission selection is rejected", () => {
  const initial = createCourseProgress();

  assert.throws(() => selectMission(initial, STORM_WATCH), /locked: storm-watch/u);
  assert.throws(() => selectMission(initial, HUNGRY_HENS), /locked: hungry-hens/u);
  assert.throws(
    () => recordMissionReceipt(initial, receipt(STORM_WATCH, "PASS")),
    /locked: storm-watch/u,
  );

  const afterMissionOne = recordMissionReceipt(initial, receipt(EAST_CHANNEL, "PASS"));
  assert.throws(
    () => recordMissionReceipt(afterMissionOne, receipt(STORM_WATCH, "PASS")),
    /while repair-east-channel is active/u,
  );
});

test("mission receipt and API ids must be exact and known", () => {
  const initial = createCourseProgress();

  for (const unknownId of [undefined, null, "", "storm-watch ", "Storm-Watch", "mission-04"]) {
    assert.throws(() => isMissionUnlocked(initial, unknownId), /Unknown mission id/u);
    assert.throws(() => selectMission(initial, unknownId), /Unknown mission id/u);
    assert.throws(() => nextMissionId(initial, unknownId), /Unknown mission id/u);
    assert.throws(
      () => recordMissionReceipt(initial, receipt(unknownId, "PASS")),
      /Unknown mission id/u,
    );
  }

  assert.throws(() => recordMissionReceipt(initial, null), /receipt object is required/u);
  assert.throws(
    () => recordMissionReceipt(initial, { verdict: "PASS" }),
    /Unknown mission id/u,
  );
  assert.throws(
    () => recordMissionReceipt(initial, receipt(EAST_CHANNEL, "pass")),
    /exactly "PASS" or "FAIL"/u,
  );
});

test("reducers accept valid value records and reject impossible progress", () => {
  const restored = structuredClone(
    recordMissionReceipt(createCourseProgress(), receipt(EAST_CHANNEL, "PASS")),
  );
  const selected = selectMission(restored, STORM_WATCH);

  assert.equal(selected.activeMissionId, STORM_WATCH);
  assert.equal(Object.isFrozen(selected), true);

  const impossible = Object.freeze({
    activeMissionId: HUNGRY_HENS,
    unlockedMissionIds: [EAST_CHANNEL, HUNGRY_HENS],
    passedMissionIds: [EAST_CHANNEL],
  });

  assert.throws(
    () => isMissionUnlocked(impossible, HUNGRY_HENS),
    /ordered mission sequence/u,
  );
  assert.throws(
    () => recordMissionReceipt(impossible, receipt(HUNGRY_HENS, "PASS")),
    /ordered mission sequence/u,
  );
});
