import { PHASES, compileProgram } from "./compiler.js";
import {
  MISSION_NAME,
  createInitialMissionState,
  runMission,
  snapshotMissionState,
} from "./mission.js";
import { FarmRenderer } from "./world.js";

const DRAFT_PROGRAM = [
  "observe irrigation",
  "decide if irrigation is blocked",
  "act water tomatoes",
  "verify tomatoes are watered",
].join("\n");

const REPAIR_ACTION = "act clear blockage";
const MISSION_DURATION_MS = 5 * 60 * 1000;
const EXECUTION_MARKS = Object.freeze([700, 1550, 2750, 4100]);
const EXECUTION_DURATION_MS = 4300;
const STAGES = Object.freeze(["inspect", "program", "failure", "repair", "proof"]);
const TEST_MODE = new URLSearchParams(window.location.search).get("test") === "1";
const SEED = new URLSearchParams(window.location.search).get("seed") || "east-channel-v1";

const elements = {
  app: query("#app"),
  canvas: query("#farm-canvas"),
  missionClock: query("#mission-clock"),
  sessionLabel: query("#session-label"),
  stageItems: [...document.querySelectorAll("[data-stage]")],
  worldObjective: query("#world-objective"),
  factBlockage: query("#fact-blockage"),
  factCrops: query("#fact-crops"),
  blockageCallout: query("#blockage-callout"),
  bertTag: query("#bert-tag"),
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
  editorStatus: query("#editor-status"),
  lineNumbers: query("#line-numbers"),
  traceOutput: query("#trace-output"),
  traceCount: query("#trace-count"),
  compileButton: query("#compile-button"),
  runButton: query("#run-button"),
  receiptPanel: query("#receipt-panel"),
  receiptSession: query("#receipt-session"),
  receiptObserved: query("#receipt-observed"),
  receiptAction: query("#receipt-action"),
  receiptProof: query("#receipt-proof"),
  feedbackLink: query("#feedback-link"),
  copyReceipt: query("#copy-receipt"),
  resetButton: query("#reset-button"),
  announcer: query("#announcer"),
  verificationStatus: query("#verification-status-text"),
};

const renderer = new FarmRenderer(elements.canvas);
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
  hintRevealed: false,
  reducedMotion: prefersReducedMotion.matches,
  visual: {
    bert: { x: 2.2, y: 5.25, moving: false, action: "idle" },
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
  state.verification = { status: "NOT_RUN", message: "Write and run the first plan." };
  state.receipt = null;
  state.lastTrace = [];
  state.execution = null;
  state.hintRevealed = false;
  state.visual = {
    bert: { x: 2.2, y: 5.25, moving: false, action: "idle" },
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
  resetLanguageReference();
  render();
  announce(replay ? "Mission reset. The East Channel is blocked again." : "Mission started. Type the four-line draft in the Agent Workbench.");
  requestAnimationFrame(() => elements.editor.focus());
}

function revealDraft() {
  state.hintRevealed = true;
  elements.languageCard.classList.add("is-revealed");
  elements.languageReference.replaceChildren(
    ...DRAFT_PROGRAM.split("\n").map((line) => {
      const item = document.createElement("li");
      const code = document.createElement("code");
      const note = document.createElement("span");
      code.textContent = line.split(" ")[0];
      note.textContent = line.slice(line.indexOf(" ") + 1);
      item.append(code, note);
      return item;
    }),
  );
  elements.hintButton.textContent = "Draft shown";
  elements.hintButton.disabled = true;
  announce("Starter draft revealed. Type each line into the editor.");
}

function resetLanguageReference() {
  const descriptions = ["read world state", "choose from evidence", "change one thing", "prove the outcome"];
  elements.languageReference.replaceChildren(
    ...PHASES.map((phase, index) => {
      const item = document.createElement("li");
      const code = document.createElement("code");
      const description = document.createElement("span");
      code.textContent = phase;
      description.textContent = descriptions[index];
      item.append(code, description);
      return item;
    }),
  );
  elements.languageCard.classList.remove("is-revealed");
  elements.hintButton.textContent = "Show draft";
}

function onEditorInput() {
  if (state.mode === "running") return;
  const nextSource = elements.editor.value;
  const sourceChanged = nextSource !== state.source;
  state.source = nextSource;

  if (sourceChanged && state.compiledPlan?.source !== nextSource) {
    state.compileResult = null;
    state.compiledPlan = null;
    state.compiledEditorSource = null;
    state.visual.routeVisible = false;
    state.lastTrace = [];
  }

  if (state.failureSeen && nextSource !== state.failedSource) {
    state.mode = "repair";
    state.stage = "repair";
  } else if (!state.failureSeen) {
    state.mode = "authoring";
    state.stage = "program";
  }

  state.domDirty = true;
  render();
}

function compileCurrentProgram() {
  if (state.mode === "running") return;
  state.source = elements.editor.value;
  const result = compileProgram(state.source);
  state.compileResult = result;
  state.lastTrace = [];

  if (!result.ok) {
    state.compiledPlan = null;
    state.compiledEditorSource = null;
    state.visual.routeVisible = false;
    state.verification = { status: "NOT_RUN", message: "Compiler stopped before world execution." };
    state.mode = state.failureSeen ? "repair" : "authoring";
    state.stage = state.failureSeen ? "repair" : "program";
    announce(`Compile stopped at line ${result.errors[0].line}. ${result.errors[0].suggestion}`);
  } else {
    state.compiledPlan = result.plan;
    state.compiledEditorSource = state.source;
    state.mode = state.failureSeen ? "repair-ready" : "compiled";
    state.stage = state.failureSeen ? "repair" : "program";
    state.visual.route = routeForAction(result.plan.steps[2].command, state.visual.bert);
    state.visual.routeVisible = true;
    state.verification = { status: "READY", message: "Four safe phases compiled. World state has not changed yet." };
    announce("Compile succeeded. Four safe phases are ready to run with Bert.");
  }

  state.domDirty = true;
  render();
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
  state.verification = { status: "RUNNING", message: "Bert is executing the compiled plan." };
  state.lastTrace = [];
  state.visual.route = routeForAction(action, state.visual.bert);
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

  if (state.execution) updateExecution(safeDelta);
  render();
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
}

function render() {
  const visualWorld = visualWorldState();
  renderer.render(visualWorld, state.elapsedRuntimeMs);
  positionWorldLabels();

  if (!state.domDirty) return;
  state.domDirty = false;
  elements.app.dataset.mode = state.mode;
  elements.app.dataset.ready = String(state.ready);
  renderStageRail();
  renderClock();
  renderWorldStatus(visualWorld);
  renderLesson();
  renderEditorStatus();
  renderCompilerBadge();
  renderTrace();
  renderControls();
  renderReceipt();
  elements.verificationStatus.textContent = state.verification.status;
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
  elements.factBlockage.lastChild.textContent = blocked ? "Channel blocked" : "Channel clear";
  elements.factBlockage.classList.toggle("is-good", !blocked);
  elements.factCrops.lastChild.textContent = `${watered} / 3 watered`;
  elements.factCrops.classList.toggle("is-good", watered === 3);
  elements.blockageCallout.style.opacity = blocked ? "1" : "0";
  elements.blockageCallout.style.transform = blocked ? "translateY(0)" : "translateY(-8px)";

  const copy = {
    welcome: ["WORLD STATE", "Blocked channel → dry tomatoes"],
    authoring: ["OBSERVE", "The debris stops every downstream segment"],
    compiled: ["PLAN VISIBLE", "Cyan route preview · world unchanged"],
    running: ["EXECUTING", `Bert is running phase ${Math.min((state.execution?.completedSteps ?? 0) + 1, 4)} of 4`],
    failure: ["VERIFY · FAIL", "No water released · repair line 3"],
    repair: ["REPAIR", "Change the action, keep the evidence"],
    "repair-ready": ["PLAN REPAIRED", "Clear blockage → release water → verify"],
    proof: ["VERIFY · PASS", "Channel clear → 3 / 3 tomato beds watered"],
  }[state.mode] ?? ["WORLD STATE", "Blocked channel → dry tomatoes"];
  elements.captionPhase.textContent = copy[0];
  elements.sceneCaption.textContent = copy[1];

  if (state.mode === "proof") {
    elements.worldObjective.textContent = "Verified: water reached every tomato bed.";
  } else if (state.failureSeen) {
    elements.worldObjective.textContent = "The first plan was safe, but it did not change the farm.";
  } else {
    elements.worldObjective.textContent = "Inspect the channel, program Bert, and prove the water arrives.";
  }
}

function renderLesson() {
  const lessons = {
    welcome: ["Step 1", "Inspect the farm first.", "Start the mission to open Bert's local workbench."],
    authoring: ["Step 2 · Program", "Write a four-phase draft.", "Use the phases in order. Let the first action try to water the tomatoes."],
    compiled: ["Plan · Ready", "Read the plan before it runs.", "Compilation proves the language is safe. Verification will prove whether it works."],
    running: ["Execution · Live", "Watch cause become effect.", "The trace and Bert advance together; the farm remains the source of truth."],
    failure: ["Step 3 · Diagnose", "The syntax passed. The world did not.", "Line 3 tried to water through debris. Replace that action, then compile again."],
    repair: ["Step 4 · Repair", "Change one causal instruction.", `Use ${REPAIR_ACTION} on line 3. Keep observe, decide, and verify unchanged.`],
    "repair-ready": ["Repair · Ready", "The new plan addresses the cause.", "Run it again and let verification inspect the resulting farm."],
    proof: ["Step 5 · Proof", "World change verified.", "Your receipt records what Bert observed, changed, and proved."],
  };
  const [step, title, copy] = lessons[state.mode] ?? lessons.authoring;
  elements.lessonStep.textContent = step;
  elements.promptTitle.textContent = title;
  elements.lessonCopy.textContent = copy;
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
  } else {
    elements.compilerBadge.textContent = state.mode === "welcome" ? "Waiting" : "Local compiler";
  }
}

function renderTrace() {
  elements.traceOutput.replaceChildren();
  let eventCount = 0;

  if (state.compileResult?.ok === false) {
    for (const error of state.compileResult.errors) {
      elements.traceOutput.append(createErrorTrace(error));
      eventCount += 1;
    }
  } else if (state.mode === "running" && state.execution) {
    const currentIndex = Math.min(state.execution.completedSteps, 3);
    state.execution.result.trace.forEach((entry, index) => {
      const complete = index < state.execution.completedSteps;
      const status = complete ? outcomeClass(entry.outcome) : index === currentIndex ? "running" : "queued";
      const message = complete ? entry.message : index === currentIndex ? "Executing this phase…" : "Waiting for the previous phase.";
      elements.traceOutput.append(createTraceItem(entry, status, message));
      eventCount += 1;
    });
  } else if (state.lastTrace.length > 0) {
    for (const entry of state.lastTrace) {
      elements.traceOutput.append(createTraceItem(entry, outcomeClass(entry.outcome), entry.message));
      eventCount += 1;
    }
  } else if (state.compiledPlan) {
    for (const step of state.compiledPlan.steps) {
      elements.traceOutput.append(createTraceItem(step, "planned", "Allowlisted and ready for execution."));
      eventCount += 1;
    }
  }

  if (state.coach) {
    const coach = document.createElement("div");
    coach.className = "coach-note";
    coach.dataset.testid = "coach-message";
    const mark = document.createElement("span");
    mark.textContent = "C";
    const body = document.createElement("div");
    const strong = document.createElement("strong");
    const message = document.createTextNode(` · ${state.coach.message} `);
    const code = document.createElement("code");
    strong.textContent = "CODEX COACH";
    code.textContent = state.coach.suggestion;
    body.append(strong, message, code);
    coach.append(mark, body);
    elements.traceOutput.append(coach);
    eventCount += 1;
  }

  if (eventCount === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-trace";
    const mark = document.createElement("span");
    const copy = document.createElement("p");
    mark.textContent = "›_";
    copy.textContent = state.mode === "welcome" ? "Your plan will become visible here." : "Type the draft, then compile it into a plan.";
    empty.append(mark, copy);
    elements.traceOutput.append(empty);
  }

  elements.traceCount.textContent = `${eventCount} ${eventCount === 1 ? "event" : "events"}`;
}

function createTraceItem(entry, status, message) {
  const item = document.createElement("div");
  item.className = `trace-item is-${status}`;
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
  elements.compileButton.disabled = state.mode === "welcome" || state.mode === "running" || !hasSource || sameFailedSource;
  elements.runButton.disabled = state.mode === "running" || !state.compiledPlan || state.compiledEditorSource !== elements.editor.value;
  elements.hintButton.disabled = state.mode === "welcome" || state.hintRevealed;
}

function renderReceipt() {
  if (!state.receipt) {
    elements.receiptPanel.hidden = true;
    return;
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
  return {
    blocked: snapshot.irrigationBlocked,
    cropsWatered: state.execution?.action === REPAIR_ACTION ? state.execution.visualCropCount : state.visual.cropsWatered || snapshot.tomatoBedsWatered,
    routeVisible: state.visual.routeVisible,
    route: state.visual.route,
    bert: state.visual.bert,
  };
}

function positionWorldLabels() {
  const blockage = renderer.project(4.1, 3.02, 1.05);
  elements.blockageCallout.style.left = `${clamp(blockage.x + 12, 12, renderer.width - 135)}px`;
  elements.blockageCallout.style.top = `${clamp(blockage.y - 32, 88, renderer.height - 80)}px`;
  const bert = renderer.project(state.visual.bert.x, state.visual.bert.y, 1.28);
  elements.bertTag.style.left = `${clamp(bert.x + 12, 10, renderer.width - 80)}px`;
  elements.bertTag.style.top = `${clamp(bert.y - 18, 80, renderer.height - 60)}px`;
}

function routeForAction(action, start) {
  const origin = { x: start.x, y: start.y };
  if (action === REPAIR_ACTION) {
    return [origin, { x: 4.9, y: 5 }, { x: 5, y: 4.15 }, { x: 4.15, y: 3.15 }];
  }
  return [origin, { x: 3.4, y: 5.05 }, { x: 4.8, y: 5.02 }, { x: 5.6, y: 4.55 }, { x: 6.15, y: 4.22 }];
}

function positionAlongRoute(route, progress) {
  if (route.length === 0) return { x: 2.2, y: 5.25 };
  if (route.length === 1) return route[0];
  const scaled = clamp(progress, 0, 1) * (route.length - 1);
  const index = Math.min(Math.floor(scaled), route.length - 2);
  const local = scaled - index;
  return {
    x: lerp(route[index].x, route[index + 1].x, local),
    y: lerp(route[index].y, route[index + 1].y, local),
  };
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
      plan,
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
    },
    trace: state.lastTrace.map(({ line, phase, command, outcome, message }) => ({ line, phase, command, outcome, message })),
    verification: { ...state.verification },
    coach: state.coach ? { ...state.coach } : null,
    receipt: state.receipt ? structuredClone(state.receipt) : null,
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
