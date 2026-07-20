import {
  ALLOWED_COMMANDS,
  DECISION_BINDINGS,
  PHASES,
  isSafePlan,
} from "./compiler.js";

export const MISSION_ID = "repair-east-channel";
export const MISSION_NAME = "Repair the East Channel";
export const TOMATO_BED_COUNT = 3;

const CHANNEL_NAME = "East Channel";
const MINTED_DECISIONS = new WeakSet();

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }

  return value;
}

function makeTomatoBeds(watered) {
  return Array.from({ length: TOMATO_BED_COUNT }, (_, index) => ({
    id: `tomato-bed-${index + 1}`,
    crop: "tomatoes",
    watered,
  }));
}

export function createInitialMissionState() {
  return deepFreeze({
    missionId: MISSION_ID,
    mission: MISSION_NAME,
    irrigation: {
      channel: CHANNEL_NAME,
      blocked: true,
      waterReleased: false,
    },
    tomatoBeds: makeTomatoBeds(false),
  });
}

export const createInitialFarmState = createInitialMissionState;

export function resetMission() {
  return createInitialMissionState();
}

function normalizeMissionState(state) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Mission state must be an object.");
  }

  const irrigation = state.irrigation;
  const tomatoBeds = state.tomatoBeds;
  if (
    !irrigation ||
    typeof irrigation !== "object" ||
    typeof irrigation.blocked !== "boolean" ||
    typeof irrigation.waterReleased !== "boolean" ||
    !Array.isArray(tomatoBeds) ||
    tomatoBeds.length !== TOMATO_BED_COUNT ||
    tomatoBeds.some((bed) => !bed || typeof bed.watered !== "boolean")
  ) {
    throw new TypeError("Mission state does not match the East Channel schema.");
  }

  return deepFreeze({
    missionId: MISSION_ID,
    mission: MISSION_NAME,
    irrigation: {
      channel: CHANNEL_NAME,
      blocked: irrigation.blocked,
      waterReleased: irrigation.waterReleased,
    },
    tomatoBeds: tomatoBeds.map((bed, index) => ({
      id: `tomato-bed-${index + 1}`,
      crop: "tomatoes",
      watered: bed.watered,
    })),
  });
}

export function snapshotMissionState(state) {
  const safeState = normalizeMissionState(state);
  const watered = safeState.tomatoBeds.filter((bed) => bed.watered).length;

  return deepFreeze({
    irrigationBlocked: safeState.irrigation.blocked,
    waterReleased: safeState.irrigation.waterReleased,
    tomatoBedsWatered: watered,
    tomatoBedsDry: TOMATO_BED_COUNT - watered,
    tomatoBedsTotal: TOMATO_BED_COUNT,
  });
}

function describeObservation(snapshot) {
  if (snapshot.irrigationBlocked) {
    return `${CHANNEL_NAME} water stops at visible debris; ${snapshot.tomatoBedsDry} tomato beds are dry.`;
  }

  if (snapshot.tomatoBedsDry > 0) {
    return `${CHANNEL_NAME} irrigation is clear; ${snapshot.tomatoBedsDry} tomato beds are still dry.`;
  }

  return `${CHANNEL_NAME} irrigation is clear; all ${TOMATO_BED_COUNT} tomato beds are watered.`;
}

function conditionMatches(snapshot, condition) {
  if (condition === "tomatoes dry") return snapshot.tomatoBedsDry > 0;
  if (condition === "irrigation blocked") return snapshot.irrigationBlocked;
  throw new TypeError("Compiled decision condition is not allowlisted.");
}

function resolveDecision(step, binding, snapshot) {
  const canonical = DECISION_BINDINGS[step.command];
  if (
    !canonical ||
    !binding ||
    binding.decisionLine !== step.line ||
    binding.decisionCommand !== step.command ||
    binding.condition !== canonical.condition ||
    binding.selectedAction !== canonical.selectedAction ||
    binding.actLine !== 3 ||
    binding.actCommand !== "act on the decision"
  ) {
    throw new TypeError("Mission decision does not match its compiled binding.");
  }

  const conditionMet = conditionMatches(snapshot, binding.condition);
  const decision = deepFreeze({
    command: step.command,
    condition: binding.condition,
    conditionMet,
    selectedAction: conditionMet ? binding.selectedAction : null,
  });
  MINTED_DECISIONS.add(decision);
  return decision;
}

function assertDecisionResult(decision, binding) {
  const canonical = DECISION_BINDINGS[decision?.command];
  if (
    !MINTED_DECISIONS.has(decision) ||
    !canonical ||
    !binding ||
    binding.decisionCommand !== decision.command ||
    binding.condition !== canonical.condition ||
    binding.selectedAction !== canonical.selectedAction ||
    binding.actCommand !== "act on the decision" ||
    decision.condition !== canonical.condition ||
    typeof decision.conditionMet !== "boolean" ||
    decision.selectedAction !==
      (decision.conditionMet ? canonical.selectedAction : null)
  ) {
    throw new TypeError("Act requires the allowlisted result selected by Decide.");
  }
}

function assertCompiledStep(plan, step) {
  if (!isSafePlan(plan) || plan.steps[step.line - 1] !== step) {
    throw new TypeError(
      "Mission steps require their compiler-minted plan and exact bound position.",
    );
  }
}

function verifySnapshot(snapshot) {
  return (
    !snapshot.irrigationBlocked &&
    snapshot.waterReleased &&
    snapshot.tomatoBedsWatered === TOMATO_BED_COUNT
  );
}

function assertAllowedStep(step) {
  if (!step || typeof step !== "object") {
    throw new TypeError("Mission steps must be objects from a compiled plan.");
  }

  const phaseIndex = PHASES.indexOf(step.phase);
  if (
    phaseIndex < 0 ||
    step.line !== phaseIndex + 1 ||
    !ALLOWED_COMMANDS[step.phase].includes(step.command)
  ) {
    throw new TypeError("Mission step is not allowlisted for this mission.");
  }
}

function nextStateForAction(state, selectedAction) {
  if (selectedAction === null) return state;

  if (selectedAction === "water tomatoes") {
    // Water cannot pass a blockage. Keeping this as a no-op is the teaching
    // moment: valid syntax does not guarantee the intended world outcome.
    return state;
  }

  if (selectedAction === "clear blockage") {
    return deepFreeze({
      missionId: MISSION_ID,
      mission: MISSION_NAME,
      irrigation: {
        channel: CHANNEL_NAME,
        blocked: false,
        waterReleased: true,
      },
      tomatoBeds: makeTomatoBeds(true),
    });
  }

  throw new TypeError("Mission action is not allowlisted.");
}

function evidenceForStep(step, before, after, decision) {
  if (step.phase === "observe") {
    return {
      outcome: before.irrigationBlocked ? "BLOCKED" : "CLEAR",
      message: describeObservation(before),
    };
  }

  if (step.phase === "decide") {
    if (!decision.conditionMet) {
      return {
        outcome: "CONDITION_NOT_MET",
        message: `Decision condition not met: ${decision.condition}. No response was selected.`,
        condition: decision.condition,
        conditionMet: false,
        selectedAction: null,
      };
    }

    const choseCause = decision.selectedAction === "clear blockage";
    return {
      outcome: choseCause ? "CAUSE_SELECTED" : "SYMPTOM_SELECTED",
      message: choseCause
        ? "Selected response: clear the blocked channel before watering."
        : "Selected response: water the dry tomato beds directly.",
      condition: decision.condition,
      conditionMet: true,
      selectedAction: decision.selectedAction,
    };
  }

  if (step.phase === "act" && decision.selectedAction === null) {
    return {
      outcome: "NO_ACTION_SELECTED",
      message: "Bert had no selected response to carry out.",
      executedAction: null,
    };
  }

  if (step.phase === "act" && decision.selectedAction === "water tomatoes") {
    return {
      outcome: before.irrigationBlocked ? "NO_CHANGE" : "ACTION_NOT_NEEDED",
      message: before.irrigationBlocked
        ? "Bert carried out direct watering, but blocked irrigation released no water."
        : "Bert checked the tomatoes after irrigation was already clear.",
      executedAction: decision.selectedAction,
    };
  }

  if (step.phase === "act" && decision.selectedAction === "clear blockage") {
    return {
      outcome: "WORLD_CHANGED",
      message: `Bert cleared the blockage; water reached all ${TOMATO_BED_COUNT} tomato beds.`,
      executedAction: decision.selectedAction,
    };
  }

  const verdict = verifySnapshot(after) ? "PASS" : "FAIL";
  return {
    outcome: verdict,
    message:
      verdict === "PASS"
        ? `Verification passed: ${after.tomatoBedsWatered} of ${TOMATO_BED_COUNT} tomato beds are watered.`
        : `Verification failed: ${after.tomatoBedsWatered} of ${TOMATO_BED_COUNT} tomato beds are watered.`,
  };
}

/**
 * Apply one allowlisted mission step without mutating the supplied state.
 */
export function applyMissionStep(
  state,
  step,
  { plan = null, decision = null } = {},
) {
  assertAllowedStep(step);
  assertCompiledStep(plan, step);
  const safeState = normalizeMissionState(state);
  const before = snapshotMissionState(safeState);
  const activeDecision =
    step.phase === "decide"
      ? resolveDecision(step, plan.binding, before)
      : decision;
  if (step.phase === "act") {
    assertDecisionResult(activeDecision, plan.binding);
  }
  const nextState =
    step.phase === "act"
      ? nextStateForAction(safeState, activeDecision.selectedAction)
      : safeState;
  const after = snapshotMissionState(nextState);
  const detail = evidenceForStep(step, before, after, activeDecision);

  return deepFreeze({
    state: nextState,
    decision: activeDecision,
    evidence: {
      line: step.line,
      phase: step.phase,
      command: step.command,
      label: step.label,
      ...detail,
      before,
      after,
    },
  });
}

function unwrapAndValidatePlan(planOrCompileResult) {
  const plan =
    planOrCompileResult?.ok === true
      ? planOrCompileResult.plan
      : planOrCompileResult;

  if (!isSafePlan(plan)) {
    throw new TypeError("runMission requires a complete allowlisted compiler plan.");
  }

  return plan;
}

function validateSessionId(sessionId) {
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new TypeError("runMission requires a non-empty sessionId.");
  }

  return sessionId;
}

/**
 * Execute all four phases and return deterministic transition evidence.
 * Session metadata is supplied by the caller and never influences the world.
 */
export function runMission(
  planOrCompileResult,
  { sessionId, state = createInitialMissionState() } = {},
) {
  const plan = unwrapAndValidatePlan(planOrCompileResult);
  const receiptSessionId = validateSessionId(sessionId);
  const initialState = normalizeMissionState(state);
  const before = snapshotMissionState(initialState);
  const trace = [];
  let currentState = initialState;
  let decision = null;

  for (const step of plan.steps) {
    const transition = applyMissionStep(currentState, step, {
      plan,
      decision,
    });
    currentState = transition.state;
    decision = transition.decision;
    trace.push(transition.evidence);
  }

  const after = snapshotMissionState(currentState);
  const verdict = verifySnapshot(after) ? "PASS" : "FAIL";
  const receipt = deepFreeze({
    sessionId: receiptSessionId,
    mission: MISSION_NAME,
    before,
    after,
    observation: trace[0].message,
    decision: plan.steps[1].command,
    selectedAction: trace[1].selectedAction,
    action: plan.steps[2].command,
    executedAction: trace[2].executedAction,
    verdict,
  });

  return deepFreeze({
    initialState,
    state: currentState,
    trace,
    receipt,
  });
}

export const executeMission = runMission;
