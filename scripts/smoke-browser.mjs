import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = resolve(ROOT, "dist");
const SERVE_SCRIPT = resolve(ROOT, "scripts", "serve.mjs");
const SCREENSHOT_DIR = resolve(ROOT, "artifacts", "screenshots");
const EVIDENCE_DIR = resolve(ROOT, "artifacts", "evidence");
const REPORT_PATH = resolve(EVIDENCE_DIR, "latest-smoke.json");
const PUBLIC_REPORT_PATH = resolve(EVIDENCE_DIR, "latest-public-smoke.json");
const PLAYWRIGHT_VERSION = createRequire(import.meta.url)("playwright/package.json").version;
const FIXED_TICK_MS = 1000 / 60;
const EXECUTION_END_TICK = 225;
const SHARED_ACT_COMMAND = "act on the decision";
const TEST_SEED = "three-mission-smoke-v1";

// These expectations are deliberately independent of the runtime mission registry.
// A registry regression must fail this smoke instead of rewriting its own oracle.
const MISSION_CASES = Object.freeze([
  Object.freeze({
    key: "m01",
    id: "repair-east-channel",
    name: "Repair the East Channel",
    sessionId: "AVBW-TEST-0001",
    sceneId: "east-channel",
    clue: "IRRIGATION",
    landmarkId: "irrigation-sign",
    entityType: "tomatoBeds",
    entityCount: 3,
    guidedProgram: Object.freeze([
      "observe the east channel",
      "decide water the tomatoes when the beds are dry",
      SHARED_ACT_COMMAND,
      "verify every tomato bed is watered",
    ]),
    repairedProgram: Object.freeze([
      "observe the east channel",
      "decide clear the blockage when the water is blocked",
      SHARED_ACT_COMMAND,
      "verify every tomato bed is watered",
    ]),
    repairLine: 2,
    repairSuggestion: "decide clear the blockage when the water is blocked",
    invalidProgram: Object.freeze([
      "observe the east channel",
      "decide sing to the crops when bells ring",
      SHARED_ACT_COMMAND,
      "verify every tomato bed is watered",
    ]),
    invalidLine: 2,
    invalidCode: "DECISION_NOT_ALLOWED",
    foreignProgram: Object.freeze([
      "observe the sky",
      "decide cover the beds when rain falls",
      SHARED_ACT_COMMAND,
      "verify the seedlings are safe",
    ]),
    guided: Object.freeze({
      observeOutcome: "BLOCKED",
      decideOutcome: "SYMPTOM_SELECTED",
      conditionSupported: true,
      conditionMet: true,
      selectedAction: "water tomatoes",
      actOutcome: "NO_CHANGE",
      executedAction: "water tomatoes",
      worldChanges: false,
    }),
    progressive: Object.freeze({
      observeBert:
        "Aha! East Channel water stops at visible debris; 3 tomato beds are dry.",
      decideBert:
        "Condition supported: The East Channel observation found dry tomato beds. I selected water tomatoes.",
      decideCue: "💡",
      decideTone: "idea",
      decideSemantics: "supported-true",
    }),
    repaired: Object.freeze({
      decideOutcome: "CAUSE_SELECTED",
      selectedAction: "clear blockage",
      actOutcome: "WORLD_CHANGED",
    }),
    coachTitle: "Treat the cause, not only the symptom.",
    coachMessage:
      "The plan chose dry beds, but direct watering cannot pass the blockage stopping the channel.",
    initialState: Object.freeze({
      missionId: "repair-east-channel",
      irrigation: Object.freeze({ channel: "East Channel", blocked: true, waterReleased: false }),
      tomatoBeds: Object.freeze([
        Object.freeze({ id: "tomato-bed-1", crop: "tomatoes", watered: false }),
        Object.freeze({ id: "tomato-bed-2", crop: "tomatoes", watered: false }),
        Object.freeze({ id: "tomato-bed-3", crop: "tomatoes", watered: false }),
      ]),
    }),
    alreadySatisfiedState: Object.freeze({
      missionId: "repair-east-channel",
      irrigation: Object.freeze({ channel: "East Channel", blocked: false, waterReleased: true }),
      tomatoBeds: Object.freeze([
        Object.freeze({ id: "tomato-bed-1", crop: "tomatoes", watered: true }),
        Object.freeze({ id: "tomato-bed-2", crop: "tomatoes", watered: true }),
        Object.freeze({ id: "tomato-bed-3", crop: "tomatoes", watered: true }),
      ]),
    }),
    nextMissionId: "storm-watch",
  }),
  Object.freeze({
    key: "m02",
    id: "storm-watch",
    name: "Storm Watch",
    sessionId: "AVBW-TEST-0002",
    sceneId: "storm-watch",
    clue: "WEATHER",
    landmarkId: "weather-sign",
    entityType: "seedlingBeds",
    entityCount: 3,
    guidedProgram: Object.freeze([
      "observe the sky",
      "decide cover the beds when rain falls",
      SHARED_ACT_COMMAND,
      "verify the seedlings are safe",
    ]),
    repairedProgram: Object.freeze([
      "observe the sky",
      "decide cover the beds when clouds gather",
      SHARED_ACT_COMMAND,
      "verify the seedlings are safe",
    ]),
    repairLine: 2,
    repairSuggestion: "decide cover the beds when clouds gather",
    invalidProgram: Object.freeze([
      "observe the sky",
      "decide hide in the shed when thunder sings",
      SHARED_ACT_COMMAND,
      "verify the seedlings are safe",
    ]),
    invalidLine: 2,
    invalidCode: "DECISION_NOT_ALLOWED",
    foreignProgram: Object.freeze([
      "observe the feeder",
      "decide unjam the chute when the hens are hungry",
      SHARED_ACT_COMMAND,
      "verify every hen has eaten",
    ]),
    guided: Object.freeze({
      observeOutcome: "CLOUDS_GATHERING",
      decideOutcome: "CONDITION_NOT_MET",
      conditionSupported: true,
      conditionMet: false,
      selectedAction: null,
      actOutcome: "NO_ACTION_SELECTED",
      executedAction: null,
      worldChanges: true,
    }),
    progressive: Object.freeze({
      observeBert: "Aha! Dark clouds are gathering, but rain has not started.",
      decideBert:
        "Condition checked: The sky observation shows that rain has not started. That would select no response yet.",
      decideCue: "?",
      decideTone: "question",
      decideSemantics: "supported-false",
    }),
    repaired: Object.freeze({
      decideOutcome: "RESPONSE_SELECTED",
      selectedAction: "cover beds",
      actOutcome: "WORLD_CHANGED",
    }),
    coachTitle: "Choose a signal that arrives before the harm.",
    coachMessage:
      "The rain trigger fired after the harm: the uncovered seedlings were battered before Bert could protect them.",
    initialState: Object.freeze({
      missionId: "storm-watch",
      weather: Object.freeze({ cloudsGathering: true, rainFalling: false, stormArrived: false }),
      covers: Object.freeze({ location: "shed", available: true, deployed: false }),
      seedlingBeds: Object.freeze([
        Object.freeze({ id: "seedling-bed-1", crop: "seedlings", covered: false, battered: false }),
        Object.freeze({ id: "seedling-bed-2", crop: "seedlings", covered: false, battered: false }),
        Object.freeze({ id: "seedling-bed-3", crop: "seedlings", covered: false, battered: false }),
      ]),
    }),
    alreadySatisfiedState: Object.freeze({
      missionId: "storm-watch",
      weather: Object.freeze({ cloudsGathering: false, rainFalling: true, stormArrived: true }),
      covers: Object.freeze({ location: "shed", available: true, deployed: true }),
      seedlingBeds: Object.freeze([
        Object.freeze({ id: "seedling-bed-1", crop: "seedlings", covered: true, battered: false }),
        Object.freeze({ id: "seedling-bed-2", crop: "seedlings", covered: true, battered: false }),
        Object.freeze({ id: "seedling-bed-3", crop: "seedlings", covered: true, battered: false }),
      ]),
    }),
    nextMissionId: "hungry-hens",
  }),
  Object.freeze({
    key: "m03",
    id: "hungry-hens",
    name: "The Hungry Hens",
    sessionId: "AVBW-TEST-0003",
    sceneId: "hungry-hens",
    clue: "FEEDER",
    landmarkId: "feeder-sign",
    entityType: "hens",
    entityCount: 3,
    guidedProgram: Object.freeze([
      "observe the feeder",
      "decide unjam the chute when the hens are hungry",
      SHARED_ACT_COMMAND,
      "verify every hen has eaten",
    ]),
    repairedProgram: Object.freeze([
      "observe the hens",
      "decide unjam the chute when the hens are hungry",
      SHARED_ACT_COMMAND,
      "verify every hen has eaten",
    ]),
    repairLine: 1,
    repairSuggestion: "observe the hens",
    invalidProgram: Object.freeze([
      "observe the moon",
      "decide unjam the chute when the hens are hungry",
      SHARED_ACT_COMMAND,
      "verify every hen has eaten",
    ]),
    invalidLine: 1,
    invalidCode: "SYNTAX",
    foreignProgram: Object.freeze([
      "observe the east channel",
      "decide clear the blockage when the water is blocked",
      SHARED_ACT_COMMAND,
      "verify every tomato bed is watered",
    ]),
    guided: Object.freeze({
      observeOutcome: "FEEDER_OBSERVED",
      decideOutcome: "EVIDENCE_UNAVAILABLE",
      conditionSupported: false,
      conditionMet: null,
      selectedAction: null,
      actOutcome: "NO_ACTION_SELECTED",
      executedAction: null,
      worldChanges: false,
    }),
    progressive: Object.freeze({
      observeBert:
        "Aha! The feeder is full, but its chute is jammed and the tray is empty.",
      decideBert:
        "I cannot use that condition yet. The feeder observation has no evidence about whether the hens are hungry; observe the hens first.",
      decideCue: "?",
      decideTone: "question",
      decideSemantics: "unsupported",
    }),
    repaired: Object.freeze({
      decideOutcome: "RESPONSE_SELECTED",
      selectedAction: "unjam chute",
      actOutcome: "WORLD_CHANGED",
    }),
    coachTitle: "Observe the evidence your decision needs.",
    coachMessage:
      "You looked in the wrong place: the feeder showed a jam, but it gave no evidence that the hens were hungry.",
    initialState: Object.freeze({
      missionId: "hungry-hens",
      feeder: Object.freeze({ full: true, chuteJammed: true }),
      tray: Object.freeze({ grainDelivered: 0, grainRemaining: 0 }),
      hens: Object.freeze([
        Object.freeze({ id: "hen-1", hungry: true, eaten: false }),
        Object.freeze({ id: "hen-2", hungry: true, eaten: false }),
        Object.freeze({ id: "hen-3", hungry: true, eaten: false }),
      ]),
    }),
    alreadySatisfiedState: Object.freeze({
      missionId: "hungry-hens",
      feeder: Object.freeze({ full: true, chuteJammed: false }),
      tray: Object.freeze({ grainDelivered: 3, grainRemaining: 0 }),
      hens: Object.freeze([
        Object.freeze({ id: "hen-1", hungry: false, eaten: true }),
        Object.freeze({ id: "hen-2", hungry: false, eaten: true }),
        Object.freeze({ id: "hen-3", hungry: false, eaten: true }),
      ]),
    }),
    nextMissionId: null,
  }),
]);

const SCREENSHOTS = Object.freeze({
  welcome: "agentville-build-week-course-selector-1280.png",
  wide1600: "agentville-build-week-responsive-1600x900.png",
  short1280: "agentville-build-week-responsive-1280x720.png",
  mobile390: "agentville-build-week-responsive-390x844.png",
  m01Authoring: "agentville-build-week-m01-authoring-1280.png",
  m01Failure: "agentville-build-week-m01-failure-1280.png",
  m01Pass: "agentville-build-week-m01-pass-1280.png",
  m02Authoring: "agentville-build-week-m02-authoring-1280.png",
  m02Failure: "agentville-build-week-m02-failure-1280.png",
  m02Pass: "agentville-build-week-m02-pass-1280.png",
  m03Authoring: "agentville-build-week-m03-authoring-1280.png",
  m03Failure: "agentville-build-week-m03-failure-1280.png",
  m03Pass: "agentville-build-week-m03-pass-1280.png",
  m03Reset: "agentville-build-week-m03-reset-1280.png",
  feedback: "agentville-build-week-feedback-m03-1280.png",
  debug: "agentville-build-week-smoke-error-1280.png",
});

export function parseSmokeArgs(argv = process.argv.slice(2)) {
  const inlineUrl = argv.find((argument) => argument.startsWith("--url="));
  const urlIndex = argv.indexOf("--url");
  return {
    dist: argv.includes("--dist"),
    headless: !argv.includes("--headed"),
    url:
      inlineUrl?.slice("--url=".length) ||
      (urlIndex >= 0 ? argv[urlIndex + 1] : null) ||
      null,
  };
}

export async function runBrowserSmoke({
  dist = false,
  headless = true,
  invocation = "smoke",
  url = null,
} = {}) {
  const startedAt = new Date();
  const assertions = [];
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    externalRequests: [],
    requestFailures: [],
    responseErrors: [],
    dialogs: [],
  };
  const stateSummary = { missions: {} };
  const screenshotPaths = Object.fromEntries(
    Object.entries(SCREENSHOTS).map(([key, filename]) => [
      key,
      resolve(SCREENSHOT_DIR, filename),
    ]),
  );
  const capturedScreenshots = new Set();
  const reportPath = url ? PUBLIC_REPORT_PATH : REPORT_PATH;
  const reportRelativePath = url
    ? "artifacts/evidence/latest-public-smoke.json"
    : "artifacts/evidence/latest-smoke.json";

  let browser = null;
  let context = null;
  let page = null;
  let feedbackPage = null;
  let server = null;
  let baseUrl = null;
  let runnerError = null;
  let status = "FAIL";

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await mkdir(EVIDENCE_DIR, { recursive: true });

  const check = (name, condition, details = {}) => {
    const passed = Boolean(condition);
    assertions.push({ name, passed, details: jsonSafe(details) });
    if (!passed) {
      const error = new Error(
        `Smoke assertion failed: ${name} · ${JSON.stringify(jsonSafe(details))}`,
      );
      error.isSmokeAssertion = true;
      throw error;
    }
  };

  const equal = (name, actual, expected) => {
    check(name, Object.is(actual, expected), { actual, expected });
  };

  const deepEqual = (name, actual, expected) => {
    check(name, JSON.stringify(actual) === JSON.stringify(expected), {
      actual,
      expected,
    });
  };

  const capture = async (targetPage, key, options = {}) => {
    await captureViewport(targetPage, screenshotPaths[key], options);
    capturedScreenshots.add(key);
  };

  try {
    if (url) {
      baseUrl = normalizeBaseUrl(url);
      equal("public target uses HTTPS", new URL(baseUrl).protocol, "https:");
    } else {
      const serveRoot = dist ? DIST : ROOT;
      check(
        dist ? "production build exists" : "source site exists",
        existsSync(resolve(serveRoot, "index.html")),
        { root: serveRoot },
      );
      server = await startStaticServer(serveRoot);
      baseUrl = normalizeBaseUrl(server.baseUrl);
    }

    const allowedOrigin = new URL(baseUrl).origin;
    browser = await chromium.launch({
      headless,
      args: ["--use-gl=angle", "--use-angle=swiftshader"],
    });
    context = await browser.newContext({
      acceptDownloads: true,
      colorScheme: "light",
      deviceScaleFactor: 1,
      locale: "en-US",
      reducedMotion: "reduce",
      screen: { width: 1280, height: 900 },
      serviceWorkers: "block",
      timezoneId: "UTC",
      viewport: { width: 1280, height: 900 },
    });

    await context.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      if (!isAllowedUrl(requestUrl, allowedOrigin)) {
        diagnostics.externalRequests.push({
          method: request.method(),
          resourceType: request.resourceType(),
          url: requestUrl,
        });
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    const guardedPages = new WeakSet();
    const attachGuards = (targetPage, label) => {
      if (guardedPages.has(targetPage)) return;
      guardedPages.add(targetPage);
      targetPage.on("console", (message) => {
        if (message.type() === "error") {
          diagnostics.consoleErrors.push({ page: label, text: message.text() });
        }
      });
      targetPage.on("pageerror", (error) => {
        diagnostics.pageErrors.push({ page: label, text: String(error) });
      });
      targetPage.on("requestfailed", (request) => {
        const requestUrl = request.url();
        if (diagnostics.externalRequests.some((entry) => entry.url === requestUrl)) return;
        diagnostics.requestFailures.push({
          page: label,
          error: request.failure()?.errorText ?? "unknown request failure",
          url: requestUrl,
        });
      });
      targetPage.on("response", (response) => {
        if (response.status() >= 400) {
          diagnostics.responseErrors.push({
            page: label,
            status: response.status(),
            url: response.url(),
          });
        }
      });
      targetPage.on("dialog", async (dialog) => {
        diagnostics.dialogs.push({
          page: label,
          message: dialog.message(),
          type: dialog.type(),
        });
        await dialog.dismiss();
      });
      targetPage.on("websocket", (socket) => {
        if (!isAllowedUrl(socket.url(), allowedOrigin)) {
          diagnostics.externalRequests.push({
            method: "WEBSOCKET",
            resourceType: "websocket",
            url: socket.url(),
          });
        }
      });
    };

    page = await context.newPage();
    attachGuards(page, "mission");
    const missionUrl = new URL(`./?test=1&seed=${TEST_SEED}`, baseUrl).href;
    await page.goto(missionUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const app = document.querySelector('[data-testid="app-ready"]');
      return app?.dataset.ready === "true" && typeof window.render_game_to_text === "function";
    });

    const welcome = await readTextState(page, "welcome", check);
    equal("app reports ready", welcome.ready, true);
    equal("course starts on Mission 01", welcome.mission.id, "repair-east-channel");
    deepEqual("only Mission 01 starts unlocked", welcome.course.unlockedMissionIds, [
      "repair-east-channel",
    ]);
    deepEqual("no mission starts complete", welcome.course.completedMissionIds, []);
    await assertWelcomeRoster(page, check, equal);
    await assertShellAndCanvas(page, welcome, check, equal);
    await capture(page, "welcome");
    await assertResponsiveViewport(
      page,
      { width: 1600, height: 900, key: "wide1600", label: "1600x900" },
      capture,
      check,
      equal,
    );
    await assertResponsiveViewport(
      page,
      { width: 1280, height: 720, key: "short1280", label: "1280x720" },
      capture,
      check,
      equal,
    );
    await assertResponsiveViewport(
      page,
      { width: 390, height: 844, key: "mobile390", label: "390x844" },
      capture,
      check,
      equal,
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForPaint(page);

    for (let index = 0; index < MISSION_CASES.length; index += 1) {
      const missionCase = MISSION_CASES[index];
      if (index === 0) {
        await page.getByTestId("start-mission").click();
      } else {
        const priorUrl = page.url();
        await page.getByTestId("start-next-mission").click();
        equal(`${missionCase.id} transition stays on the same page`, page.url(), priorUrl);
      }
      await waitForMode(page, "authoring");

      const initial = await readTextState(page, `${missionCase.id} initial`, check);
      assertMissionInitial(initial, missionCase, index, equal, deepEqual, check);
      await assertMissionPresentation(page, initial, missionCase, check, equal);

      const engineBoundary = await runEngineBoundaryChecks(page, missionCase);
      equal(`${missionCase.id} foreign mission source is rejected`, engineBoundary.foreign.ok, false);
      check(
        `${missionCase.id} foreign mission compile returns no plan`,
        engineBoundary.foreign.hasPlan === false,
        engineBoundary.foreign,
      );
      equal(`${missionCase.id} already-satisfied run passes`, engineBoundary.satisfied.verdict, "PASS");
      equal(
        `${missionCase.id} already-satisfied run selects no action`,
        engineBoundary.satisfied.selectedAction,
        null,
      );
      equal(
        `${missionCase.id} already-satisfied Act reports no action`,
        engineBoundary.satisfied.actOutcome,
        "NO_ACTION_SELECTED",
      );
      equal(
        `${missionCase.id} already-satisfied run preserves the world key`,
        engineBoundary.satisfied.afterKey,
        engineBoundary.satisfied.beforeKey,
      );

      if (missionCase.id === "repair-east-channel") {
        await assertInvalidProgressiveObserve(
          page,
          initial,
          missionCase,
          check,
          equal,
          deepEqual,
        );
      }
      await exerciseProgressivePrefixes(
        page,
        initial,
        missionCase,
        check,
        equal,
        deepEqual,
      );

      const guidedSource = missionCase.guidedProgram.join("\n");
      await page.getByTestId("program-editor").fill(guidedSource);
      const authoring = await readTextState(page, `${missionCase.id} authoring`, check);
      deepEqual(
        `${missionCase.id} displays the exact four guided lines`,
        authoring.program.sourceLines,
        [...missionCase.guidedProgram],
      );
      equal(
        `${missionCase.id} uses the shared Act instruction`,
        authoring.program.sourceLines[2],
        SHARED_ACT_COMMAND,
      );
      await assertEditorContainment(page, `${missionCase.id} authoring`, check);
      await capture(page, `${missionCase.key}Authoring`);

      const invalidBaseline = projectImmutableUiState(authoring);
      await page
        .getByTestId("program-editor")
        .fill(missionCase.invalidProgram.join("\n"));
      await page.getByTestId("compile-program").click();
      await waitForCompileResult(page, false);
      const rejected = await readTextState(page, `${missionCase.id} rejected line`, check);
      equal(
        `${missionCase.id} rejects the nonallowlisted line number`,
        rejected.program.compile.error.line,
        missionCase.invalidLine,
      );
      equal(
        `${missionCase.id} rejects the nonallowlisted line with the expected code`,
        rejected.program.compile.error.code,
        missionCase.invalidCode,
      );
      deepEqual(
        `${missionCase.id} rejection cannot mint a plan`,
        rejected.program.plan,
        invalidBaseline.plan,
      );
      equal(
        `${missionCase.id} rejection cannot change the world`,
        rejected.world.worldHash,
        invalidBaseline.worldHash,
      );
      equal(
        `${missionCase.id} rejection cannot advance world revision`,
        rejected.world.revision,
        invalidBaseline.worldRevision,
      );
      equal(
        `${missionCase.id} rejection cannot issue a receipt`,
        rejected.receipt,
        invalidBaseline.receipt,
      );
      equal(
        `${missionCase.id} rejection leaves Run disabled`,
        await page.getByTestId("run-program").isDisabled(),
        true,
      );

      await page.getByTestId("program-editor").fill(guidedSource);
      await page.getByTestId("compile-program").click();
      await waitForMode(page, "compiled");
      const guidedCompiled = await readTextState(
        page,
        `${missionCase.id} guided compiled`,
        check,
      );
      equal(`${missionCase.id} guided program compiles`, guidedCompiled.program.compile.ok, true);
      deepEqual(
        `${missionCase.id} compiled plan preserves exact lines`,
        guidedCompiled.program.plan.map((step) => step.command),
        [...missionCase.guidedProgram],
      );
      equal(
        `${missionCase.id} compilation does not change the world`,
        guidedCompiled.world.worldHash,
        initial.world.worldHash,
      );
      equal(`${missionCase.id} compilation does not issue a receipt`, guidedCompiled.receipt, null);

      await page.getByTestId("run-program").click();
      await waitForMode(page, "running");
      if (missionCase.id === "repair-east-channel") {
        await assertExecutionMilestones(page, check, equal);
      } else if (missionCase.id === "storm-watch") {
        await assertStormEventBoundary(page, "guided failure", "HARM_OCCURRED", false, check, equal);
      }
      await advanceExecutionToEnd(page);
      await waitForMode(page, "failure");
      const failed = await readTextState(page, `${missionCase.id} guided failure`, check);
      assertGuidedFailure(failed, missionCase, equal, deepEqual, check);
      await assertCoachPresentation(page, missionCase, check, equal);
      await assertEditorContainment(page, `${missionCase.id} failure`, check);
      await capture(page, `${missionCase.key}Failure`);

      const repairedDiff = changedLineNumbers(
        missionCase.guidedProgram,
        missionCase.repairedProgram,
      );
      deepEqual(
        `${missionCase.id} repair changes exactly its declared line`,
        repairedDiff,
        [missionCase.repairLine],
      );
      await page
        .getByTestId("program-editor")
        .fill(missionCase.repairedProgram.join("\n"));
      await page.getByTestId("compile-program").click();
      await waitForMode(page, "repair-ready");
      const repairCompiled = await readTextState(
        page,
        `${missionCase.id} repair compiled`,
        check,
      );
      deepEqual(
        `${missionCase.id} repair plan preserves the other three lines`,
        repairCompiled.program.plan.map((step) => step.command),
        [...missionCase.repairedProgram],
      );
      equal(
        `${missionCase.id} repair compilation does not mutate the visible failed world`,
        repairCompiled.world.worldHash,
        failed.world.worldHash,
      );
      await assertEditorContainment(page, `${missionCase.id} repair-ready`, check);

      await page.getByTestId("run-program").click();
      await waitForMode(page, "running");
      if (missionCase.id === "storm-watch") {
        await assertStormEventBoundary(page, "repaired pass", "PROTECTED", true, check, equal);
      }
      await advanceExecutionToEnd(page);
      await waitForMode(page, "proof");
      const passed = await readTextState(page, `${missionCase.id} repaired pass`, check);
      assertRepairedPass(passed, missionCase, equal, deepEqual, check);
      await assertPassPresentation(page, passed, missionCase, check, equal);
      await assertReceiptDom(page, passed, missionCase, check, equal);
      await capture(page, `${missionCase.key}Pass`, {
        preserveScroll: true,
      });

      stateSummary.missions[missionCase.id] = summarizeMissionCase(
        initial,
        failed,
        passed,
        engineBoundary,
      );

      if (missionCase.nextMissionId) {
        equal(
          `${missionCase.id} unlocks the real next mission`,
          passed.nextMission.id,
          missionCase.nextMissionId,
        );
        equal(
          `${missionCase.id} next mission status is unlocked`,
          passed.nextMission.status,
          "UNLOCKED",
        );
        equal(
          `${missionCase.nextMissionId} selector is enabled after PASS`,
          await page
            .getByTestId(`select-mission-${missionCase.nextMissionId}`)
            .isEnabled(),
          true,
        );
        equal(
          `${missionCase.id} exposes a real next-mission button`,
          await page.getByTestId("start-next-mission").isVisible(),
          true,
        );
      } else {
        equal("final mission reports course complete", passed.nextMission.status, "COURSE_COMPLETE");
        deepEqual("all three missions are complete", passed.course.completedMissionIds, [
          "repair-east-channel",
          "storm-watch",
          "hungry-hens",
        ]);
        equal(
          "course-complete debrief hides the next-mission button",
          await page.getByTestId("start-next-mission").isHidden(),
          true,
        );

        const resetUrl = page.url();
        await page.getByTestId("reset-mission").click();
        await waitForMode(page, "authoring");
        const reset = await readTextState(page, "Mission 03 replay reset", check);
        equal("Replay reset stays on the same browser page", page.url(), resetUrl);
        equal("Replay reset keeps Mission 03 active", reset.mission.id, "hungry-hens");
        equal("Replay reset creates the next deterministic session", reset.session.id, "AVBW-TEST-0004");
        deepEqual("Replay reset clears all source lines", reset.program.sourceLines, []);
        deepEqual("Replay reset clears the compiled plan", reset.program.plan, []);
        equal("Replay reset clears the visible receipt", reset.receipt, null);
        equal("Replay reset returns verification to NOT_RUN", reset.verification.status, "NOT_RUN");
        equal("Replay reset returns to the initial Mission 03 world", reset.world.worldHash, initial.world.worldHash);
        equal("Replay reset starts with zero attempts", reset.session.attemptCount, 0);
        deepEqual("Replay reset preserves completed course progress", reset.course.completedMissionIds, [
          "repair-east-channel",
          "storm-watch",
          "hungry-hens",
        ]);
        equal("Replay reset re-enables the editor", await page.getByTestId("program-editor").isEnabled(), true);
        equal("Replay reset hides the debrief panel", await page.getByTestId("receipt").isHidden(), true);
        await capture(page, "m03Reset");
      }
    }

    const finalMission = stateSummary.missions["hungry-hens"];
    feedbackPage = await context.newPage();
    attachGuards(feedbackPage, "feedback");
    await feedbackPage.goto(finalMission.feedbackHref, { waitUntil: "networkidle" });
    await feedbackPage.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    const feedbackInitial = await readTextState(
      feedbackPage,
      "Mission 03 feedback initial",
      check,
    );
    equal("feedback query preserves Mission 03 id", feedbackInitial.missionId, "hungry-hens");
    equal(
      "feedback query preserves Mission 03 session",
      feedbackInitial.sessionId,
      "AVBW-TEST-0003",
    );
    equal("feedback page matches its composite receipt", feedbackInitial.receiptMatched, true);
    equal("feedback page displays the PASS receipt", feedbackInitial.receiptVerdict, "PASS");
    equal(
      "feedback UI displays Mission 03 id",
      await feedbackPage.getByTestId("feedback-mission-id").textContent(),
      "hungry-hens",
    );
    equal(
      "feedback UI displays Mission 03 session",
      await feedbackPage.getByTestId("feedback-session-id").textContent(),
      "AVBW-TEST-0003",
    );
    const storedReceipt = await feedbackPage.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          "agentville:receipt:hungry-hens:AVBW-TEST-0003",
        ) ?? "null",
      ),
    );
    equal("composite receipt storage preserves mission id", storedReceipt?.missionId, "hungry-hens");
    equal(
      "composite receipt storage preserves session id",
      storedReceipt?.sessionId,
      "AVBW-TEST-0003",
    );
    equal("composite receipt storage preserves PASS", storedReceipt?.verdict, "PASS");

    await feedbackPage
      .locator('label:has(input[name="clarity"][value="5"])')
      .click();
    equal(
      "feedback rating 5 is selected through its visible label",
      await feedbackPage.locator('input[name="clarity"][value="5"]').isChecked(),
      true,
    );
    await feedbackPage
      .locator('#learned')
      .fill("I learned that Observe controls what evidence Decide is allowed to use.");
    await feedbackPage
      .locator('#friction')
      .fill("I first inspected the feeder instead of the hens.");
    await feedbackPage.locator('#evidence-consent').check();
    await feedbackPage.locator('#submit-feedback').click();
    const feedbackSaved = await readTextState(
      feedbackPage,
      "Mission 03 feedback saved",
      check,
    );
    equal("feedback render state reports saved evidence", feedbackSaved.feedbackSaved, true);
    const savedRecord = await feedbackPage.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          "agentville:feedback:hungry-hens:AVBW-TEST-0003",
        ) ?? "null",
      ),
    );
    equal("saved feedback uses v2 schema", savedRecord?.schema, "agentville.feedback.v2");
    equal("saved feedback preserves mission id", savedRecord?.missionId, "hungry-hens");
    equal("saved feedback preserves session id", savedRecord?.sessionId, "AVBW-TEST-0003");
    equal("saved feedback preserves receipt verdict", savedRecord?.receiptVerdict, "PASS");
    equal("saved feedback preserves consent", savedRecord?.evidenceConsent, true);

    const downloadPromise = feedbackPage.waitForEvent("download");
    await feedbackPage.getByTestId("feedback-export").click();
    const download = await downloadPromise;
    equal(
      "feedback export filename carries mission and session",
      download.suggestedFilename(),
      "agentville-feedback-hungry-hens-AVBW-TEST-0003.json",
    );
    const downloadedPath = await download.path();
    check("feedback export writes a downloadable JSON file", Boolean(downloadedPath), {
      downloadedPath,
    });
    const downloadedRecord = JSON.parse(await readFile(downloadedPath, "utf8"));
    equal("feedback export JSON preserves mission id", downloadedRecord.missionId, "hungry-hens");
    equal(
      "feedback export JSON preserves session id",
      downloadedRecord.sessionId,
      "AVBW-TEST-0003",
    );
    await capture(feedbackPage, "feedback", {
      preserveScroll: true,
    });
    stateSummary.feedback = {
      missionId: feedbackSaved.missionId,
      sessionId: feedbackSaved.sessionId,
      receiptMatched: feedbackSaved.receiptMatched,
      feedbackSaved: feedbackSaved.feedbackSaved,
      storageKey: "agentville:feedback:hungry-hens:AVBW-TEST-0003",
      exportFilename: download.suggestedFilename(),
    };

    for (const [kind, entries] of Object.entries(diagnostics)) {
      equal(`browser diagnostics contain no ${kind}`, entries.length, 0);
    }
    status = "PASS";
  } catch (error) {
    runnerError = serializeError(error);
    if (page && !page.isClosed()) {
      try {
        await capture(page, "debug", { preserveScroll: true });
      } catch {
        // The report still contains the original failure and browser diagnostics.
      }
    }
  } finally {
    if (feedbackPage && !feedbackPage.isClosed()) await feedbackPage.close();
    if (page && !page.isClosed()) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) await server.stop();

    const finishedAt = new Date();
    stateSummary.assertionCount = assertions.length;
    const report = {
      schema: "agentville.browser-smoke.v3",
      product: "AgentVille: Build Week Edition",
      status,
      invocation,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      target: {
        baseUrl,
        kind: url ? "public" : dist ? "dist" : "source",
        root: server?.root ?? null,
      },
      runtime: {
        node: process.version,
        playwright: PLAYWRIGHT_VERSION,
        viewport: { width: 1280, height: 900 },
      },
      assertions: {
        count: assertions.length,
        passed: assertions.filter((assertion) => assertion.passed).length,
        failed: assertions.filter((assertion) => !assertion.passed).length,
        items: assertions,
      },
      stateSummary,
      artifacts: {
        screenshots: Object.fromEntries(
          Object.entries(SCREENSHOTS)
            .filter(([key]) => capturedScreenshots.has(key))
            .map(([key, filename]) => [
            key,
            `artifacts/screenshots/${filename}`,
            ]),
        ),
        report: reportRelativePath,
      },
      diagnostics: {
        ...diagnostics,
        runnerError,
        server: server
          ? {
              root: server.root,
              stderr: server.stderr.trim(),
              stdout: server.stdout.trim(),
            }
          : null,
      },
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return {
    ok: status === "PASS",
    assertionCount: assertions.length,
    reportPath,
    runnerError,
    status,
  };
}

function assertMissionInitial(state, missionCase, index, equal, deepEqual, check) {
  equal(`${missionCase.id} is the active mission`, state.mission.id, missionCase.id);
  equal(`${missionCase.id} uses the expected mission name`, state.mission.name, missionCase.name);
  equal(`${missionCase.id} starts in authoring mode`, state.mode, "authoring");
  equal(`${missionCase.id} starts a deterministic session`, state.session.id, missionCase.sessionId);
  equal(`${missionCase.id} session carries mission id`, state.session.missionId, missionCase.id);
  equal(`${missionCase.id} starts with no attempts`, state.session.attemptCount, 0);
  deepEqual(`${missionCase.id} transition resets source`, state.program.sourceLines, []);
  deepEqual(`${missionCase.id} transition resets plan`, state.program.plan, []);
  equal(`${missionCase.id} transition resets receipt`, state.receipt, null);
  equal(`${missionCase.id} transition resets verification`, state.verification.status, "NOT_RUN");
  equal(`${missionCase.id} carries the deterministic test seed`, state.seed, TEST_SEED);
  equal(`${missionCase.id} course active id matches`, state.course.activeMissionId, missionCase.id);
  check(
    `${missionCase.id} course keeps the completed prefix`,
    state.course.completedMissionIds.length === index,
    state.course,
  );
}

async function assertInvalidProgressiveObserve(
  page,
  initial,
  missionCase,
  check,
  equal,
  deepEqual,
) {
  await page.getByTestId("program-editor").fill("observe the pond");
  equal(
    "Mission 01 invalid Observe uses the real Check line control",
    await page.getByTestId("compile-program").locator("span").textContent(),
    "Check line",
  );
  await page.getByTestId("compile-program").click();
  await waitForLessonCheck(page, false);
  const rejected = await readTextState(
    page,
    "Mission 01 invalid progressive Observe",
    check,
  );
  equal("Mission 01 invalid progressive Observe stays in authoring", rejected.mode, "authoring");
  equal("Mission 01 invalid progressive Observe reports line 1", rejected.program.lessonCheck.error.line, 1);
  equal("Mission 01 invalid progressive Observe reports SYNTAX", rejected.program.lessonCheck.error.code, "SYNTAX");
  equal("Mission 01 invalid progressive Observe does not run full compilation", rejected.program.compile.ok, null);
  deepEqual("Mission 01 invalid progressive Observe accepts no commands", rejected.lesson.acceptedCommands, []);
  equal("Mission 01 invalid progressive Observe keeps Observe active", rejected.lesson.currentPhase, "observe");
  equal(
    "Mission 01 invalid Observe gives Bert a clue-specific question",
    rejected.lesson.bertMessage.text,
    "What visible farm clue should I inspect? Look for IRRIGATION.",
  );
  equal(
    "Mission 01 invalid Observe question is visible over Bert",
    await page.getByTestId("bert-speech").locator("p").textContent(),
    "What visible farm clue should I inspect? Look for IRRIGATION.",
  );
  deepEqual("Mission 01 invalid progressive Observe cannot mint a plan", rejected.program.plan, []);
  equal("Mission 01 invalid progressive Observe cannot issue a receipt", rejected.receipt, null);
  equal("Mission 01 invalid progressive Observe cannot issue a failure receipt", rejected.failureReceipt, null);
  equal("Mission 01 invalid progressive Observe preserves world hash", rejected.world.worldHash, initial.world.worldHash);
  equal("Mission 01 invalid progressive Observe preserves world revision", rejected.world.revision, initial.world.revision);
  deepEqual("Mission 01 invalid progressive Observe preserves unlocks", rejected.course.unlockedMissionIds, initial.course.unlockedMissionIds);
  deepEqual("Mission 01 invalid progressive Observe preserves completion", rejected.course.completedMissionIds, initial.course.completedMissionIds);
  equal("Mission 01 invalid progressive Observe leaves Run disabled", await page.getByTestId("run-program").isDisabled(), true);
  equal("Mission 01 invalid progressive Observe stays on its mission", rejected.mission.id, missionCase.id);
}

async function exerciseProgressivePrefixes(
  page,
  initial,
  missionCase,
  check,
  equal,
  deepEqual,
) {
  const nextPhases = ["decide", "act", "verify"];
  const rehearsalDurations = [1300, 850, 850];
  const actAuthorityMessage =
    "Action ready. Line 3 will execute whatever Decide selects during the full run.";

  for (let prefixLength = 1; prefixLength <= 3; prefixLength += 1) {
    const prefix = missionCase.guidedProgram.slice(0, prefixLength);
    await page.getByTestId("program-editor").fill(prefix.join("\n"));
    equal(
      `${missionCase.id} progressive line ${prefixLength} uses Check line`,
      await page.getByTestId("compile-program").locator("span").textContent(),
      "Check line",
    );
    await page.getByTestId("compile-program").click();
    await waitForLessonStatus(page, "rehearsing");
    const rehearsing = await readTextState(
      page,
      `${missionCase.id} line ${prefixLength} rehearsal`,
      check,
    );
    equal(
      `${missionCase.id} line ${prefixLength} rehearses the correct phase`,
      rehearsing.lesson.currentPhase,
      ["observe", "decide", "act"][prefixLength - 1],
    );
    equal(
      `${missionCase.id} line ${prefixLength} rehearsal stays mission-scoped`,
      rehearsing.mission.id,
      missionCase.id,
    );
    equal(
      `${missionCase.id} line ${prefixLength} rehearsal cannot enable Run`,
      await page.getByTestId("run-program").isDisabled(),
      true,
    );

    await advanceTime(page, rehearsalDurations[prefixLength - 1]);
    await waitForLessonStatus(page, "prompt");
    const accepted = await readTextState(
      page,
      `${missionCase.id} progressive prefix ${prefixLength} accepted`,
      check,
    );
    deepEqual(
      `${missionCase.id} progressive prefix ${prefixLength} records exact accepted commands`,
      accepted.lesson.acceptedCommands,
      [...prefix],
    );
    equal(
      `${missionCase.id} progressive prefix ${prefixLength} unlocks the correct next phase`,
      accepted.lesson.currentPhase,
      nextPhases[prefixLength - 1],
    );
    equal(
      `${missionCase.id} progressive prefix ${prefixLength} remains on the active mission`,
      accepted.mission.id,
      missionCase.id,
    );
    equal(
      `${missionCase.id} progressive prefix ${prefixLength} passes prefix validation`,
      accepted.program.lessonCheck.ok,
      true,
    );
    equal(
      `${missionCase.id} progressive prefix ${prefixLength} does not invoke full compilation`,
      accepted.program.compile.ok,
      null,
    );
    deepEqual(
      `${missionCase.id} progressive prefix ${prefixLength} cannot mint a complete plan`,
      accepted.program.plan,
      [],
    );
    equal(
      `${missionCase.id} progressive prefix ${prefixLength} cannot issue a receipt`,
      accepted.receipt,
      null,
    );
    equal(
      `${missionCase.id} progressive prefix ${prefixLength} cannot issue a failure receipt`,
      accepted.failureReceipt,
      null,
    );
    equal(
      `${missionCase.id} progressive prefix ${prefixLength} preserves authoritative world hash`,
      accepted.world.worldHash,
      initial.world.worldHash,
    );
    equal(
      `${missionCase.id} progressive prefix ${prefixLength} preserves authoritative world revision`,
      accepted.world.revision,
      initial.world.revision,
    );
    deepEqual(
      `${missionCase.id} progressive prefix ${prefixLength} preserves course unlocks`,
      accepted.course.unlockedMissionIds,
      initial.course.unlockedMissionIds,
    );
    deepEqual(
      `${missionCase.id} progressive prefix ${prefixLength} preserves course completion`,
      accepted.course.completedMissionIds,
      initial.course.completedMissionIds,
    );
    equal(
      `${missionCase.id} progressive prefix ${prefixLength} keeps Run disabled`,
      await page.getByTestId("run-program").isDisabled(),
      true,
    );

    if (prefixLength === 1) {
      equal(
        `${missionCase.id} Observe rehearsal gives mission-specific Bert feedback`,
        accepted.lesson.bertMessage.text,
        missionCase.progressive.observeBert,
      );
      equal(
        `${missionCase.id} Observe feedback is visibly rendered`,
        await page.getByTestId("bert-speech").locator("p").textContent(),
        missionCase.progressive.observeBert,
      );
    } else if (prefixLength === 2) {
      equal(
        `${missionCase.id} Decide rehearsal visibly explains ${missionCase.progressive.decideSemantics} evidence`,
        accepted.lesson.bertMessage.text,
        missionCase.progressive.decideBert,
      );
      equal(
        `${missionCase.id} Decide rehearsal uses the expected Bert cue`,
        accepted.lesson.bertMessage.cue,
        missionCase.progressive.decideCue,
      );
      equal(
        `${missionCase.id} Decide rehearsal uses the expected feedback tone`,
        accepted.lesson.bertMessage.tone,
        missionCase.progressive.decideTone,
      );
      equal(
        `${missionCase.id} Decide evidence is visibly rendered`,
        await page.getByTestId("bert-speech").locator("p").textContent(),
        missionCase.progressive.decideBert,
      );
    } else {
      equal(
        `${missionCase.id} Act rehearsal names full-run authority`,
        accepted.lesson.bertMessage.text,
        actAuthorityMessage,
      );
      equal(
        `${missionCase.id} Act rehearsal visibly names full-run authority`,
        await page.getByTestId("bert-speech").locator("p").textContent(),
        actAuthorityMessage,
      );
      equal(
        `${missionCase.id} Act rehearsal explicitly keeps the world unchanged`,
        accepted.verification.message,
        "Line 3 is safe teaching input. The world has not changed.",
      );
    }
  }
}

async function assertWelcomeRoster(page, check, equal) {
  const roster = await page.locator("#mission-roster").evaluate((node) =>
    [...node.querySelectorAll("[data-mission-id]")].map((item) => ({
      id: item.dataset.missionId,
      state: item.dataset.state,
      disabled: item.querySelector("button").disabled,
      status: item.querySelector("small").textContent,
    })),
  );
  equal("welcome roster has three missions", roster.length, 3);
  equal("Mission 01 is available in the welcome roster", roster[0].disabled, false);
  equal("Mission 02 is locked in the welcome roster", roster[1].disabled, true);
  equal("Mission 03 is locked in the welcome roster", roster[2].disabled, true);
  check("welcome roster labels Mission 01 available", /Available/u.test(roster[0].status), roster[0]);
  check("welcome roster labels Mission 02 locked", /Locked/u.test(roster[1].status), roster[1]);
  check("welcome roster labels Mission 03 locked", /Locked/u.test(roster[2].status), roster[2]);
}

async function assertShellAndCanvas(page, state, check, equal) {
  equal("app shell is visible", await page.getByTestId("app-ready").isVisible(), true);
  equal("farm canvas is visible", await page.getByTestId("farm-canvas").isVisible(), true);
  equal("Agent Workbench is visible", await page.locator(".workbench").isVisible(), true);
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      workspace: rect(".workspace"),
      scene: rect(".scene-card"),
      workbench: rect(".workbench"),
      canvas: rect("#farm-canvas"),
    };
  });
  equal("smoke viewport is exactly 1280 pixels wide", layout.viewport.width, 1280);
  check("1280 layout has no horizontal document overflow", layout.documentWidth <= 1281, layout);
  check("scene stays inside the 1280 viewport", horizontallyContained(layout.scene, 1280), layout.scene);
  check(
    "Workbench stays inside the 1280 viewport",
    horizontallyContained(layout.workbench, 1280),
    layout.workbench,
  );
  check("farm canvas has a substantial visible surface", layout.canvas.width > 500 && layout.canvas.height > 400, layout.canvas);
  check("scene and Workbench do not overlap", layout.scene.right <= layout.workbench.left + 1, layout);
  const canvas = await measureCanvasPresentation(page);
  check("voxel canvas is visibly painted", canvas.nonDarkRatio >= 0.7, canvas);
  check("voxel canvas has rich color variation", canvas.uniqueColorBuckets >= 24, canvas);
  equal("welcome presentation uses a voxel farm", state.presentation.style, "layered-voxel-farm");
}

async function assertResponsiveViewport(
  page,
  viewport,
  capture,
  check,
  equal,
) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await waitForPaint(page);
  const state = await readTextState(page, `${viewport.label} responsive state`, check);
  equal(`${viewport.label} resize keeps the welcome state`, state.mode, "welcome");
  equal(`${viewport.label} resize keeps the farm renderer active`, state.presentation.style, "layered-voxel-farm");
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      app: rect("#app"),
      scene: rect(".scene-card"),
      workbench: rect(".workbench"),
      canvas: rect("#farm-canvas"),
      startCard: rect(".start-card"),
    };
  });
  equal(`${viewport.label} viewport width is exact`, layout.viewport.width, viewport.width);
  equal(`${viewport.label} viewport height is exact`, layout.viewport.height, viewport.height);
  check(`${viewport.label} has no horizontal document overflow`, layout.documentWidth <= viewport.width + 1, layout);
  check(`${viewport.label} app stays horizontally contained`, horizontallyContained(layout.app, viewport.width), layout.app);
  check(`${viewport.label} scene stays horizontally contained`, horizontallyContained(layout.scene, viewport.width), layout.scene);
  check(`${viewport.label} Workbench stays horizontally contained`, horizontallyContained(layout.workbench, viewport.width), layout.workbench);
  check(`${viewport.label} start card stays horizontally contained`, horizontallyContained(layout.startCard, viewport.width), layout.startCard);
  check(`${viewport.label} canvas keeps a usable size`, layout.canvas.width >= Math.min(350, viewport.width - 28) && layout.canvas.height >= 300, layout.canvas);
  const pixels = await measureCanvasPresentation(page);
  check(`${viewport.label} canvas remains painted`, pixels.nonDarkRatio >= 0.7, pixels);
  check(`${viewport.label} canvas retains color variation`, pixels.uniqueColorBuckets >= 20, pixels);
  await capture(page, viewport.key);
}

async function assertMissionPresentation(page, state, missionCase, check, equal) {
  equal(`${missionCase.id} renderer selects its scene`, state.presentation.sceneId, missionCase.sceneId);
  equal(`${missionCase.id} automation exposes one clue landmark`, state.world.landmarks.length, 1);
  equal(`${missionCase.id} landmark id is stable`, state.world.landmarks[0].id, missionCase.landmarkId);
  equal(`${missionCase.id} landmark label is visible`, state.world.landmarks[0].label, missionCase.clue);
  equal(`${missionCase.id} renderer landmark label matches`, state.presentation.landmarks.items[0].label, missionCase.clue);
  equal(
    `${missionCase.id} renderer exposes expected farm entities`,
    state.presentation.entities.byType[missionCase.entityType],
    missionCase.entityCount,
  );
  const canvasLabel = await page.getByTestId("farm-canvas").getAttribute("aria-label");
  check(`${missionCase.id} canvas description names ${missionCase.clue}`, canvasLabel.includes(missionCase.clue), {
    canvasLabel,
  });
}

function assertGuidedFailure(state, missionCase, equal, deepEqual, check) {
  equal(`${missionCase.id} guided attempt reaches failure mode`, state.mode, "failure");
  equal(`${missionCase.id} guided Verify honestly fails`, state.verification.status, "FAIL");
  equal(`${missionCase.id} guided failure has no PASS receipt`, state.receipt, null);
  equal(`${missionCase.id} keeps an honest failure receipt`, state.failureReceipt.verdict, "FAIL");
  equal(`${missionCase.id} failure receipt carries mission id`, state.failureReceipt.missionId, missionCase.id);
  equal(`${missionCase.id} failure receipt carries session id`, state.failureReceipt.sessionId, missionCase.sessionId);
  deepEqual(`${missionCase.id} failure receipt preserves guided source`, state.failureReceipt.program, [...missionCase.guidedProgram]);
  equal(`${missionCase.id} observation outcome is mission-specific`, state.trace[0].outcome, missionCase.guided.observeOutcome);
  equal(`${missionCase.id} decision outcome is mission-specific`, state.trace[1].outcome, missionCase.guided.decideOutcome);
  equal(`${missionCase.id} decision support is honest`, state.trace[1].conditionSupported, missionCase.guided.conditionSupported);
  equal(`${missionCase.id} decision result is honest`, state.trace[1].conditionMet, missionCase.guided.conditionMet);
  equal(`${missionCase.id} guided selected action is honest`, state.trace[1].selectedAction, missionCase.guided.selectedAction);
  equal(`${missionCase.id} guided Act outcome is honest`, state.trace[2].outcome, missionCase.guided.actOutcome);
  equal(`${missionCase.id} guided executed action is honest`, state.trace[2].executedAction, missionCase.guided.executedAction);
  equal(`${missionCase.id} Verify trace reports FAIL`, state.trace[3].outcome, "FAIL");
  equal(`${missionCase.id} Coach focuses the causal line`, state.coach.focusLine, missionCase.repairLine);
  equal(`${missionCase.id} Coach gives the exact one-line suggestion`, state.coach.suggestion, missionCase.repairSuggestion);
  equal(`${missionCase.id} Coach title is mission-specific`, state.coach.title, missionCase.coachTitle);
  equal(`${missionCase.id} Coach explanation is causal`, state.coach.message, missionCase.coachMessage);
  equal(
    `${missionCase.id} guided world-change evidence is honest`,
    state.failureReceipt.beforeKey !== state.failureReceipt.afterKey,
    missionCase.guided.worldChanges,
  );

  if (missionCase.id === "repair-east-channel") {
    equal("Mission 01 guided failure leaves blockage in place", state.failureReceipt.after.irrigationBlocked, true);
    equal("Mission 01 guided failure waters zero beds", state.failureReceipt.after.tomatoBedsWatered, 0);
  } else if (missionCase.id === "storm-watch") {
    equal("Mission 02 failure records one fixed scripted event", state.failureReceipt.scriptedEvents.length, 1);
    equal("Mission 02 storm occurs at tick 150", state.failureReceipt.scriptedEvents[0].tick, 150);
    equal("Mission 02 storm records harm", state.failureReceipt.scriptedEvents[0].outcome, "HARM_OCCURRED");
    equal("Mission 02 failure batters all seedlings", state.failureReceipt.after.seedlingBedsBattered, 3);
    check("Mission 02 Coach explains that the trigger fired after harm", state.coach.message.includes("trigger fired after the harm"), state.coach);
  } else {
    equal("Mission 03 decision is unsupported by feeder evidence", state.failureReceipt.conditionSupported, false);
    equal("Mission 03 failure observation scope is feeder", state.failureReceipt.observationScope, "feeder");
    equal("Mission 03 failure feeds zero hens", state.failureReceipt.after.hensFed, 0);
    check("Mission 03 Coach explains that Bert looked in the wrong place", state.coach.message.includes("looked in the wrong place"), state.coach);
  }
}

async function assertCoachPresentation(page, missionCase, check, equal) {
  equal(
    `${missionCase.id} failure lesson visibly names the diagnosis`,
    await page.locator("#prompt-title").textContent(),
    missionCase.coachTitle,
  );
  const presentation = await page.locator('[data-testid="coach-message"]').evaluate((node) => {
    const trace = document.querySelector("#trace-output");
    const nodeRect = node.getBoundingClientRect();
    const traceRect = trace.getBoundingClientRect();
    const width = Math.max(0, Math.min(nodeRect.right, traceRect.right) - Math.max(nodeRect.left, traceRect.left));
    const height = Math.max(0, Math.min(nodeRect.bottom, traceRect.bottom) - Math.max(nodeRect.top, traceRect.top));
    return {
      text: node.textContent,
      visibleRatio: (width * height) / Math.max(1, nodeRect.width * nodeRect.height),
      horizontallyContained: nodeRect.left >= traceRect.left - 1 && nodeRect.right <= traceRect.right + 1,
      traceHorizontalOverflow: trace.scrollWidth - trace.clientWidth,
      viewportWidth: window.innerWidth,
    };
  });
  check(`${missionCase.id} Coach explanation is visible in the trace`, presentation.text.includes(missionCase.coachMessage), presentation);
  check(`${missionCase.id} Coach suggestion is visible in the trace`, presentation.text.includes(missionCase.repairSuggestion), presentation);
  check(`${missionCase.id} Coach stays visible at 1280`, presentation.visibleRatio >= 0.98, presentation);
  check(`${missionCase.id} Coach stays horizontally contained at 1280`, presentation.horizontallyContained, presentation);
  check(`${missionCase.id} Coach trace has no horizontal overflow`, presentation.traceHorizontalOverflow <= 1, presentation);
}

function assertRepairedPass(state, missionCase, equal, deepEqual, check) {
  equal(`${missionCase.id} repaired run reaches proof mode`, state.mode, "proof");
  equal(`${missionCase.id} repaired Verify passes`, state.verification.status, "PASS");
  equal(`${missionCase.id} PASS receipt carries mission id`, state.receipt.missionId, missionCase.id);
  equal(`${missionCase.id} PASS receipt carries session id`, state.receipt.sessionId, missionCase.sessionId);
  equal(`${missionCase.id} PASS receipt has verdict PASS`, state.receipt.verdict, "PASS");
  deepEqual(`${missionCase.id} PASS receipt preserves repaired source`, state.receipt.program, [...missionCase.repairedProgram]);
  equal(`${missionCase.id} repaired Decide selects expected response`, state.receipt.selectedAction, missionCase.repaired.selectedAction);
  equal(`${missionCase.id} repaired Act executes expected response`, state.receipt.executedAction, missionCase.repaired.selectedAction);
  equal(`${missionCase.id} repaired Decide trace is causal`, state.trace[1].outcome, missionCase.repaired.decideOutcome);
  equal(`${missionCase.id} repaired Act changes the world`, state.trace[2].outcome, missionCase.repaired.actOutcome);
  check(`${missionCase.id} PASS receipt proves a changed world`, state.receipt.beforeKey !== state.receipt.afterKey, state.receipt);
  equal(
    `${missionCase.id} repaired execution replays from the original starting world`,
    state.receipt.beforeKey,
    state.failureReceipt.beforeKey,
  );
  equal(`${missionCase.id} debrief carries exact mission id`, state.learningRecap.missionId, missionCase.id);
  equal(`${missionCase.id} debrief recognizes repair path`, state.learningRecap.path, "repair");
  equal(`${missionCase.id} debrief records changed line`, state.learningRecap.learner.changedLine, missionCase.repairLine);
  deepEqual(`${missionCase.id} debrief explains exact four commands`, state.learningRecap.phases.map((phase) => phase.command), [...missionCase.repairedProgram]);
  const feedbackUrl = new URL(state.feedbackHref);
  equal(`${missionCase.id} feedback href carries mission_id`, feedbackUrl.searchParams.get("mission_id"), missionCase.id);
  equal(`${missionCase.id} feedback href carries session_id`, feedbackUrl.searchParams.get("session_id"), missionCase.sessionId);
}

async function assertPassPresentation(page, state, missionCase, check, equal) {
  equal(`${missionCase.id} PASS scene remains mission-specific`, state.presentation.sceneId, missionCase.sceneId);
  equal(`${missionCase.id} PASS renderer keeps expected entity count`, state.presentation.entities.byType[missionCase.entityType], missionCase.entityCount);
  if (missionCase.id === "repair-east-channel") {
    const alignment = state.presentation.farm.gridAlignment;
    check("Mission 01 renderer emits channel alignment evidence", alignment.channel.segmentCount > 0, alignment.channel);
    check("Mission 01 renderer emits fence alignment evidence", alignment.fences.segmentCount > 0, alignment.fences);
    equal("Mission 01 channel has zero isometric axis error", alignment.channel.maxAxisErrorPx, 0);
    equal("Mission 01 channel has zero join gap", alignment.channel.maxJoinGapPx, 0);
    equal("Mission 01 fences have zero isometric axis error", alignment.fences.maxAxisErrorPx, 0);
    equal("Mission 01 fences have zero join gap", alignment.fences.maxJoinGapPx, 0);
    equal("Mission 01 fences have zero rail/post gap", alignment.fences.maxRailPostGapPx, 0);
    equal("Mission 01 PASS clears the visual blockage", state.world.visualState.blocked, false);
    equal("Mission 01 PASS visually waters all beds", state.world.visualState.cropsWatered, 3);
  } else if (missionCase.id === "storm-watch") {
    equal("Mission 02 PASS covers all three beds", state.world.activeState.seedlingBedsCovered, 3);
    equal("Mission 02 PASS leaves zero battered beds", state.world.activeState.seedlingBedsBattered, 0);
    equal("Mission 02 PASS visually covers seedlings", state.world.visualState.seedlingsCovered, true);
    equal("Mission 02 PASS visual avoids battered seedlings", state.world.visualState.seedlingsBattered, false);
    equal("Mission 02 renderer marks beds covered", state.presentation.entities.state.seedlingBeds.covered, true);
    equal("Mission 02 renderer marks beds protected", state.presentation.entities.state.seedlingBeds.battered, false);
    equal("Mission 02 fixed event records protection", state.timeline.visibleEvent.outcome, "PROTECTED");
  } else {
    equal("Mission 03 PASS feeds all three hens", state.world.activeState.hensFed, 3);
    equal("Mission 03 PASS clears the chute", state.world.activeState.chuteJammed, false);
    equal("Mission 03 PASS drops three grain portions", state.world.activeState.grainDelivered, 3);
    equal("Mission 03 PASS visually feeds the hens", state.world.visualState.hensFed, true);
    equal("Mission 03 PASS visually shows grain", state.world.visualState.grainVisible, true);
    equal("Mission 03 renderer includes three hens", state.presentation.entities.byType.hens, 3);
    equal("Mission 03 renderer marks all hens fed", state.presentation.entities.state.hens.fed, true);
  }
  const pixels = await measureCanvasPresentation(page);
  check(`${missionCase.id} PASS canvas remains visibly painted`, pixels.nonDarkRatio >= 0.7, pixels);
  check(`${missionCase.id} PASS canvas retains voxel color variation`, pixels.uniqueColorBuckets >= 24, pixels);
}

async function assertReceiptDom(page, state, missionCase, check, equal) {
  equal(`${missionCase.id} PASS receipt panel is visible`, await page.getByTestId("receipt").isVisible(), true);
  equal(`${missionCase.id} receipt DOM displays session`, await page.getByTestId("receipt-session-id").textContent(), missionCase.sessionId);
  equal(`${missionCase.id} receipt DOM displays PASS`, (await page.getByTestId("verification-status").textContent()).trim(), "✓PASS");
  const layout = await page.getByTestId("receipt").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  check(`${missionCase.id} debrief remains horizontally contained at 1280`, horizontallyContained(layout, layout.viewportWidth), layout);
  check(`${missionCase.id} debrief creates no horizontal page overflow`, layout.documentWidth <= layout.viewportWidth + 1, layout);
  equal(`${missionCase.id} receipt snapshot session matches DOM`, state.receipt.sessionId, missionCase.sessionId);
}

async function assertStormEventBoundary(page, label, expectedOutcome, coveredBeforeStorm, check, equal) {
  await advanceExecutionToTick(page, 149);
  const before = await readTextState(page, `Storm Watch ${label} tick 149`, check);
  equal(`Storm Watch ${label} reaches tick 149`, before.timeline.executionTick, 149);
  equal(`Storm Watch ${label} hides event before tick 150`, before.timeline.visibleEvent, null);
  equal(`Storm Watch ${label} has no rain before tick 150`, before.world.activeState.rainFalling, false);
  equal(`Storm Watch ${label} cover state is causal before the storm`, before.world.activeState.seedlingBedsCovered === 3, coveredBeforeStorm);

  await advanceExecutionToTick(page, 150);
  const atEvent = await readTextState(page, `Storm Watch ${label} tick 150`, check);
  equal(`Storm Watch ${label} reaches tick 150`, atEvent.timeline.executionTick, 150);
  equal(`Storm Watch ${label} reveals the event at tick 150`, atEvent.timeline.visibleEvent.tick, 150);
  equal(`Storm Watch ${label} event outcome is deterministic`, atEvent.timeline.visibleEvent.outcome, expectedOutcome);
  equal(`Storm Watch ${label} begins rain at tick 150`, atEvent.world.activeState.rainFalling, true);
  equal(`Storm Watch ${label} event visibility matches world state`, atEvent.world.activeState.stormArrived, true);
}

async function assertExecutionMilestones(page, check, equal) {
  await advanceExecutionToTick(page, 45);
  const observed = await readTextState(page, "Mission 01 Observe milestone", check);
  equal("execution tick 45 exposes only Observe evidence", observed.trace.length, 1);
  equal("execution tick 45 trace phase is Observe", observed.trace[0].phase, "observe");
  check(
    "execution tick 45 Bert speech matches Observe evidence",
    observed.lesson.bertMessage.text.startsWith("observe:"),
    observed.lesson.bertMessage,
  );

  await advanceExecutionToTick(page, 90);
  const decided = await readTextState(page, "Mission 01 Decide milestone", check);
  equal("execution tick 90 exposes Observe and Decide", decided.trace.length, 2);
  equal("execution tick 90 latest trace phase is Decide", decided.trace[1].phase, "decide");
  check(
    "execution tick 90 Bert speech matches Decide evidence",
    decided.lesson.bertMessage.text.startsWith("decide:"),
    decided.lesson.bertMessage,
  );
}

async function runEngineBoundaryChecks(page, missionCase) {
  return page.evaluate(async (input) => {
    const compiler = await import(new URL("./src/compiler.js", window.location.href));
    const simulator = await import(new URL("./src/mission.js", window.location.href));
    const repairedSource = input.repairedProgram.join("\n");
    const compileResult = compiler.compileProgram(repairedSource, {
      missionId: input.id,
    });
    if (!compileResult.ok) {
      return { compileError: compileResult.errors };
    }
    const result = simulator.runMission(compileResult, {
      missionId: input.id,
      sessionId: `ENGINE-${input.id}`,
      state: structuredClone(input.alreadySatisfiedState),
    });
    const foreign = compiler.compileProgram(input.foreignProgram.join("\n"), {
      missionId: input.id,
    });
    return {
      foreign: {
        ok: foreign.ok,
        hasPlan: Boolean(foreign.plan),
        errors: foreign.errors?.map(({ line, code }) => ({ line, code })) ?? [],
      },
      satisfied: {
        verdict: result.receipt.verdict,
        selectedAction: result.receipt.selectedAction,
        executedAction: result.receipt.executedAction,
        beforeKey: result.receipt.beforeKey,
        afterKey: result.receipt.afterKey,
        actOutcome: result.trace[2].outcome,
        scriptedEvents: result.receipt.scriptedEvents,
      },
    };
  }, {
    id: missionCase.id,
    repairedProgram: [...missionCase.repairedProgram],
    foreignProgram: [...missionCase.foreignProgram],
    alreadySatisfiedState: missionCase.alreadySatisfiedState,
  });
}

function projectImmutableUiState(state) {
  return {
    plan: state.program.plan,
    receipt: state.receipt,
    worldHash: state.world.worldHash,
    worldRevision: state.world.revision,
  };
}

function changedLineNumbers(before, after) {
  const count = Math.max(before.length, after.length);
  return Array.from({ length: count }, (_, index) => index + 1).filter(
    (line) => before[line - 1] !== after[line - 1],
  );
}

function summarizeMissionCase(initial, failed, passed, engineBoundary) {
  return {
    missionId: passed.mission.id,
    sessionId: passed.session.id,
    initialWorldHash: initial.world.worldHash,
    failure: {
      verdict: failed.failureReceipt.verdict,
      worldHash: failed.world.worldHash,
      observationScope: failed.failureReceipt.observationScope,
      conditionSupported: failed.failureReceipt.conditionSupported,
      conditionMet: failed.failureReceipt.conditionMet,
      selectedAction: failed.failureReceipt.selectedAction,
      executedAction: failed.failureReceipt.executedAction,
      coachLine: failed.coach.focusLine,
      suggestion: failed.coach.suggestion,
      scriptedEvents: failed.failureReceipt.scriptedEvents,
    },
    pass: {
      verdict: passed.receipt.verdict,
      worldHash: passed.world.worldHash,
      changedLine: passed.learningRecap.learner.changedLine,
      selectedAction: passed.receipt.selectedAction,
      executedAction: passed.receipt.executedAction,
      scriptedEvents: passed.receipt.scriptedEvents,
    },
    alreadySatisfied: engineBoundary.satisfied,
    feedbackHref: passed.feedbackHref,
  };
}

async function readTextState(page, label, check) {
  const raw = await page.evaluate(() =>
    typeof window.render_game_to_text === "function"
      ? window.render_game_to_text()
      : null,
  );
  check(`${label} exposes render_game_to_text`, typeof raw === "string", {
    type: typeof raw,
  });
  try {
    return JSON.parse(raw);
  } catch (error) {
    check(`${label} returns valid JSON state`, false, {
      error: String(error),
      raw,
    });
    return null;
  }
}

async function waitForMode(page, expectedMode) {
  await page.waitForFunction((mode) => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      return JSON.parse(window.render_game_to_text()).mode === mode;
    } catch {
      return false;
    }
  }, expectedMode);
}

async function waitForCompileResult(page, expectedOk) {
  await page.waitForFunction((ok) => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      return JSON.parse(window.render_game_to_text()).program.compile.ok === ok;
    } catch {
      return false;
    }
  }, expectedOk);
}

async function waitForLessonCheck(page, expectedOk) {
  await page.waitForFunction((ok) => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      return JSON.parse(window.render_game_to_text()).program.lessonCheck.ok === ok;
    } catch {
      return false;
    }
  }, expectedOk);
}

async function waitForLessonStatus(page, expectedStatus) {
  await page.waitForFunction((status) => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      return JSON.parse(window.render_game_to_text()).lesson.status === status;
    } catch {
      return false;
    }
  }, expectedStatus);
}

async function advanceExecutionToTick(page, targetTick) {
  const currentTick = await page.evaluate(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.timeline.executionTick;
  });
  if (currentTick > targetTick) {
    throw new Error(`Execution already passed tick ${targetTick}: ${currentTick}`);
  }
  const tickDelta = targetTick - currentTick;
  if (tickDelta === 0) return;
  await advanceTime(page, tickDelta * FIXED_TICK_MS + 0.001);
}

async function advanceExecutionToEnd(page) {
  const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const currentTick = state.timeline.executionTick;
  const remainingTicks = Math.max(0, EXECUTION_END_TICK - currentTick);
  await advanceTime(page, remainingTicks * FIXED_TICK_MS + 1);
}

async function advanceTime(page, milliseconds) {
  await page.evaluate(async (amount) => {
    if (typeof window.advanceTime !== "function") {
      throw new Error("window.advanceTime is unavailable");
    }
    await window.advanceTime(amount);
  }, milliseconds);
}

async function assertEditorContainment(page, label, check) {
  const layout = await page.locator(".editor-area").evaluate((area) => {
    const editor = area.querySelector("#program-editor");
    const areaRect = area.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight);
    return {
      area: { left: areaRect.left, right: areaRect.right, top: areaRect.top, bottom: areaRect.bottom },
      editor: { left: editorRect.left, right: editorRect.right, top: editorRect.top, bottom: editorRect.bottom },
      lineHeight,
      clientHeight: editor.clientHeight,
      scrollHeight: editor.scrollHeight,
      sourceFitsVertically: editor.scrollHeight <= editor.clientHeight + 1,
      horizontalOverflow: editor.scrollWidth - editor.clientWidth,
    };
  });
  check(`${label} shows all four source lines without vertical clipping`, layout.sourceFitsVertically, layout);
  check(`${label} editor stays inside its workbench area`, layout.editor.left >= layout.area.left - 1 && layout.editor.right <= layout.area.right + 1 && layout.editor.top >= layout.area.top - 1 && layout.editor.bottom <= layout.area.bottom + 1, layout);
  check(`${label} editor has no horizontal overflow`, layout.horizontalOverflow <= 1, layout);
}

async function captureViewport(page, path, { preserveScroll = false } = {}) {
  if (!preserveScroll) await page.evaluate(() => window.scrollTo(0, 0));
  let lastBuffer = null;
  let blackRatio = 1;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await waitForPaint(page);
    lastBuffer = await page.screenshot({ caret: "hide", fullPage: false, type: "png" });
    blackRatio = await measureBlackPixelRatio(page, lastBuffer);
    if (blackRatio < 0.08) {
      await writeFile(path, lastBuffer);
      return;
    }
  }
  if (lastBuffer) await writeFile(path, lastBuffer);
  throw new Error(
    `Screenshot compositor remained incomplete (${(blackRatio * 100).toFixed(1)}% black pixels): ${path}`,
  );
}

async function waitForPaint(page) {
  await page.evaluate(
    () => new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint))),
  );
  await page.waitForTimeout(200);
}

async function measureCanvasPresentation(page) {
  return page.evaluate(() => {
    const source = document.querySelector("#farm-canvas");
    const probe = document.createElement("canvas");
    probe.width = 96;
    probe.height = 64;
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    const buckets = new Set();
    let nonDark = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red + green + blue >= 48) nonDark += 1;
      buckets.add(`${Math.floor(red / 32)}:${Math.floor(green / 32)}:${Math.floor(blue / 32)}`);
    }
    return {
      nonDarkRatio: nonDark / (pixels.length / 4),
      uniqueColorBuckets: buckets.size,
    };
  });
}

async function measureBlackPixelRatio(page, buffer) {
  const source = `data:image/png;base64,${buffer.toString("base64")}`;
  return page.evaluate(async (imageSource) => {
    const image = new Image();
    image.src = imageSource;
    await image.decode();
    const probe = document.createElement("canvas");
    probe.width = 320;
    probe.height = 225;
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let black = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        pixels[index] <= 4 &&
        pixels[index + 1] <= 4 &&
        pixels[index + 2] <= 4 &&
        pixels[index + 3] >= 250
      ) {
        black += 1;
      }
    }
    return black / (pixels.length / 4);
  }, source);
}

function horizontallyContained(rect, viewportWidth) {
  return rect.left >= -1 && rect.right <= viewportWidth + 1;
}

function isAllowedUrl(value, allowedOrigin) {
  try {
    const candidate = new URL(value);
    if (["about:", "blob:", "data:"].includes(candidate.protocol)) return true;
    return candidate.origin === allowedOrigin;
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value) {
  const normalized = new URL(value);
  normalized.search = "";
  normalized.hash = "";
  if (!normalized.pathname.endsWith("/")) normalized.pathname += "/";
  return normalized.href;
}

async function startStaticServer(root) {
  const port = await findFreePort();
  const child = spawn(
    process.execPath,
    [SERVE_SCRIPT, `--port=${port}`, `--root=${root}`],
    {
      cwd: ROOT,
      env: { ...process.env, COPYFILE_DISABLE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exitPromise = new Promise((resolveExit) => {
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseUrl, child);
  } catch (error) {
    child.kill("SIGTERM");
    await Promise.race([exitPromise, delay(1000)]);
    throw new Error(`${error.message}\nServer stdout: ${stdout}\nServer stderr: ${stderr}`);
  }

  return {
    baseUrl,
    child,
    root,
    get stderr() {
      return stderr;
    },
    get stdout() {
      return stdout;
    },
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      await Promise.race([exitPromise, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exitPromise;
      }
    },
  };
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Static server exited before becoming ready with code ${child.exitCode}.`,
      );
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // The child process may not have reached listen() yet.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port === null) reject(new Error("Unable to reserve a local port."));
        else resolvePort(port);
      });
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function serializeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "Error",
    stack: error instanceof Error ? error.stack : null,
  };
}

function jsonSafe(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function isDirectInvocation() {
  return (
    Boolean(process.argv[1]) &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  );
}

if (isDirectInvocation()) {
  const result = await runBrowserSmoke(parseSmokeArgs());
  if (result.ok) {
    console.log(
      `Browser smoke PASS · ${result.assertionCount} assertions · ${result.reportPath}`,
    );
  } else {
    console.error(`Browser smoke FAIL · ${result.reportPath}`);
    if (result.runnerError) {
      console.error(result.runnerError.stack ?? result.runnerError.message);
    }
    process.exitCode = 1;
  }
}
