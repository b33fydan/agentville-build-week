import {
  DEFAULT_MISSION_ID,
  getMissionDefinition,
} from "./mission-registry.js";

const PLAN_KIND = "agentville-safe-plan";
const MINTED_PLANS = new WeakSet();

export const PLAN_VERSION = 3;
export const PHASES = Object.freeze(["observe", "decide", "act", "verify"]);

const COMMENT_MARKERS = Object.freeze([
  { pattern: /\/\//u, token: "//" },
  { pattern: /\/\*/u, token: "/*" },
  { pattern: /\*\//u, token: "*/" },
  { pattern: /#/u, token: "#" },
]);

const FORBIDDEN_WORD =
  /\b(?:eval|function|fetch|xmlhttprequest|websocket|import|export|require|process|globalthis|window|document|localstorage|sessionstorage|indexeddb|filesystem|file|fs|http|https|while|for|do|loop|repeat|class|new|this|prototype|constructor)\b/iu;

const FORBIDDEN_PUNCTUATION = /(?:=>|[;{}()[\]`'"\\]|\$\{)/u;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function resolveMission(options = {}) {
  const missionId =
    typeof options === "string"
      ? options
      : options?.missionId ?? DEFAULT_MISSION_ID;
  return getMissionDefinition(missionId);
}

function projectAllowedCommands(mission) {
  return deepFreeze(
    Object.fromEntries(
      PHASES.map((phase) => [phase, [...mission.language.commands[phase]]]),
    ),
  );
}

function projectDecisionBindings(mission) {
  return deepFreeze(
    Object.fromEntries(
      Object.entries(mission.language.bindings).map(([command, binding]) => [
        command,
        {
          condition: binding.conditionText,
          conditionId: binding.conditionId,
          selectedAction: binding.selectedAction,
        },
      ]),
    ),
  );
}

const DEFAULT_MISSION = resolveMission();

// Compatibility projections for the original Mission 01 API. New code should
// resolve the active mission through getLanguageContract().
export const ALLOWED_COMMANDS = projectAllowedCommands(DEFAULT_MISSION);
export const DECISION_BINDINGS = projectDecisionBindings(DEFAULT_MISSION);

export function getLanguageContract(missionId = DEFAULT_MISSION_ID) {
  const mission = getMissionDefinition(missionId);
  return deepFreeze({
    missionId: mission.id,
    phases: PHASES,
    allowedCommands: projectAllowedCommands(mission),
    decisionBindings: projectDecisionBindings(mission),
    labels: mission.language.labels,
  });
}

function issue(line, code, message, suggestion) {
  return deepFreeze({ line, code, message, suggestion });
}

function expectedSuggestion(mission, phase) {
  const commands = mission.language.commands[phase];
  if (commands.length === 1) return `Use exactly: ${commands[0]}`;
  return `Use exactly one of: ${commands.join(" | ")}`;
}

function normalizeSource(source) {
  const normalizedLineEndings = source.replace(/\r\n?/gu, "\n");
  return normalizedLineEndings.endsWith("\n")
    ? normalizedLineEndings.slice(0, -1)
    : normalizedLineEndings;
}

function findUnsafeIssue(lineText, lineNumber) {
  for (const marker of COMMENT_MARKERS) {
    if (marker.pattern.test(lineText)) {
      return issue(
        lineNumber,
        "COMMENT_NOT_ALLOWED",
        `Comments (${marker.token}) are not part of this four-line language.`,
        "Remove the comment and keep only the allowlisted instruction.",
      );
    }
  }

  const forbiddenWord = lineText.match(FORBIDDEN_WORD)?.[0];
  if (forbiddenWord) {
    return issue(
      lineNumber,
      "FORBIDDEN_TOKEN",
      `“${forbiddenWord}” is forbidden in player programs.`,
      "Use only observe, decide, act, and verify instructions from the mission.",
    );
  }

  const forbiddenPunctuation = lineText.match(FORBIDDEN_PUNCTUATION)?.[0];
  if (forbiddenPunctuation) {
    return issue(
      lineNumber,
      "FORBIDDEN_TOKEN",
      `“${forbiddenPunctuation}” is not allowed in the teaching language.`,
      "Remove JavaScript punctuation and use one plain allowlisted instruction.",
    );
  }

  if (/[^a-z ]/u.test(lineText)) {
    return issue(
      lineNumber,
      "FORBIDDEN_TOKEN",
      "Only lowercase words and single spaces are allowed.",
      "Retype the line using the exact lowercase instruction shown in the lesson.",
    );
  }

  return null;
}

function validateLine(mission, lineText, index) {
  const lineNumber = index + 1;
  const expectedPhase = PHASES[index];

  if (lineText.length === 0) {
    return issue(
      lineNumber,
      "BLANK_LINE",
      `Line ${lineNumber} cannot be blank; it must be the ${expectedPhase} phase.`,
      expectedSuggestion(mission, expectedPhase),
    );
  }

  const unsafeIssue = findUnsafeIssue(lineText, lineNumber);
  if (unsafeIssue) return unsafeIssue;

  const enteredPhase = lineText.split(" ", 1)[0];
  if (PHASES.includes(enteredPhase) && enteredPhase !== expectedPhase) {
    return issue(
      lineNumber,
      "PHASE_ORDER",
      `Line ${lineNumber} starts with ${enteredPhase}, but ${expectedPhase} must come next.`,
      expectedSuggestion(mission, expectedPhase),
    );
  }

  if (!PHASES.includes(enteredPhase)) {
    return issue(
      lineNumber,
      "UNKNOWN_PHASE",
      `“${enteredPhase || lineText}” is not an allowed phase.`,
      `Start line ${lineNumber} with ${expectedPhase}. ${expectedSuggestion(mission, expectedPhase)}`,
    );
  }

  if (!mission.language.commands[expectedPhase].includes(lineText)) {
    const code =
      expectedPhase === "decide"
        ? "DECISION_NOT_ALLOWED"
        : expectedPhase === "act"
          ? "ACTION_NOT_ALLOWED"
          : "SYNTAX";
    const message =
      expectedPhase === "decide"
        ? `“${lineText}” is not an allowlisted decision for ${mission.name}.`
        : expectedPhase === "act"
          ? `“${lineText}” is not the shared execution instruction.`
          : `Line ${lineNumber} does not match the ${expectedPhase} instruction for ${mission.name}.`;
    return issue(
      lineNumber,
      code,
      message,
      expectedSuggestion(mission, expectedPhase),
    );
  }

  return null;
}

function buildSteps(mission, lines) {
  return lines.map((command, index) => ({
    line: index + 1,
    phase: PHASES[index],
    command,
    label: mission.language.labels[command],
  }));
}

function buildBindings(mission, lines) {
  const decision = mission.language.bindings[lines[1]];
  return {
    observe: {
      line: 1,
      command: lines[0],
      observationId: lines[0],
    },
    decide: {
      line: 2,
      command: lines[1],
      conditionId: decision.conditionId,
      conditionText: decision.conditionText,
      selectedAction: decision.selectedAction,
    },
    act: {
      line: 3,
      command: lines[2],
    },
    verify: {
      line: 4,
      command: lines[3],
      verifyId: lines[3],
    },
  };
}

function legacyDecisionBinding(bindings) {
  return {
    decisionLine: bindings.decide.line,
    decisionCommand: bindings.decide.command,
    condition: bindings.decide.conditionText,
    conditionId: bindings.decide.conditionId,
    selectedAction: bindings.decide.selectedAction,
    actLine: bindings.act.line,
    actCommand: bindings.act.command,
  };
}

function buildPlan(mission, source, lines) {
  const bindings = buildBindings(mission, lines);
  const plan = deepFreeze({
    kind: PLAN_KIND,
    version: PLAN_VERSION,
    missionId: mission.id,
    missionVersion: 1,
    source,
    steps: buildSteps(mission, lines),
    bindings,
    binding: legacyDecisionBinding(bindings),
  });
  MINTED_PLANS.add(plan);
  return plan;
}

/**
 * Validate an incomplete lesson program without minting an executable plan.
 */
export function validateProgramPrefix(source, options = {}) {
  const mission = resolveMission(options);
  if (typeof source !== "string") {
    return deepFreeze({
      ok: false,
      missionId: mission.id,
      errors: [
        issue(
          1,
          "SOURCE_TYPE",
          "The lesson program must be plain text.",
          "Enter a text line beginning with observe.",
        ),
      ],
    });
  }

  const normalizedSource = normalizeSource(source);
  const lines = normalizedSource.split("\n");
  const errors = [];

  if (lines.length > PHASES.length) {
    errors.push(
      issue(
        PHASES.length + 1,
        "LINE_COUNT",
        `The lesson program has ${lines.length} lines; extra lines are not allowed.`,
        "Remove every line after line 4.",
      ),
    );
  }

  for (let index = 0; index < Math.min(lines.length, PHASES.length); index += 1) {
    const lineIssue = validateLine(mission, lines[index], index);
    if (lineIssue) errors.push(lineIssue);
  }

  for (let index = PHASES.length; index < lines.length; index += 1) {
    if (lines[index].length === 0) continue;
    const unsafeIssue = findUnsafeIssue(lines[index], index + 1);
    if (unsafeIssue) errors.push(unsafeIssue);
  }

  if (errors.length > 0) {
    return deepFreeze({ ok: false, missionId: mission.id, errors });
  }

  return deepFreeze({
    ok: true,
    missionId: mission.id,
    complete: lines.length === PHASES.length,
    acceptedCount: lines.length,
    nextPhase: PHASES[lines.length] ?? null,
    steps: buildSteps(mission, lines),
  });
}

/**
 * Compile the four-line teaching language without evaluating player text.
 */
export function compileProgram(source, options = {}) {
  const mission = resolveMission(options);
  if (typeof source !== "string") {
    return deepFreeze({
      ok: false,
      missionId: mission.id,
      errors: [
        issue(
          1,
          "SOURCE_TYPE",
          "The program must be plain text.",
          "Enter four text lines beginning with observe, decide, act, and verify.",
        ),
      ],
    });
  }

  const normalizedSource = normalizeSource(source);
  const lines = normalizedSource.split("\n");
  const errors = [];

  if (lines.length !== PHASES.length) {
    const offendingLine =
      lines.length > PHASES.length ? PHASES.length + 1 : lines.length + 1;
    const expectedPhase = PHASES[Math.min(offendingLine - 1, PHASES.length - 1)];
    errors.push(
      issue(
        offendingLine,
        "LINE_COUNT",
        lines.length > PHASES.length
          ? `The program has ${lines.length} lines; extra lines are not allowed.`
          : `The program has ${lines.length} lines; all four phases are required.`,
        lines.length > PHASES.length
          ? "Remove every line after line 4."
          : expectedSuggestion(mission, expectedPhase),
      ),
    );
  }

  for (let index = 0; index < Math.min(lines.length, PHASES.length); index += 1) {
    const lineIssue = validateLine(mission, lines[index], index);
    if (lineIssue) errors.push(lineIssue);
  }

  for (let index = PHASES.length; index < lines.length; index += 1) {
    if (lines[index].length === 0) continue;
    const unsafeIssue = findUnsafeIssue(lines[index], index + 1);
    if (unsafeIssue) errors.push(unsafeIssue);
  }

  if (errors.length > 0) {
    return deepFreeze({ ok: false, missionId: mission.id, errors });
  }

  return deepFreeze({
    ok: true,
    missionId: mission.id,
    plan: buildPlan(mission, normalizedSource, lines),
  });
}

export const compile = compileProgram;

export function isSafePlan(plan, options = {}) {
  if (
    !plan ||
    typeof plan !== "object" ||
    !MINTED_PLANS.has(plan) ||
    plan.kind !== PLAN_KIND ||
    plan.version !== PLAN_VERSION ||
    plan.missionVersion !== 1 ||
    typeof plan.missionId !== "string" ||
    typeof plan.source !== "string" ||
    !Array.isArray(plan.steps) ||
    plan.steps.length !== PHASES.length ||
    !plan.bindings ||
    !plan.binding
  ) {
    return false;
  }

  let mission;
  try {
    mission = getMissionDefinition(plan.missionId);
  } catch {
    return false;
  }

  const requestedMissionId =
    typeof options === "string" ? options : options?.missionId;
  if (requestedMissionId !== undefined && requestedMissionId !== mission.id) {
    return false;
  }

  const normalizedSource = normalizeSource(plan.source);
  if (normalizedSource !== plan.source) return false;
  const lines = normalizedSource.split("\n");
  if (lines.length !== PHASES.length) return false;

  const stepsAreSafe = plan.steps.every((step, index) => {
    const phase = PHASES[index];
    return (
      step &&
      step.line === index + 1 &&
      step.phase === phase &&
      step.command === lines[index] &&
      mission.language.commands[phase].includes(step.command) &&
      step.label === mission.language.labels[step.command]
    );
  });
  if (!stepsAreSafe) return false;

  const expectedBindings = buildBindings(mission, lines);
  const expectedLegacy = legacyDecisionBinding(expectedBindings);
  return (
    JSON.stringify(plan.bindings) === JSON.stringify(expectedBindings) &&
    JSON.stringify(plan.binding) === JSON.stringify(expectedLegacy)
  );
}
