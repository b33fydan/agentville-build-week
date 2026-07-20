export const DEFAULT_MISSION_ID = "repair-east-channel";
export const SHARED_ACT_COMMAND = "act on the decision";

const PHASES = ["observe", "decide", "act", "verify"];
const TOMATO_BED_COUNT = 3;
const SEEDLING_BED_COUNT = 3;
const HEN_COUNT = 3;
const FIXED_TICK_RATE = 60;

function deepFreeze(value, seen = new WeakSet()) {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    seen.has(value)
  ) {
    return value;
  }

  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key], seen);
  }
  return Object.freeze(value);
}

function assertRecord(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(message);
  }
  return value;
}

function assertBoolean(value, message) {
  if (typeof value !== "boolean") throw new TypeError(message);
  return value;
}

function assertNonNegativeInteger(value, message) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(message);
  return value;
}

function hasFact(observation, fact) {
  return Boolean(
    observation &&
      typeof observation === "object" &&
      observation.facts &&
      typeof observation.facts === "object" &&
      Object.prototype.hasOwnProperty.call(observation.facts, fact),
  );
}

function factCondition(observation, fact, { met, notMet, unsupported }) {
  if (!hasFact(observation, fact)) {
    return deepFreeze({ supported: false, met: null, reason: unsupported });
  }

  const conditionMet = observation.facts[fact] === true;
  return deepFreeze({
    supported: true,
    met: conditionMet,
    reason: conditionMet ? met : notMet,
  });
}

function assertMissionIdentity(state, missionId, label) {
  if (state.missionId !== missionId) {
    throw new TypeError(`${label} state must belong to ${missionId}.`);
  }
}

function unknownCommand(kind, command) {
  throw new RangeError(`Unknown ${kind}: ${String(command)}`);
}

function makeBeds(prefix, count, createBed) {
  return Array.from({ length: count }, (_, index) =>
    createBed(`${prefix}-${index + 1}`, index),
  );
}

function normalizeFixedList(value, count, message, normalizeItem) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new TypeError(message);
  }
  return value.map((item, index) => normalizeItem(assertRecord(item, message), index));
}

function createEastChannelInitialState() {
  return deepFreeze({
    missionId: "repair-east-channel",
    irrigation: {
      channel: "East Channel",
      blocked: true,
      waterReleased: false,
    },
    tomatoBeds: makeBeds("tomato-bed", TOMATO_BED_COUNT, (id) => ({
      id,
      crop: "tomatoes",
      watered: false,
    })),
  });
}

function normalizeEastChannelState(state) {
  const source = assertRecord(state, "East Channel state must be an object.");
  assertMissionIdentity(source, "repair-east-channel", "East Channel");
  const irrigation = assertRecord(
    source.irrigation,
    "East Channel state requires irrigation data.",
  );
  const tomatoBeds = normalizeFixedList(
    source.tomatoBeds,
    TOMATO_BED_COUNT,
    "East Channel state requires exactly three tomato beds.",
    (bed, index) => ({
      id: `tomato-bed-${index + 1}`,
      crop: "tomatoes",
      watered: assertBoolean(
        bed.watered,
        "Each tomato bed requires a watered boolean.",
      ),
    }),
  );

  return deepFreeze({
    missionId: "repair-east-channel",
    irrigation: {
      channel: "East Channel",
      blocked: assertBoolean(
        irrigation.blocked,
        "East Channel irrigation requires a blocked boolean.",
      ),
      waterReleased: assertBoolean(
        irrigation.waterReleased,
        "East Channel irrigation requires a waterReleased boolean.",
      ),
    },
    tomatoBeds,
  });
}

function snapshotEastChannelState(state) {
  const safeState = normalizeEastChannelState(state);
  const tomatoBedsWatered = safeState.tomatoBeds.filter(
    (bed) => bed.watered,
  ).length;
  return deepFreeze({
    missionId: safeState.missionId,
    irrigationBlocked: safeState.irrigation.blocked,
    waterReleased: safeState.irrigation.waterReleased,
    tomatoBedsWatered,
    tomatoBedsDry: TOMATO_BED_COUNT - tomatoBedsWatered,
    tomatoBedsTotal: TOMATO_BED_COUNT,
  });
}

function eastChannelSnapshotKey(state) {
  const snapshot = snapshotEastChannelState(state);
  return [
    snapshot.irrigationBlocked ? 1 : 0,
    snapshot.waterReleased ? 1 : 0,
    snapshot.tomatoBedsWatered,
  ].join(":");
}

function observeEastChannel(state) {
  const snapshot = snapshotEastChannelState(state);
  const summary = snapshot.irrigationBlocked
    ? `East Channel water stops at visible debris; ${snapshot.tomatoBedsDry} tomato beds are dry.`
    : snapshot.tomatoBedsDry > 0
      ? `East Channel water is flowing; ${snapshot.tomatoBedsDry} tomato beds are still dry.`
      : `East Channel water is flowing; all ${TOMATO_BED_COUNT} tomato beds are watered.`;

  return deepFreeze({
    command: "observe the east channel",
    scope: "east-channel",
    summary,
    facts: {
      waterBlocked: snapshot.irrigationBlocked,
      bedsDry: snapshot.tomatoBedsDry > 0,
      tomatoBedsDry: snapshot.tomatoBedsDry,
      tomatoBedsWatered: snapshot.tomatoBedsWatered,
    },
  });
}

function evaluateEastChannelCondition(conditionId, observation) {
  if (conditionId === "beds-dry") {
    return factCondition(observation, "bedsDry", {
      met: "The East Channel observation found dry tomato beds.",
      notMet: "The East Channel observation found no dry tomato beds.",
      unsupported: "The observation did not include evidence about the tomato beds.",
    });
  }
  if (conditionId === "water-blocked") {
    return factCondition(observation, "waterBlocked", {
      met: "The East Channel observation found that debris is blocking the water.",
      notMet: "The East Channel observation found that the water is not blocked.",
      unsupported: "The observation did not include evidence about the water flow.",
    });
  }
  return unknownCommand("East Channel condition", conditionId);
}

function transitionEastChannel(state, actionId) {
  const safeState = normalizeEastChannelState(state);
  if (actionId === null) return safeState;

  if (actionId === "water tomatoes") {
    if (safeState.irrigation.blocked) return safeState;
    return deepFreeze({
      ...safeState,
      tomatoBeds: makeBeds("tomato-bed", TOMATO_BED_COUNT, (id) => ({
        id,
        crop: "tomatoes",
        watered: true,
      })),
    });
  }

  if (actionId === "clear blockage") {
    return deepFreeze({
      missionId: safeState.missionId,
      irrigation: {
        channel: "East Channel",
        blocked: false,
        waterReleased: true,
      },
      tomatoBeds: makeBeds("tomato-bed", TOMATO_BED_COUNT, (id) => ({
        id,
        crop: "tomatoes",
        watered: true,
      })),
    });
  }

  return unknownCommand("East Channel action", actionId);
}

function verifyEastChannel(state) {
  const snapshot = snapshotEastChannelState(state);
  return (
    !snapshot.irrigationBlocked &&
    snapshot.waterReleased &&
    snapshot.tomatoBedsWatered === snapshot.tomatoBedsTotal
  );
}

function eastChannelVerificationEvidence(state) {
  const snapshot = snapshotEastChannelState(state);
  const passed = verifyEastChannel(state);
  return deepFreeze({
    passed,
    outcome: passed ? "PASS" : "FAIL",
    message: `${snapshot.tomatoBedsWatered} of ${snapshot.tomatoBedsTotal} tomato beds are watered.`,
    snapshot,
  });
}

function createStormWatchInitialState() {
  return deepFreeze({
    missionId: "storm-watch",
    weather: {
      cloudsGathering: true,
      rainFalling: false,
      stormArrived: false,
    },
    covers: {
      location: "shed",
      available: true,
      deployed: false,
    },
    seedlingBeds: makeBeds("seedling-bed", SEEDLING_BED_COUNT, (id) => ({
      id,
      crop: "seedlings",
      covered: false,
      battered: false,
    })),
  });
}

function normalizeStormWatchState(state) {
  const source = assertRecord(state, "Storm Watch state must be an object.");
  assertMissionIdentity(source, "storm-watch", "Storm Watch");
  const weather = assertRecord(
    source.weather,
    "Storm Watch state requires weather data.",
  );
  const covers = assertRecord(
    source.covers,
    "Storm Watch state requires cover data.",
  );
  const seedlingBeds = normalizeFixedList(
    source.seedlingBeds,
    SEEDLING_BED_COUNT,
    "Storm Watch state requires exactly three seedling beds.",
    (bed, index) => ({
      id: `seedling-bed-${index + 1}`,
      crop: "seedlings",
      covered: assertBoolean(
        bed.covered,
        "Each seedling bed requires a covered boolean.",
      ),
      battered: assertBoolean(
        bed.battered,
        "Each seedling bed requires a battered boolean.",
      ),
    }),
  );

  return deepFreeze({
    missionId: "storm-watch",
    weather: {
      cloudsGathering: assertBoolean(
        weather.cloudsGathering,
        "Storm Watch weather requires a cloudsGathering boolean.",
      ),
      rainFalling: assertBoolean(
        weather.rainFalling,
        "Storm Watch weather requires a rainFalling boolean.",
      ),
      stormArrived: assertBoolean(
        weather.stormArrived,
        "Storm Watch weather requires a stormArrived boolean.",
      ),
    },
    covers: {
      location: "shed",
      available: assertBoolean(
        covers.available,
        "Storm Watch covers require an available boolean.",
      ),
      deployed: assertBoolean(
        covers.deployed,
        "Storm Watch covers require a deployed boolean.",
      ),
    },
    seedlingBeds,
  });
}

function snapshotStormWatchState(state) {
  const safeState = normalizeStormWatchState(state);
  const seedlingBedsCovered = safeState.seedlingBeds.filter(
    (bed) => bed.covered,
  ).length;
  const seedlingBedsBattered = safeState.seedlingBeds.filter(
    (bed) => bed.battered,
  ).length;
  return deepFreeze({
    missionId: safeState.missionId,
    cloudsGathering: safeState.weather.cloudsGathering,
    rainFalling: safeState.weather.rainFalling,
    stormArrived: safeState.weather.stormArrived,
    coversAvailable: safeState.covers.available,
    coversDeployed: safeState.covers.deployed,
    seedlingBedsCovered,
    seedlingBedsBattered,
    seedlingBedsSafe: SEEDLING_BED_COUNT - seedlingBedsBattered,
    seedlingBedsTotal: SEEDLING_BED_COUNT,
  });
}

function stormWatchSnapshotKey(state) {
  const snapshot = snapshotStormWatchState(state);
  return [
    snapshot.cloudsGathering ? 1 : 0,
    snapshot.rainFalling ? 1 : 0,
    snapshot.stormArrived ? 1 : 0,
    snapshot.coversDeployed ? 1 : 0,
    snapshot.seedlingBedsCovered,
    snapshot.seedlingBedsBattered,
  ].join(":");
}

function observeSky(state) {
  const snapshot = snapshotStormWatchState(state);
  let summary = "The sky is calm; no rain is falling.";
  if (snapshot.cloudsGathering && !snapshot.rainFalling) {
    summary = "Dark clouds are gathering, but rain has not started.";
  } else if (snapshot.rainFalling) {
    summary = "Rain is falling over the seedling beds.";
  }

  return deepFreeze({
    command: "observe the sky",
    scope: "sky",
    summary,
    facts: {
      cloudsGathering: snapshot.cloudsGathering,
      rainFalling: snapshot.rainFalling,
    },
  });
}

function evaluateStormWatchCondition(conditionId, observation) {
  if (conditionId === "rain-falls") {
    return factCondition(observation, "rainFalling", {
      met: "The sky observation shows that rain is falling.",
      notMet: "The sky observation shows that rain has not started.",
      unsupported: "The observation did not include evidence about rain.",
    });
  }
  if (conditionId === "clouds-gather") {
    return factCondition(observation, "cloudsGathering", {
      met: "The sky observation shows dark clouds gathering before the rain.",
      notMet: "The sky observation shows no gathering storm clouds.",
      unsupported: "The observation did not include evidence about the clouds.",
    });
  }
  return unknownCommand("Storm Watch condition", conditionId);
}

function transitionStormWatch(state, actionId) {
  const safeState = normalizeStormWatchState(state);
  if (actionId === null) return safeState;
  if (actionId !== "cover beds") {
    return unknownCommand("Storm Watch action", actionId);
  }

  return deepFreeze({
    ...safeState,
    covers: {
      ...safeState.covers,
      deployed: true,
    },
    seedlingBeds: safeState.seedlingBeds.map((bed) => ({
      ...bed,
      covered: true,
    })),
  });
}

function stormArrives(state) {
  const safeState = normalizeStormWatchState(state);
  return deepFreeze({
    ...safeState,
    weather: {
      cloudsGathering: false,
      rainFalling: true,
      stormArrived: true,
    },
    seedlingBeds: safeState.seedlingBeds.map((bed) => ({
      ...bed,
      battered: bed.battered || !bed.covered,
    })),
  });
}

function applyStormWatchEvent(state, eventId) {
  if (eventId === "storm-arrives") return stormArrives(state);
  return unknownCommand("Storm Watch scripted event", eventId);
}

function verifyStormWatch(state) {
  const snapshot = snapshotStormWatchState(state);
  return (
    snapshot.stormArrived &&
    snapshot.seedlingBedsBattered === 0 &&
    snapshot.seedlingBedsSafe === snapshot.seedlingBedsTotal
  );
}

function stormWatchVerificationEvidence(state) {
  const snapshot = snapshotStormWatchState(state);
  const passed = verifyStormWatch(state);
  return deepFreeze({
    passed,
    outcome: passed ? "PASS" : "FAIL",
    message: passed
      ? `All ${snapshot.seedlingBedsTotal} seedling beds stayed safe through the storm.`
      : `${snapshot.seedlingBedsBattered} of ${snapshot.seedlingBedsTotal} seedling beds were battered before they were covered.`,
    snapshot,
  });
}

function createHungryHensInitialState() {
  return deepFreeze({
    missionId: "hungry-hens",
    feeder: {
      full: true,
      chuteJammed: true,
    },
    tray: {
      grainDelivered: 0,
      grainRemaining: 0,
    },
    hens: makeBeds("hen", HEN_COUNT, (id) => ({
      id,
      hungry: true,
      eaten: false,
    })),
  });
}

function normalizeHungryHensState(state) {
  const source = assertRecord(state, "Hungry Hens state must be an object.");
  assertMissionIdentity(source, "hungry-hens", "Hungry Hens");
  const feeder = assertRecord(
    source.feeder,
    "Hungry Hens state requires feeder data.",
  );
  const tray = assertRecord(source.tray, "Hungry Hens state requires tray data.");
  const hens = normalizeFixedList(
    source.hens,
    HEN_COUNT,
    "Hungry Hens state requires exactly three hens.",
    (hen, index) => ({
      id: `hen-${index + 1}`,
      hungry: assertBoolean(hen.hungry, "Each hen requires a hungry boolean."),
      eaten: assertBoolean(hen.eaten, "Each hen requires an eaten boolean."),
    }),
  );

  return deepFreeze({
    missionId: "hungry-hens",
    feeder: {
      full: assertBoolean(feeder.full, "The feeder requires a full boolean."),
      chuteJammed: assertBoolean(
        feeder.chuteJammed,
        "The feeder requires a chuteJammed boolean.",
      ),
    },
    tray: {
      grainDelivered: assertNonNegativeInteger(
        tray.grainDelivered,
        "The tray requires a non-negative grainDelivered count.",
      ),
      grainRemaining: assertNonNegativeInteger(
        tray.grainRemaining,
        "The tray requires a non-negative grainRemaining count.",
      ),
    },
    hens,
  });
}

function snapshotHungryHensState(state) {
  const safeState = normalizeHungryHensState(state);
  const hensHungry = safeState.hens.filter((hen) => hen.hungry).length;
  const hensFed = safeState.hens.filter((hen) => hen.eaten).length;
  return deepFreeze({
    missionId: safeState.missionId,
    feederFull: safeState.feeder.full,
    chuteJammed: safeState.feeder.chuteJammed,
    grainDelivered: safeState.tray.grainDelivered,
    grainRemaining: safeState.tray.grainRemaining,
    hensHungry,
    hensFed,
    hensTotal: HEN_COUNT,
  });
}

function hungryHensSnapshotKey(state) {
  const snapshot = snapshotHungryHensState(state);
  return [
    snapshot.feederFull ? 1 : 0,
    snapshot.chuteJammed ? 1 : 0,
    snapshot.grainDelivered,
    snapshot.hensHungry,
    snapshot.hensFed,
  ].join(":");
}

function observeFeeder(state) {
  const snapshot = snapshotHungryHensState(state);
  return deepFreeze({
    command: "observe the feeder",
    scope: "feeder",
    summary: snapshot.chuteJammed
      ? "The feeder is full, but its chute is jammed and the tray is empty."
      : "The feeder chute is clear and grain can reach the tray.",
    facts: {
      feederFull: snapshot.feederFull,
      chuteJammed: snapshot.chuteJammed,
      grainDelivered: snapshot.grainDelivered,
    },
  });
}

function observeHens(state) {
  const snapshot = snapshotHungryHensState(state);
  return deepFreeze({
    command: "observe the hens",
    scope: "hens",
    summary:
      snapshot.hensHungry > 0
        ? `${snapshot.hensHungry} hungry hens are waiting at the jammed chute.`
        : `All ${snapshot.hensTotal} hens have eaten.`,
    facts: {
      hensHungry: snapshot.hensHungry > 0,
      hungryHenCount: snapshot.hensHungry,
      hensAtJammedChute:
        snapshot.hensHungry > 0 && snapshot.chuteJammed,
      allHensHaveEaten: snapshot.hensFed === snapshot.hensTotal,
    },
  });
}

function collectHungryHensObservation(state, command) {
  if (command === "observe the feeder") return observeFeeder(state);
  if (command === "observe the hens") return observeHens(state);
  return unknownCommand("Hungry Hens observation", command);
}

function evaluateHungryHensCondition(conditionId, observation) {
  if (conditionId !== "hens-hungry") {
    return unknownCommand("Hungry Hens condition", conditionId);
  }
  return factCondition(observation, "hensHungry", {
    met: "The hen observation found hungry hens waiting at the jammed chute.",
    notMet: "The hen observation found that every hen has already eaten.",
    unsupported:
      "The feeder observation has no evidence about whether the hens are hungry; observe the hens first.",
  });
}

function transitionHungryHens(state, actionId) {
  const safeState = normalizeHungryHensState(state);
  if (actionId === null) return safeState;
  if (actionId !== "unjam chute") {
    return unknownCommand("Hungry Hens action", actionId);
  }

  const hungryHenCount = safeState.hens.filter((hen) => hen.hungry).length;
  return deepFreeze({
    missionId: safeState.missionId,
    feeder: {
      full: safeState.feeder.full,
      chuteJammed: false,
    },
    tray: {
      grainDelivered: safeState.tray.grainDelivered + hungryHenCount,
      grainRemaining: 0,
    },
    hens: safeState.hens.map((hen) => ({
      ...hen,
      hungry: false,
      eaten: true,
    })),
  });
}

function verifyHungryHens(state) {
  const snapshot = snapshotHungryHensState(state);
  return snapshot.hensFed === snapshot.hensTotal && snapshot.hensHungry === 0;
}

function hungryHensVerificationEvidence(state) {
  const snapshot = snapshotHungryHensState(state);
  const passed = verifyHungryHens(state);
  return deepFreeze({
    passed,
    outcome: passed ? "PASS" : "FAIL",
    message: `${snapshot.hensFed} of ${snapshot.hensTotal} hens have eaten.`,
    snapshot,
  });
}

const rawDefinitions = [
  {
    id: "repair-east-channel",
    name: "Repair the East Channel",
    order: 1,
    seed: 1101,
    filename: "repair_irrigation.agent",
    objective: "Clear the East Channel so every tomato bed is watered.",
    requires: null,
    unlocks: ["storm-watch"],
    language: {
      phases: [...PHASES],
      commands: {
        observe: ["observe the east channel"],
        decide: [
          "decide water the tomatoes when the beds are dry",
          "decide clear the blockage when the water is blocked",
        ],
        act: [SHARED_ACT_COMMAND],
        verify: ["verify every tomato bed is watered"],
      },
      labels: {
        "observe the east channel": "Observe the East Channel irrigation",
        "decide water the tomatoes when the beds are dry":
          "Choose direct watering when the beds are dry",
        "decide clear the blockage when the water is blocked":
          "Choose blockage removal when the water is blocked",
        [SHARED_ACT_COMMAND]: "Carry out the response chosen on line 2",
        "verify every tomato bed is watered":
          "Verify that every tomato bed is watered",
      },
      bindings: {
        "decide water the tomatoes when the beds are dry": {
          conditionId: "beds-dry",
          conditionText: "the beds are dry",
          selectedAction: "water tomatoes",
        },
        "decide clear the blockage when the water is blocked": {
          conditionId: "water-blocked",
          conditionText: "the water is blocked",
          selectedAction: "clear blockage",
        },
      },
      guidedProgram: [
        "observe the east channel",
        "decide water the tomatoes when the beds are dry",
        SHARED_ACT_COMMAND,
        "verify every tomato bed is watered",
      ],
      repair: {
        line: 2,
        phase: "decide",
        from: "decide water the tomatoes when the beds are dry",
        to: "decide clear the blockage when the water is blocked",
      },
    },
    state: {
      createInitial: createEastChannelInitialState,
      normalize: normalizeEastChannelState,
      snapshot: snapshotEastChannelState,
      snapshotKey: eastChannelSnapshotKey,
    },
    observation: {
      collectors: {
        "observe the east channel": observeEastChannel,
      },
      collect(state, command) {
        if (command === "observe the east channel") return observeEastChannel(state);
        return unknownCommand("East Channel observation", command);
      },
    },
    conditions: {
      catalog: {
        "beds-dry": { fact: "bedsDry" },
        "water-blocked": { fact: "waterBlocked" },
      },
      evaluate: evaluateEastChannelCondition,
    },
    actions: {
      allowed: ["water tomatoes", "clear blockage"],
      transition: transitionEastChannel,
    },
    verify: {
      command: "verify every tomato bed is watered",
      predicate: verifyEastChannel,
      evidence: eastChannelVerificationEvidence,
    },
    timeline: {
      tickRateHz: FIXED_TICK_RATE,
      durationTicks: 240,
      events: [],
      applyEvent(_state, eventId) {
        return unknownCommand("East Channel scripted event", eventId);
      },
    },
    teaching: {
      observationText:
        "Visible debris stops water in the East Channel while three tomato beds remain dry.",
      coach: {
        guidedFailure: {
          line: 2,
          title: "Treat the cause, not only the symptom.",
          explanation:
            "The plan chose dry beds, but direct watering cannot pass the blockage stopping the channel.",
        },
        repairSuccess: {
          line: 2,
          explanation:
            "Changing only Decide selected blockage removal; Act carried it out and Verify proved the water reached every bed.",
        },
      },
      debrief: {
        title: "You repaired an agent decision.",
        summary:
          "Observe found the evidence, Decide chose the cause, Act cleared it, and Verify proved the farm changed.",
        phaseExplanations: {
          observe: "Looked at the East Channel and reported blocked water and dry beds.",
          decide: "Chose to clear the blockage when the water was blocked.",
          act: "Carried out the response selected by Decide.",
          verify: "Checked that every tomato bed was watered.",
        },
      },
    },
    ui: {
      missionLabel: "Mission 01",
      lessonTitle: "Repair the East Channel",
      editorPrompt: "Help Bert restore water to the tomatoes.",
      repairPrompt: "Repair line 2, then rerun the complete plan.",
      clueSign: "IRRIGATION",
    },
    world: {
      scene: "east-channel-farm",
      focus: "east-channel",
      sign: { text: "IRRIGATION", target: "east-channel" },
      actors: ["bert"],
      props: ["tomato-beds", "east-channel", "visible-debris"],
    },
  },
  {
    id: "storm-watch",
    name: "Storm Watch",
    order: 2,
    seed: 2202,
    filename: "storm_watch.agent",
    objective: "Cover the seedling beds before the storm reaches the farm.",
    requires: "repair-east-channel",
    unlocks: ["hungry-hens"],
    language: {
      phases: [...PHASES],
      commands: {
        observe: ["observe the sky"],
        decide: [
          "decide cover the beds when rain falls",
          "decide cover the beds when clouds gather",
        ],
        act: [SHARED_ACT_COMMAND],
        verify: ["verify the seedlings are safe"],
      },
      labels: {
        "observe the sky": "Observe the sky above the seedling beds",
        "decide cover the beds when rain falls":
          "Choose bed covers after rain begins",
        "decide cover the beds when clouds gather":
          "Choose bed covers while storm clouds gather",
        [SHARED_ACT_COMMAND]: "Carry out the response chosen on line 2",
        "verify the seedlings are safe":
          "Verify that the seedlings stayed safe",
      },
      bindings: {
        "decide cover the beds when rain falls": {
          conditionId: "rain-falls",
          conditionText: "rain falls",
          selectedAction: "cover beds",
        },
        "decide cover the beds when clouds gather": {
          conditionId: "clouds-gather",
          conditionText: "clouds gather",
          selectedAction: "cover beds",
        },
      },
      guidedProgram: [
        "observe the sky",
        "decide cover the beds when rain falls",
        SHARED_ACT_COMMAND,
        "verify the seedlings are safe",
      ],
      repair: {
        line: 2,
        phase: "decide",
        from: "decide cover the beds when rain falls",
        to: "decide cover the beds when clouds gather",
      },
    },
    state: {
      createInitial: createStormWatchInitialState,
      normalize: normalizeStormWatchState,
      snapshot: snapshotStormWatchState,
      snapshotKey: stormWatchSnapshotKey,
    },
    observation: {
      collectors: {
        "observe the sky": observeSky,
      },
      collect(state, command) {
        if (command === "observe the sky") return observeSky(state);
        return unknownCommand("Storm Watch observation", command);
      },
    },
    conditions: {
      catalog: {
        "rain-falls": { fact: "rainFalling" },
        "clouds-gather": { fact: "cloudsGathering" },
      },
      evaluate: evaluateStormWatchCondition,
    },
    actions: {
      allowed: ["cover beds"],
      transition: transitionStormWatch,
    },
    verify: {
      command: "verify the seedlings are safe",
      predicate: verifyStormWatch,
      evidence: stormWatchVerificationEvidence,
    },
    timeline: {
      tickRateHz: FIXED_TICK_RATE,
      durationTicks: 240,
      events: [
        {
          id: "storm-arrives",
          tick: 150,
          transitionId: "storm-arrives",
          label: "The storm reaches the seedling beds",
        },
      ],
      transitions: {
        "storm-arrives": stormArrives,
      },
      applyEvent: applyStormWatchEvent,
    },
    teaching: {
      observationText:
        "Dark clouds are gathering over uncovered seedlings; covers wait beside the shed, but rain has not started.",
      coach: {
        guidedFailure: {
          line: 2,
          title: "Choose a signal that arrives before the harm.",
          explanation:
            "The rain trigger fired after the harm: the uncovered seedlings were battered before Bert could protect them.",
        },
        repairSuccess: {
          line: 2,
          explanation:
            "Changing only Decide used gathering clouds as an early signal, so Bert covered the beds before the storm.",
        },
      },
      debrief: {
        title: "You taught an agent to act early.",
        summary:
          "Observe saw the warning, Decide used a leading signal, Act covered the beds, and Verify proved the seedlings stayed safe.",
        phaseExplanations: {
          observe: "Looked at the sky and reported gathering clouds before rain.",
          decide: "Chose to cover the beds when clouds gathered.",
          act: "Carried the shed covers to every seedling bed.",
          verify: "Checked the seedlings after the scripted storm arrived.",
        },
      },
    },
    ui: {
      missionLabel: "Mission 02",
      lessonTitle: "Storm Watch",
      editorPrompt: "Help Bert protect the seedlings before the storm.",
      repairPrompt: "Repair line 2 so the response starts before the rain.",
      clueSign: "WEATHER",
    },
    world: {
      scene: "storm-watch-farm",
      focus: "seedling-beds",
      sign: { text: "WEATHER", target: "weather-vane" },
      actors: ["bert"],
      props: ["uncovered-seedlings", "shed", "bed-covers", "weather-vane"],
    },
  },
  {
    id: "hungry-hens",
    name: "The Hungry Hens",
    order: 3,
    seed: 3303,
    filename: "hungry_hens.agent",
    objective: "Unjam the feeder chute so every hen can eat.",
    requires: "storm-watch",
    unlocks: [],
    language: {
      phases: [...PHASES],
      commands: {
        observe: ["observe the feeder", "observe the hens"],
        decide: ["decide unjam the chute when the hens are hungry"],
        act: [SHARED_ACT_COMMAND],
        verify: ["verify every hen has eaten"],
      },
      labels: {
        "observe the feeder": "Observe the feeder and its chute",
        "observe the hens": "Observe the hens beside the empty tray",
        "decide unjam the chute when the hens are hungry":
          "Choose chute repair when the hens are hungry",
        [SHARED_ACT_COMMAND]: "Carry out the response chosen on line 2",
        "verify every hen has eaten": "Verify that every hen has eaten",
      },
      bindings: {
        "decide unjam the chute when the hens are hungry": {
          conditionId: "hens-hungry",
          conditionText: "the hens are hungry",
          selectedAction: "unjam chute",
        },
      },
      guidedProgram: [
        "observe the feeder",
        "decide unjam the chute when the hens are hungry",
        SHARED_ACT_COMMAND,
        "verify every hen has eaten",
      ],
      repair: {
        line: 1,
        phase: "observe",
        from: "observe the feeder",
        to: "observe the hens",
      },
    },
    state: {
      createInitial: createHungryHensInitialState,
      normalize: normalizeHungryHensState,
      snapshot: snapshotHungryHensState,
      snapshotKey: hungryHensSnapshotKey,
    },
    observation: {
      collectors: {
        "observe the feeder": observeFeeder,
        "observe the hens": observeHens,
      },
      collect: collectHungryHensObservation,
    },
    conditions: {
      catalog: {
        "hens-hungry": { fact: "hensHungry" },
      },
      evaluate: evaluateHungryHensCondition,
    },
    actions: {
      allowed: ["unjam chute"],
      transition: transitionHungryHens,
    },
    verify: {
      command: "verify every hen has eaten",
      predicate: verifyHungryHens,
      evidence: hungryHensVerificationEvidence,
    },
    timeline: {
      tickRateHz: FIXED_TICK_RATE,
      durationTicks: 240,
      events: [],
      applyEvent(_state, eventId) {
        return unknownCommand("Hungry Hens scripted event", eventId);
      },
    },
    teaching: {
      observationText:
        "The tray is empty beneath a full feeder with a jammed chute; three hungry hens wait nearby.",
      coach: {
        guidedFailure: {
          line: 1,
          title: "Observe the evidence your decision needs.",
          explanation:
            "You looked in the wrong place: the feeder showed a jam, but it gave no evidence that the hens were hungry.",
        },
        repairSuccess: {
          line: 1,
          explanation:
            "Changing only Observe gave Decide the hungry-hen evidence it needed; Bert unjammed the chute and every hen ate.",
        },
      },
      debrief: {
        title: "You repaired an agent observation.",
        summary:
          "Observe gathered relevant evidence, Decide used only that evidence, Act unjammed the chute, and Verify proved every hen ate.",
        phaseExplanations: {
          observe: "Looked at the hens and reported that they were hungry at the jammed chute.",
          decide: "Used the observed hungry-hen fact to choose chute repair.",
          act: "Unjammed the chute so grain dropped and the hens ate.",
          verify: "Checked that every hen had eaten.",
        },
      },
    },
    ui: {
      missionLabel: "Mission 03",
      lessonTitle: "The Hungry Hens",
      editorPrompt: "Help Bert get grain to every hungry hen.",
      repairPrompt: "Repair line 1 by observing the evidence Decide needs.",
      clueSign: "FEEDER",
    },
    world: {
      scene: "hungry-hens-farm",
      focus: "hen-feeder",
      sign: { text: "FEEDER", target: "hen-feeder" },
      actors: ["bert", "hen-1", "hen-2", "hen-3"],
      props: ["full-feeder", "jammed-chute", "empty-tray"],
    },
  },
];

function validateDefinition(definition, allIds) {
  if (!definition.id || !definition.name || !definition.filename) {
    throw new TypeError("Every mission requires an id, name, and filename.");
  }
  if (!Number.isInteger(definition.order) || definition.order < 1) {
    throw new TypeError(`${definition.id} requires a positive integer order.`);
  }
  if (
    definition.language.phases.length !== PHASES.length ||
    definition.language.phases.some((phase, index) => phase !== PHASES[index])
  ) {
    throw new TypeError(`${definition.id} must use the exact four teaching phases.`);
  }

  for (const phase of PHASES) {
    const commands = definition.language.commands[phase];
    if (!Array.isArray(commands) || commands.length === 0) {
      throw new TypeError(`${definition.id} requires commands for ${phase}.`);
    }
    for (const command of commands) {
      if (!/^[a-z]+(?: [a-z]+)*$/u.test(command)) {
        throw new TypeError(
          `${definition.id} has a command that is not lowercase single-spaced text: ${command}`,
        );
      }
    }
  }

  if (
    definition.language.commands.act.length !== 1 ||
    definition.language.commands.act[0] !== SHARED_ACT_COMMAND
  ) {
    throw new TypeError(`${definition.id} must use the shared Act command.`);
  }

  const guided = definition.language.guidedProgram;
  if (
    !Array.isArray(guided) ||
    guided.length !== PHASES.length ||
    guided.some(
      (command, index) =>
        !definition.language.commands[PHASES[index]].includes(command),
    )
  ) {
    throw new TypeError(`${definition.id} has an invalid guided program.`);
  }

  const repair = definition.language.repair;
  const repairIndex = repair.line - 1;
  if (
    repairIndex < 0 ||
    repairIndex >= PHASES.length ||
    repair.phase !== PHASES[repairIndex] ||
    guided[repairIndex] !== repair.from ||
    !definition.language.commands[repair.phase].includes(repair.to)
  ) {
    throw new TypeError(`${definition.id} has an invalid single-line repair.`);
  }
  const repaired = guided.map((command, index) =>
    index === repairIndex ? repair.to : command,
  );
  const differences = repaired.filter((command, index) => command !== guided[index]);
  if (differences.length !== 1 || repair.from === repair.to) {
    throw new TypeError(`${definition.id} repair must change exactly one line.`);
  }

  const observeCommands = definition.language.commands.observe;
  for (const command of observeCommands) {
    if (typeof definition.observation.collectors[command] !== "function") {
      throw new TypeError(`${definition.id} observation command has no collector.`);
    }
  }
  for (const command of definition.language.commands.decide) {
    const binding = definition.language.bindings[command];
    if (
      !binding ||
      !definition.conditions.catalog[binding.conditionId] ||
      !definition.actions.allowed.includes(binding.selectedAction)
    ) {
      throw new TypeError(`${definition.id} decision binding does not resolve.`);
    }
  }
  if (!definition.language.commands.verify.includes(definition.verify.command)) {
    throw new TypeError(`${definition.id} Verify command does not resolve.`);
  }

  if (definition.requires !== null && !allIds.has(definition.requires)) {
    throw new TypeError(`${definition.id} requires an unknown mission.`);
  }
  for (const unlockId of definition.unlocks) {
    if (!allIds.has(unlockId)) {
      throw new TypeError(`${definition.id} unlocks an unknown mission.`);
    }
  }

  if (
    !Number.isInteger(definition.timeline.tickRateHz) ||
    definition.timeline.tickRateHz <= 0 ||
    !Number.isInteger(definition.timeline.durationTicks) ||
    definition.timeline.durationTicks <= 0
  ) {
    throw new TypeError(`${definition.id} timeline must use integer ticks.`);
  }
  for (const event of definition.timeline.events) {
    if (
      !Number.isInteger(event.tick) ||
      event.tick < 0 ||
      event.tick > definition.timeline.durationTicks ||
      !definition.timeline.transitions ||
      typeof definition.timeline.transitions[event.transitionId] !== "function"
    ) {
      throw new TypeError(`${definition.id} has an unresolved scripted event.`);
    }
  }
}

function assertDeeplyFrozen(value, path = "definition", seen = new WeakSet()) {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    seen.has(value)
  ) {
    return;
  }
  seen.add(value);
  if (!Object.isFrozen(value)) {
    throw new TypeError(`${path} was not deeply frozen.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    assertDeeplyFrozen(value[key], `${path}.${String(key)}`, seen);
  }
}

const ids = new Set(rawDefinitions.map((definition) => definition.id));
const orders = new Set(rawDefinitions.map((definition) => definition.order));
if (ids.size !== rawDefinitions.length || orders.size !== rawDefinitions.length) {
  throw new TypeError("Mission ids and orders must be unique.");
}
if (
  rawDefinitions.some((definition, index) => definition.order !== index + 1)
) {
  throw new TypeError("Mission definitions must be stored in order.");
}
for (const definition of rawDefinitions) validateDefinition(definition, ids);

const MISSION_DEFINITIONS = deepFreeze(rawDefinitions);
for (const definition of MISSION_DEFINITIONS) assertDeeplyFrozen(definition);

export const MISSION_IDS = deepFreeze(
  MISSION_DEFINITIONS.map((definition) => definition.id),
);

export function listMissionDefinitions() {
  return MISSION_DEFINITIONS;
}

export function getMissionDefinition(id) {
  const definition = MISSION_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!definition) throw new RangeError(`Unknown mission id: ${String(id)}`);
  return definition;
}

deepFreeze(listMissionDefinitions);
deepFreeze(getMissionDefinition);
