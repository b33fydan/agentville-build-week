import test from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_COMMANDS,
  PHASES,
  compile,
  compileProgram,
  isSafePlan,
} from "../src/compiler.js";

const WATER_PROGRAM = [
  "observe irrigation",
  "decide if irrigation is blocked",
  "act water tomatoes",
  "verify tomatoes are watered",
].join("\n");

const REPAIR_PROGRAM = WATER_PROGRAM.replace(
  "act water tomatoes",
  "act clear blockage",
);

function errorWithCode(result, code) {
  assert.equal(result.ok, false);
  const error = result.errors.find((candidate) => candidate.code === code);
  assert.ok(error, `Expected ${code}; received ${JSON.stringify(result.errors)}`);
  return error;
}

test("compiler accepts only the two allowlisted action variants", () => {
  for (const [source, expectedAction] of [
    [WATER_PROGRAM, "act water tomatoes"],
    [REPAIR_PROGRAM, "act clear blockage"],
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
          command: "decide if irrigation is blocked",
        },
        { line: 3, phase: "act", command: expectedAction },
        {
          line: 4,
          phase: "verify",
          command: "verify tomatoes are watered",
        },
      ],
    );
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
  assert.deepEqual(ALLOWED_COMMANDS.act, [
    "act water tomatoes",
    "act clear blockage",
  ]);
});

test("compiler accepts CRLF and one conventional terminal newline", () => {
  const source = `${REPAIR_PROGRAM.replaceAll("\n", "\r\n")}\r\n`;
  const result = compileProgram(source);

  assert.equal(result.ok, true);
  assert.equal(result.plan.source, REPAIR_PROGRAM);
});

test("successful compiler output is deeply immutable", () => {
  const result = compileProgram(REPAIR_PROGRAM);
  assert.equal(result.ok, true);

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.plan), true);
  assert.equal(Object.isFrozen(result.plan.steps), true);
  assert.equal(Object.isFrozen(result.plan.steps[0]), true);
  assert.equal(Object.isFrozen(ALLOWED_COMMANDS), true);
  assert.equal(Object.isFrozen(ALLOWED_COMMANDS.act), true);

  assert.throws(() => result.plan.steps.push({}), TypeError);
  assert.throws(
    () => {
      result.plan.steps[2].command = "act eval";
    },
    TypeError,
  );
  assert.equal(result.plan.steps[2].command, "act clear blockage");
});

test("wrong phase order reports the exact lines and repairs", () => {
  const source = [
    "decide if irrigation is blocked",
    "observe irrigation",
    "act clear blockage",
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
  assert.match(result.errors[1].suggestion, /decide if irrigation is blocked/u);
});

test("syntax and unsupported actions include concrete line-level suggestions", () => {
  const badObserve = compileProgram(
    WATER_PROGRAM.replace("observe irrigation", "observe the irrigation"),
  );
  const syntax = errorWithCode(badObserve, "SYNTAX");
  assert.equal(syntax.line, 1);
  assert.match(syntax.message, /observe/u);
  assert.match(syntax.suggestion, /observe irrigation/u);

  const badAction = compileProgram(
    WATER_PROGRAM.replace("act water tomatoes", "act harvest tomatoes"),
  );
  const action = errorWithCode(badAction, "ACTION_NOT_ALLOWED");
  assert.equal(action.line, 3);
  assert.match(action.suggestion, /act water tomatoes/u);
  assert.match(action.suggestion, /act clear blockage/u);
});

test("comments are rejected on program and extra lines", () => {
  for (const source of [
    WATER_PROGRAM.replace(
      "observe irrigation",
      "observe irrigation // inspect first",
    ),
    WATER_PROGRAM.replace(
      "act water tomatoes",
      "act water tomatoes /* maybe */",
    ),
    WATER_PROGRAM.replace(
      "verify tomatoes are watered",
      "verify tomatoes are watered # done",
    ),
    `${WATER_PROGRAM}\n// hidden fifth line`,
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
  const missing = compileProgram(WATER_PROGRAM.split("\n").slice(0, 3).join("\n"));
  const missingError = errorWithCode(missing, "LINE_COUNT");
  assert.equal(missingError.line, 4);
  assert.match(missingError.suggestion, /verify tomatoes are watered/u);

  const blank = compileProgram(
    WATER_PROGRAM.replace("decide if irrigation is blocked", ""),
  );
  const blankError = errorWithCode(blank, "BLANK_LINE");
  assert.equal(blankError.line, 2);
  assert.match(blankError.suggestion, /decide if irrigation is blocked/u);

  const extra = compileProgram(`${WATER_PROGRAM}\nact clear blockage`);
  const extraError = errorWithCode(extra, "LINE_COUNT");
  assert.equal(extraError.line, 5);
  assert.match(extraError.suggestion, /after line 4/u);

  const twoTerminalNewlines = compileProgram(`${WATER_PROGRAM}\n\n`);
  errorWithCode(twoTerminalNewlines, "LINE_COUNT");
});

test("loops, JavaScript, network, and file primitives are rejected", () => {
  const payloads = [
    "act while blocked",
    "act for tomatoes",
    "act loop forever",
    "act clear blockage; fetch(url)",
    "act clear blockage; XMLHttpRequest()",
    "act clear blockage; WebSocket()",
    "act clear blockage; eval(source)",
    "act clear blockage; Function(source)",
    "act clear blockage; import fs",
    "act clear blockage; require(fs)",
    "act clear blockage; process exit",
    "act clear blockage; window location",
    "act clear blockage; document cookie",
    "act clear blockage; file write",
    "act clear blockage => tomatoes",
  ];

  for (const payload of payloads) {
    const result = compileProgram(
      WATER_PROGRAM.replace("act water tomatoes", payload),
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
    const source = WATER_PROGRAM.replace(
      "act water tomatoes",
      `act clear blockage; globalThis.${probeName} = "changed"`,
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
      return WATER_PROGRAM;
    },
  });
  const typeError = errorWithCode(nonText, "SOURCE_TYPE");
  assert.equal(typeError.line, 1);
  assert.equal(coerced, false);

  const unknown = compileProgram(
    WATER_PROGRAM.replace("observe irrigation", "inspect irrigation"),
  );
  const unknownError = errorWithCode(unknown, "UNKNOWN_PHASE");
  assert.equal(unknownError.line, 1);
  assert.match(unknownError.suggestion, /Start line 1 with observe/u);

  const uppercase = compileProgram(
    WATER_PROGRAM.replace("observe irrigation", "Observe irrigation"),
  );
  errorWithCode(uppercase, "FORBIDDEN_TOKEN");

  const valid = compileProgram(REPAIR_PROGRAM);
  assert.equal(valid.ok, true);
  const forged = structuredClone(valid.plan);
  forged.steps[2].command = "act eval";
  assert.equal(isSafePlan(forged), false);
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
