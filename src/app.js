import { PHASES, compileProgram, validateProgramPrefix } from "./compiler.js";
import { createLearningRecap } from "./debrief.js";
import {
  MISSION_NAME,
  createInitialMissionState,
  runMission,
  snapshotMissionState,
} from "./mission.js";
import { FarmRenderer, IRRIGATION_SIGN } from "./world.js";

const DRAFT_PROGRAM = [
  "observe irrigation",
  "decide if irrigation is blocked",
  "act water tomatoes",
  "verify tomatoes are watered",
].join("\n");
const DRAFT_LINES = Object.freeze(DRAFT_PROGRAM.split("\n"));

const REPAIR_ACTION = "act clear blockage";
const BERT_START = Object.freeze({ x: 2.2, y: 5.25 });
const OBSERVE_DESTINATION = Object.freeze({ x: 4.25, y: 3.45 });
const MISSION_DURATION_MS = 5 * 60 * 1000;
const EXECUTION_MARKS = Object.freeze([850, 1850, 3200, 4400]);
const EXECUTION_DURATION_MS = 5200;
const STAGES = Object.freeze(["inspect", "program", "failure", "repair", "proof"]);
const TEST_MODE = new URLSearchParams(window.location.search).get("test") === "1";
const SEED = new URLSearchParams(window.location.search).get("seed") || "east-channel-v1";

const elements = {
  app: query("#app"),
  debriefBackgroundTargets: [query(".topbar"), query(".stage-rail"), query(".workspace")],
  canvas: query("#farm-canvas"),
  missionClock: query("#mission-clock"),
  sessionLabel: query("#session-label"),
  stageItems: [...document.querySelectorAll("[data-stage]")],
  worldObjective: query("#world-objective"),
  factBlockage: query("#fact-blockage"),
  factCrops: query("#fact-crops"),
  blockageCallout: query("#blockage-callout"),
  bertTag: query("#bert-tag"),
  bertSpeech: query("#bert-speech"),
  bertCue: query("#bert-cue"),
  bertSpeechCopy: query("#bert-speech-copy"),
  agentBoundaryNote: query("#agent-boundary-note"),
  captionPhase: query("#caption-phase"),
  sceneCaption: query("#scene-caption"),
  startButton: query("#start-button"),
  motionToggle: query("#motion-toggle"),
  compilerBadge: query("#compiler-badge"),
  lessonStep: query("#lesson-step"),
  promptTitle: query("#prompt-title"),
  lessonCopy: query("#lesson-copy"),
  languageCard: query(".language-card"),
  languageReference: query("#language-reference"),
  hintButton: query("#hint-button"),
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
  receiptSession: query("#receipt-session"),
  receiptObserved: query("#receipt-observed"),
  receiptAction: query("#receipt-action"),
  receiptProof: query("#receipt-proof"),
  recapIntro: query("#recap-intro"),
  recapPhases: [...document.querySelectorAll("[data-recap-phase]")],
  recapTakeawayTitle: query("#recap-takeaway-title"),
  recapTakeawayCopy: query("#recap-takeaway-copy"),
  feedbackLink: query("#feedback-link"),
  copyReceipt: query("#copy-receipt"),
  resetButton: query("#reset-button"),
  announcer: query("#announcer"),
  verificationStatus: query("#verification-status-text"),
};

const renderer = new FarmRenderer(elements.canvas, {
  onResize: () => {
    if (elements.app.dataset.ready === "true") render();
  },
});
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

elements.app.dataset.testMode = String(TEST_MODE);

const state = {
  ready: false,
  mode: "welcome",
  stage: "inspect",
  seed: SEED,
  tick: 0,
  elapsedRuntimeMs: 0,
  elapsedMissionMs: 0,
  lastClockSecond: -1,
  sessionId: null,
  sessionCounter: 0,
  missionState: createInitialMissionState(),
  worldRevision: 0,
  source: "",
  compiledEditorSource: null,
  compileResult: null,
  compiledPlan: null,
  attemptCount: 0,
  failureSeen: false,
  failedSource: null,
  coach: null,
  verification: { status: "NOT_RUN", message: "Mission not started." },
  receipt: null,
  lastTrace: [],
  execution: null,
  lesson: createInitialLessonState(),
  reducedMotion: prefersReducedMotion.matches,
  visual: {
    bert: { ...BERT_START, moving: false, action: "idle" },
    route: [],
    routeVisible: false,
    cropsWatered: 0,
  },
  domDirty: true,
};

renderer.setReducedMotion(state.reducedMotion);
elements.motionToggle.setAttribute("aria-pressed", String(state.reducedMotion));
elements.motionToggle.textContent = state.reducedMotion ? "Use motion" : "Reduce motion";

elements.startButton.addEventListener("click", () => beginMission());
elements.hintButton.addEventListener("click", revealDraft);
elements.editor.addEventListener("input", onEditorInput);
elements.compileButton.addEventListener("click", compileCurrentProgram);
elements.runButton.addEventListener("click", runCurrentProgram);
elements.resetButton.addEventListener("click", () => beginMission({ replay: true }));
elements.copyReceipt.addEventListener("click", copyReceiptEvidence);
elements.motionToggle.addEventListener("click", toggleMotion);

document.addEventListener("keydown", (event) => {
  if (state.mode === "welcome" && event.key === "Enter") {
    event.preventDefault();
    beginMission();
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
  elements.motionToggle.setAttribute("aria-pressed", String(state.reducedMotion));
  elements.motionToggle.textContent = state.reducedMotion ? "Use motion" : "Reduce motion";
  render();
});

function beginMission({ replay = false } = {}) {
  state.sessionId = createSessionId();
  state.mode = "authoring";
  state.stage = "program";
  state.elapsedMissionMs = 0;
  state.lastClockSecond = -1;
  state.missionState = createInitialMissionState();
  state.worldRevision += 1;
  state.source = "";
  state.compiledEditorSource = null;
  state.compileResult = null;
  state.compiledPlan = null;
  state.attemptCount = 0;
  state.failureSeen = false;
  state.failedSource = null;
  state.coach = null;
  state.verification = { status: "NOT_RUN", message: "Teach Bert what to observe first." };
  state.receipt = null;
  state.lastTrace = [];
  state.execution = null;
  state.lesson = createInitialLessonState();
  state.visual = {
    bert: { ...BERT_START, moving: false, action: "idle" },
    route: [],
    routeVisible: false,
    cropsWatered: 0,
  };
  state.domDirty = true;

  elements.editor.value = "";
  elements.editor.disabled = false;
  elements.hintButton.disabled = false;
  elements.receiptPanel.hidden = true;
  elements.copyReceipt.textContent = "Copy receipt";
  render();
  announce(
    replay
      ? "Mission reset. Teach Bert what to observe first."
      : "Mission started. Teach Bert one instruction at a time, beginning with observe.",
  );
  requestAnimationFrame(() => elements.editor.focus());
}

function revealDraft() {
  const phaseIndex = lessonFocusIndex();
  state.lesson.hintedPhases[phaseIndex] = true;
  state.domDirty = true;
  render();
  announce(
    state.failureSeen
      ? `Repair hint revealed: ${REPAIR_ACTION}.`
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
    state.lastTrace = [];
  }

  if (!state.failureSeen) {
    const enteredLines = programLines(nextSource);
    let retainedCount = 0;
    while (
      retainedCount < state.lesson.acceptedSteps.length &&
      enteredLines[retainedCount] === state.lesson.acceptedSteps[retainedCount].command
    ) {
      retainedCount += 1;
    }

    if (retainedCount < state.lesson.acceptedSteps.length) {
      state.lesson.acceptedSteps = state.lesson.acceptedSteps.slice(0, retainedCount);
      state.lesson.validation = null;
      state.lesson.status = "prompt";
      state.lesson.evidenceLevel = retainedCount === 0 ? 0 : retainedCount === 1 ? 1 : 2;
      state.lesson.conceptVisible = retainedCount >= 2;
      state.lesson.bertMessage = promptForPhase(retainedCount);
      resetBertForLesson(retainedCount);
    }
  }

  if (state.failureSeen && nextSource !== state.failedSource) {
    state.mode = "repair";
    state.stage = "repair";
    state.lesson.status = "repair";
    state.lesson.bertMessage = repairFailureMessage();
    state.verification = {
      status: "FAIL",
      message: "0 of 3 tomato beds are watered; the blockage is still present.",
    };
  } else if (state.failureSeen) {
    state.mode = "failure";
    state.stage = "failure";
    state.lesson.status = "repair";
    state.lesson.bertMessage = repairFailureMessage();
    state.verification = {
      status: "FAIL",
      message: "0 of 3 tomato beds are watered; the blockage is still present.",
    };
  } else {
    state.mode = "authoring";
    state.stage = "program";
  }

  state.domDirty = true;
  render();
}

function compileCurrentProgram() {
  if (state.mode === "running" || state.lesson.status === "rehearsing") return;
  state.source = elements.editor.value;
  state.lastTrace = [];

  if (state.failureSeen || programLines(state.source).length === PHASES.length) {
    compileFullProgram();
    return;
  }

  let result = validateProgramPrefix(state.source);
  if (
    result.ok &&
    result.acceptedCount > state.lesson.acceptedSteps.length + 1
  ) {
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
    state.mode = "authoring";
    state.stage = "program";
    announce(`Compile stopped at line ${result.errors[0].line}. ${result.errors[0].suggestion}`);
    requestAnimationFrame(() => focusLine(result.errors[0].line));
  } else {
    const acceptedStep = result.steps.at(-1);
    state.lesson.acceptedSteps = result.steps;
    startLessonRehearsal(acceptedStep);
  }

  state.domDirty = true;
  render();
}

function compileFullProgram() {
  const result = compileProgram(state.source);
  state.compileResult = result;
  state.lesson.validation = null;
  state.lastTrace = [];

  if (!result.ok) {
    state.compiledPlan = null;
    state.compiledEditorSource = null;
    state.visual.routeVisible = false;
    state.verification = { status: "NOT_RUN", message: "Compiler stopped before world execution." };
    state.lesson.status = "error";
    state.lesson.bertMessage = state.failureSeen
      ? {
          cue: "?",
          tone: "question",
          text: "That repair is not ready yet. Which action changes the cause?",
        }
      : {
          cue: "?",
          tone: "question",
          text: questionAfterError(result.errors[0]),
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
    state.lesson.bertMessage = state.failureSeen
      ? {
          cue: "✓",
          tone: "idea",
          text: "That repair targets the cause. Let’s run the full loop again.",
        }
      : {
          cue: "✓",
          tone: "idea",
          text: "All four instructions are ready. I’ll run the full loop, then check the farm.",
        };
    state.mode = state.failureSeen ? "repair-ready" : "compiled";
    state.stage = state.failureSeen ? "repair" : "program";
    state.visual.route = routeForAction(result.plan.steps[2].command, BERT_START);
    state.visual.routeVisible = true;
    state.verification = { status: "READY", message: "Four safe phases compiled. World state has not changed yet." };
    announce("Compile succeeded. Four safe phases are ready to run as one complete agent loop.");
    requestAnimationFrame(() => elements.runButton.focus());
  }

  state.domDirty = true;
  render();
}

function startLessonRehearsal(step) {
  const durationMs = step.phase === "observe" ? 1450 : 950;
  const route =
    step.phase === "observe"
      ? [
          { x: state.visual.bert.x, y: state.visual.bert.y },
          { x: 3.25, y: 4.95 },
          { ...OBSERVE_DESTINATION },
        ]
      : [{ x: state.visual.bert.x, y: state.visual.bert.y }];
  state.lesson.status = "rehearsing";
  state.lesson.rehearsal = { elapsedMs: 0, durationMs, phase: step.phase, route };
  state.lesson.bertMessage = rehearsalStartMessage(step.phase);
  state.verification = {
    status: "NOT_RUN",
    message: `Line ${step.line} is safe teaching input. The farm has not changed.`,
  };
  state.visual.route = route;
  state.visual.routeVisible = step.phase === "observe";
  state.visual.bert.moving = step.phase === "observe";
  state.visual.bert.action = step.phase === "decide" ? "think" : "inspect";
  elements.editor.disabled = true;
  announce(`Line ${step.line} accepted for rehearsal. Authoritative world state is unchanged.`);
}

function runCurrentProgram() {
  if (!state.compiledPlan || state.mode === "running") return;
  const action = state.compiledPlan.steps[2].command;
  const result = runMission(state.compiledPlan, {
    sessionId: state.sessionId,
    state: state.missionState,
  });

  state.attemptCount += 1;
  state.mode = "running";
  state.lesson.status = "executing";
  state.lesson.conceptVisible = false;
  state.lesson.bertMessage = executionMessage(0, action);
  state.verification = { status: "RUNNING", message: "Bert is executing the compiled plan." };
  state.lastTrace = [];
  state.visual.bert = { ...BERT_START, moving: true, action: "inspect" };
  state.visual.route = routeForAction(action, BERT_START);
  state.visual.routeVisible = true;
  state.visual.bert.action = "inspect";
  state.visual.bert.moving = true;
  state.execution = {
    result,
    action,
    elapsedMs: 0,
    completedSteps: 0,
    route: state.visual.route,
    startedAtWorldRevision: state.worldRevision,
    visualCropCount: snapshotMissionState(state.missionState).tomatoBedsWatered,
  };
  elements.editor.disabled = true;
  state.domDirty = true;
  render();
  announce("Bert started executing the plan. The trace will advance one phase at a time.");
}

function update(deltaMs) {
  const safeDelta = Math.max(0, Math.min(deltaMs, 100));
  state.tick += 1;
  state.elapsedRuntimeMs += safeDelta;

  if (state.mode !== "welcome" && state.mode !== "proof") {
    state.elapsedMissionMs += safeDelta;
    const clockSecond = Math.floor(state.elapsedMissionMs / 1000);
    if (clockSecond !== state.lastClockSecond) {
      state.lastClockSecond = clockSecond;
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
    state.visual.bert.x = position.x;
    state.visual.bert.y = position.y;
    state.visual.bert.moving = progress < 1;
  } else {
    state.visual.bert.moving = false;
    state.visual.bert.action = rehearsal.phase === "decide" ? "think" : "inspect";
  }

  if (rehearsal.elapsedMs >= rehearsal.durationMs) finishLessonRehearsal(rehearsal.phase);
}

function finishLessonRehearsal(phase) {
  const phaseIndex = PHASES.indexOf(phase);
  state.lesson.rehearsal = null;
  state.lesson.status = "prompt";
  state.lesson.evidenceLevel = phaseIndex === 0 ? 1 : phaseIndex >= 1 ? 2 : state.lesson.evidenceLevel;
  state.lesson.conceptVisible = phaseIndex >= 1;
  state.lesson.bertMessage = rehearsalCompleteMessage(phase);
  state.visual.bert.moving = false;
  state.visual.bert.action = phase === "observe" ? "inspect" : phase === "decide" ? "think" : "idle";
  state.visual.routeVisible = false;
  elements.editor.disabled = false;

  if (state.lesson.acceptedSteps.length < PHASES.length && !elements.editor.value.endsWith("\n")) {
    elements.editor.value += "\n";
    state.source = elements.editor.value;
  }

  state.domDirty = true;
  render();
  announce(`${phase} accepted. ${PHASES[phaseIndex + 1]} is now unlocked.`);
  requestAnimationFrame(() => {
    elements.editor.focus();
    elements.editor.setSelectionRange(elements.editor.value.length, elements.editor.value.length);
  });
}

function updateExecution(deltaMs) {
  const execution = state.execution;
  execution.elapsedMs += deltaMs;

  const travelProgress = clamp(execution.elapsedMs / 3050, 0, 1);
  const nextPosition = positionAlongRoute(execution.route, travelProgress);
  state.visual.bert.x = nextPosition.x;
  state.visual.bert.y = nextPosition.y;
  state.visual.bert.moving = execution.elapsedMs < 3050;

  if (execution.elapsedMs < EXECUTION_MARKS[0]) state.visual.bert.action = "inspect";
  else if (execution.elapsedMs < EXECUTION_MARKS[2]) state.visual.bert.action = "think";
  else state.visual.bert.action = execution.action === REPAIR_ACTION ? "clear" : "water";

  while (
    execution.completedSteps < EXECUTION_MARKS.length &&
    execution.elapsedMs >= EXECUTION_MARKS[execution.completedSteps]
  ) {
    const completedIndex = execution.completedSteps;
    execution.completedSteps += 1;
    state.lastTrace = execution.result.trace.slice(0, execution.completedSteps);
    state.lesson.bertMessage = executionMessage(
      Math.min(execution.completedSteps, PHASES.length - 1),
      execution.action,
    );

    if (completedIndex === 2 && execution.action === REPAIR_ACTION) {
      state.missionState = execution.result.state;
      state.worldRevision += 1;
      execution.visualCropCount = 0;
    }

    state.domDirty = true;
  }

  if (execution.action === REPAIR_ACTION && execution.elapsedMs >= EXECUTION_MARKS[2]) {
    const waterTravel = clamp((execution.elapsedMs - EXECUTION_MARKS[2]) / 900, 0, 1);
    const nextCropCount = Math.min(3, Math.floor(waterTravel * 4));
    if (nextCropCount !== execution.visualCropCount) {
      execution.visualCropCount = nextCropCount;
      state.domDirty = true;
    }
    state.visual.cropsWatered = nextCropCount;
  }

  if (execution.elapsedMs >= EXECUTION_DURATION_MS) finishExecution();
}

function finishExecution() {
  const execution = state.execution;
  const result = execution.result;
  state.missionState = result.state;
  state.lastTrace = result.trace;
  state.visual.routeVisible = false;
  state.visual.bert.moving = false;
  state.visual.bert.action = "idle";
  state.visual.cropsWatered = result.receipt.after.tomatoBedsWatered;
  state.execution = null;

  if (result.receipt.verdict === "FAIL") {
    state.mode = "failure";
    state.stage = "failure";
    state.failureSeen = true;
    state.failedSource = state.source;
    state.lesson.status = "repair";
    state.lesson.conceptVisible = false;
    state.lesson.bertMessage = repairFailureMessage();
    state.compiledPlan = null;
    state.verification = {
      status: "FAIL",
      message: "0 of 3 tomato beds are watered; the blockage is still present.",
    };
    state.coach = {
      source: "Codex-authored deterministic coach",
      focusLine: 3,
      message: "Bert observed the blockage, but line 3 tried to water through it.",
      suggestion: REPAIR_ACTION,
    };
    elements.editor.disabled = false;
    announce("Verification failed. The blockage is still present. Repair line 3 by clearing the blockage first.");
  } else {
    state.mode = "proof";
    state.stage = "proof";
    state.verification = {
      status: "PASS",
      message: "The blockage is clear, water was released, and 3 of 3 tomato beds are watered.",
    };
    state.receipt = result.receipt;
    state.lesson.status = "complete";
    state.lesson.conceptVisible = false;
    state.lesson.bertMessage = {
      cue: "✓",
      tone: "idea",
      text: "Check passed: 3 of 3 tomato beds are watered.",
    };
    state.coach = {
      source: "Codex-authored deterministic coach",
      focusLine: 4,
      message: "Your program did more than run: verification inspected the changed farm.",
      suggestion: "Keep the receipt as evidence of cause and effect.",
    };
    elements.editor.disabled = true;
    preserveReceipt(result.receipt);
    announce("Verification passed. The East Channel is clear and all three tomato beds are watered.");
  }

  state.domDirty = true;
  render();
  if (state.receipt) requestAnimationFrame(() => elements.receiptPanel.focus({ preventScroll: true }));
}

function render() {
  const visualWorld = visualWorldState();
  renderer.render(visualWorld, state.elapsedRuntimeMs);

  if (state.domDirty) {
    state.domDirty = false;
    elements.app.dataset.mode = state.mode;
    elements.app.dataset.ready = String(state.ready);
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
    elements.verificationStatus.textContent = state.verification.status;
  }

  positionWorldLabels();
}

function renderStageRail() {
  const activeIndex = STAGES.indexOf(state.stage);
  for (const item of elements.stageItems) {
    const itemIndex = STAGES.indexOf(item.dataset.stage);
    item.classList.toggle("is-active", itemIndex === activeIndex);
    item.classList.toggle("is-complete", itemIndex < activeIndex);
    if (itemIndex < activeIndex) item.querySelector("span").textContent = "✓";
    else item.querySelector("span").textContent = String(itemIndex + 1);
    item.setAttribute("aria-current", itemIndex === activeIndex ? "step" : "false");
  }
}

function renderClock() {
  if (state.mode === "welcome") {
    elements.missionClock.textContent = "05:00 mission";
    elements.sessionLabel.textContent = "Session not started";
    return;
  }

  const remaining = Math.max(0, MISSION_DURATION_MS - state.elapsedMissionMs);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  elements.missionClock.textContent = remaining > 0 ? `${minutes}:${String(seconds).padStart(2, "0")} remaining` : "5+ min · keep learning";
  elements.sessionLabel.textContent = state.sessionId;
}

function renderWorldStatus(visualWorld) {
  const blocked = visualWorld.blocked;
  const watered = visualWorld.cropsWatered;
  const evidenceLevel =
    state.mode === "welcome" ? 0 : state.failureSeen || state.mode !== "authoring" ? 2 : state.lesson.evidenceLevel;
  const flowLabel = !blocked
    ? "Channel clear"
    : evidenceLevel >= 2
      ? "Channel blocked"
      : evidenceLevel === 1
        ? "Flow stopped"
        : "Irrigation unchecked";
  elements.factBlockage.lastChild.textContent = flowLabel;
  elements.factBlockage.classList.toggle("is-good", !blocked);
  elements.factCrops.lastChild.textContent = `${watered} / 3 watered`;
  elements.factCrops.classList.toggle("is-good", watered === 3);
  const showBlockageEvidence = blocked && evidenceLevel >= 1;
  elements.blockageCallout.hidden = !showBlockageEvidence;
  if (showBlockageEvidence) {
    elements.blockageCallout.querySelector("b").textContent = evidenceLevel >= 2 ? "Debris jam" : "Flow stopped";
    elements.blockageCallout.querySelector("small").textContent =
      evidenceLevel >= 2 ? "Water stops here" : "Something is in the channel";
  }
  elements.canvas.setAttribute(
    "aria-label",
    evidenceLevel === 0
      ? "A layered isometric voxel farm with three dry tomato beds. A block-built IRRIGATION sign marks the East Channel, and humanoid voxel farmhand Bert waits nearby."
      : blocked
        ? "A layered isometric voxel farm. The IRRIGATION sign marks the East Channel, where stopped water and debris are visible before three dry tomato beds. Humanoid voxel farmhand Bert is inspecting the channel."
        : "A layered isometric voxel farm. The East Channel is clear, water is flowing, and all three tomato beds are watered. Humanoid voxel farmhand Bert stands beside the repaired irrigation.",
  );

  const copy = {
    welcome: ["WORLD STATE", "Dry tomatoes · cause unknown"],
    authoring:
      evidenceLevel === 0
        ? ["OBSERVE", "Dry tomatoes · find the farm system"]
        : evidenceLevel === 1
          ? ["OBSERVED", "Water stops before the tomato beds"]
          : ["DECIDED", "The irrigation is blocked"],
    compiled: ["PLAN VISIBLE", "Cyan route preview · world unchanged"],
    running: ["EXECUTING", `Bert is running phase ${Math.min((state.execution?.completedSteps ?? 0) + 1, 4)} of 4`],
    failure: ["VERIFY · FAIL", "No water released · repair line 3"],
    repair: ["REPAIR", "Change the action, keep the evidence"],
    "repair-ready": ["PLAN REPAIRED", "Clear blockage → release water → verify"],
    proof: ["VERIFY · PASS", "Channel clear → 3 / 3 tomato beds watered"],
  }[state.mode] ?? ["WORLD STATE", "Dry tomatoes · cause unknown"];
  elements.captionPhase.textContent = copy[0];
  elements.sceneCaption.textContent = copy[1];

  if (state.mode === "proof") {
    elements.worldObjective.textContent = "Verified: water reached every tomato bed.";
  } else if (state.failureSeen) {
    elements.worldObjective.textContent = "The first plan was safe, but it did not change the farm.";
  } else if (evidenceLevel === 0) {
    elements.worldObjective.textContent = "Use the farm’s labels to tell Bert what to inspect first.";
  } else if (evidenceLevel === 1) {
    elements.worldObjective.textContent = "Bert found stopped water. Turn that evidence into a decision.";
  } else {
    elements.worldObjective.textContent = "Teach Bert what to do, then define how success will be checked.";
  }
}

function renderLesson() {
  const phaseIndex = lessonFocusIndex();
  const progressiveLessons = [
    ["Line 1 · Observe", "Tell Bert what to inspect.", "Begin with observe, then name something visible on the farm."],
    ["Line 2 · Decide", "Turn evidence into a condition.", "Tell Bert what question to answer about the irrigation."],
    ["Line 3 · Act", "Choose one safe action.", "A safe instruction can still produce the wrong result in the world."],
    ["Line 4 · Verify", "Define what success looks like.", "Tell Bert what fact must be true after he acts."],
  ];
  const lessons = {
    welcome: ["Step 1", "Inspect the farm first.", "Start the mission to open Bert's local workbench."],
    authoring:
      state.lesson.status === "rehearsing"
        ? [
            `Line ${phaseIndex + 1} · Rehearsal`,
            `Bert is trying ${PHASES[phaseIndex]}.`,
            "This preview teaches the step. Only a complete program can change the farm.",
          ]
        : progressiveLessons[phaseIndex],
    compiled: ["Plan · Ready", "Read the plan before it runs.", "Compilation proves the language is safe. Verification will prove whether it works."],
    running: ["Execution · Live", "Watch cause become effect.", "The trace and Bert advance together; the farm remains the source of truth."],
    failure: ["Step 3 · Diagnose", "The syntax passed. The world did not.", "Bert followed line 3, but water could not cross the debris. Repair that action."],
    repair: ["Step 4 · Repair", "Change one causal instruction.", `Use ${REPAIR_ACTION} on line 3. Keep observe, decide, and verify unchanged.`],
    "repair-ready": ["Repair · Ready", "The new plan addresses the cause.", "Run it again and let verification inspect the resulting farm."],
    proof: ["Step 5 · Proof", "World change verified.", "Your receipt records what Bert observed, changed, and proved."],
  };
  const [step, title, copy] = lessons[state.mode] ?? lessons.authoring;
  elements.lessonStep.textContent = step;
  elements.promptTitle.textContent = title;
  elements.lessonCopy.textContent = copy;
}

function renderLanguageReference() {
  const descriptions = [
    "read world state",
    "choose from evidence",
    "change one thing",
    "prove the outcome",
  ];
  const activeIndex = lessonFocusIndex();
  const hasActivePhase =
    state.mode === "authoring" || state.mode === "failure" || state.mode === "repair";

  elements.languageReference.replaceChildren(
    ...PHASES.map((phase, index) => {
      const item = document.createElement("li");
      const code = document.createElement("code");
      const description = document.createElement("span");
      const isComplete =
        index < state.lesson.acceptedSteps.length && !(state.failureSeen && index === 2);
      const isActive = hasActivePhase && index === activeIndex;
      const isHinted = state.lesson.hintedPhases[index] && isActive;
      const descriptionText = isHinted
        ? hintLineForPhase(index).slice(phase.length + 1)
        : isComplete
          ? "accepted · world unchanged"
          : descriptions[index];
      item.dataset.phase = phase;
      item.classList.toggle("is-complete", isComplete);
      item.classList.toggle("is-active", isActive);
      item.classList.toggle("is-locked", !isComplete && !isActive);
      item.classList.toggle("is-hinted", isHinted);
      item.setAttribute("aria-current", isActive ? "step" : "false");
      item.setAttribute(
        "aria-label",
        `${phase}: ${isComplete ? "accepted" : isActive ? "current instruction" : "locked"}. ${descriptionText}`,
      );
      code.textContent = phase;
      description.textContent = descriptionText;
      item.append(code, description);
      return item;
    }),
  );

  const promptIndex = lessonFocusIndex();
  const help = [
    "Tell Bert what to inspect. Begin with observe, then name something visible on the farm.",
    "Turn the stopped flow into a yes-or-no decision about the irrigation.",
    "Choose a safe action. Compilation checks safety; the farm will check effectiveness.",
    "Define the world fact that will prove the tomatoes were helped.",
  ];
  elements.editorHelp.textContent = state.failureSeen
    ? "Repair only line 3. Keep the evidence and success check unchanged."
    : help[promptIndex];
  elements.editor.placeholder = state.failureSeen
    ? "Repair line 3: act …"
    : `Line ${promptIndex + 1}: ${PHASES[promptIndex]} …`;

  const compileLabel = elements.compileButton.querySelector("span");
  compileLabel.textContent = state.failureSeen
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

  elements.agentBoundaryNote.hidden = !(
    state.lesson.conceptVisible &&
    ["authoring", "compiled"].includes(state.mode)
  );
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
  if (state.mode === "running") {
    elements.compilerBadge.textContent = "Executing";
    elements.compilerBadge.classList.add("is-good");
  } else if (state.verification.status === "PASS") {
    elements.compilerBadge.textContent = "Verified PASS";
    elements.compilerBadge.classList.add("is-good");
  } else if (state.verification.status === "FAIL") {
    elements.compilerBadge.textContent = "Verified FAIL";
    elements.compilerBadge.classList.add("is-bad");
  } else if (state.compileResult?.ok === true) {
    elements.compilerBadge.textContent = "Plan safe";
    elements.compilerBadge.classList.add("is-good");
  } else if (state.compileResult?.ok === false) {
    elements.compilerBadge.textContent = "Fix source";
    elements.compilerBadge.classList.add("is-bad");
  } else if (state.lesson.validation?.ok === false) {
    elements.compilerBadge.textContent = "Fix this line";
    elements.compilerBadge.classList.add("is-bad");
  } else if (state.lesson.acceptedSteps.length > 0) {
    elements.compilerBadge.textContent = `${state.lesson.acceptedSteps.length} / 4 safe`;
    elements.compilerBadge.classList.add("is-good");
  } else {
    elements.compilerBadge.textContent = state.mode === "welcome" ? "Waiting" : "Local compiler";
  }
}

function renderTrace() {
  elements.traceOutput.replaceChildren();
  let eventCount = 0;
  let coachInserted = false;
  let followTarget = null;

  const appendCoach = () => {
    if (!state.coach || coachInserted) return null;
    const coach = createCoachTrace(state.coach);
    elements.traceOutput.append(coach);
    coachInserted = true;
    eventCount += 1;
    return coach;
  };

  const teachingErrors =
    state.compileResult?.ok === false
      ? state.compileResult.errors
      : state.lesson.validation?.ok === false
        ? state.lesson.validation.errors
        : null;

  if (teachingErrors) {
    for (const error of teachingErrors) {
      elements.traceOutput.append(createErrorTrace(error));
      eventCount += 1;
    }
  } else if (state.mode === "running" && state.execution) {
    const currentIndex = Math.min(state.execution.completedSteps, 3);
    state.execution.result.trace.forEach((entry, index) => {
      const complete = index < state.execution.completedSteps;
      const status = complete ? outcomeClass(entry.outcome) : index === currentIndex ? "running" : "queued";
      const message = complete ? entry.message : index === currentIndex ? "Executing this phase…" : "Waiting for the previous phase.";
      const item = createTraceItem(entry, status, message);
      elements.traceOutput.append(item);
      if (index === currentIndex || (state.execution.completedSteps >= 4 && index === 3)) followTarget = item;
      eventCount += 1;
    });
  } else if (state.lastTrace.length > 0) {
    for (const entry of state.lastTrace) {
      const item = createTraceItem(entry, outcomeClass(entry.outcome), entry.message);
      elements.traceOutput.append(item);
      eventCount += 1;
      if (state.coach && entry.line === state.coach.focusLine) {
        followTarget = item;
        appendCoach();
      }
    }
  } else if (state.compiledPlan) {
    for (const step of state.compiledPlan.steps) {
      elements.traceOutput.append(createTraceItem(step, "planned", "Allowlisted and ready for execution."));
      eventCount += 1;
    }
  } else if (state.lesson.acceptedSteps.length > 0) {
    for (const step of state.lesson.acceptedSteps) {
      elements.traceOutput.append(
        createTraceItem(
          step,
          "learned",
          "Safe lesson step accepted. It cannot change the farm until the full program runs.",
        ),
      );
      eventCount += 1;
    }
  }

  const trailingCoach = appendCoach();
  if (!followTarget && trailingCoach) followTarget = trailingCoach;

  if (eventCount === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-trace";
    const mark = document.createElement("span");
    const copy = document.createElement("p");
    mark.textContent = "›_";
    copy.textContent =
      state.mode === "welcome"
        ? "Your plan will become visible here."
        : "Teach one line, check it, then watch Bert respond.";
    empty.append(mark, copy);
    elements.traceOutput.append(empty);
  }

  elements.traceCount.textContent = `${eventCount} ${eventCount === 1 ? "event" : "events"}`;
  if (followTarget) requestAnimationFrame(() => revealTraceTarget(followTarget));
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
  stateLabel.textContent = status;
  body.append(title, detail);
  item.append(index, body, stateLabel);
  return item;
}

function createCoachTrace(coachState) {
  const coach = document.createElement("div");
  coach.className = "coach-note";
  coach.dataset.testid = "coach-message";
  const mark = document.createElement("span");
  mark.textContent = "C";
  const body = document.createElement("div");
  const strong = document.createElement("strong");
  const message = document.createTextNode(` · ${coachState.message} `);
  const code = document.createElement("code");
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
  const targetTop = targetBounds.top - outputBounds.top + elements.traceOutput.scrollTop;
  elements.traceOutput.scrollTop = Math.max(0, targetTop - 6);
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
  const sameAcceptedPrefix =
    !state.failureSeen &&
    enteredLines.length === state.lesson.acceptedSteps.length &&
    enteredLines.every((line, index) => line === state.lesson.acceptedSteps[index]?.command);
  elements.compileButton.disabled =
    state.mode === "welcome" ||
    state.mode === "running" ||
    state.lesson.status === "rehearsing" ||
    !hasSource ||
    sameFailedSource ||
    sameAcceptedPrefix;
  elements.runButton.disabled = state.mode === "running" || !state.compiledPlan || state.compiledEditorSource !== elements.editor.value;
  const hintIndex = lessonFocusIndex();
  elements.hintButton.textContent = state.lesson.hintedPhases[hintIndex]
    ? "Hint shown"
    : state.failureSeen
      ? "Hint repair"
      : "Hint this line";
  elements.hintButton.disabled =
    state.mode === "welcome" ||
    state.mode === "running" ||
    state.lesson.status === "rehearsing" ||
    state.mode === "compiled" ||
    state.mode === "repair-ready" ||
    state.lesson.hintedPhases[hintIndex];
}

function renderReceipt() {
  if (!state.receipt) {
    for (const target of elements.debriefBackgroundTargets) target.inert = false;
    elements.receiptPanel.hidden = true;
    return;
  }

  for (const target of elements.debriefBackgroundTargets) target.inert = true;
  const recap = createLearningRecap(state.receipt, { failureSeen: state.failureSeen });
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

  elements.receiptSession.textContent = state.receipt.sessionId;
  elements.receiptObserved.textContent = "East Channel blocked · 3 beds dry";
  elements.receiptAction.textContent = state.receipt.action;
  elements.receiptProof.textContent = "blocked true → false · watered 0 → 3";
  elements.feedbackLink.href = `./feedback/?session_id=${encodeURIComponent(state.receipt.sessionId)}`;
  elements.receiptPanel.hidden = false;
}

function visualWorldState() {
  const snapshot = snapshotMissionState(state.missionState);
  const blockageRevealed =
    state.mode !== "welcome" &&
    (state.failureSeen || state.mode !== "authoring" || state.lesson.evidenceLevel >= 1);
  return {
    blocked: snapshot.irrigationBlocked,
    blockageRevealed,
    cropsWatered: state.execution?.action === REPAIR_ACTION ? state.execution.visualCropCount : state.visual.cropsWatered || snapshot.tomatoBedsWatered,
    routeVisible: state.visual.routeVisible,
    route: state.visual.route,
    bert: state.visual.bert,
  };
}

function positionWorldLabels() {
  const blockage = renderer.project(4.1, 3.02, 1.05);
  const presentation = renderer.presentationSnapshot();
  const bertBounds = presentation?.bert?.screenBounds ?? null;
  const paddedBert = bertBounds
    ? {
        left: bertBounds.left - 12,
        top: bertBounds.top - 12,
        right: bertBounds.right + 12,
        bottom: bertBounds.bottom + 12,
      }
    : null;
  const sign = renderer.project(IRRIGATION_SIGN.position.x, IRRIGATION_SIGN.position.y, 1.15);
  const sceneExclusions = [
    { left: 12, top: 12, right: Math.min(renderer.width * 0.48, 420), bottom: 172 },
    { left: sign.x - 42, top: sign.y - 25, right: sign.x + 82, bottom: sign.y + 30 },
    { left: 8, top: renderer.height - 58, right: renderer.width - 8, bottom: renderer.height - 6 },
    ...(paddedBert ? [paddedBert] : []),
  ];
  const blockageWidth = elements.blockageCallout.offsetWidth || 132;
  const blockageHeight = elements.blockageCallout.offsetHeight || 48;
  const blockageCandidates = [
    { left: blockage.x + 34, top: blockage.y - blockageHeight - 28 },
    { left: blockage.x - blockageWidth - 34, top: blockage.y - blockageHeight - 28 },
    { left: blockage.x + 38, top: blockage.y + 18 },
    { left: blockage.x - blockageWidth - 38, top: blockage.y + 18 },
  ].map((candidate, index) => ({
    index,
    left: clamp(candidate.left, 12, renderer.width - blockageWidth - 12),
    top: clamp(candidate.top, 88, renderer.height - blockageHeight - 58),
  }));
  const scoredBlockage = blockageCandidates.map((candidate) => {
    const rect = {
      left: candidate.left,
      top: candidate.top,
      right: candidate.left + blockageWidth,
      bottom: candidate.top + blockageHeight,
    };
    return {
      ...candidate,
      rect,
      score: sceneExclusions.reduce((total, exclusion) => total + overlapArea(rect, exclusion), 0) + candidate.index * 12,
    };
  });
  scoredBlockage.sort((a, b) => a.score - b.score);
  const blockagePlacement = scoredBlockage[0];
  elements.blockageCallout.style.left = `${blockagePlacement.left}px`;
  elements.blockageCallout.style.top = `${blockagePlacement.top}px`;

  const bert = renderer.getBertAnchor(state.visual.bert);
  const bertTagWidth = elements.bertTag.offsetWidth || 104;
  elements.bertTag.style.left = `${clamp(bert.x - bertTagWidth - 14, 10, renderer.width - bertTagWidth - 10)}px`;
  elements.bertTag.style.top = `${clamp(bert.y - 8, 80, renderer.height - 60)}px`;

  if (!elements.bertSpeech.hidden) {
    const bubbleWidth = Math.min(elements.bertSpeech.offsetWidth || 236, 236);
    const bubbleHeight = elements.bertSpeech.offsetHeight || 72;
    const candidates = [
      { left: bert.x + 22, top: bert.y + 12 },
      { left: bert.x - bubbleWidth - 22, top: bert.y + 12 },
      { left: bert.x + 22, top: bert.y - bubbleHeight - 24 },
      { left: bert.x - bubbleWidth - 22, top: bert.y - bubbleHeight - 24 },
    ].map((candidate, index) => ({
      index,
      left: clamp(candidate.left, 12, renderer.width - bubbleWidth - 12),
      top: clamp(candidate.top, 90, renderer.height - bubbleHeight - 56),
    }));
    const exclusions = [
      { left: 12, top: 12, right: Math.min(renderer.width * 0.48, 420), bottom: 172 },
      { left: sign.x - 42, top: sign.y - 25, right: sign.x + 82, bottom: sign.y + 30 },
      blockagePlacement.rect,
      { left: 8, top: renderer.height - 58, right: renderer.width - 8, bottom: renderer.height - 6 },
      ...(paddedBert ? [paddedBert] : []),
    ];
    const scored = candidates.map((candidate) => {
      const rect = {
        left: candidate.left,
        top: candidate.top,
        right: candidate.left + bubbleWidth,
        bottom: candidate.top + bubbleHeight,
      };
      const overlap = exclusions.reduce((total, exclusion) => total + overlapArea(rect, exclusion), 0);
      return { ...candidate, score: overlap + candidate.index * 20 };
    });
    scored.sort((a, b) => a.score - b.score);
    elements.bertSpeech.style.left = `${scored[0].left}px`;
    elements.bertSpeech.style.top = `${scored[0].top}px`;
  }
}

function routeForAction(action, start) {
  const origin = { x: start.x, y: start.y };
  if (action === REPAIR_ACTION) {
    return [origin, { x: 4.9, y: 5 }, { x: 5, y: 4.15 }, { x: 4.15, y: 3.15 }];
  }
  return [origin, { x: 3.4, y: 5.05 }, { x: 4.8, y: 5.02 }, { x: 5.6, y: 4.55 }, { x: 6.15, y: 4.22 }];
}

function positionAlongRoute(route, progress) {
  if (route.length === 0) return { ...BERT_START };
  if (route.length === 1) return route[0];
  const scaled = clamp(progress, 0, 1) * (route.length - 1);
  const index = Math.min(Math.floor(scaled), route.length - 2);
  const local = scaled - index;
  return {
    x: lerp(route[index].x, route[index + 1].x, local),
    y: lerp(route[index].y, route[index + 1].y, local),
  };
}

function overlapArea(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function outcomeClass(outcome) {
  if (outcome === "PASS" || outcome === "WORLD_CHANGED") return "pass";
  if (outcome === "FAIL" || outcome === "NO_CHANGE") return "fail";
  return "complete";
}

function focusLine(lineNumber) {
  const lines = elements.editor.value.split("\n");
  const start = lines.slice(0, lineNumber - 1).reduce((length, line) => length + line.length + 1, 0);
  const end = start + (lines[lineNumber - 1]?.length ?? 0);
  elements.editor.focus();
  elements.editor.setSelectionRange(start, end);
}

function toggleMotion() {
  state.reducedMotion = !state.reducedMotion;
  renderer.setReducedMotion(state.reducedMotion);
  elements.motionToggle.setAttribute("aria-pressed", String(state.reducedMotion));
  elements.motionToggle.textContent = state.reducedMotion ? "Use motion" : "Reduce motion";
  render();
}

async function copyReceiptEvidence() {
  if (!state.receipt) return;
  const payload = `${JSON.stringify({ schema: "agentville.receipt.v1", ...state.receipt }, null, 2)}\n`;
  try {
    await navigator.clipboard.writeText(payload);
    elements.copyReceipt.textContent = "Receipt copied";
  } catch {
    elements.copyReceipt.textContent = "Copy unavailable";
  }
}

function preserveReceipt(receipt) {
  try {
    localStorage.setItem("agentville:lastReceipt", JSON.stringify(receipt));
  } catch {
    // Storage is evidence convenience, never a mission-critical dependency.
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
  const plan = state.compiledPlan?.steps.map(({ line, phase, command, label }) => ({ line, phase, command, label })) ?? [];
  const compileError = state.compileResult?.ok === false ? state.compileResult.errors[0] : null;
  const visibleWorld = visualWorldState();
  const learningRecap = createLearningRecap(state.receipt, { failureSeen: state.failureSeen });
  return {
    schemaVersion: 1,
    ready: state.ready,
    mode: state.mode,
    stage: state.stage,
    seed: state.seed,
    tick: state.tick,
    coordinates: "Isometric farm grid: origin northwest; x runs southeast, y runs southwest.",
    session: {
      id: state.sessionId,
      mission: MISSION_NAME,
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
        error:
          state.lesson.validation?.ok === false
            ? {
                line: state.lesson.validation.errors[0].line,
                code: state.lesson.validation.errors[0].code,
                suggestion: state.lesson.validation.errors[0].suggestion,
              }
            : null,
      },
      plan,
    },
    lesson: {
      status: state.lesson.status,
      currentPhase:
        state.lesson.rehearsal
          ? state.lesson.rehearsal.phase
          : ["failure", "repair"].includes(state.mode)
            ? "act"
            : state.lesson.acceptedSteps.length >= PHASES.length
              ? null
              : PHASES[state.lesson.acceptedSteps.length],
      acceptedCommands: state.lesson.acceptedSteps.map((step) => step.command),
      evidenceLevel: state.lesson.evidenceLevel,
      conceptVisible: state.lesson.conceptVisible,
      rehearsal: state.lesson.rehearsal
        ? {
            phase: state.lesson.rehearsal.phase,
            elapsedMs: Math.round(state.lesson.rehearsal.elapsedMs),
            durationMs: state.lesson.rehearsal.durationMs,
          }
        : null,
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
      worldHash: `${state.seed}:B${Number(world.irrigationBlocked)}:W${Number(world.waterReleased)}:C${world.tomatoBedsWatered}`,
      blockage: world.irrigationBlocked ? "debris-present" : "cleared",
      eastChannel: world.waterReleased ? "flowing" : world.irrigationBlocked ? "blocked" : "idle",
      tomatoBeds: { watered: world.tomatoBedsWatered, total: world.tomatoBedsTotal },
      visibleTomatoBedsWatered: visibleWorld.cropsWatered,
      landmarks: [
        {
          id: IRRIGATION_SIGN.id,
          label: IRRIGATION_SIGN.label,
          pointsTo: IRRIGATION_SIGN.pointsTo,
          position: { ...IRRIGATION_SIGN.position },
        },
      ],
    },
    presentation: renderer.presentationSnapshot(),
    trace: state.lastTrace.map(({ line, phase, command, outcome, message }) => ({ line, phase, command, outcome, message })),
    verification: { ...state.verification },
    coach: state.coach ? { ...state.coach } : null,
    receipt: state.receipt ? structuredClone(state.receipt) : null,
    learningRecap: learningRecap ? structuredClone(learningRecap) : null,
    nextLesson:
      state.receipt?.verdict === "PASS"
        ? {
            id: "lesson-02-weather-window",
            status: "TEASER",
            signal: "Rain reaches AgentVille soon.",
            objective: "Plant the east field before the soil turns muddy.",
          }
        : null,
    feedbackHref: state.receipt ? new URL(elements.feedbackLink.href, window.location.href).href : null,
  };
}

window.render_game_to_text = () => JSON.stringify(snapshotForAutomation());
window.advanceTime = (milliseconds) => {
  const requested = Number(milliseconds);
  if (!Number.isFinite(requested) || requested < 0) throw new TypeError("advanceTime expects a non-negative number of milliseconds.");
  const step = 1000 / 60;
  let remaining = requested;
  if (remaining === 0) render();
  while (remaining > 0) {
    const delta = Math.min(step, remaining);
    update(delta);
    remaining -= delta;
  }
  return window.render_game_to_text();
};
window.__agentville = Object.freeze({ snapshot: snapshotForAutomation });

let previousFrame = performance.now();
function animationLoop(timestamp) {
  const delta = Math.min(50, timestamp - previousFrame);
  previousFrame = timestamp;
  if (!document.hidden) update(delta);
  requestAnimationFrame(animationLoop);
}

state.ready = true;
state.domDirty = true;
render();
if (!TEST_MODE) requestAnimationFrame(animationLoop);

function createInitialLessonState() {
  return {
    acceptedSteps: [],
    status: "prompt",
    validation: null,
    rehearsal: null,
    evidenceLevel: 0,
    conceptVisible: false,
    hintedPhases: [false, false, false, false],
    bertMessage: null,
  };
}

function programLines(source) {
  if (typeof source !== "string" || source.length === 0) return [];
  const normalized = source.replace(/\r\n?/gu, "\n");
  const withoutTerminalNewline = normalized.endsWith("\n")
    ? normalized.slice(0, -1)
    : normalized;
  return withoutTerminalNewline.length === 0 ? [] : withoutTerminalNewline.split("\n");
}

function lessonFocusIndex() {
  if (state.failureSeen) return 2;
  const error =
    state.compileResult?.ok === false
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
  const allowedPrefix = line === 1 ? "line 1" : `lines 1–${line}`;
  const error = Object.freeze({
    line,
    code: "LINE_LOCKED",
    message: `Check line ${line} (${phase}) before adding later instructions.`,
    suggestion: `Keep only ${allowedPrefix}, then check ${phase}.`,
  });
  return Object.freeze({ ok: false, errors: Object.freeze([error]) });
}

function repairFailureMessage() {
  return {
    cue: "!",
    tone: "warning",
    text: "I followed line 3—but water can’t pass the debris. Which action changes the cause?",
  };
}

function questionAfterError(error) {
  const phase = PHASES[Math.min(Math.max((error?.line ?? 1) - 1, 0), PHASES.length - 1)];
  const questions = {
    observe: "Hmm… the tomatoes need water. What farm system should I inspect first?",
    decide: "Water should be flowing, but it isn’t. What should I conclude from that evidence?",
    act: "The irrigation is blocked. What safe action should I try?",
    verify: "How will we prove the tomatoes were actually helped?",
  };
  return questions[phase];
}

function promptForPhase(index) {
  const prompts = [
    null,
    {
      cue: "?",
      tone: "question",
      text: "Water should be flowing, but it isn’t. What should I conclude from that evidence?",
    },
    {
      cue: "💡",
      tone: "idea",
      text: "Decision: the irrigation is blocked. What safe action should I try?",
    },
    {
      cue: "?",
      tone: "question",
      text: "How will we prove the tomatoes were actually helped?",
    },
  ];
  return prompts[index] ?? null;
}

function rehearsalStartMessage(phase) {
  const messages = {
    observe: { cue: "…", tone: "working", text: "I’m checking the irrigation system…" },
    decide: { cue: "…", tone: "working", text: "I’m comparing the stopped flow with the tomato beds…" },
    act: { cue: "→", tone: "working", text: "I’m reading the action you chose…" },
    verify: { cue: "✓", tone: "working", text: "I’m preparing the success check…" },
  };
  return messages[phase];
}

function rehearsalCompleteMessage(phase) {
  const messages = {
    observe: {
      cue: "!",
      tone: "idea",
      text: "Aha! This irrigation channel feeds the tomatoes—but water stops before the beds.",
    },
    decide: {
      cue: "💡",
      tone: "idea",
      text: "Decision: the irrigation is blocked. What action should I try?",
    },
    act: {
      cue: "✓",
      tone: "idea",
      text: "Safe action ready. Now tell me how we’ll prove it worked.",
    },
    verify: {
      cue: "✓",
      tone: "idea",
      text: "The success check is ready. Now I can run the complete loop.",
    },
  };
  return messages[phase];
}

function executionMessage(phaseIndex, action) {
  const messages = [
    { cue: "01", tone: "working", text: "Observe: I’m inspecting the irrigation." },
    { cue: "02", tone: "idea", text: "Decide: the evidence says the irrigation is blocked." },
    {
      cue: "03",
      tone: action === REPAIR_ACTION ? "idea" : "working",
      text:
        action === REPAIR_ACTION
          ? "Act: I’m clearing the blockage—the cause."
          : "Act: I’m trying line 3 and watering the tomatoes.",
    },
    { cue: "04", tone: "working", text: "Verify: I’m checking all three tomato beds." },
  ];
  return messages[phaseIndex];
}

function hintLineForPhase(index) {
  if (state.failureSeen && index === 2) return REPAIR_ACTION;
  return DRAFT_LINES[index];
}

function resetBertForLesson(retainedCount) {
  const position = retainedCount > 0 ? OBSERVE_DESTINATION : BERT_START;
  state.visual.bert = { ...position, moving: false, action: "idle" };
  state.visual.route = [];
  state.visual.routeVisible = false;
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
