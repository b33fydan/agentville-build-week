import { PHASES, compileProgram, validateProgramPrefix } from "./compiler.js";
import {
  createCourseProgress,
  isMissionUnlocked,
  nextMissionId,
  recordMissionReceipt,
  selectMission,
} from "./course-progress.js";
import { createLearningRecap } from "./debrief.js";
import {
  createInitialMissionState,
  runMission,
  snapshotMissionState,
} from "./mission.js";
import {
  DEFAULT_MISSION_ID,
  MISSION_IDS,
  getMissionDefinition,
} from "./mission-registry.js";
import { FarmRenderer, WORLD_LANDMARKS } from "./world.js";

const MISSION_DURATION_MS = 5 * 60 * 1000;
const EXECUTION_STEP_TICKS = Object.freeze([45, 90, 135, 210]);
const EXECUTION_DURATION_TICKS = 225;
const FIXED_TICK_MS = 1000 / 60;
const STAGES = Object.freeze(["inspect", "program", "failure", "repair", "proof"]);
const params = new URLSearchParams(window.location.search);
const TEST_MODE = params.get("test") === "1";
const SEED_OVERRIDE = params.get("seed")?.trim() || null;

const LAYOUTS = Object.freeze({
  "repair-east-channel": Object.freeze({
    start: Object.freeze({ x: 2.2, y: 5.25 }),
    observe: Object.freeze({ x: 4.25, y: 3.45 }),
    focus: Object.freeze({ x: 4.1, y: 3.02 }),
    routes: Object.freeze({
      "water tomatoes": Object.freeze([
        Object.freeze({ x: 2.2, y: 5.25 }),
        Object.freeze({ x: 5.2, y: 5.0 }),
        Object.freeze({ x: 6.4, y: 4.4 }),
      ]),
      "clear blockage": Object.freeze([
        Object.freeze({ x: 2.2, y: 5.25 }),
        Object.freeze({ x: 3.15, y: 4.65 }),
        Object.freeze({ x: 4.1, y: 3.45 }),
      ]),
    }),
  }),
  "storm-watch": Object.freeze({
    start: Object.freeze({ x: 2.2, y: 5.25 }),
    observe: Object.freeze({ x: 3.65, y: 2.55 }),
    focus: Object.freeze({ x: 6.55, y: 4.4 }),
    routes: Object.freeze({
      "cover beds": Object.freeze([
        Object.freeze({ x: 2.2, y: 5.25 }),
        Object.freeze({ x: 2.3, y: 1.15 }),
        Object.freeze({ x: 5.3, y: 4.8 }),
        Object.freeze({ x: 6.55, y: 4.4 }),
      ]),
    }),
  }),
  "hungry-hens": Object.freeze({
    start: Object.freeze({ x: 2.2, y: 5.25 }),
    observe: Object.freeze({ x: 5.55, y: 4.0 }),
    focus: Object.freeze({ x: 5.86, y: 4.18 }),
    routes: Object.freeze({
      "unjam chute": Object.freeze([
        Object.freeze({ x: 2.2, y: 5.25 }),
        Object.freeze({ x: 4.4, y: 5.0 }),
        Object.freeze({ x: 5.75, y: 4.25 }),
      ]),
    }),
  }),
});

const elements = {
  app: query("#app"),
  debriefBackgroundTargets: [query(".topbar"), query(".stage-rail"), query(".workspace")],
  canvas: query("#farm-canvas"),
  missionClock: query("#mission-clock"),
  sessionLabel: query("#session-label"),
  stageItems: [...document.querySelectorAll("[data-stage]")],
  missionKicker: query("#mission-kicker"),
  worldTitle: query("#world-title"),
  worldObjective: query("#world-objective"),
  factPrimary: query("#fact-blockage"),
  factSecondary: query("#fact-crops"),
  worldCallout: query("#blockage-callout"),
  calloutTitle: query("#callout-title"),
  calloutCopy: query("#callout-copy"),
  bertTag: query("#bert-tag"),
  bertSpeech: query("#bert-speech"),
  bertCue: query("#bert-cue"),
  bertSpeechCopy: query("#bert-speech-copy"),
  agentBoundaryNote: query("#agent-boundary-note"),
  captionPhase: query("#caption-phase"),
  sceneCaption: query("#scene-caption"),
  startMissionNumber: query("#start-mission-number"),
  startTitle: query("#start-title"),
  startCopy: query("#start-copy"),
  missionRoster: query("#mission-roster"),
  startButton: query("#start-button"),
  motionToggle: query("#motion-toggle"),
  compilerBadge: query("#compiler-badge"),
  lessonStep: query("#lesson-step"),
  promptTitle: query("#prompt-title"),
  lessonCopy: query("#lesson-copy"),
  languageReference: query("#language-reference"),
  hintButton: query("#hint-button"),
  editorFilename: query("#editor-filename"),
  editor: query("#program-editor"),
  editorHelp: query("#editor-help"),
  editorStatus: query("#editor-status"),
  lineNumbers: query("#line-numbers"),
  traceOutput: query("#trace-output"),
  traceCount: query("#trace-count"),
  compileButton: query("#compile-button"),
  runButton: query("#run-button"),
  receiptPanel: query("#receipt-panel"),
  receiptTitle: query("#receipt-title"),
  receiptSummary: query("#receipt-summary"),
  receiptMission: query("#receipt-mission"),
  receiptSession: query("#receipt-session"),
  receiptObserved: query("#receipt-observed"),
  receiptAction: query("#receipt-action"),
  receiptProof: query("#receipt-proof"),
  recapIntro: query("#recap-intro"),
  recapPhases: [...document.querySelectorAll("[data-recap-phase]")],
  recapTakeawayTitle: query("#recap-takeaway-title"),
  recapTakeawayCopy: query("#recap-takeaway-copy"),
  lessonAlert: query(".lesson-alert"),
  nextMissionKicker: query("#next-mission-kicker"),
  nextMissionTitle: query("#next-mission-title"),
  nextMissionCopy: query("#next-mission-copy"),
  nextMissionButton: query("#next-mission-button"),
  feedbackLink: query("#feedback-link"),
  copyReceipt: query("#copy-receipt"),
  resetButton: query("#reset-button"),
  announcer: query("#announcer"),
  verificationStatus: query("#verification-status-text"),
};

let course = createCourseProgress();
let mission = getMissionDefinition(DEFAULT_MISSION_ID);

const state = {
  ready: false,
  mode: "welcome",
  stage: "inspect",
  tick: 0,
  elapsedRuntimeMs: 0,
  elapsedMissionMs: 0,
  lastClockSecond: -1,
  sessionId: null,
  sessionCounter: 0,
  missionId: mission.id,
  seed: seedForMission(mission),
  missionState: createInitialMissionState(mission.id),
  attemptBaseline: createInitialMissionState(mission.id),
  worldRevision: 1,
  source: "",
  compiledEditorSource: null,
  compileResult: null,
  compiledPlan: null,
  attemptCount: 0,
  failureSeen: false,
  failedSource: null,
  failedReceipt: null,
  coach: null,
  verification: { status: "NOT_RUN", message: "Mission not started." },
  receipt: null,
  lastTrace: [],
  visibleEvent: null,
  execution: null,
  lesson: createInitialLessonState(),
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  visual: createVisualState(mission.id),
  domDirty: true,
};

const renderer = new FarmRenderer(elements.canvas, {
  onResize: () => {
    if (state.ready) render();
  },
});
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
renderer.setReducedMotion(state.reducedMotion);
elements.app.dataset.testMode = String(TEST_MODE);

elements.startButton.addEventListener("click", () => beginMission({ missionId: state.missionId }));
elements.hintButton.addEventListener("click", revealHint);
elements.editor.addEventListener("input", onEditorInput);
elements.compileButton.addEventListener("click", compileCurrentProgram);
elements.runButton.addEventListener("click", runCurrentProgram);
elements.resetButton.addEventListener("click", () => beginMission({ missionId: state.missionId, replay: true }));
elements.nextMissionButton.addEventListener("click", startNextMission);
elements.copyReceipt.addEventListener("click", copyReceiptEvidence);
elements.motionToggle.addEventListener("click", toggleMotion);

for (const item of elements.missionRoster.querySelectorAll("[data-mission-id]")) {
  item.querySelector("button").addEventListener("click", () => {
    selectWelcomeMission(item.dataset.missionId);
  });
}

document.addEventListener("keydown", (event) => {
  if (state.mode === "welcome" && event.key === "Enter") {
    event.preventDefault();
    beginMission({ missionId: state.missionId });
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !elements.compileButton.disabled) {
    event.preventDefault();
    compileCurrentProgram();
  }
});

window.addEventListener("resize", () => {
  state.domDirty = true;
  render();
});

prefersReducedMotion.addEventListener("change", (event) => {
  state.reducedMotion = event.matches;
  renderer.setReducedMotion(state.reducedMotion);
  renderMotionToggle();
  state.domDirty = true;
  render();
});

function selectWelcomeMission(missionId) {
  if (!isMissionUnlocked(course, missionId)) return;
  course = selectMission(course, missionId);
  activateMissionDefinition(missionId);
  state.missionState = createInitialMissionState(missionId);
  state.attemptBaseline = createInitialMissionState(missionId);
  state.visual = createVisualState(missionId);
  state.worldRevision += 1;
  state.domDirty = true;
  render();
}

function beginMission({ missionId = state.missionId, replay = false } = {}) {
  course = selectMission(course, missionId);
  activateMissionDefinition(missionId);
  state.sessionId = createSessionId();
  state.mode = "authoring";
  state.stage = "program";
  state.elapsedMissionMs = 0;
  state.lastClockSecond = -1;
  state.missionState = createInitialMissionState(mission.id);
  state.attemptBaseline = state.missionState;
  state.worldRevision += 1;
  state.source = "";
  state.compiledEditorSource = null;
  state.compileResult = null;
  state.compiledPlan = null;
  state.attemptCount = 0;
  state.failureSeen = false;
  state.failedSource = null;
  state.failedReceipt = null;
  state.coach = null;
  state.verification = { status: "NOT_RUN", message: "Teach Bert what to observe first." };
  state.receipt = null;
  state.lastTrace = [];
  state.visibleEvent = null;
  state.execution = null;
  state.lesson = createInitialLessonState();
  state.visual = createVisualState(mission.id);
  state.domDirty = true;

  for (const target of elements.debriefBackgroundTargets) target.inert = false;
  elements.receiptPanel.hidden = true;
  elements.editor.value = "";
  elements.editor.disabled = false;
  elements.hintButton.disabled = false;
  elements.copyReceipt.textContent = "Copy receipt";
  render();
  announce(
    replay
      ? `${mission.name} reset. Teach Bert what to observe first.`
      : `${mission.name} started. Begin with Observe.`,
  );
  requestAnimationFrame(() => elements.editor.focus());
}

function activateMissionDefinition(missionId) {
  mission = getMissionDefinition(missionId);
  state.missionId = mission.id;
  state.seed = seedForMission(mission);
}

function revealHint() {
  const phaseIndex = lessonFocusIndex();
  if (state.failureSeen) state.lesson.repairHinted = true;
  else state.lesson.hintedPhases[phaseIndex] = true;
  state.domDirty = true;
  render();
  announce(
    state.failureSeen
      ? `Repair hint for line ${mission.language.repair.line}: ${mission.language.repair.to}.`
      : `Hint revealed for line ${phaseIndex + 1}.`,
  );
}

function onEditorInput() {
  if (state.mode === "running" || state.lesson.status === "rehearsing") return;
  const nextSource = elements.editor.value;
  const sourceChanged = nextSource !== state.source;
  state.source = nextSource;

  if (sourceChanged && state.compiledPlan?.source !== nextSource) {
    state.compileResult = null;
    state.lesson.validation = null;
    state.compiledPlan = null;
    state.compiledEditorSource = null;
    state.visual.routeVisible = false;
    state.lastTrace = state.failureSeen ? state.lastTrace : [];
  }

  if (!state.failureSeen) rewindAcceptedPrefix(nextSource);

  if (state.failureSeen) {
    const changed = nextSource !== state.failedSource;
    state.mode = changed ? "repair" : "failure";
    state.stage = changed ? "repair" : "failure";
    state.lesson.status = "repair";
    state.lesson.bertMessage = repairFailureMessage();
    state.verification = {
      status: "FAIL",
      message: state.failedReceipt
        ? `Verify failed: ${state.failedReceipt.afterKey}. Repair line ${mission.language.repair.line}.`
        : "Verify failed.",
    };
  } else {
    state.mode = "authoring";
    state.stage = "program";
  }

  state.domDirty = true;
  render();
}

function rewindAcceptedPrefix(source) {
  const enteredLines = programLines(source);
  let retainedCount = 0;
  while (
    retainedCount < state.lesson.acceptedSteps.length &&
    enteredLines[retainedCount] === state.lesson.acceptedSteps[retainedCount].command
  ) {
    retainedCount += 1;
  }
  if (retainedCount >= state.lesson.acceptedSteps.length) return;

  state.lesson.acceptedSteps = state.lesson.acceptedSteps.slice(0, retainedCount);
  state.lesson.validation = null;
  state.lesson.status = "prompt";
  state.lesson.evidenceLevel = retainedCount === 0 ? 0 : retainedCount === 1 ? 1 : 2;
  state.lesson.conceptVisible = retainedCount >= 2;
  state.lesson.bertMessage = promptForPhase(retainedCount);
  resetBertForLesson(retainedCount);
}

function compileCurrentProgram() {
  if (state.mode === "running" || state.lesson.status === "rehearsing") return;
  state.source = elements.editor.value;
  if (state.failureSeen || programLines(state.source).length === PHASES.length) {
    compileFullProgram();
    return;
  }

  let result = validateProgramPrefix(state.source, { missionId: mission.id });
  if (result.ok && result.acceptedCount > state.lesson.acceptedSteps.length + 1) {
    result = lockedPrefixResult(state.lesson.acceptedSteps.length);
  }
  state.lesson.validation = result;
  state.compileResult = null;
  state.compiledPlan = null;
  state.compiledEditorSource = null;
  state.visual.routeVisible = false;

  if (!result.ok) {
    state.verification = { status: "NOT_RUN", message: "Compiler stopped before world execution." };
    state.lesson.status = "error";
    state.lesson.bertMessage = {
      cue: "?",
      tone: "question",
      text: questionAfterError(result.errors[0]),
    };
    announce(`Compile stopped at line ${result.errors[0].line}. ${result.errors[0].suggestion}`);
    requestAnimationFrame(() => focusLine(result.errors[0].line));
  } else {
    state.lesson.acceptedSteps = result.steps;
    startLessonRehearsal(result.steps.at(-1));
  }

  state.domDirty = true;
  render();
}

function compileFullProgram() {
  const result = compileProgram(state.source, { missionId: mission.id });
  state.compileResult = result;
  state.lesson.validation = null;

  if (!result.ok) {
    state.compiledPlan = null;
    state.compiledEditorSource = null;
    state.visual.routeVisible = false;
    state.verification = { status: "NOT_RUN", message: "Compiler stopped before world execution." };
    state.lesson.status = "error";
    state.lesson.bertMessage = {
      cue: "?",
      tone: "question",
      text: state.failureSeen
        ? `That repair is not ready. Change line ${mission.language.repair.line}: ${mission.language.repair.phase}.`
        : questionAfterError(result.errors[0]),
    };
    state.mode = state.failureSeen ? "repair" : "authoring";
    state.stage = state.failureSeen ? "repair" : "program";
    announce(`Compile stopped at line ${result.errors[0].line}. ${result.errors[0].suggestion}`);
    requestAnimationFrame(() => focusLine(result.errors[0].line));
  } else {
    state.compiledPlan = result.plan;
    state.compiledEditorSource = state.source;
    state.lesson.acceptedSteps = result.plan.steps;
    state.lesson.status = "ready";
    state.lesson.evidenceLevel = 2;
    state.lesson.conceptVisible = !state.failureSeen;
    const repaired =
      result.plan.steps[mission.language.repair.line - 1].command ===
      mission.language.repair.to;
    state.lesson.bertMessage = state.failureSeen
      ? {
          cue: repaired ? "✓" : "?",
          tone: repaired ? "idea" : "question",
          text: repaired
            ? `That changes ${mission.language.repair.phase}. I’ll replay the complete plan from its starting world.`
            : `That line still matches the first attempt. What should change on line ${mission.language.repair.line}?`,
        }
      : {
          cue: "✓",
          tone: "idea",
          text: "All four instructions are ready. I’ll run the loop, then Verify the world.",
        };
    state.mode = state.failureSeen ? "repair-ready" : "compiled";
    state.stage = state.failureSeen ? "repair" : "program";
    state.visual.route = routeForAction(result.plan.bindings.decide.selectedAction);
    state.visual.routeVisible = true;
    state.verification = {
      status: "READY",
      message: "Four safe phases compiled. The authoritative world has not changed.",
    };
    announce("Compile succeeded. Four safe phases are ready to run.");
    requestAnimationFrame(() => elements.runButton.focus());
  }
  state.domDirty = true;
  render();
}

function startLessonRehearsal(step) {
  const layout = LAYOUTS[mission.id];
  const route =
    step.phase === "observe"
      ? [
          { x: state.visual.bert.x, y: state.visual.bert.y },
          midpointPoint(state.visual.bert, layout.observe),
          { ...layout.observe },
        ]
      : [{ x: state.visual.bert.x, y: state.visual.bert.y }];
  state.lesson.status = "rehearsing";
  state.lesson.rehearsal = {
    elapsedMs: 0,
    durationMs: step.phase === "observe" ? 1250 : 800,
    phase: step.phase,
    command: step.command,
    route,
  };
  state.lesson.bertMessage = rehearsalStartMessage(step);
  state.verification = {
    status: "NOT_RUN",
    message: `Line ${step.line} is safe teaching input. The world has not changed.`,
  };
  state.visual.route = route;
  state.visual.routeVisible = step.phase === "observe";
  state.visual.bert.moving = step.phase === "observe";
  state.visual.bert.action = step.phase === "decide" ? "think" : "inspect";
  elements.editor.disabled = true;
  announce(`Line ${step.line} accepted for rehearsal. World state is unchanged.`);
}

function runCurrentProgram() {
  if (!state.compiledPlan || state.mode === "running") return;
  const result = runMission(state.compiledPlan, {
    sessionId: state.sessionId,
    missionId: mission.id,
    state: state.attemptBaseline,
  });
  state.attemptCount += 1;
  state.mode = "running";
  state.lesson.status = "executing";
  state.lesson.conceptVisible = false;
  state.lesson.bertMessage = executionMessage(0, result);
  state.verification = { status: "RUNNING", message: "Bert is executing the compiled plan." };
  state.lastTrace = [];
  state.visibleEvent = null;
  state.missionState = state.attemptBaseline;
  state.visual = createVisualState(mission.id);
  state.visual.bert.moving = true;
  state.visual.bert.action = "inspect";
  state.visual.route = routeForAction(result.receipt.selectedAction);
  state.visual.routeVisible = true;
  state.execution = {
    result,
    tick: 0,
    completedSteps: 0,
    eventApplied: false,
    action: result.receipt.executedAction,
  };
  elements.editor.disabled = true;
  state.domDirty = true;
  render();
  announce("Bert started the plan. Watch Observe, Decide, Act, events, and Verify.");
}

function update(deltaMs) {
  const safeDelta = Math.max(0, Math.min(deltaMs, 100));
  state.tick += 1;
  state.elapsedRuntimeMs += safeDelta;
  if (state.mode !== "welcome" && state.mode !== "proof") {
    state.elapsedMissionMs += safeDelta;
    const second = Math.floor(state.elapsedMissionMs / 1000);
    if (second !== state.lastClockSecond) {
      state.lastClockSecond = second;
      state.domDirty = true;
    }
  }
  if (state.lesson.rehearsal) updateLessonRehearsal(safeDelta);
  if (state.execution) updateExecution(safeDelta);
  render();
}

function updateLessonRehearsal(deltaMs) {
  const rehearsal = state.lesson.rehearsal;
  rehearsal.elapsedMs += deltaMs;
  if (rehearsal.phase === "observe") {
    const progress = clamp(rehearsal.elapsedMs / rehearsal.durationMs, 0, 1);
    const position = positionAlongRoute(rehearsal.route, progress);
    Object.assign(state.visual.bert, position, { moving: progress < 1, action: "inspect" });
  } else {
    state.visual.bert.moving = false;
    state.visual.bert.action = rehearsal.phase === "decide" ? "think" : "idle";
  }
  if (rehearsal.elapsedMs >= rehearsal.durationMs) finishLessonRehearsal(rehearsal);
}

function finishLessonRehearsal(rehearsal) {
  const phaseIndex = PHASES.indexOf(rehearsal.phase);
  state.lesson.rehearsal = null;
  state.lesson.status = "prompt";
  state.lesson.evidenceLevel = phaseIndex === 0 ? 1 : phaseIndex >= 1 ? 2 : state.lesson.evidenceLevel;
  state.lesson.conceptVisible = phaseIndex >= 1;
  state.lesson.bertMessage = rehearsalCompleteMessage(rehearsal.phase, rehearsal.command);
  state.visual.bert.moving = false;
  state.visual.bert.action = rehearsal.phase === "decide" ? "think" : "idle";
  state.visual.routeVisible = false;
  elements.editor.disabled = false;
  if (state.lesson.acceptedSteps.length < PHASES.length && !elements.editor.value.endsWith("\n")) {
    elements.editor.value += "\n";
    state.source = elements.editor.value;
  }
  state.domDirty = true;
  render();
  announce(`${rehearsal.phase} accepted. ${PHASES[phaseIndex + 1]} is unlocked.`);
  requestAnimationFrame(() => {
    elements.editor.focus();
    elements.editor.setSelectionRange(elements.editor.value.length, elements.editor.value.length);
  });
}

function updateExecution(deltaMs) {
  const execution = state.execution;
  execution.tick = Math.min(
    EXECUTION_DURATION_TICKS,
    execution.tick + deltaMs / FIXED_TICK_MS,
  );
  const routeProgress = clamp(execution.tick / EXECUTION_STEP_TICKS[2], 0, 1);
  const position = positionAlongRoute(state.visual.route, routeProgress);
  Object.assign(state.visual.bert, position, { moving: execution.tick < EXECUTION_STEP_TICKS[2] });

  if (execution.tick < EXECUTION_STEP_TICKS[0]) state.visual.bert.action = "inspect";
  else if (execution.tick < EXECUTION_STEP_TICKS[2]) state.visual.bert.action = "think";
  else state.visual.bert.action = actionPose(execution.action);

  while (
    execution.completedSteps < EXECUTION_STEP_TICKS.length &&
    execution.tick >= EXECUTION_STEP_TICKS[execution.completedSteps]
  ) {
    const index = execution.completedSteps;
    execution.completedSteps += 1;
    state.lastTrace = execution.result.trace.slice(0, execution.completedSteps);
    state.lesson.bertMessage = executionMessage(index, execution.result);
    if (index === 2) {
      state.missionState = execution.result.phaseStates[2].state;
      state.worldRevision += 1;
    }
    if (index === 3) state.missionState = execution.result.state;
    state.domDirty = true;
  }

  const scriptedEvent = execution.result.timeline[0];
  if (scriptedEvent && !execution.eventApplied && execution.tick >= scriptedEvent.tick) {
    execution.eventApplied = true;
    state.visibleEvent = scriptedEvent;
    state.missionState = scriptedEvent.state;
    state.worldRevision += 1;
    state.lesson.bertMessage = {
      cue: scriptedEvent.outcome === "HARM_OCCURRED" ? "!" : "✓",
      tone: scriptedEvent.outcome === "HARM_OCCURRED" ? "warning" : "idea",
      text: scriptedEvent.message,
    };
    state.domDirty = true;
  }

  if (execution.tick >= EXECUTION_DURATION_TICKS) finishExecution();
}

function finishExecution() {
  const result = state.execution.result;
  state.execution = null;
  state.missionState = result.state;
  state.lastTrace = result.trace;
  state.visibleEvent = result.timeline[0] ?? null;
  state.visual.routeVisible = false;
  state.visual.bert.moving = false;
  state.visual.bert.action = result.receipt.verdict === "PASS" ? "idle" : "think";
  state.worldRevision += 1;

  if (result.receipt.verdict === "FAIL") {
    course = recordMissionReceipt(course, result.receipt);
    state.failureSeen = true;
    state.failedSource = state.source;
    state.failedReceipt = result.receipt;
    state.coach = {
      focusLine: mission.teaching.coach.guidedFailure.line,
      insertAfterLine: Math.max(2, mission.teaching.coach.guidedFailure.line),
      title: mission.teaching.coach.guidedFailure.title,
      message: mission.teaching.coach.guidedFailure.explanation,
      suggestion: mission.language.repair.to,
    };
    state.verification = { status: "FAIL", message: result.trace[3].message };
    state.mode = "failure";
    state.stage = "failure";
    state.lesson.status = "repair";
    state.lesson.bertMessage = repairFailureMessage();
    state.compiledPlan = null;
    state.compiledEditorSource = null;
    elements.editor.disabled = false;
    announce(`Verify failed. The Coach points to line ${mission.language.repair.line}.`);
    requestAnimationFrame(() => focusLine(mission.language.repair.line));
  } else {
    course = recordMissionReceipt(course, result.receipt);
    state.receipt = result.receipt;
    state.coach = null;
    state.verification = { status: "PASS", message: result.trace[3].message };
    state.mode = "proof";
    state.stage = "proof";
    state.lesson.status = "complete";
    state.lesson.bertMessage = null;
    preserveReceipt(result.receipt);
    announce(`${mission.name} passed. Verification receipt ready.`);
  }
  state.domDirty = true;
  render();
}

function startNextMission() {
  const nextId = nextMissionId(course, state.missionId);
  if (!nextId) return;
  beginMission({ missionId: nextId });
}

function render() {
  elements.app.dataset.mode = state.mode;
  elements.app.dataset.ready = String(state.ready);
  elements.app.dataset.mission = state.missionId;
  elements.app.dataset.programLines = String(programLines(elements.editor.value).length);
  const visualWorld = visualWorldState();
  renderer.render(visualWorld, state.elapsedRuntimeMs);

  if (state.domDirty) {
    renderRoster();
    renderStageRail();
    renderClock();
    renderWorldStatus(visualWorld);
    renderLesson();
    renderLanguageReference();
    renderBertTeaching();
    renderEditorStatus();
    renderCompilerBadge();
    renderTrace();
    renderControls();
    renderReceipt();
    renderMotionToggle();
    elements.verificationStatus.textContent = `${state.verification.status}: ${state.verification.message}`;
    state.domDirty = false;
  }
  positionWorldLabels();
}

function renderRoster() {
  elements.startMissionNumber.textContent = String(mission.order).padStart(2, "0");
  elements.startTitle.textContent = mission.ui.lessonTitle;
  elements.startCopy.textContent = mission.ui.editorPrompt;
  for (const item of elements.missionRoster.querySelectorAll("[data-mission-id]")) {
    const id = item.dataset.missionId;
    const unlocked = isMissionUnlocked(course, id);
    const passed = course.passedMissionIds.includes(id);
    const selected = id === state.missionId;
    item.dataset.state = selected ? "selected" : passed ? "complete" : unlocked ? "available" : "locked";
    const button = item.querySelector("button");
    button.disabled = !unlocked;
    button.setAttribute("aria-pressed", String(selected));
    item.querySelector("small").textContent = passed ? "Complete" : unlocked ? "Available" : "Locked";
  }
}

function renderStageRail() {
  const activeIndex = STAGES.indexOf(state.stage);
  for (const item of elements.stageItems) {
    const index = STAGES.indexOf(item.dataset.stage);
    item.classList.toggle("is-active", index === activeIndex);
    item.classList.toggle("is-complete", index < activeIndex || state.mode === "proof");
    item.setAttribute("aria-current", index === activeIndex ? "step" : "false");
  }
}

function renderClock() {
  const remaining = Math.max(0, MISSION_DURATION_MS - state.elapsedMissionMs);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  elements.missionClock.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} mission`;
  elements.sessionLabel.textContent = state.sessionId ?? "Session not started";
}

function renderWorldStatus(visualWorld) {
  const snapshot = snapshotMissionState(state.missionState);
  const copy = worldCopy(snapshot);
  elements.missionKicker.textContent = `${mission.ui.missionLabel} · ${mission.name}`;
  elements.worldTitle.textContent = copy.title;
  elements.worldObjective.textContent = copy.objective;
  setFact(elements.factPrimary, copy.primaryFact, copy.primaryTone);
  setFact(elements.factSecondary, copy.secondaryFact, copy.secondaryTone);
  elements.canvas.setAttribute("aria-label", copy.canvasLabel);
  elements.captionPhase.textContent = copy.captionPhase;
  elements.sceneCaption.textContent = copy.caption;
  elements.calloutTitle.textContent = copy.calloutTitle;
  elements.calloutCopy.textContent = copy.calloutCopy;
  elements.worldCallout.hidden = !copy.calloutVisible;
  elements.worldCallout.classList.toggle("is-revealed", copy.calloutVisible);
  elements.editorFilename.textContent = mission.filename;
}

function worldCopy(snapshot) {
  const evidenceVisible =
    state.mode !== "welcome" &&
    (state.failureSeen || state.mode !== "authoring" || state.lesson.evidenceLevel >= 1);
  if (mission.id === "repair-east-channel") {
    const passed = snapshot.tomatoBedsWatered === snapshot.tomatoBedsTotal;
    return {
      title: passed ? "The tomatoes are thriving." : "The tomatoes are thirsty.",
      objective: passed ? "Verified: water reached every tomato bed." : mission.objective,
      primaryFact: snapshot.irrigationBlocked ? (evidenceVisible ? "Debris blocks the channel" : "Irrigation unchecked") : "Channel clear",
      secondaryFact: `${snapshot.tomatoBedsWatered} / ${snapshot.tomatoBedsTotal} watered`,
      primaryTone: snapshot.irrigationBlocked ? "warning" : "good",
      secondaryTone: passed ? "good" : "dry",
      canvasLabel: evidenceVisible
        ? `A voxel farm with an IRRIGATION sign, ${snapshot.irrigationBlocked ? "visible debris blocking the East Channel" : "flowing water"}, and ${snapshot.tomatoBedsWatered} of 3 tomato beds watered. Bert stands nearby.`
        : "A voxel farm with three dry tomato beds, an IRRIGATION sign pointing to the East Channel, and Bert waiting nearby.",
      captionPhase: state.verification.status === "PASS" ? "VERIFY · PASS" : state.verification.status === "FAIL" ? "VERIFY · FAIL" : "EAST CHANNEL",
      caption: snapshot.irrigationBlocked ? "Stopped water · dry beds" : "Water flowing · beds watered",
      calloutTitle: "Debris jam",
      calloutCopy: "Water stops here",
      calloutVisible: evidenceVisible && snapshot.irrigationBlocked,
    };
  }
  if (mission.id === "storm-watch") {
    const safe = snapshot.seedlingBedsBattered === 0 && snapshot.seedlingBedsCovered === 3;
    return {
      title: snapshot.stormArrived ? (safe ? "The seedlings are sheltered." : "The storm struck the beds.") : "A storm is building.",
      objective: state.verification.status === "PASS" ? "Verified: every seedling stayed safe." : mission.objective,
      primaryFact: snapshot.rainFalling ? "Rain falling" : "Clouds gathering",
      secondaryFact: snapshot.seedlingBedsBattered > 0 ? `${snapshot.seedlingBedsBattered} / 3 battered` : `${snapshot.seedlingBedsCovered} / 3 covered`,
      primaryTone: snapshot.rainFalling ? "warning" : "dry",
      secondaryTone: snapshot.seedlingBedsBattered > 0 ? "warning" : safe ? "good" : "dry",
      canvasLabel: `A voxel farm with a WEATHER vane, three ${snapshot.seedlingBedsCovered === 3 ? "covered" : "uncovered"} seedling beds, covers beside the shed, and ${snapshot.rainFalling ? "falling rain" : "gathering clouds"}. Bert stands nearby.`,
      captionPhase: state.verification.status === "PASS" ? "VERIFY · PASS" : state.verification.status === "FAIL" ? "VERIFY · FAIL" : "STORM WATCH",
      caption: snapshot.rainFalling ? "Storm arrived" : "Clouds gather · no rain yet",
      calloutTitle: snapshot.rainFalling ? "Storm event" : "Weather warning",
      calloutCopy: snapshot.rainFalling ? "Rain reached the beds" : "Clouds are gathering",
      calloutVisible: evidenceVisible,
    };
  }
  const fed = snapshot.hensFed === snapshot.hensTotal;
  return {
    title: fed ? "Every hen has eaten." : "The hens are hungry.",
    objective: fed ? "Verified: grain reached every hen." : mission.objective,
    primaryFact: snapshot.chuteJammed ? (evidenceVisible ? "Feeder chute jammed" : "Feeder unchecked") : "Chute clear",
    secondaryFact: `${snapshot.hensFed} / ${snapshot.hensTotal} fed`,
    primaryTone: snapshot.chuteJammed ? "warning" : "good",
    secondaryTone: fed ? "good" : "dry",
    canvasLabel: `A voxel farm with a FEEDER sign, a ${snapshot.feederFull ? "full" : "partly full"} feeder, a ${snapshot.chuteJammed ? "jammed" : "clear"} chute, an ${snapshot.grainDelivered > 0 ? "used" : "empty"} grain tray, and three ${fed ? "fed" : "hungry"} hens. Bert stands nearby.`,
    captionPhase: state.verification.status === "PASS" ? "VERIFY · PASS" : state.verification.status === "FAIL" ? "VERIFY · FAIL" : "HUNGRY HENS",
    caption: snapshot.chuteJammed ? "Full feeder · empty tray" : "Grain delivered · hens fed",
    calloutTitle: "Jammed chute",
    calloutCopy: "Grain cannot reach the tray",
    calloutVisible: evidenceVisible && snapshot.chuteJammed,
  };
}

function renderLesson() {
  const phaseIndex = lessonFocusIndex();
  const phase = PHASES[phaseIndex];
  const progressive = {
    observe: ["Line 1 · Observe", "Tell Bert where to look.", `Use a visible clue on the farm. ${mission.teaching.observationText}`],
    decide: ["Line 2 · Decide", "Choose a response and condition.", "Decide uses only the evidence produced by line 1."],
    act: ["Line 3 · Act", "Tell Bert to carry out the choice.", "Act does not choose again; it executes the response selected by Decide."],
    verify: ["Line 4 · Verify", "Define what success means.", `State the world fact that would complete ${mission.name}.`],
  };
  let lesson;
  if (state.mode === "welcome") lesson = ["Step 1", "Inspect the farm first.", "Start a mission to open Bert’s local Workbench."];
  else if (state.lesson.status === "rehearsing") lesson = [`Line ${phaseIndex + 1} · Rehearsal`, `Bert is trying ${phase}.`, "This preview cannot change the world; only the full compiler plan can."];
  else if (state.mode === "compiled") lesson = ["Plan · Ready", "Read the plan before it runs.", "Compilation proves the language is safe. Verify will prove whether it works."];
  else if (state.mode === "running") lesson = ["Execution · Live", "Watch evidence become action.", "The trace, scripted events, and voxel world advance together."];
  else if (state.mode === "failure") lesson = ["Step 3 · Diagnose", mission.teaching.coach.guidedFailure.title, mission.teaching.coach.guidedFailure.explanation];
  else if (state.mode === "repair") lesson = ["Step 4 · Repair", `Change line ${mission.language.repair.line}: ${mission.language.repair.phase}.`, mission.ui.repairPrompt];
  else if (state.mode === "repair-ready") lesson = ["Repair · Ready", "The single-line repair is compiled.", "Run the complete plan again from the same starting world."];
  else if (state.mode === "proof") lesson = ["Step 5 · Proof", "World change verified.", "The receipt explains why all four lines worked and what you changed."];
  else lesson = progressive[phase];
  elements.lessonStep.textContent = lesson[0];
  elements.promptTitle.textContent = lesson[1];
  elements.lessonCopy.textContent = lesson[2];
}

function renderLanguageReference() {
  const descriptions = ["read scoped evidence", "choose from evidence", "carry out the choice", "prove the outcome"];
  const activeIndex = lessonFocusIndex();
  const hasActive = ["authoring", "failure", "repair"].includes(state.mode);
  elements.languageReference.replaceChildren(
    ...PHASES.map((phase, index) => {
      const item = document.createElement("li");
      const code = document.createElement("code");
      const description = document.createElement("span");
      const repairing = state.failureSeen && index === mission.language.repair.line - 1 && ["failure", "repair"].includes(state.mode);
      const complete = index < state.lesson.acceptedSteps.length && !repairing;
      const active = hasActive && index === activeIndex;
      const hinted = active && (state.failureSeen ? state.lesson.repairHinted : state.lesson.hintedPhases[index]);
      const descriptionText = hinted
        ? hintLineForPhase(index).slice(phase.length + 1)
        : complete
          ? "accepted · world unchanged"
          : descriptions[index];
      item.dataset.phase = phase;
      item.classList.toggle("is-complete", complete);
      item.classList.toggle("is-active", active);
      item.classList.toggle("is-locked", !complete && !active);
      item.classList.toggle("is-hinted", hinted);
      item.setAttribute("aria-current", active ? "step" : "false");
      item.setAttribute("aria-label", `${phase}: ${complete ? "accepted" : active ? "current instruction" : "locked"}. ${descriptionText}`);
      code.textContent = phase;
      description.textContent = descriptionText;
      item.append(code, description);
      return item;
    }),
  );

  const help = [
    `Tell Bert where to look. The farm sign says ${mission.ui.clueSign}.`,
    "Start with decide. Include a response and a complete condition clause.",
    "Use the shared Act line to carry out the response selected on line 2.",
    `Define the world fact that proves ${mission.name} succeeded.`,
  ];
  elements.editorHelp.textContent = state.failureSeen
    ? `Repair only line ${mission.language.repair.line}. Keep the other three phases unchanged.`
    : help[activeIndex];
  elements.editor.placeholder = state.failureSeen
    ? `Repair line ${mission.language.repair.line}: ${mission.language.repair.phase} …`
    : `Line ${activeIndex + 1}: ${PHASES[activeIndex]} …`;
  elements.compileButton.querySelector("span").textContent = state.failureSeen
    ? "Compile repair"
    : programLines(elements.editor.value).length === 4
      ? "Compile full plan"
      : "Check line";
}

function renderBertTeaching() {
  const visible = state.mode !== "welcome" && state.mode !== "proof" && Boolean(state.lesson.bertMessage);
  elements.bertSpeech.hidden = !visible;
  elements.bertTag.hidden = visible;
  if (visible) {
    elements.bertCue.textContent = state.lesson.bertMessage.cue;
    elements.bertSpeechCopy.textContent = state.lesson.bertMessage.text;
    elements.bertSpeech.dataset.tone = state.lesson.bertMessage.tone;
  }
  elements.agentBoundaryNote.hidden = !(state.lesson.conceptVisible && ["authoring", "compiled"].includes(state.mode));
}

function renderEditorStatus() {
  const lines = elements.editor.value.length === 0 ? [] : elements.editor.value.split(/\r?\n/u);
  const phaseCount = lines.filter((line, index) => line.startsWith(`${PHASES[index] ?? "__"} `)).length;
  const lineCount = Math.max(4, lines.length || 1);
  elements.lineNumbers.innerHTML = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("<br>");
  elements.editorStatus.textContent = `${phaseCount} / 4 phases`;
}

function renderCompilerBadge() {
  elements.compilerBadge.className = "compiler-badge";
  if (state.mode === "running") setBadge("Executing", "is-good");
  else if (state.verification.status === "PASS") setBadge("Verified PASS", "is-good");
  else if (state.verification.status === "FAIL") setBadge("Verified FAIL", "is-bad");
  else if (state.compileResult?.ok === true) setBadge("Plan safe", "is-good");
  else if (state.compileResult?.ok === false || state.lesson.validation?.ok === false) setBadge("Fix source", "is-bad");
  else if (state.lesson.acceptedSteps.length > 0) setBadge(`${state.lesson.acceptedSteps.length} / 4 safe`, "is-good");
  else elements.compilerBadge.textContent = state.mode === "welcome" ? "Waiting" : "Local compiler";
}

function setBadge(text, className) {
  elements.compilerBadge.textContent = text;
  elements.compilerBadge.classList.add(className);
}

function renderTrace() {
  elements.traceOutput.replaceChildren();
  let eventCount = 0;
  let followTarget = null;
  const teachingErrors = state.compileResult?.ok === false
    ? state.compileResult.errors
    : state.lesson.validation?.ok === false
      ? state.lesson.validation.errors
      : null;

  if (teachingErrors) {
    for (const error of teachingErrors) {
      elements.traceOutput.append(createErrorTrace(error));
      eventCount += 1;
    }
  } else if (state.lastTrace.length > 0) {
    for (const entry of state.lastTrace) {
      const item = createTraceItem(entry, outcomeClass(entry.outcome), entry.message);
      if (state.coach && entry.line === state.coach.focusLine) item.classList.add("is-coach-focus");
      elements.traceOutput.append(item);
      eventCount += 1;
      if (entry.line === 3 && state.visibleEvent) {
        elements.traceOutput.append(createEventTrace(state.visibleEvent));
        eventCount += 1;
      }
      if (state.coach && entry.line === state.coach.insertAfterLine) {
        followTarget = createCoachTrace(state.coach);
        elements.traceOutput.append(followTarget);
        eventCount += 1;
      }
    }
  } else if (state.compiledPlan) {
    for (const step of state.compiledPlan.steps) {
      elements.traceOutput.append(createTraceItem(step, "planned", "Allowlisted and ready for execution."));
      eventCount += 1;
    }
  } else if (state.lesson.acceptedSteps.length > 0) {
    for (const step of state.lesson.acceptedSteps) {
      elements.traceOutput.append(createTraceItem(step, "learned", "Safe rehearsal accepted; authoritative world unchanged."));
      eventCount += 1;
    }
  }

  if (eventCount === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-trace";
    empty.innerHTML = "<span>›_</span><p>Your plan will become visible here.</p>";
    elements.traceOutput.append(empty);
  }
  elements.traceCount.textContent = `${eventCount} ${eventCount === 1 ? "event" : "events"}`;
  if (followTarget) {
    const alignTrace = () => revealTraceTarget(followTarget);
    requestAnimationFrame(() => {
      alignTrace();
      requestAnimationFrame(alignTrace);
    });
    document.fonts?.ready.then(alignTrace);
  } else {
    requestAnimationFrame(() => {
      elements.traceOutput.scrollTop = elements.traceOutput.scrollHeight;
    });
  }
}

function createTraceItem(entry, status, message) {
  const item = document.createElement("div");
  item.className = `trace-item is-${status}`;
  item.dataset.line = String(entry.line);
  const index = document.createElement("span");
  const body = document.createElement("div");
  const title = document.createElement("b");
  const detail = document.createElement("small");
  const stateLabel = document.createElement("span");
  index.className = "trace-index";
  index.textContent = status === "pass" ? "✓" : status === "fail" ? "!" : String(entry.line);
  title.textContent = `${entry.phase.toUpperCase()} · ${entry.label}`;
  detail.textContent = message;
  stateLabel.className = "trace-state";
  stateLabel.textContent = status === "no-change" ? "NO CHANGE" : status;
  body.append(title, detail);
  item.append(index, body, stateLabel);
  return item;
}

function createEventTrace(event) {
  const item = document.createElement("div");
  item.className = `trace-item is-${event.outcome === "HARM_OCCURRED" ? "fail" : "pass"}`;
  item.dataset.testid = "world-event";
  const index = document.createElement("span");
  const body = document.createElement("div");
  const title = document.createElement("b");
  const detail = document.createElement("small");
  index.className = "trace-index";
  index.textContent = event.outcome === "HARM_OCCURRED" ? "!" : "☂";
  title.textContent = `WORLD EVENT · TICK ${event.tick}`;
  detail.textContent = event.message;
  body.append(title, detail);
  item.append(index, body);
  return item;
}

function createCoachTrace(coachState) {
  const coach = document.createElement("div");
  coach.className = "coach-note";
  coach.dataset.testid = "coach-message";
  const mark = document.createElement("span");
  const body = document.createElement("div");
  const strong = document.createElement("strong");
  const message = document.createTextNode(` · ${coachState.message} `);
  const code = document.createElement("code");
  mark.textContent = "C";
  strong.textContent = "CODEX COACH";
  code.textContent = coachState.suggestion;
  body.append(strong, message, code);
  coach.append(mark, body);
  return coach;
}

function revealTraceTarget(target) {
  if (!target?.isConnected) return;
  const outputBounds = elements.traceOutput.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const targetTop =
    targetBounds.top - outputBounds.top + elements.traceOutput.scrollTop;
  const targetBottom = targetTop + targetBounds.height;
  elements.traceOutput.scrollTop = Math.max(
    0,
    targetBottom - elements.traceOutput.clientHeight + 6,
  );
}

function createErrorTrace(error) {
  const item = document.createElement("div");
  item.className = "trace-item is-error";
  const index = document.createElement("span");
  const body = document.createElement("div");
  const title = document.createElement("b");
  const detail = document.createElement("small");
  const jump = document.createElement("button");
  index.className = "trace-index";
  index.textContent = "!";
  title.textContent = `LINE ${error.line} · ${error.code}`;
  detail.textContent = `${error.message} ${error.suggestion}`;
  jump.type = "button";
  jump.textContent = "Fix line";
  jump.addEventListener("click", () => focusLine(error.line));
  body.append(title, detail, jump);
  item.append(index, body);
  return item;
}

function renderControls() {
  const hasSource = elements.editor.value.trim().length > 0;
  const sameFailedSource = state.failureSeen && elements.editor.value === state.failedSource;
  const enteredLines = programLines(elements.editor.value);
  const sameAcceptedPrefix = !state.failureSeen && enteredLines.length === state.lesson.acceptedSteps.length && enteredLines.every((line, index) => line === state.lesson.acceptedSteps[index]?.command);
  elements.compileButton.disabled =
    state.mode === "welcome" ||
    state.mode === "running" ||
    state.lesson.status === "rehearsing" ||
    !hasSource ||
    sameFailedSource ||
    sameAcceptedPrefix;
  elements.runButton.disabled = state.mode === "running" || !state.compiledPlan || state.compiledEditorSource !== elements.editor.value;
  const hintIndex = lessonFocusIndex();
  const hintShown = state.failureSeen ? state.lesson.repairHinted : state.lesson.hintedPhases[hintIndex];
  elements.hintButton.textContent = ["repair-ready", "running", "proof"].includes(state.mode)
    ? `Line ${mission.language.repair.line} set`
    : hintShown
      ? "Hint shown"
      : state.failureSeen
        ? "Hint repair"
        : "Hint this line";
  elements.hintButton.disabled =
    state.mode === "welcome" ||
    state.mode === "running" ||
    state.lesson.status === "rehearsing" ||
    ["compiled", "repair-ready"].includes(state.mode) ||
    hintShown;
}

function renderReceipt() {
  if (!state.receipt) {
    for (const target of elements.debriefBackgroundTargets) target.inert = false;
    elements.receiptPanel.hidden = true;
    return;
  }

  const recap = createLearningRecap(state.receipt, { failedReceipt: state.failedReceipt });
  for (const target of elements.debriefBackgroundTargets) target.inert = true;
  elements.receiptTitle.textContent = recap.title;
  elements.receiptSummary.textContent = recap.summary;
  elements.recapIntro.textContent = recap.intro;
  elements.recapTakeawayTitle.textContent = recap.takeaway.title;
  elements.recapTakeawayCopy.textContent = recap.takeaway.explanation;
  for (const phase of recap.phases) {
    const item = elements.recapPhases.find((candidate) => candidate.dataset.recapPhase === phase.phase);
    item.querySelector("[data-recap-command]").textContent = phase.command;
    item.querySelector("[data-recap-copy]").textContent = phase.explanation;
  }
  elements.receiptMission.textContent = `${mission.ui.missionLabel} · ${mission.name}`;
  elements.receiptSession.textContent = state.receipt.sessionId;
  elements.receiptObserved.textContent = state.receipt.observation;
  elements.receiptAction.textContent = recap.path === "repair"
    ? `${state.receipt.executedAction ?? "no action"} · line ${mission.language.repair.line} repaired`
    : recap.path === "already-satisfied"
      ? "no action · goal already satisfied"
      : `${state.receipt.executedAction ?? "no action"} · direct safe plan`;
  elements.receiptProof.textContent = `${state.receipt.beforeKey} → ${state.receipt.afterKey} · ${state.receipt.verdict}`;
  elements.feedbackLink.href = `./feedback/?mission_id=${encodeURIComponent(state.receipt.missionId)}&session_id=${encodeURIComponent(state.receipt.sessionId)}`;

  const nextId = nextMissionId(course, state.missionId);
  if (nextId) {
    const next = getMissionDefinition(nextId);
    elements.nextMissionKicker.textContent = `${next.ui.missionLabel} unlocked`;
    elements.nextMissionTitle.textContent = next.name;
    elements.nextMissionCopy.textContent = next.objective;
    elements.nextMissionButton.hidden = false;
    elements.nextMissionButton.textContent = `Start ${next.name}`;
  } else {
    elements.nextMissionKicker.textContent = "Build Week course complete";
    elements.nextMissionTitle.textContent = "All three field missions verified.";
    elements.nextMissionCopy.textContent = "You repaired a decision, a timing trigger, and an observation scope.";
    elements.nextMissionButton.hidden = true;
  }
  elements.receiptPanel.hidden = false;
  requestAnimationFrame(() => elements.receiptPanel.focus());
}

function visualWorldState() {
  const snapshot = snapshotMissionState(state.missionState);
  const common = {
    sceneId: sceneIdForMission(mission.id),
    routeVisible: state.visual.routeVisible,
    route: state.visual.route,
    bert: state.visual.bert,
    verified: state.verification.status === "PASS",
  };
  if (mission.id === "repair-east-channel") {
    const reveal = state.mode !== "welcome" && (state.failureSeen || state.mode !== "authoring" || state.lesson.evidenceLevel >= 1);
    const revealProgress = state.execution && state.execution.action === "clear blockage"
      ? clamp((state.execution.tick - EXECUTION_STEP_TICKS[2]) / 55, 0, 1)
      : 1;
    return {
      ...common,
      blocked: snapshot.irrigationBlocked,
      blockageRevealed: reveal,
      cropsWatered: Math.floor(snapshot.tomatoBedsWatered * revealProgress),
    };
  }
  if (mission.id === "storm-watch") {
    return {
      ...common,
      seedlingsCovered: snapshot.seedlingBedsCovered === snapshot.seedlingBedsTotal,
      seedlingsBattered: snapshot.seedlingBedsBattered > 0,
      stormStage: snapshot.rainFalling ? "raining" : snapshot.cloudsGathering ? "building" : snapshot.stormArrived ? "cleared" : "calm",
    };
  }
  return {
    ...common,
    feederFull: snapshot.feederFull,
    chuteJammed: snapshot.chuteJammed,
    hensFed: snapshot.hensFed === snapshot.hensTotal,
    grainVisible: snapshot.grainDelivered > 0,
  };
}

function positionWorldLabels() {
  const focus = LAYOUTS[mission.id].focus;
  const projected = renderer.project(focus.x, focus.y, 1.1);
  elements.worldCallout.style.left = `${clamp(projected.x + 18, 16, renderer.width - 182)}px`;
  elements.worldCallout.style.top = `${clamp(projected.y - 70, 112, renderer.height - 98)}px`;
  const bertAnchor = renderer.getBertAnchor(state.visual.bert);
  elements.bertTag.style.left = `${clamp(bertAnchor.x + 16, 12, renderer.width - 130)}px`;
  elements.bertTag.style.top = `${clamp(bertAnchor.y - 8, 110, renderer.height - 60)}px`;
  elements.bertSpeech.style.left = `${clamp(bertAnchor.x + 22, 18, renderer.width - 295)}px`;
  elements.bertSpeech.style.top = `${clamp(bertAnchor.y - 82, 112, renderer.height - 130)}px`;
}

function routeForAction(action) {
  const layout = LAYOUTS[mission.id];
  return (layout.routes[action] ?? [layout.start, layout.observe]).map((point) => ({ ...point }));
}

function actionPose(action) {
  if (action === "clear blockage") return "clear";
  if (action === "water tomatoes") return "water";
  if (action === "cover beds") return "cover";
  if (action === "unjam chute") return "unjam";
  return "think";
}

function positionAlongRoute(route, progress) {
  if (!Array.isArray(route) || route.length === 0) return { ...LAYOUTS[mission.id].start };
  if (route.length === 1) return { ...route[0] };
  const scaled = clamp(progress, 0, 1) * (route.length - 1);
  const index = Math.min(Math.floor(scaled), route.length - 2);
  const local = scaled - index;
  return {
    x: lerp(route[index].x, route[index + 1].x, local),
    y: lerp(route[index].y, route[index + 1].y, local),
  };
}

function midpointPoint(left, right) {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function outcomeClass(outcome) {
  if (["PASS", "CAUSE_SELECTED", "RESPONSE_SELECTED", "WORLD_CHANGED", "CLEAR", "PROTECTED"].includes(outcome)) return "pass";
  if (["FAIL", "HARM_OCCURRED", "EVIDENCE_UNAVAILABLE"].includes(outcome)) return "fail";
  if (["NO_CHANGE", "NO_ACTION_SELECTED", "CONDITION_NOT_MET"].includes(outcome)) return "no-change";
  return "info";
}

function focusLine(lineNumber) {
  const lines = elements.editor.value.split("\n");
  const start = lines.slice(0, lineNumber - 1).reduce((total, line) => total + line.length + 1, 0);
  const end = start + (lines[lineNumber - 1]?.length ?? 0);
  elements.editor.focus();
  elements.editor.setSelectionRange(start, end);
}

function toggleMotion() {
  state.reducedMotion = !state.reducedMotion;
  renderer.setReducedMotion(state.reducedMotion);
  renderMotionToggle();
  state.domDirty = true;
  render();
}

function renderMotionToggle() {
  elements.motionToggle.setAttribute("aria-pressed", String(state.reducedMotion));
  elements.motionToggle.textContent = state.reducedMotion ? "Use motion" : "Reduce motion";
}

async function copyReceiptEvidence() {
  if (!state.receipt) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(state.receipt, null, 2));
    elements.copyReceipt.textContent = "Copied";
  } catch {
    elements.copyReceipt.textContent = "Copy unavailable";
  }
}

function preserveReceipt(receipt) {
  try {
    localStorage.setItem("agentville:lastReceipt", JSON.stringify(receipt));
    localStorage.setItem(
      `agentville:receipt:${receipt.missionId}:${receipt.sessionId}`,
      JSON.stringify(receipt),
    );
  } catch {
    // The visible receipt remains authoritative when storage is unavailable.
  }
}

function announce(message) {
  elements.announcer.textContent = "";
  requestAnimationFrame(() => {
    elements.announcer.textContent = message;
  });
}

function createSessionId() {
  state.sessionCounter += 1;
  if (TEST_MODE) return `AVBW-TEST-${String(state.sessionCounter).padStart(4, "0")}`;
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `AVBW-${date}-${token}`;
}

function snapshotForAutomation() {
  const world = snapshotMissionState(state.missionState);
  const visibleWorld = visualWorldState();
  const compileError = state.compileResult?.ok === false ? state.compileResult.errors[0] : null;
  const learningRecap = createLearningRecap(state.receipt, { failedReceipt: state.failedReceipt });
  const landmarks = WORLD_LANDMARKS[sceneIdForMission(mission.id)].map((landmark) => ({
    id: landmark.id,
    label: landmark.label,
    pointsTo: landmark.pointsTo,
    position: { ...landmark.position },
  }));
  const nextId = state.receipt ? nextMissionId(course, state.missionId) : null;
  return {
    schemaVersion: 2,
    ready: state.ready,
    mode: state.mode,
    stage: state.stage,
    seed: state.seed,
    tick: state.tick,
    coordinates: "Isometric farm grid: origin northwest; x runs southeast, y runs southwest.",
    mission: {
      id: mission.id,
      name: mission.name,
      index: mission.order,
      count: MISSION_IDS.length,
    },
    course: {
      activeMissionId: course.activeMissionId,
      unlockedMissionIds: [...course.unlockedMissionIds],
      completedMissionIds: [...course.passedMissionIds],
      nextMissionId: nextId,
    },
    session: {
      id: state.sessionId,
      missionId: mission.id,
      mission: mission.name,
      attemptCount: state.attemptCount,
      elapsedMs: Math.round(state.elapsedMissionMs),
    },
    program: {
      sourceLines: state.source.length > 0 ? state.source.split("\n") : [],
      compile: {
        ok: state.compileResult?.ok ?? null,
        error: compileError ? { line: compileError.line, code: compileError.code, suggestion: compileError.suggestion } : null,
      },
      lessonCheck: {
        ok: state.lesson.validation?.ok ?? null,
        error: state.lesson.validation?.ok === false ? state.lesson.validation.errors[0] : null,
      },
      plan: state.compiledPlan?.steps.map(({ line, phase, command, label }) => ({ line, phase, command, label })) ?? [],
      bindings: state.compiledPlan ? structuredClone(state.compiledPlan.bindings) : null,
      binding: state.compiledPlan ? { ...state.compiledPlan.binding } : null,
    },
    lesson: {
      status: state.lesson.status,
      currentPhase: state.lesson.rehearsal
        ? state.lesson.rehearsal.phase
        : state.failureSeen
          ? mission.language.repair.phase
          : state.lesson.acceptedSteps.length >= PHASES.length
            ? null
            : PHASES[state.lesson.acceptedSteps.length],
      repairLine: mission.language.repair.line,
      acceptedCommands: state.lesson.acceptedSteps.map((step) => step.command),
      evidenceLevel: state.lesson.evidenceLevel,
      conceptVisible: state.lesson.conceptVisible,
      repairHinted: state.lesson.repairHinted,
      bertMessage: state.lesson.bertMessage ? { ...state.lesson.bertMessage } : null,
    },
    crew: {
      bert: {
        position: { x: round(state.visual.bert.x), y: round(state.visual.bert.y) },
        moving: state.visual.bert.moving,
        action: state.visual.bert.action,
      },
    },
    world: {
      revision: state.worldRevision,
      worldHash: `${state.seed}:${mission.state.snapshotKey(state.missionState)}`,
      activeState: world,
      visualState: visibleWorld,
      landmarks,
      ...(mission.id === "repair-east-channel"
        ? {
            blockage: world.irrigationBlocked ? "debris-present" : "cleared",
            eastChannel: world.waterReleased ? "flowing" : world.irrigationBlocked ? "blocked" : "idle",
            tomatoBeds: { watered: world.tomatoBedsWatered, total: world.tomatoBedsTotal },
          }
        : {}),
    },
    presentation: renderer.presentationSnapshot(),
    trace: state.lastTrace.map((entry) => structuredClone(entry)),
    timeline: {
      tickRateHz: mission.timeline.tickRateHz,
      executionTick: Math.floor(state.execution?.tick ?? 0),
      events: state.execution
        ? state.execution.result.timeline.map((event) => ({
            id: event.id,
            tick: event.tick,
            outcome: event.outcome,
          }))
        : state.visibleEvent
          ? [{
              id: state.visibleEvent.id,
              tick: state.visibleEvent.tick,
              outcome: state.visibleEvent.outcome,
            }]
          : [],
      visibleEvent: state.visibleEvent ? { id: state.visibleEvent.id, tick: state.visibleEvent.tick, outcome: state.visibleEvent.outcome, message: state.visibleEvent.message } : null,
    },
    verification: { ...state.verification },
    coach: state.coach ? { ...state.coach } : null,
    receipt: state.receipt ? structuredClone(state.receipt) : null,
    failureReceipt: state.failedReceipt ? structuredClone(state.failedReceipt) : null,
    learningRecap: learningRecap ? structuredClone(learningRecap) : null,
    nextMission: nextId ? { id: nextId, status: "UNLOCKED", name: getMissionDefinition(nextId).name } : state.receipt ? { id: null, status: "COURSE_COMPLETE" } : null,
    feedbackHref: state.receipt ? new URL(elements.feedbackLink.href, window.location.href).href : null,
  };
}

window.render_game_to_text = () => JSON.stringify(snapshotForAutomation());
window.advanceTime = (milliseconds) => {
  const requested = Number(milliseconds);
  if (!Number.isFinite(requested) || requested < 0) {
    throw new TypeError("advanceTime expects a non-negative number of milliseconds.");
  }
  let remaining = requested;
  if (remaining === 0) render();
  while (remaining > 0) {
    const delta = Math.min(FIXED_TICK_MS, remaining);
    update(delta);
    remaining -= delta;
  }
  return window.render_game_to_text();
};
window.__agentville = Object.freeze({ snapshot: snapshotForAutomation });

function createInitialLessonState() {
  return {
    acceptedSteps: [],
    status: "prompt",
    validation: null,
    rehearsal: null,
    evidenceLevel: 0,
    conceptVisible: false,
    hintedPhases: [false, false, false, false],
    repairHinted: false,
    bertMessage: null,
  };
}

function createVisualState(missionId) {
  const start = LAYOUTS[missionId].start;
  return {
    bert: { ...start, moving: false, action: "idle" },
    route: [],
    routeVisible: false,
  };
}

function programLines(source) {
  if (typeof source !== "string" || source.length === 0) return [];
  const normalized = source.replace(/\r\n?/gu, "\n");
  const withoutTerminalNewline = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return withoutTerminalNewline.length === 0 ? [] : withoutTerminalNewline.split("\n");
}

function lessonFocusIndex() {
  if (state.failureSeen) return mission.language.repair.line - 1;
  const error = state.compileResult?.ok === false
    ? state.compileResult.errors[0]
    : state.lesson.validation?.ok === false
      ? state.lesson.validation.errors[0]
      : null;
  if (error) return clamp(error.line - 1, 0, PHASES.length - 1);
  if (state.lesson.rehearsal) return PHASES.indexOf(state.lesson.rehearsal.phase);
  return Math.min(state.lesson.acceptedSteps.length, PHASES.length - 1);
}

function lockedPrefixResult(acceptedCount) {
  const line = acceptedCount + 1;
  const phase = PHASES[acceptedCount];
  return Object.freeze({
    ok: false,
    missionId: mission.id,
    errors: Object.freeze([
      Object.freeze({
        line,
        code: "LINE_LOCKED",
        message: `Check line ${line} (${phase}) before adding later instructions.`,
        suggestion: `Keep only lines 1–${line}, then check ${phase}.`,
      }),
    ]),
  });
}

function repairFailureMessage() {
  return {
    cue: "!",
    tone: "warning",
    text: `${mission.teaching.coach.guidedFailure.title} Repair line ${mission.language.repair.line}.`,
  };
}

function questionAfterError(error) {
  const phase = PHASES[clamp((error?.line ?? 1) - 1, 0, 3)];
  const questions = {
    observe: `What visible farm clue should I inspect? Look for ${mission.ui.clueSign}.`,
    decide: "Which response and condition should I use with the evidence I observed?",
    act: "My response is chosen. What shared instruction tells me to carry it out?",
    verify: `How will we prove ${mission.name} actually succeeded?`,
  };
  return questions[phase];
}

function promptForPhase(index) {
  const prompts = [
    null,
    { cue: "?", tone: "question", text: "I observed the clue. What response and condition should I use?" },
    { cue: "💡", tone: "idea", text: "My response is chosen. What tells me to carry it out?" },
    { cue: "?", tone: "question", text: "What world fact will prove the mission worked?" },
  ];
  return prompts[index] ?? null;
}

function rehearsalStartMessage(step) {
  const text = {
    observe: `I’m inspecting ${mission.world.focus.replaceAll("-", " ")}…`,
    decide: "I’m checking whether my condition is supported by line 1…",
    act: "I’m preparing to act on the decision…",
    verify: "I’m preparing the success check…",
  }[step.phase];
  return { cue: step.phase === "verify" ? "✓" : "…", tone: "working", text };
}

function rehearsalCompleteMessage(phase, command) {
  if (phase === "observe") {
    const observation = mission.observation.collect(state.attemptBaseline, command);
    return { cue: "!", tone: "idea", text: `Aha! ${observation.summary}` };
  }
  if (phase === "decide") {
    const binding = mission.language.bindings[command];
    const observeCommand = state.lesson.acceptedSteps[0].command;
    const observation = mission.observation.collect(state.attemptBaseline, observeCommand);
    const evaluation = mission.conditions.evaluate(binding.conditionId, observation);
    const text = !evaluation.supported
      ? `I cannot use that condition yet. ${evaluation.reason}`
      : evaluation.met
        ? `Condition supported: ${evaluation.reason} I selected ${binding.selectedAction}.`
        : `Condition checked: ${evaluation.reason} That would select no response yet.`;
    return { cue: evaluation.supported && evaluation.met ? "💡" : "?", tone: evaluation.supported && evaluation.met ? "idea" : "question", text };
  }
  if (phase === "act") return { cue: "✓", tone: "idea", text: "Action ready. Line 3 will execute whatever Decide selects during the full run." };
  return { cue: "✓", tone: "idea", text: "The success check is ready. Now run the complete loop." };
}

function executionMessage(phaseIndex, result) {
  const entry = result.trace[phaseIndex] ?? result.trace.at(-1);
  return {
    cue: String(Math.min(phaseIndex + 1, 4)).padStart(2, "0"),
    tone: entry.outcome === "FAIL" || entry.outcome === "EVIDENCE_UNAVAILABLE" ? "warning" : entry.outcome === "WORLD_CHANGED" || entry.outcome === "PASS" ? "idea" : "working",
    text: `${entry.phase}: ${entry.message}`,
  };
}

function hintLineForPhase(index) {
  if (state.failureSeen && index === mission.language.repair.line - 1) return mission.language.repair.to;
  return mission.language.guidedProgram[index];
}

function resetBertForLesson(retainedCount) {
  const position = retainedCount > 0 ? LAYOUTS[mission.id].observe : LAYOUTS[mission.id].start;
  state.visual.bert = { ...position, moving: false, action: "idle" };
  state.visual.route = [];
  state.visual.routeVisible = false;
}

function setFact(element, text, tone) {
  let icon = element.querySelector("i");
  if (!icon) icon = document.createElement("i");
  icon.className = `fact-icon ${tone}`;
  element.replaceChildren(icon, document.createTextNode(text));
}

function seedForMission(definition) {
  return SEED_OVERRIDE ?? `${definition.id}-v1`;
}

function sceneIdForMission(missionId) {
  return missionId === "repair-east-channel" ? "east-channel" : missionId;
}

function query(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

state.ready = true;
state.domDirty = true;
render();

let previousFrame = performance.now();
function animationLoop(timestamp) {
  const delta = Math.min(50, timestamp - previousFrame);
  previousFrame = timestamp;
  if (!document.hidden) update(delta);
  requestAnimationFrame(animationLoop);
}
if (!TEST_MODE) requestAnimationFrame(animationLoop);
