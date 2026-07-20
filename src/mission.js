import { PHASES, isSafePlan } from "./compiler.js";
import {
  DEFAULT_MISSION_ID,
  getMissionDefinition,
} from "./mission-registry.js";

export const MISSION_ID = DEFAULT_MISSION_ID;
export const MISSION_NAME = getMissionDefinition(MISSION_ID).name;
export const TOMATO_BED_COUNT = 3;

const OBSERVATION_PROVENANCE = new WeakMap();
const DECISION_PROVENANCE = new WeakMap();

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function missionForState(state) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Mission state must be an object.");
  }
  return getMissionDefinition(state.missionId);
}

export function createInitialMissionState(missionId = DEFAULT_MISSION_ID) {
  return getMissionDefinition(missionId).state.createInitial();
}

export const createInitialFarmState = createInitialMissionState;

export function resetMission(missionId = DEFAULT_MISSION_ID) {
  return createInitialMissionState(missionId);
}

export function normalizeMissionState(state, options = {}) {
  const missionId = options?.missionId ?? state?.missionId;
  const mission = getMissionDefinition(missionId);
  return mission.state.normalize(state);
}

export function snapshotMissionState(state, options = {}) {
  const missionId = options?.missionId ?? state?.missionId;
  const mission = getMissionDefinition(missionId);
  return mission.state.snapshot(state);
}

function assertCompiledStep(plan, step, mission) {
  if (
    !isSafePlan(plan, { missionId: mission.id }) ||
    plan.steps[step.line - 1] !== step
  ) {
    throw new TypeError(
      "Mission steps require their compiler-minted plan and exact bound position.",
    );
  }
}

function assertAllowedStep(step, mission) {
  if (!step || typeof step !== "object") {
    throw new TypeError("Mission steps must be objects from a compiled plan.");
  }
  const phaseIndex = PHASES.indexOf(step.phase);
  if (
    phaseIndex < 0 ||
    step.line !== phaseIndex + 1 ||
    !mission.language.commands[step.phase].includes(step.command)
  ) {
    throw new TypeError("Mission step is not allowlisted for this mission.");
  }
}

function mintObservation(mission, plan, step, state) {
  if (
    plan.bindings.observe.line !== step.line ||
    plan.bindings.observe.command !== step.command ||
    plan.bindings.observe.observationId !== step.command
  ) {
    throw new TypeError("Observe does not match its compiled mission binding.");
  }
  const observation = mission.observation.collect(state, step.command);
  if (!observation || typeof observation !== "object") {
    throw new TypeError("Mission observation did not produce scoped evidence.");
  }
  OBSERVATION_PROVENANCE.set(observation, { plan, step });
  return observation;
}

function assertObservation(observation, plan) {
  const provenance = OBSERVATION_PROVENANCE.get(observation);
  if (
    !provenance ||
    provenance.plan !== plan ||
    provenance.step !== plan.steps[0] ||
    observation.command !== plan.bindings.observe.command ||
    typeof observation.scope !== "string" ||
    !observation.facts ||
    typeof observation.facts !== "object"
  ) {
    throw new TypeError(
      "Decide requires scoped observation evidence minted for this exact plan.",
    );
  }
}

function mintDecision(mission, plan, step, observation) {
  assertObservation(observation, plan);
  const binding = plan.bindings.decide;
  const canonical = mission.language.bindings[step.command];
  if (
    !canonical ||
    binding.line !== step.line ||
    binding.command !== step.command ||
    binding.conditionId !== canonical.conditionId ||
    binding.conditionText !== canonical.conditionText ||
    binding.selectedAction !== canonical.selectedAction
  ) {
    throw new TypeError("Decide does not match its compiled mission binding.");
  }

  const evaluation = mission.conditions.evaluate(
    binding.conditionId,
    observation,
  );
  if (
    typeof evaluation?.supported !== "boolean" ||
    !(
      typeof evaluation.met === "boolean" ||
      (evaluation.supported === false && evaluation.met === null)
    ) ||
    typeof evaluation.reason !== "string"
  ) {
    throw new TypeError("Mission condition evaluation returned invalid evidence.");
  }

  const selectedAction =
    evaluation.supported && evaluation.met ? binding.selectedAction : null;
  const decision = deepFreeze({
    command: step.command,
    condition: binding.conditionText,
    conditionId: binding.conditionId,
    conditionSupported: evaluation.supported,
    conditionMet: evaluation.met,
    reason: evaluation.reason,
    selectedAction,
    observationScope: observation.scope,
  });
  DECISION_PROVENANCE.set(decision, { plan, observation });
  return decision;
}

function assertDecision(decision, plan, mission) {
  const provenance = DECISION_PROVENANCE.get(decision);
  const binding = plan.bindings.decide;
  const canonical = mission.language.bindings[binding.command];
  const shouldSelect =
    decision?.conditionSupported === true && decision?.conditionMet === true
      ? canonical?.selectedAction
      : null;
  if (
    !provenance ||
    provenance.plan !== plan ||
    !OBSERVATION_PROVENANCE.has(provenance.observation) ||
    !canonical ||
    decision.command !== binding.command ||
    decision.condition !== binding.conditionText ||
    decision.conditionId !== binding.conditionId ||
    typeof decision.conditionSupported !== "boolean" ||
    !(
      typeof decision.conditionMet === "boolean" ||
      (decision.conditionSupported === false && decision.conditionMet === null)
    ) ||
    decision.selectedAction !== shouldSelect ||
    plan.bindings.act.command !== mission.language.commands.act[0]
  ) {
    throw new TypeError(
      "Act requires the allowlisted result selected by Decide for this exact plan.",
    );
  }
}

function actionMessage(mission, selectedAction, before, after) {
  if (selectedAction === null) {
    return "Bert had no response selected from the observed evidence, so he made no change.";
  }
  if (mission.id === "repair-east-channel" && selectedAction === "water tomatoes") {
    return before.irrigationBlocked
      ? "Bert carried out direct watering, but blocked irrigation released no water."
      : "Bert watered the tomato beds after the channel was already clear.";
  }
  if (mission.id === "repair-east-channel") {
    return `Bert cleared the blockage; water reached all ${after.tomatoBedsTotal} tomato beds.`;
  }
  if (mission.id === "storm-watch") {
    return `Bert carried out the decision and covered ${after.seedlingBedsCovered} seedling beds before the storm.`;
  }
  return `Bert unjammed the chute; grain dropped and ${after.hensFed} hens ate.`;
}

function observationOutcome(mission, before, observation) {
  if (mission.id === "repair-east-channel") {
    return before.irrigationBlocked ? "BLOCKED" : "CLEAR";
  }
  if (mission.id === "storm-watch") {
    return before.rainFalling ? "RAINING" : "CLOUDS_GATHERING";
  }
  return observation.scope === "hens" ? "HENS_OBSERVED" : "FEEDER_OBSERVED";
}

function decisionOutcome(mission, decision) {
  if (!decision.conditionSupported) return "EVIDENCE_UNAVAILABLE";
  if (!decision.conditionMet) return "CONDITION_NOT_MET";
  if (mission.id === "repair-east-channel") {
    return decision.selectedAction === "clear blockage"
      ? "CAUSE_SELECTED"
      : "SYMPTOM_SELECTED";
  }
  return "RESPONSE_SELECTED";
}

function evidenceForStep(
  mission,
  step,
  before,
  after,
  { observation, decision },
) {
  if (step.phase === "observe") {
    return {
      outcome: observationOutcome(mission, before, observation),
      message: observation.summary,
      observationScope: observation.scope,
      facts: observation.facts,
    };
  }

  if (step.phase === "decide") {
    return {
      outcome: decisionOutcome(mission, decision),
      message: decision.conditionSupported
        ? decision.conditionMet
          ? `${decision.reason} Selected response: ${decision.selectedAction}.`
          : `${decision.reason} No response was selected.`
        : `${decision.reason} No response was selected.`,
      condition: decision.condition,
      conditionId: decision.conditionId,
      conditionSupported: decision.conditionSupported,
      conditionMet: decision.conditionMet,
      conditionReason: decision.reason,
      selectedAction: decision.selectedAction,
      observationScope: decision.observationScope,
    };
  }

  if (step.phase === "act") {
    const changed = mission.state.snapshotKey(before.__state) !== mission.state.snapshotKey(after.__state);
    return {
      outcome:
        decision.selectedAction === null
          ? "NO_ACTION_SELECTED"
          : changed
            ? "WORLD_CHANGED"
            : "NO_CHANGE",
      message: actionMessage(mission, decision.selectedAction, before, after),
      executedAction: decision.selectedAction,
    };
  }

  const verification = mission.verify.evidence(after.__state);
  return {
    outcome: verification.outcome,
    message: verification.message,
  };
}

function snapshotWithState(mission, state) {
  const snapshot = mission.state.snapshot(state);
  return Object.assign(Object.create(null), snapshot, { __state: state });
}

function stripPrivateSnapshot(snapshot) {
  return deepFreeze(
    Object.fromEntries(
      Object.entries(snapshot).filter(([key]) => key !== "__state"),
    ),
  );
}

/** Apply one compiler-minted mission step without mutating supplied state. */
export function applyMissionStep(
  state,
  step,
  { plan = null, observation = null, decision = null } = {},
) {
  const mission = missionForState(state);
  assertAllowedStep(step, mission);
  assertCompiledStep(plan, step, mission);
  const safeState = mission.state.normalize(state);
  const beforeInternal = snapshotWithState(mission, safeState);
  let activeObservation = observation;
  let activeDecision = decision;

  if (step.phase === "observe") {
    activeObservation = mintObservation(mission, plan, step, safeState);
  }
  if (step.phase === "decide") {
    activeDecision = mintDecision(
      mission,
      plan,
      step,
      activeObservation,
    );
  }
  if (step.phase === "act") {
    assertDecision(activeDecision, plan, mission);
  }

  const nextState =
    step.phase === "act"
      ? mission.actions.transition(safeState, activeDecision.selectedAction)
      : safeState;
  const normalizedNextState = mission.state.normalize(nextState);
  const afterInternal = snapshotWithState(mission, normalizedNextState);
  const detail = evidenceForStep(
    mission,
    step,
    beforeInternal,
    afterInternal,
    { observation: activeObservation, decision: activeDecision },
  );

  return deepFreeze({
    state: normalizedNextState,
    observation: activeObservation,
    decision: activeDecision,
    evidence: {
      line: step.line,
      phase: step.phase,
      command: step.command,
      label: step.label,
      ...detail,
      before: stripPrivateSnapshot(beforeInternal),
      after: stripPrivateSnapshot(afterInternal),
    },
  });
}

function unwrapAndValidatePlan(planOrCompileResult, requestedMissionId) {
  const plan =
    planOrCompileResult?.ok === true
      ? planOrCompileResult.plan
      : planOrCompileResult;
  const missionId = requestedMissionId ?? plan?.missionId;
  if (!isSafePlan(plan, { missionId })) {
    throw new TypeError(
      "runMission requires a complete allowlisted compiler plan for the active mission.",
    );
  }
  return plan;
}

function validateSessionId(sessionId) {
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new TypeError("runMission requires a non-empty sessionId.");
  }
  return sessionId;
}

function eventEvidence(mission, event, beforeState, afterState) {
  const before = mission.state.snapshot(beforeState);
  const after = mission.state.snapshot(afterState);
  let outcome = "WORLD_EVENT";
  let message = event.label;

  if (mission.id === "storm-watch") {
    const battered = after.seedlingBedsBattered - before.seedlingBedsBattered;
    outcome = battered > 0 ? "HARM_OCCURRED" : "PROTECTED";
    message =
      battered > 0
        ? `At tick ${event.tick}, rain arrived after ${battered} uncovered seedling beds were battered.`
        : `At tick ${event.tick}, the storm arrived and the covers protected every seedling bed.`;
  }

  return deepFreeze({
    id: event.id,
    tick: event.tick,
    tickRateHz: mission.timeline.tickRateHz,
    label: event.label,
    outcome,
    message,
    before,
    after,
    state: afterState,
  });
}

function applyScriptedEvents(mission, currentState) {
  let state = currentState;
  const events = [];
  for (const event of mission.timeline.events) {
    const beforeState = state;
    state = mission.state.normalize(
      mission.timeline.applyEvent(state, event.id),
    );
    events.push(eventEvidence(mission, event, beforeState, state));
  }
  return deepFreeze({ state, events });
}

/** Execute all phases plus deterministic mission events. */
export function runMission(
  planOrCompileResult,
  {
    sessionId,
    missionId: requestedMissionId,
    state,
  } = {},
) {
  const plan = unwrapAndValidatePlan(planOrCompileResult, requestedMissionId);
  const mission = getMissionDefinition(plan.missionId);
  const receiptSessionId = validateSessionId(sessionId);
  const initialState = mission.state.normalize(
    state ?? mission.state.createInitial(),
  );
  const before = mission.state.snapshot(initialState);
  const trace = [];
  const phaseStates = [];
  let currentState = initialState;
  let observation = null;
  let decision = null;
  let timeline = [];

  for (const step of plan.steps) {
    const transition = applyMissionStep(currentState, step, {
      plan,
      observation,
      decision,
    });
    currentState = transition.state;
    observation = transition.observation;
    decision = transition.decision;
    trace.push(transition.evidence);
    phaseStates.push(
      deepFreeze({ line: step.line, phase: step.phase, state: currentState }),
    );

    if (step.phase === "act" && mission.timeline.events.length > 0) {
      const eventResult = applyScriptedEvents(mission, currentState);
      currentState = eventResult.state;
      timeline = eventResult.events;
    }
  }

  const after = mission.state.snapshot(currentState);
  const verdict = mission.verify.predicate(currentState) ? "PASS" : "FAIL";
  const observeTrace = trace[0];
  const decideTrace = trace[1];
  const actTrace = trace[2];
  const receipt = deepFreeze({
    schema: "agentville.receipt.v2",
    missionId: mission.id,
    mission: mission.name,
    sessionId: receiptSessionId,
    source: plan.source,
    program: plan.steps.map((step) => step.command),
    before,
    after,
    beforeKey: mission.state.snapshotKey(initialState),
    afterKey: mission.state.snapshotKey(currentState),
    observation: observeTrace.message,
    observationCommand: plan.steps[0].command,
    observationScope: observeTrace.observationScope,
    decision: plan.steps[1].command,
    condition: decideTrace.condition,
    conditionId: decideTrace.conditionId,
    conditionSupported: decideTrace.conditionSupported,
    conditionMet: decideTrace.conditionMet,
    conditionReason: decideTrace.conditionReason,
    selectedAction: decideTrace.selectedAction,
    action: plan.steps[2].command,
    executedAction: actTrace.executedAction,
    verify: plan.steps[3].command,
    scriptedEvents: timeline.map(({ id, tick, outcome, message, before: eventBefore, after: eventAfter }) => ({
      id,
      tick,
      outcome,
      message,
      before: eventBefore,
      after: eventAfter,
    })),
    verdict,
  });

  return deepFreeze({
    missionId: mission.id,
    initialState,
    state: currentState,
    observation,
    decision,
    trace,
    timeline,
    phaseStates,
    receipt,
  });
}

export const executeMission = runMission;
