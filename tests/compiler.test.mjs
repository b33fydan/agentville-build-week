import test from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_COMMANDS,
  DECISION_BINDINGS,
  PHASES,
  compile,
  compileProgram,
  isSafePlan,
  validateProgramPrefix,
} from "../src/compiler.js";

const SYMPTOM_PROGRAM = [
  "observe irrigation",
  "decide water tomatoes when dry",
  "act chosen repair",
  "verify tomatoes are watered",
].join("\n");

const REPAIR_PROGRAM = SYMPTOM_PROGRAM.replace(
  "decide water tomatoes when dry",
  "decide clear blockage when blocked",
);

function errorWithCode(result, code) {
  assert.equal(result.ok, false);
  const error = result.errors.find((candidate) => candidate.code === code);
  assert.ok(error, `Expected ${code}; received ${JSON.stringify(result.errors)}`);
  return error;
}

test("compiler binds either allowlisted decision to the shared Act instruction", () => {
  for (const [source, expectedDecision, condition, selectedAction] of [
    [SYMPTOM_PROGRAM, "decide water tomatoes when dry", "tomatoes dry", "water tomatoes"],
    [REPAIR_PROGRAM, "decide clear blockage when blocked", "irrigation blocked", "clear blockage"],
  ]) {
    const result = compileProgram(source);

    assert.equal(result.ok, true);
    assert.equal(result.plan.kind, "agentville-safe-plan");
    assert.deepEqual(
      result.plan.steps.map(({ line, phase, command }) => ({
        line,
        phase,
        command,
      })),
      [
        { line: 1, phase: "observe", command: "observe irrigation" },
        {
          line: 2,
          phase: "decide",
          command: expectedDecision,
        },
        { line: 3, phase: "act", command: "act chosen repair" },
        {
          line: 4,
          phase: "verify",
          command: "verify tomatoes are watered",
        },
      ],
    );
    assert.deepEqual(result.plan.binding, {
      decisionLine: 2,
      decisionCommand: expectedDecision,
      condition,
      selectedAction,
      actLine: 3,
      actCommand: "act chosen repair",
    });
    assert.ok(
      result.plan.steps.every(
        (step) => typeof step.label === "string" && step.label.length > 12,
      ),
      "Every accepted step exposes a readable UI label",
    );
    assert.equal(isSafePlan(result.plan), true);
  }

  assert.equal(compile, compileProgram);
  assert.deepEqual(PHASES, ["observe", "decide", "act", "verify"]);
  assert.deepEqual(ALLOWED_COMMANDS.decide, [
    "decide water tomatoes when dry",
    "decide clear blockage when blocked",
  ]);
  assert.deepEqual(ALLOWED_COMMANDS.act, ["act chosen repair"]);
  assert.deepEqual(DECISION_BINDINGS, {
    "decide water tomatoes when dry": {
      condition: "tomatoes dry",
      selectedAction: "water tomatoes",
    },
    "decide clear blockage when blocked": {
      condition: "irrigation blocked",
      selectedAction: "clear blockage",
    },
  });
});

test("compiler accepts CRLF and one conventional terminal newline", () => {
  const source = `${REPAIR_PROGRAM.replaceAll("\n", "\r\n")}\r\n`;
  const result = compileProgram(source);

  assert.equal(result.ok, true);
  assert.equal(result.plan.source, REPAIR_PROGRAM);
});

test("lesson prefixes validate safely without creating executable plans", () => {
  const lines = SYMPTOM_PROGRAM.split("\n");

  for (let count = 1; count <= 4; count += 1) {
    const result = validateProgramPrefix(lines.slice(0, count).join("\n"));
    assert.equal(result.ok, true);
    assert.equal(result.acceptedCount, count);
    assert.equal(result.complete, count === 4);
    assert.equal(result.nextPhase, PHASES[count] ?? null);
    assert.equal(result.steps.length, count);
    assert.equal("plan" in result, false);
    assert.equal("kind" in result, false);
    assert.equal(isSafePlan(result), false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.steps), true);
    assert.ok(result.steps.every(Object.isFrozen));
  }
});

test("lesson prefixes reuse strict order and sandbox diagnostics", () => {
  const wrongOrder = validateProgramPrefix("decide water tomatoes when dry");
  const orderError = errorWithCode(wrongOrder, "PHASE_ORDER");
  assert.equal(orderError.line, 1);
  assert.match(orderError.suggestion, /observe irrigation/u);

  const unsafe = validateProgramPrefix("observe irrigation\nact fetch farm");
  const unsafeError = errorWithCode(unsafe, "FORBIDDEN_TOKEN");
  assert.equal(unsafeError.line, 2);
  assert.equal("plan" in unsafe, false);

  const extra = validateProgramPrefix(`${SYMPTOM_PROGRAM}\nact chosen repair`);
  errorWithCode(extra, "LINE_COUNT");
});

test("successful compiler output is deeply immutable", () => {
  const result = compileProgram(REPAIR_PROGRAM);
  assert.equal(result.ok, true);

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.plan), true);
    assert.equal(Object.isFrozen(result.plan.steps), true);
    assert.equal(Object.isFrozen(result.plan.steps[0]), true);
    assert.equal(Object.isFrozen(result.plan.binding), true);
    assert.equal(Object.isFrozen(ALLOWED_COMMANDS), true);
    assert.equal(Object.isFrozen(ALLOWED_COMMANDS.act), true);
  assert.equal(Object.isFrozen(DECISION_BINDINGS), true);
  assert.equal(Object.isFrozen(DECISION_BINDINGS["decide clear blockage when blocked"]), true);

  assert.throws(() => result.plan.steps.push({}), TypeError);
  assert.throws(
    () => {
      result.plan.binding.selectedAction = "eval";
    },
    TypeError,
  );
  assert.equal(result.plan.binding.selectedAction, "clear blockage");
});

test("wrong phase order reports the exact lines and repairs", () => {
  const source = [
    "decide clear blockage when blocked",
    "observe irrigation",
    "act chosen repair",
    "verify tomatoes are watered",
  ].join("\n");
  const result = compileProgram(source);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map(({ line, code }) => ({ line, code })),
    [
      { line: 1, code: "PHASE_ORDER" },
      { line: 2, code: "PHASE_ORDER" },
    ],
  );
  assert.match(result.errors[0].suggestion, /observe irrigation/u);
  assert.match(result.errors[1].suggestion, /decide water tomatoes when dry/u);
});

test("syntax and unsupported actions include concrete line-level suggestions", () => {
  const badObserve = compileProgram(
    SYMPTOM_PROGRAM.replace("observe irrigation", "observe the irrigation"),
  );
  const syntax = errorWithCode(badObserve, "SYNTAX");
  assert.equal(syntax.line, 1);
  assert.match(syntax.message, /observe/u);
  assert.match(syntax.suggestion, /observe irrigation/u);

  const badDecision = compileProgram(
    SYMPTOM_PROGRAM.replace(
      "decide water tomatoes when dry",
      "decide harvest tomatoes when dry",
    ),
  );
  const decision = errorWithCode(badDecision, "DECISION_NOT_ALLOWED");
  assert.equal(decision.line, 2);
  assert.match(decision.suggestion, /decide water tomatoes when dry/u);
  assert.match(decision.suggestion, /decide clear blockage when blocked/u);

  const badAction = compileProgram(
    SYMPTOM_PROGRAM.replace("act chosen repair", "act clear blockage"),
  );
  const action = errorWithCode(badAction, "ACTION_NOT_ALLOWED");
  assert.equal(action.line, 3);
  assert.match(action.suggestion, /act chosen repair/u);
});

test("legacy diagnosis and concrete Act commands fail closed", () => {
  const oldDiagnosis = compileProgram(
    SYMPTOM_PROGRAM.replace(
      "decide water tomatoes when dry",
      "decide if irrigation is blocked",
    ),
  );
  assert.equal(errorWithCode(oldDiagnosis, "DECISION_NOT_ALLOWED").line, 2);

  for (const oldAction of ["act water tomatoes", "act clear blockage"]) {
    const result = compileProgram(
      SYMPTOM_PROGRAM.replace("act chosen repair", oldAction),
    );
    assert.equal(errorWithCode(result, "ACTION_NOT_ALLOWED").line, 3);
    assert.equal("plan" in result, false);
  }
});

test("comments are rejected on program and extra lines", () => {
  for (const source of [
      SYMPTOM_PROGRAM.replace(
      "observe irrigation",
      "observe irrigation // inspect first",
    ),
      SYMPTOM_PROGRAM.replace(
        "act chosen repair",
        "act chosen repair /* maybe */",
    ),
      SYMPTOM_PROGRAM.replace(
      "verify tomatoes are watered",
      "verify tomatoes are watered # done",
    ),
      `${SYMPTOM_PROGRAM}\n// hidden fifth line`,
  ]) {
    const error = errorWithCode(
      compileProgram(source),
      "COMMENT_NOT_ALLOWED",
    );
    assert.ok(error.line >= 1);
    assert.match(error.suggestion, /Remove the comment/u);
  }
});

test("missing, blank, and extra instructions cannot compile", () => {
  const missing = compileProgram(SYMPTOM_PROGRAM.split("\n").slice(0, 3).join("\n"));
  const missingError = errorWithCode(missing, "LINE_COUNT");
  assert.equal(missingError.line, 4);
  assert.match(missingError.suggestion, /verify tomatoes are watered/u);

  const blank = compileProgram(
    SYMPTOM_PROGRAM.replace("decide water tomatoes when dry", ""),
  );
  const blankError = errorWithCode(blank, "BLANK_LINE");
  assert.equal(blankError.line, 2);
  assert.match(blankError.suggestion, /decide water tomatoes when dry/u);

  const extra = compileProgram(`${SYMPTOM_PROGRAM}\nact chosen repair`);
  const extraError = errorWithCode(extra, "LINE_COUNT");
  assert.equal(extraError.line, 5);
  assert.match(extraError.suggestion, /after line 4/u);

  const twoTerminalNewlines = compileProgram(`${SYMPTOM_PROGRAM}\n\n`);
  errorWithCode(twoTerminalNewlines, "LINE_COUNT");
});

test("loops, JavaScript, network, and file primitives are rejected", () => {
  const payloads = [
    "act while blocked",
    "act for tomatoes",
    "act loop forever",
    "act chosen repair; fetch(url)",
    "act chosen repair; XMLHttpRequest()",
    "act chosen repair; WebSocket()",
    "act chosen repair; eval(source)",
    "act chosen repair; Function(source)",
    "act chosen repair; import fs",
    "act chosen repair; require(fs)",
    "act chosen repair; process exit",
    "act chosen repair; window location",
    "act chosen repair; document cookie",
    "act chosen repair; file write",
    "act chosen repair => tomatoes",
  ];

  for (const payload of payloads) {
    const result = compileProgram(
      SYMPTOM_PROGRAM.replace("act chosen repair", payload),
    );
    const error = errorWithCode(result, "FORBIDDEN_TOKEN");
    assert.equal(error.line, 3, payload);
    assert.match(
      error.suggestion,
      /Use only|allowlisted|JavaScript|exact lowercase/u,
    );
    assert.equal("plan" in result, false, payload);
  }
});

test("rejected source remains inert and cannot mutate the host sandbox", () => {
  const probeName = "__agentvilleCompilerMutationProbe";
  globalThis[probeName] = "unchanged";

  try {
    const source = SYMPTOM_PROGRAM.replace(
      "act chosen repair",
      `act chosen repair; globalThis.${probeName} = "changed"`,
    );
    const result = compileProgram(source);

    errorWithCode(result, "FORBIDDEN_TOKEN");
    assert.equal(globalThis[probeName], "unchanged");
    assert.equal("plan" in result, false);
  } finally {
    delete globalThis[probeName];
  }
});

test("non-text, unknown phases, case changes, and forged plans fail closed", () => {
  let coerced = false;
  const nonText = compileProgram({
    toString: () => {
      coerced = true;
      return SYMPTOM_PROGRAM;
    },
  });
  const typeError = errorWithCode(nonText, "SOURCE_TYPE");
  assert.equal(typeError.line, 1);
  assert.equal(coerced, false);

  const unknown = compileProgram(
    SYMPTOM_PROGRAM.replace("observe irrigation", "inspect irrigation"),
  );
  const unknownError = errorWithCode(unknown, "UNKNOWN_PHASE");
  assert.equal(unknownError.line, 1);
  assert.match(unknownError.suggestion, /Start line 1 with observe/u);

  const uppercase = compileProgram(
    SYMPTOM_PROGRAM.replace("observe irrigation", "Observe irrigation"),
  );
  errorWithCode(uppercase, "FORBIDDEN_TOKEN");

  const valid = compileProgram(REPAIR_PROGRAM);
  assert.equal(valid.ok, true);
  const forged = structuredClone(valid.plan);
  assert.equal(isSafePlan(forged), false);

  for (const mutate of [
    (plan) => { plan.steps[1].command = "decide water tomatoes when dry"; },
    (plan) => { plan.steps[2].command = "act clear blockage"; },
    (plan) => { plan.steps[1].label = "Forged label"; },
    (plan) => { plan.binding.selectedAction = "water tomatoes"; },
    (plan) => { plan.source = SYMPTOM_PROGRAM; },
  ]) {
    const candidate = structuredClone(valid.plan);
    mutate(candidate);
    assert.equal(isSafePlan(candidate), false);
  }
});

test("compiler error results are deeply immutable teaching records", () => {
  const result = compileProgram("observe irrigation");
  assert.equal(result.ok, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.errors), true);
  assert.equal(Object.isFrozen(result.errors[0]), true);
  assert.throws(() => result.errors.pop(), TypeError);
  assert.throws(
    () => {
      result.errors[0].line = 99;
    },
    TypeError,
  );
});
