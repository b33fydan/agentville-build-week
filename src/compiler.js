const PLAN_KIND = "agentville-safe-plan";
const MINTED_PLANS = new WeakSet();

export const PLAN_VERSION = 2;

export const PHASES = Object.freeze([
  "observe",
  "decide",
  "act",
  "verify",
]);

export const DECISION_BINDINGS = deepFreeze({
  "decide water tomatoes when dry": {
    condition: "tomatoes dry",
    selectedAction: "water tomatoes",
  },
  "decide clear blockage when blocked": {
    condition: "irrigation blocked",
    selectedAction: "clear blockage",
  },
});

export const ALLOWED_COMMANDS = deepFreeze({
  observe: ["observe irrigation"],
  decide: Object.keys(DECISION_BINDINGS),
  act: ["act chosen repair"],
  verify: ["verify tomatoes are watered"],
});

const LABELS = Object.freeze({
  "observe irrigation": "Observe the East Channel irrigation",
  "decide water tomatoes when dry":
    "Choose direct watering for dry tomatoes",
  "decide clear blockage when blocked":
    "Choose blockage removal when flow is blocked",
  "act chosen repair": "Carry out the response chosen on line 2",
  "verify tomatoes are watered":
    "Verify that all tomato beds are watered",
});

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
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }

  return value;
}

function issue(line, code, message, suggestion) {
  return deepFreeze({ line, code, message, suggestion });
}

function expectedSuggestion(phase) {
  const commands = ALLOWED_COMMANDS[phase];
  if (commands.length === 1) {
    return `Use exactly: ${commands[0]}`;
  }

  return `Use exactly one of: ${commands.join(" | ")}`;
}

function normalizeSource(source) {
  const normalizedLineEndings = source.replace(/\r\n?/gu, "\n");

  // A conventional final newline is not a fifth instruction. Additional
  // trailing newlines remain visible and are rejected as extra blank lines.
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

function validateLine(lineText, index) {
  const lineNumber = index + 1;
  const expectedPhase = PHASES[index];

  if (lineText.length === 0) {
    return issue(
      lineNumber,
      "BLANK_LINE",
      `Line ${lineNumber} cannot be blank; it must be the ${expectedPhase} phase.`,
      expectedSuggestion(expectedPhase),
    );
  }

  const unsafeIssue = findUnsafeIssue(lineText, lineNumber);
  if (unsafeIssue) {
    return unsafeIssue;
  }

  const enteredPhase = lineText.split(" ", 1)[0];
  if (PHASES.includes(enteredPhase) && enteredPhase !== expectedPhase) {
    return issue(
      lineNumber,
      "PHASE_ORDER",
      `Line ${lineNumber} starts with ${enteredPhase}, but ${expectedPhase} must come next.`,
      expectedSuggestion(expectedPhase),
    );
  }

  if (!PHASES.includes(enteredPhase)) {
    return issue(
      lineNumber,
      "UNKNOWN_PHASE",
      `“${enteredPhase || lineText}” is not an allowed phase.`,
      `Start line ${lineNumber} with ${expectedPhase}. ${expectedSuggestion(expectedPhase)}`,
    );
  }

  if (!ALLOWED_COMMANDS[expectedPhase].includes(lineText)) {
    const code =
      expectedPhase === "decide"
        ? "DECISION_NOT_ALLOWED"
        : expectedPhase === "act"
          ? "ACTION_NOT_ALLOWED"
          : "SYNTAX";
    const message =
      expectedPhase === "decide"
        ? `“${lineText}” is not an allowlisted decision.`
        : expectedPhase === "act"
          ? `“${lineText}” is not the allowlisted execution instruction.`
          : `Line ${lineNumber} does not match the ${expectedPhase} instruction.`;

    return issue(
      lineNumber,
      code,
      message,
      expectedSuggestion(expectedPhase),
    );
  }

  return null;
}

function buildPlan(source, lines) {
  const steps = buildSteps(lines);

  const plan = deepFreeze({
    kind: PLAN_KIND,
    version: PLAN_VERSION,
    source,
    steps,
    binding: buildDecisionBinding(lines),
  });
  MINTED_PLANS.add(plan);
  return plan;
}

function buildDecisionBinding(lines) {
  const decision = DECISION_BINDINGS[lines[1]];
  return {
    decisionLine: 2,
    decisionCommand: lines[1],
    condition: decision?.condition,
    selectedAction: decision?.selectedAction,
    actLine: 3,
    actCommand: lines[2],
  };
}

function buildSteps(lines) {
  return lines.map((command, index) => ({
    line: index + 1,
    phase: PHASES[index],
    command,
    label: LABELS[command],
  }));
}

/**
 * Validate an incomplete lesson program without creating an executable plan.
 * Prefix results are teaching records only; runMission accepts only the
 * four-line safe plan produced by compileProgram().
 *
 * @param {string} source Player-authored prefix containing one to four lines.
 * @returns {{ok: true, complete: boolean, acceptedCount: number, nextPhase: string|null, steps: object[]}|{ok: false, errors: object[]}}
 */
export function validateProgramPrefix(source) {
  if (typeof source !== "string") {
    return deepFreeze({
      ok: false,
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
    const lineIssue = validateLine(lines[index], index);
    if (lineIssue) errors.push(lineIssue);
  }

  for (let index = PHASES.length; index < lines.length; index += 1) {
    if (lines[index].length === 0) continue;
    const unsafeIssue = findUnsafeIssue(lines[index], index + 1);
    if (unsafeIssue) errors.push(unsafeIssue);
  }

  if (errors.length > 0) return deepFreeze({ ok: false, errors });

  return deepFreeze({
    ok: true,
    complete: lines.length === PHASES.length,
    acceptedCount: lines.length,
    nextPhase: PHASES[lines.length] ?? null,
    steps: buildSteps(lines),
  });
}

/**
 * Compile the four-line teaching language without evaluating player text.
 *
 * @param {string} source Player-authored program text.
 * @returns {{ok: true, plan: object}|{ok: false, errors: object[]}}
 */
export function compileProgram(source) {
  if (typeof source !== "string") {
    return deepFreeze({
      ok: false,
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
    const missingOrExtra =
      lines.length > PHASES.length
        ? `The program has ${lines.length} lines; extra lines are not allowed.`
        : `The program has ${lines.length} lines; all four phases are required.`;
    const expectedPhase = PHASES[Math.min(offendingLine - 1, PHASES.length - 1)];

    errors.push(
      issue(
        offendingLine,
        "LINE_COUNT",
        missingOrExtra,
        lines.length > PHASES.length
          ? "Remove every line after line 4."
          : expectedSuggestion(expectedPhase),
      ),
    );
  }

  for (let index = 0; index < Math.min(lines.length, PHASES.length); index += 1) {
    const lineIssue = validateLine(lines[index], index);
    if (lineIssue) {
      errors.push(lineIssue);
    }
  }

  // Inspect extra lines too, so a hidden comment or JavaScript payload gets a
  // precise diagnostic rather than only a structural line-count error.
  for (let index = PHASES.length; index < lines.length; index += 1) {
    if (lines[index].length === 0) {
      continue;
    }

    const unsafeIssue = findUnsafeIssue(lines[index], index + 1);
    if (unsafeIssue) {
      errors.push(unsafeIssue);
    }
  }

  if (errors.length > 0) {
    return deepFreeze({ ok: false, errors });
  }

  return deepFreeze({
    ok: true,
    plan: buildPlan(normalizedSource, lines),
  });
}

export const compile = compileProgram;

export function isSafePlan(plan) {
  if (
    !plan ||
    typeof plan !== "object" ||
    !MINTED_PLANS.has(plan) ||
    plan.kind !== PLAN_KIND ||
    plan.version !== PLAN_VERSION ||
    typeof plan.source !== "string" ||
    !Array.isArray(plan.steps) ||
    plan.steps.length !== PHASES.length ||
    !plan.binding ||
    typeof plan.binding !== "object"
  ) {
    return false;
  }

  const normalizedSource = normalizeSource(plan.source);
  if (normalizedSource !== plan.source) return false;
  const sourceLines = normalizedSource.split("\n");
  if (sourceLines.length !== PHASES.length) return false;

  const stepsAreSafe = plan.steps.every((step, index) => {
    const phase = PHASES[index];
    return (
      step &&
      step.line === index + 1 &&
      step.phase === phase &&
      step.command === sourceLines[index] &&
      ALLOWED_COMMANDS[phase].includes(step.command) &&
      step.label === LABELS[step.command]
    );
  });

  if (!stepsAreSafe) return false;

  const expectedBinding = buildDecisionBinding(sourceLines);
  return (
    plan.binding.decisionLine === expectedBinding.decisionLine &&
    plan.binding.decisionCommand === expectedBinding.decisionCommand &&
    plan.binding.condition === expectedBinding.condition &&
    plan.binding.selectedAction === expectedBinding.selectedAction &&
    plan.binding.actLine === expectedBinding.actLine &&
    plan.binding.actCommand === expectedBinding.actCommand
  );
}
