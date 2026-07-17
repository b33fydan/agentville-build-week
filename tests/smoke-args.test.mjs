import assert from "node:assert/strict";
import test from "node:test";

import { parseSmokeArgs } from "../scripts/smoke-browser.mjs";

test("browser smoke arguments keep local defaults", () => {
  assert.deepEqual(parseSmokeArgs([]), {
    dist: false,
    headless: true,
    url: null,
  });
});

test("browser smoke arguments accept an inline public URL", () => {
  assert.deepEqual(parseSmokeArgs(["--dist", "--headed", "--url=https://example.test/game/"]), {
    dist: true,
    headless: false,
    url: "https://example.test/game/",
  });
});

test("browser smoke arguments accept a separated public URL", () => {
  assert.equal(parseSmokeArgs(["--url", "https://example.test/game/"]).url, "https://example.test/game/");
});
