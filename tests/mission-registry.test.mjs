import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MISSION_ID,
  MISSION_IDS,
  SHARED_ACT_COMMAND,
  getMissionDefinition,
  listMissionDefinitions,
} from "../src/mission-registry.js";

const EXPECTED_COMMANDS = {
  "repair-east-channel": {
    guided: [
      "observe the east channel",
      "decide water the tomatoes when the beds are dry",
      "act on the decision",
      "verify every tomato bed is watered",
    ],
    repair: {
      line: 2,
      from: "decide water the tomatoes when the beds are dry",
      to: "decide clear the blockage when the water is blocked",
    },
  },
  "storm-watch": {
    guided: [
      "observe the sky",
      "decide cover the beds when rain falls",
      "act on the decision",
      "verify the seedlings are safe",
    ],
    repair: {
      line: 2,
      from: "decide cover the beds when rain falls",
      to: "decide cover the beds when clouds gather",
    },
  },
  "hungry-hens": {
    guided: [
      "observe the feeder",
      "decide unjam the chute when the hens are hungry",
      "act on the decision",
      "verify every hen has eaten",
    ],
    repair: {
      line: 1,
      from: "observe the feeder",
      to: "observe the hens",
    },
  },
};

function assertDeeplyFrozen(value, seen = new WeakSet()) {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    seen.has(value)
  ) {
    return;
  }
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    assertDeeplyFrozen(value[key], seen);
  }
}

test("registry exposes three ordered, complete mission definitions", () => {
  const definitions = listMissionDefinitions();

  assert.equal(DEFAULT_MISSION_ID, "repair-east-channel");
  assert.equal(SHARED_ACT_COMMAND, "act on the decision");
  assert.deepEqual(MISSION_IDS, [
    "repair-east-channel",
    "storm-watch",
    "hungry-hens",
  ]);
  assert.deepEqual(
    definitions.map(({ id, name, order }) => ({ id, name, order })),
    [
      { id: "repair-east-channel", name: "Repair the East Channel", order: 1 },
      { id: "storm-watch", name: "Storm Watch", order: 2 },
      { id: "hungry-hens", name: "The Hungry Hens", order: 3 },
    ],
  );
  assert.deepEqual(definitions[0].unlocks, ["storm-watch"]);
  assert.deepEqual(definitions[1].unlocks, ["hungry-hens"]);
  assert.deepEqual(definitions[2].unlocks, []);
});

test("every mission owns exact four-line commands and one declared repair", () => {
  for (const definition of listMissionDefinitions()) {
    const expected = EXPECTED_COMMANDS[definition.id];
    assert.deepEqual(definition.language.phases, [
      "observe",
      "decide",
      "act",
      "verify",
    ]);
    assert.deepEqual(definition.language.guidedProgram, expected.guided);
    assert.deepEqual(definition.language.commands.act, [SHARED_ACT_COMMAND]);
    assert.equal(definition.language.repair.line, expected.repair.line);
    assert.equal(definition.language.repair.from, expected.repair.from);
    assert.equal(definition.language.repair.to, expected.repair.to);

    const repaired = [...definition.language.guidedProgram];
    repaired[definition.language.repair.line - 1] = definition.language.repair.to;
    assert.equal(
      repaired.filter(
        (command, index) => command !== definition.language.guidedProgram[index],
      ).length,
      1,
    );

    for (const commands of Object.values(definition.language.commands)) {
      for (const command of commands) {
        assert.match(command, /^[a-z]+(?: [a-z]+)*$/u);
      }
    }
  }
});

test("registry data, nested behavior functions, and returned states are frozen", () => {
  assertDeeplyFrozen(MISSION_IDS);
  assertDeeplyFrozen(listMissionDefinitions());
  assert.equal(Object.isFrozen(listMissionDefinitions), true);
  assert.equal(Object.isFrozen(getMissionDefinition), true);

  for (const definition of listMissionDefinitions()) {
    assertDeeplyFrozen(definition);
    const first = definition.state.createInitial();
    const second = definition.state.createInitial();
    assert.notEqual(first, second);
    assert.deepEqual(first, second);
    assertDeeplyFrozen(first);
    assert.equal(first.missionId, definition.id);
    assert.equal(
      definition.state.snapshotKey(first),
      definition.state.snapshotKey(second),
    );
  }
});

test("lookup is stable and rejects unknown mission ids", () => {
  for (const definition of listMissionDefinitions()) {
    assert.equal(getMissionDefinition(definition.id), definition);
  }
  assert.throws(
    () => getMissionDefinition("missing-mission"),
    /Unknown mission id: missing-mission/u,
  );
  assert.throws(() => getMissionDefinition(null), /Unknown mission id: null/u);
});

test("non-shared commands stay separated between missions", () => {
  const definitions = listMissionDefinitions();
  for (const definition of definitions) {
    const owned = new Set(
      Object.values(definition.language.commands).flat().filter(
        (command) => command !== SHARED_ACT_COMMAND,
      ),
    );
    for (const other of definitions) {
      if (other === definition) continue;
      const foreign = Object.values(other.language.commands)
        .flat()
        .filter((command) => command !== SHARED_ACT_COMMAND);
      assert.equal(
        foreign.some((command) => owned.has(command)),
        false,
        `${definition.id} accepted a command owned by ${other.id}`,
      );
    }
  }
});

test("Storm Watch uses a fixed 60 Hz event that batters only uncovered beds", () => {
  const mission = getMissionDefinition("storm-watch");
  assert.equal(mission.timeline.tickRateHz, 60);
  assert.equal(mission.timeline.durationTicks, 240);
  assert.deepEqual(mission.timeline.events, [
    {
      id: "storm-arrives",
      tick: 150,
      transitionId: "storm-arrives",
      label: "The storm reaches the seedling beds",
    },
  ]);
  assert.ok(
    mission.timeline.events.every(({ tick }) => Number.isInteger(tick)),
  );

  const initial = mission.state.createInitial();
  const observed = mission.observation.collect(initial, "observe the sky");
  assert.deepEqual(observed.facts, {
    cloudsGathering: true,
    rainFalling: false,
  });
  assert.deepEqual(
    mission.conditions.evaluate("rain-falls", observed),
    {
      supported: true,
      met: false,
      reason: "The sky observation shows that rain has not started.",
    },
  );
  assert.equal(
    mission.conditions.evaluate("clouds-gather", observed).met,
    true,
  );

  const battered = mission.timeline.applyEvent(initial, "storm-arrives");
  assert.equal(mission.verify.predicate(battered), false);
  assert.equal(
    mission.state.snapshot(battered).seedlingBedsBattered,
    3,
  );

  const covered = mission.actions.transition(initial, "cover beds");
  const protectedState = mission.timeline.applyEvent(covered, "storm-arrives");
  assert.equal(mission.verify.predicate(protectedState), true);
  assert.equal(
    mission.state.snapshot(protectedState).seedlingBedsBattered,
    0,
  );
});

test("Hungry Hens decisions can use only facts yielded by line one", () => {
  const mission = getMissionDefinition("hungry-hens");
  const initial = mission.state.createInitial();

  const feederObservation = mission.observation.collect(
    initial,
    "observe the feeder",
  );
  assert.equal(feederObservation.scope, "feeder");
  assert.deepEqual(feederObservation.facts, {
    feederFull: true,
    chuteJammed: true,
    grainDelivered: 0,
  });
  assert.equal("hensHungry" in feederObservation.facts, false);
  const unsupported = mission.conditions.evaluate(
    "hens-hungry",
    feederObservation,
  );
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.met, null);
  assert.match(unsupported.reason, /no evidence.*hens are hungry/u);

  const henObservation = mission.observation.collect(initial, "observe the hens");
  assert.equal(henObservation.scope, "hens");
  assert.equal(henObservation.facts.hensHungry, true);
  assert.equal(henObservation.facts.hensAtJammedChute, true);
  assert.deepEqual(mission.conditions.evaluate("hens-hungry", henObservation), {
    supported: true,
    met: true,
    reason:
      "The hen observation found hungry hens waiting at the jammed chute.",
  });

  const fed = mission.actions.transition(initial, "unjam chute");
  const snapshot = mission.state.snapshot(fed);
  assert.equal(snapshot.chuteJammed, false);
  assert.equal(snapshot.grainDelivered, 3);
  assert.equal(snapshot.hensFed, 3);
  assert.equal(mission.verify.predicate(fed), true);
});
