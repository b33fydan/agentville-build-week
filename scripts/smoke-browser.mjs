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

const DRAFT_PROGRAM = [
  "observe irrigation",
  "decide water tomatoes when dry",
  "act chosen repair",
  "verify tomatoes are watered",
].join("\n");

const REPAIR_DECISION = "decide clear blockage when blocked";
const REPAIRED_PROGRAM = DRAFT_PROGRAM.replace(
  "decide water tomatoes when dry",
  REPAIR_DECISION,
);

const ARTIFACTS = Object.freeze({
  welcome: "artifacts/screenshots/agentville-build-week-welcome.png",
  hero: "artifacts/screenshots/agentville-build-week-hero.png",
  irrigationCue1280: "artifacts/screenshots/agentville-build-week-irrigation-cue-1280.png",
  observeError1280: "artifacts/screenshots/agentville-build-week-observe-error-1280.png",
  observeSuccess1280: "artifacts/screenshots/agentville-build-week-observe-success-1280.png",
  bertDetail: "artifacts/screenshots/agentville-build-week-bert-detail.png",
  bertTeaching: "artifacts/screenshots/agentville-build-week-bert-teaching.png",
  decideAha1280: "artifacts/screenshots/agentville-build-week-decide-aha-1280.png",
  grandPayoff1280: "artifacts/screenshots/agentville-build-week-grand-payoff-1280.png",
  compilerError: "artifacts/screenshots/agentville-build-week-compiler-error.png",
  failure: "artifacts/screenshots/agentville-build-week-failure.png",
  receipt: "artifacts/screenshots/agentville-build-week-receipt.png",
  debrief1280: "artifacts/screenshots/agentville-build-week-debrief-1280.png",
  feedback: "artifacts/screenshots/agentville-build-week-feedback.png",
  feedbackMobile390: "artifacts/screenshots/agentville-build-week-feedback-mobile-390.png",
  mobile390: "artifacts/screenshots/agentville-build-week-mobile-390.png",
  debug: "artifacts/screenshots/agentville-build-week-smoke-error.png",
  report: "artifacts/evidence/latest-smoke.json",
});

export function parseSmokeArgs(argv = process.argv.slice(2)) {
  const urlFlag = argv.find((argument) => argument.startsWith("--url="));
  const urlIndex = argv.indexOf("--url");
  return {
    dist: argv.includes("--dist"),
    headless: !argv.includes("--headed"),
    url: urlFlag?.slice("--url=".length) || (urlIndex >= 0 ? argv[urlIndex + 1] : null) || null,
  };
}

export async function runBrowserSmoke({ dist = false, headless = true, invocation = "smoke", url = null } = {}) {
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
  const stateSummary = {};
  const screenshotPaths = Object.fromEntries(
    Object.entries(ARTIFACTS)
      .filter(([name]) => name !== "report")
      .map(([name, relativePath]) => [name, resolve(ROOT, relativePath)]),
  );
  const reportPath = url ? PUBLIC_REPORT_PATH : REPORT_PATH;

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
      const error = new Error(`Smoke assertion failed: ${name}`);
      error.isSmokeAssertion = true;
      throw error;
    }
  };

  const equal = (name, actual, expected) => {
    check(name, Object.is(actual, expected), { actual, expected });
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
      baseUrl = server.baseUrl;
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
      screen: { width: 1600, height: 900 },
      serviceWorkers: "block",
      timezoneId: "UTC",
      viewport: { width: 1600, height: 900 },
    });

    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = request.url();
      if (!isAllowedUrl(url, allowedOrigin)) {
        diagnostics.externalRequests.push({ method: request.method(), resourceType: request.resourceType(), url });
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
        const url = request.url();
        if (diagnostics.externalRequests.some((entry) => entry.url === url)) return;
        diagnostics.requestFailures.push({
          page: label,
          error: request.failure()?.errorText ?? "unknown request failure",
          url,
        });
      });
      targetPage.on("response", (response) => {
        if (response.status() >= 400) {
          diagnostics.responseErrors.push({ page: label, status: response.status(), url: response.url() });
        }
      });
      targetPage.on("dialog", async (dialog) => {
        diagnostics.dialogs.push({ page: label, message: dialog.message(), type: dialog.type() });
        await dialog.dismiss();
      });
      targetPage.on("websocket", (socket) => {
        if (!isAllowedUrl(socket.url(), allowedOrigin)) {
          diagnostics.externalRequests.push({ method: "WEBSOCKET", resourceType: "websocket", url: socket.url() });
        }
      });
    };

    page = await context.newPage();
    attachGuards(page, "mission");

    const missionUrl = new URL("./?test=1&seed=east-channel-v1", normalizeBaseUrl(baseUrl)).href;
    await page.goto(missionUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const app = document.querySelector('[data-testid="app-ready"]');
      return app?.dataset.ready === "true" && typeof window.render_game_to_text === "function";
    });

    const welcome = await readTextState(page, "welcome", check);
    equal("app reports ready", welcome.ready, true);
    equal("deterministic seed is active", welcome.seed, "east-channel-v1");
    equal("mission starts at welcome", welcome.mode, "welcome");
    const welcomeCanvas = await measureCanvasPresentation(page);
    check("welcome renders the farm before Start is clicked", welcomeCanvas.nonDarkRatio >= 0.7, welcomeCanvas);
    check("welcome farm preview has rich color variation", welcomeCanvas.uniqueColorBuckets >= 24, welcomeCanvas);
    const welcomeComposite = await measureCompositedScene(page);
    check("welcome overlay keeps the composited farm visibly lit", welcomeComposite.edgeAverageLuminance >= 45, welcomeComposite);
    check("welcome overlay keeps farm color variation outside the start card", welcomeComposite.edgeColorBuckets >= 20, welcomeComposite);
    check("welcome scrim stays translucent enough to see the diorama", welcomeComposite.overlayAlpha <= 0.35, welcomeComposite);
    await captureViewport(page, screenshotPaths.welcome);

    await page.getByTestId("start-mission").click();
    await waitForMode(page, "authoring");
    const started = await readTextState(page, "started mission", check);
    stateSummary.initial = summarizeMission(started);
    equal("start creates first deterministic session", started.session.id, "AVBW-TEST-0001");
    equal("start restores blocked irrigation", started.world.blockage, "debris-present");
    equal("start keeps channel stopped", started.world.eastChannel, "blocked");
    equal("start restores three dry beds", started.world.tomatoBeds.watered, 0);
    equal("farm renderer reports the layered voxel style", started.presentation?.style, "layered-voxel-farm");
    equal("farm renderer reports two terrain elevation layers", started.presentation?.farm?.elevationLayers, 2);
    check("refined farm renders at least 240 voxel forms", started.presentation?.farm?.voxelCount >= 240, started.presentation?.farm);
    check("refined farm includes at least 24 authored props", started.presentation?.farm?.propCount >= 24, started.presentation?.farm);
    check(
      "refined farm exposes the approved agricultural prop families",
      ["bridge", "crate", "crop", "flowers", "hay", "pump", "reservoir", "shed", "sign", "tree"].every((family) =>
        started.presentation?.farm?.propFamilies?.includes(family),
      ),
      started.presentation?.farm,
    );
    const startedCanvas = await page.getByTestId("farm-canvas").evaluate((node) => ({ height: node.clientHeight, width: node.clientWidth }));
    const farmBounds = started.presentation?.farm?.screenBounds;
    check(
      "renderer-derived farm bounds stay inside the canvas",
      farmBounds?.left >= 0 && farmBounds?.top >= 0 && farmBounds?.right <= startedCanvas.width && farmBounds?.bottom <= startedCanvas.height,
      { canvas: startedCanvas, farmBounds },
    );
    check(
      "voxel farm occupies a substantial part of the scene",
      farmBounds?.width >= startedCanvas.width * 0.6 && farmBounds?.height >= startedCanvas.height * 0.45,
      { canvas: startedCanvas, farmBounds },
    );
    equal("Bert renderer reports a humanoid farmhand silhouette", started.presentation?.bert?.silhouette, "humanoid-farmhand");
    check(
      "Bert actually renders a head, face, torso, paired arms, hands, legs, and boots",
      [
        "head",
        "face",
        "torso",
        "left-arm",
        "right-arm",
        "left-hand",
        "right-hand",
        "left-leg",
        "right-leg",
        "left-boot",
        "right-boot",
      ].every((part) => started.presentation?.bert?.renderedParts?.includes(part)),
      started.presentation?.bert,
    );
    check(
      "Bert's projected silhouette is large enough to read at normal zoom",
      started.presentation?.bert?.screenBounds?.right - started.presentation?.bert?.screenBounds?.left >= 46 &&
        started.presentation?.bert?.screenBounds?.bottom - started.presentation?.bert?.screenBounds?.top >= 72,
      started.presentation?.bert?.screenBounds,
    );
    equal("Bert begins in an idle visual pose", started.presentation?.bert?.pose, "idle");
    const irrigationSign = started.world.landmarks?.find(({ id }) => id === "irrigation-sign");
    equal("farm exposes the irrigation sign", irrigationSign?.label, "IRRIGATION");
    equal("irrigation sign points to the East Channel", irrigationSign?.pointsTo, "East Channel");
    check(
      "canvas description names the visible irrigation clue",
      (await page.getByTestId("farm-canvas").getAttribute("aria-label"))?.includes("IRRIGATION sign"),
    );
    await captureViewport(page, screenshotPaths.hero);

    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForPaint(page);
    const authoringLayout = await page.evaluate(() => ({
      canvas: {
        height: document.querySelector("#farm-canvas").getBoundingClientRect().height,
        width: document.querySelector("#farm-canvas").getBoundingClientRect().width,
      },
      document: {
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
      },
      rig: {
        actionHeight: document.querySelector("#compile-button").getBoundingClientRect().height,
        editorFontSize: parseFloat(getComputedStyle(document.querySelector("#program-editor")).fontSize),
        editorHelpFontSize: parseFloat(getComputedStyle(document.querySelector("#editor-help")).fontSize),
        hintHeight: document.querySelector("#hint-button").getBoundingClientRect().height,
        languageDescriptionFontSize: parseFloat(getComputedStyle(document.querySelector("#language-reference li span")).fontSize),
        motionHeight: document.querySelector("#motion-toggle").getBoundingClientRect().height,
        promptFontSize: parseFloat(getComputedStyle(document.querySelector("#lesson-copy")).fontSize),
        sceneRadius: parseFloat(getComputedStyle(document.querySelector(".scene-card")).borderTopLeftRadius),
        sceneBorder: parseFloat(getComputedStyle(document.querySelector(".scene-card")).borderTopWidth),
        workbenchBorder: parseFloat(getComputedStyle(document.querySelector(".workbench")).borderTopWidth),
      },
    }));
    check(
      "1280 irrigation clue keeps a visible farm canvas",
      authoringLayout.canvas.width >= 700 && authoringLayout.canvas.height >= 500,
      authoringLayout,
    );
    check(
      "1280 authoring view has no document overflow",
      authoringLayout.document.width <= 1280 && authoringLayout.document.height <= 720,
      authoringLayout,
    );
    check("Voxel Field Rig uses square scene geometry", authoringLayout.rig.sceneRadius <= 1, authoringLayout.rig);
    check(
      "Voxel Field Rig mounts both main panels in substantial frames",
      authoringLayout.rig.sceneBorder >= 4 && authoringLayout.rig.workbenchBorder >= 4,
      authoringLayout.rig,
    );
    check("Workbench code remains at least 13px", authoringLayout.rig.editorFontSize >= 13, authoringLayout.rig);
    check("Workbench actions remain at least 44px tall", authoringLayout.rig.actionHeight >= 44, authoringLayout.rig);
    check(
      "learner-facing hint and motion controls remain at least 44px tall",
      authoringLayout.rig.hintHeight >= 44 && authoringLayout.rig.motionHeight >= 44,
      authoringLayout.rig,
    );
    check(
      "lesson prompt and editor guidance remain at least 12px",
      authoringLayout.rig.promptFontSize >= 12 && authoringLayout.rig.editorHelpFontSize >= 12,
      authoringLayout.rig,
    );
    check(
      "safe-language descriptions remain at least 10px",
      authoringLayout.rig.languageDescriptionFontSize >= 10,
      authoringLayout.rig,
    );
    await captureViewport(page, screenshotPaths.irrigationCue1280);
    await page.setViewportSize({ width: 1600, height: 900 });
    await waitForPaint(page);

    const initialWorldHash = started.world.worldHash;
    const initialWorldRevision = started.world.revision;
    const editor = page.getByTestId("program-editor");
    const compileButton = page.getByTestId("compile-program");
    const runButton = page.getByTestId("run-program");

    equal("progressive lesson starts at Observe", started.lesson.currentPhase, "observe");
    equal("progressive lesson starts with no accepted commands", started.lesson.acceptedCommands.length, 0);
    equal("initial blockage evidence is hidden", started.lesson.evidenceLevel, 0);
    check("Bert waits silently until the learner needs help", await page.getByTestId("bert-speech").isHidden());
    check("initial canvas description does not disclose debris", !(await page.getByTestId("farm-canvas").getAttribute("aria-label"))?.includes("debris"));
    check("initial blockage callout is hidden", await page.locator("#blockage-callout").isHidden());
    check("full-program run starts disabled", await runButton.isDisabled());
    await page.locator("#hint-button").click();
    const currentHint = (await page.locator("#language-reference").textContent()) ?? "";
    check("line hint reveals the irrigation noun", currentHint.includes("irrigation"));
    check(
      "line hint is included in the accessible phase name",
      (await page.locator('[data-phase="observe"]').getAttribute("aria-label"))?.includes("irrigation"),
    );
    check(
      "line hint does not reveal Decide, Act, or Verify commands",
      !currentHint.includes("when dry") &&
        !currentHint.includes("chosen repair") &&
        !currentHint.includes("tomatoes are watered"),
    );
    equal("hint never writes source for the learner", await editor.inputValue(), "");

    await editor.fill("observe tomatoes");
    await compileButton.click();
    const invalid = await readTextState(page, "invalid Observe", check);
    stateSummary.invalid = summarizeMission(invalid);
    equal("invalid Observe is rejected by the lesson checker", invalid.program.lessonCheck.ok, false);
    equal("invalid Observe points to line 1", invalid.program.lessonCheck.error?.line, 1);
    equal("invalid Observe reports exact syntax", invalid.program.lessonCheck.error?.code, "SYNTAX");
    equal("a partial lesson never reports a full compile", invalid.program.compile.ok, null);
    equal("invalid Observe cannot change world hash", invalid.world.worldHash, initialWorldHash);
    equal("invalid Observe cannot increment world revision", invalid.world.revision, initialWorldRevision);
    equal("invalid Observe cannot create a plan", invalid.program.plan.length, 0);
    equal("invalid Observe cannot create a receipt", invalid.receipt, null);
    check(
      "compiler error is visibly tied to line 1",
      (await page.getByTestId("compiler-trace").textContent())?.includes("LINE 1"),
    );
    check("Bert responds with a visible question", await page.getByTestId("bert-speech").isVisible());
    check(
      "Bert asks what to inspect without disclosing the repair",
      (await page.getByTestId("bert-speech").textContent())?.toLowerCase().includes("what farm system") &&
        !(await page.getByTestId("bert-speech").textContent())?.toLowerCase().includes("clear blockage"),
    );
    await page.waitForFunction(() => document.activeElement?.id === "program-editor");
    equal("invalid Observe returns focus to line 1", await page.evaluate(() => document.activeElement?.id), "program-editor");
    await captureViewport(page, screenshotPaths.compilerError);

    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForPaint(page);
    await captureViewport(page, screenshotPaths.observeError1280);

    await editor.fill("observe fetch");
    await compileButton.click();
    const unsafePrefix = await readTextState(page, "unsafe Observe", check);
    equal("unsafe prefix reports a forbidden token", unsafePrefix.program.lessonCheck.error?.code, "FORBIDDEN_TOKEN");
    equal("unsafe prefix stays non-executable", unsafePrefix.program.plan.length, 0);
    equal("unsafe prefix keeps world revision stable", unsafePrefix.world.revision, initialWorldRevision);

    await editor.fill(DRAFT_PROGRAM.split("\n").slice(0, 2).join("\n"));
    await compileButton.click();
    const lockedPrefix = await readTextState(page, "locked multi-line prefix", check);
    equal("two unchecked lines cannot skip the Observe rehearsal", lockedPrefix.program.lessonCheck.error?.code, "LINE_LOCKED");
    equal("locked multi-line prefix accepts no commands", lockedPrefix.lesson.acceptedCommands.length, 0);
    equal("locked multi-line prefix creates no plan", lockedPrefix.program.plan.length, 0);
    equal("locked multi-line prefix leaves world revision stable", lockedPrefix.world.revision, initialWorldRevision);

    await waitForPaint(page);
    await editor.fill("observe irrigation");
    await page.waitForFunction(() => document.querySelector("#program-editor")?.value === "observe irrigation");
    await compileButton.click();
    const observing = await readTextState(page, "Observe rehearsal", check);
    equal("accepted Observe enters a rehearsal", observing.lesson.status, "rehearsing");
    equal("Observe is the rehearsal phase", observing.lesson.rehearsal?.phase, "observe");
    equal("Observe prefix does not compile a plan", observing.program.compile.ok, null);
    equal("Run remains disabled during Observe rehearsal", await runButton.isDisabled(), true);
    await advanceTime(page, 700);
    const observingMidway = await readTextState(page, "moving Observe rehearsal", check);
    check("Bert walks toward irrigation during Observe", observingMidway.crew.bert.moving, observingMidway.crew.bert);
    equal("renderer exposes Bert's walking pose during Observe", observingMidway.presentation?.bert?.pose, "walk");
    check(
      "Bert leaves his starting tile during Observe",
      observingMidway.crew.bert.position.x !== started.crew.bert.position.x ||
        observingMidway.crew.bert.position.y !== started.crew.bert.position.y,
      { before: started.crew.bert.position, after: observingMidway.crew.bert.position },
    );
    equal("Observe rehearsal cannot change world hash", observingMidway.world.worldHash, initialWorldHash);
    equal("Observe rehearsal cannot increment world revision", observingMidway.world.revision, initialWorldRevision);
    await advanceTime(page, 800);
    const observed = await readTextState(page, "accepted Observe", check);
    equal("Observe becomes the first accepted command", observed.lesson.acceptedCommands.join(","), "observe irrigation");
    equal("Decide unlocks after Observe", observed.lesson.currentPhase, "decide");
    equal("Observe reveals stopped-flow evidence", observed.lesson.evidenceLevel, 1);
    check("Observe produces Bert's Aha response", observed.lesson.bertMessage?.text.startsWith("Aha!"));
    equal("renderer exposes Bert's inspect pose after Observe", observed.presentation?.bert?.pose, "inspect");
    equal("accepted Observe leaves the authoritative world unchanged", observed.world.worldHash, initialWorldHash);
    check("stopped-flow callout appears after Observe", await page.locator("#blockage-callout").isVisible());
    await page.waitForFunction(() => document.activeElement?.id === "program-editor");
    await waitForPaint(page);
    const observeBertVisibility = await measureBertOverlayVisibility(page, observed.presentation?.bert?.screenBounds);
    check(
      "Observe teaching overlays leave Bert's humanoid silhouette unobscured",
      observeBertVisibility.visibleRatio >= 0.9,
      observeBertVisibility,
    );
    await captureViewport(page, screenshotPaths.observeSuccess1280);
    await captureBertDetail(page, screenshotPaths.bertDetail, observed.presentation?.bert?.screenBounds);
    await captureBertTeachingComposite(page, screenshotPaths.bertTeaching, observed.presentation?.bert?.screenBounds);

    await editor.fill(DRAFT_PROGRAM.split("\n").slice(0, 2).join("\n"));
    await compileButton.click();
    await advanceTime(page, 1000);
    const decided = await readTextState(page, "accepted Decide", check);
    equal(
      "Observe and Decide remain accepted in order",
      decided.lesson.acceptedCommands.join(","),
      "observe irrigation,decide water tomatoes when dry",
    );
    equal("Act unlocks after Decide", decided.lesson.currentPhase, "act");
    equal("Decide keeps the discovered evidence visible", decided.lesson.evidenceLevel, 2);
    check(
      "Decide visibly records the symptom response",
      decided.lesson.bertMessage?.text.includes("water the dry beds"),
    );
    equal("decision teaching boundary becomes visible", decided.lesson.conceptVisible, true);
    equal("renderer exposes Bert's thinking pose after Decide", decided.presentation?.bert?.pose, "think");
    check("lightbulb cue appears with Bert's decision", (await page.getByTestId("bert-cue").textContent())?.includes("💡"));
    check("agent-boundary note is visible", await page.getByTestId("agent-boundary-note").isVisible());
    check(
      "agent-boundary note accurately names human limits",
      (await page.getByTestId("agent-boundary-note").textContent())?.includes("goal, tools, limits, and success check"),
    );
    equal("Decide rehearsal cannot change world hash", decided.world.worldHash, initialWorldHash);
    equal("Decide rehearsal cannot increment world revision", decided.world.revision, initialWorldRevision);
    check(
      "Bert teaching copy remains readable at 1280",
      await page.getByTestId("bert-speech").evaluate((node) => parseFloat(getComputedStyle(node.querySelector("p")).fontSize) >= 12),
    );
    const teachingLayout = await page.evaluate(() => {
      const rect = (selector) => {
        const bounds = document.querySelector(selector).getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        };
      };
      const scene = rect(".scene-card");
      return {
        scene,
        bubble: rect("#bert-speech"),
        concept: rect("#agent-boundary-note"),
        document: {
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
        },
      };
    });
    check(
      "1280 Bert bubble stays inside the farm",
      teachingLayout.bubble.left >= teachingLayout.scene.left &&
        teachingLayout.bubble.right <= teachingLayout.scene.right &&
        teachingLayout.bubble.top >= teachingLayout.scene.top &&
        teachingLayout.bubble.bottom <= teachingLayout.scene.bottom,
      teachingLayout,
    );
    check(
      "1280 agent-boundary note stays inside the farm",
      teachingLayout.concept.left >= teachingLayout.scene.left &&
        teachingLayout.concept.right <= teachingLayout.scene.right &&
        teachingLayout.concept.top >= teachingLayout.scene.top &&
        teachingLayout.concept.bottom <= teachingLayout.scene.bottom,
      teachingLayout,
    );
    check(
      "1280 progressive teaching has no document overflow",
      teachingLayout.document.width <= 1280 && teachingLayout.document.height <= 720,
      teachingLayout,
    );
    const decideBertVisibility = await measureBertOverlayVisibility(page, decided.presentation?.bert?.screenBounds);
    check(
      "Decide teaching overlays leave Bert's humanoid silhouette unobscured",
      decideBertVisibility.visibleRatio >= 0.9,
      decideBertVisibility,
    );
    await captureViewport(page, screenshotPaths.decideAha1280);

    await editor.fill(DRAFT_PROGRAM.split("\n").slice(0, 3).join("\n"));
    await compileButton.click();
    await advanceTime(page, 1000);
    const acted = await readTextState(page, "accepted Act", check);
    equal("Act becomes the shared execution command", acted.lesson.acceptedCommands[2], "act chosen repair");
    equal("Verify unlocks after Act", acted.lesson.currentPhase, "verify");
    equal("Act rehearsal cannot change world hash", acted.world.worldHash, initialWorldHash);
    equal("Act rehearsal cannot increment world revision", acted.world.revision, initialWorldRevision);
    equal("Act rehearsal cannot issue a receipt", acted.receipt, null);

    await editor.fill(
      DRAFT_PROGRAM.split("\n")
        .slice(0, 2)
        .join("\n")
        .replace("decide water tomatoes when dry", REPAIR_DECISION),
    );
    const rewoundDecision = await readTextState(page, "edited accepted Decide", check);
    equal("editing accepted Decide rewinds later lesson steps", rewoundDecision.lesson.acceptedCommands.length, 1);
    equal("editing accepted Decide returns focus to line 2", rewoundDecision.lesson.currentPhase, "decide");
    equal("editing accepted Decide hides the prior concept reward", rewoundDecision.lesson.conceptVisible, false);
    equal("editing accepted Decide cannot preserve a plan", rewoundDecision.program.plan.length, 0);
    equal("editing accepted Decide leaves the farm unchanged", rewoundDecision.world.worldHash, initialWorldHash);

    await editor.fill(DRAFT_PROGRAM.split("\n").slice(0, 2).join("\n"));
    await compileButton.click();
    await advanceTime(page, 1000);
    await editor.fill(DRAFT_PROGRAM.split("\n").slice(0, 3).join("\n"));
    await compileButton.click();
    await advanceTime(page, 1000);

    await editor.fill(DRAFT_PROGRAM);
    await compileButton.click();
    const compiledDraft = await readTextState(page, "compiled water draft", check);
    stateSummary.compiledDraft = summarizeMission(compiledDraft);
    equal("valid draft compiles", compiledDraft.program.compile.ok, true);
    equal("valid draft exposes four plan steps", compiledDraft.program.plan.length, 4);
    equal(
      "compiled draft binds the line-2 decision",
      compiledDraft.program.binding?.decisionCommand,
      "decide water tomatoes when dry",
    );
    equal(
      "compiled draft binds the selected response",
      compiledDraft.program.binding?.selectedAction,
      "water tomatoes",
    );
    equal(
      "compiled Act remains the generic executor",
      compiledDraft.program.binding?.actCommand,
      "act chosen repair",
    );
    equal(
      "compiled phases preserve observe-decide-act-verify order",
      compiledDraft.program.plan.map((step) => step.phase).join(","),
      "observe,decide,act,verify",
    );
    equal("compile leaves world unchanged", compiledDraft.world.worldHash, initialWorldHash);
    equal("all four lesson commands are accepted", compiledDraft.lesson.acceptedCommands.length, 4);
    equal("complete lesson has no pending phase", compiledDraft.lesson.currentPhase, null);
    equal("final compile cannot increment world revision", compiledDraft.world.revision, initialWorldRevision);
    await page.waitForFunction(() => document.activeElement?.id === "run-button");
    equal(
      "four planned steps are visible",
      await page.locator('[data-testid="compiler-trace"] .trace-item').count(),
      4,
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await waitForPaint(page);

    await runButton.click();
    const runningDraft = await readTextState(page, "running water draft", check);
    equal("first draft enters running mode", runningDraft.mode, "running");
    await advanceTime(page, 1000);
    const movingDraft = await readTextState(page, "moving water draft", check);
    check("Bert visibly moves during execution", movingDraft.crew.bert.moving, movingDraft.crew.bert);
    check(
      "Bert leaves the starting position",
      movingDraft.crew.bert.position.x !== started.crew.bert.position.x ||
        movingDraft.crew.bert.position.y !== started.crew.bert.position.y,
      { before: started.crew.bert.position, after: movingDraft.crew.bert.position },
    );
    check("execution trace advances before completion", movingDraft.trace.length > 0, {
      traceLength: movingDraft.trace.length,
    });
    await advanceTime(page, 4300);

    const failed = await readTextState(page, "failed water draft", check);
    stateSummary.failure = summarizeMission(failed);
    equal("first accepted draft reaches FAIL", failed.verification.status, "FAIL");
    equal("failed draft keeps blockage present", failed.world.blockage, "debris-present");
    equal("failed draft releases no water", failed.world.eastChannel, "blocked");
    equal("failed draft waters zero beds", failed.world.tomatoBeds.watered, 0);
    equal("failed draft leaves world hash unchanged", failed.world.worldHash, initialWorldHash);
    equal("failure trace records the symptom decision", failed.trace[1]?.selectedAction, "water tomatoes");
    equal("generic Act executes the symptom decision", failed.trace[2]?.executedAction, "water tomatoes");
    equal("Verify owns the failed verdict", failed.trace[3]?.outcome, "FAIL");
    equal("failure receipt preserves the wrong decision", failed.failureReceipt?.decision, "decide water tomatoes when dry");
    equal("failure receipt preserves the generic Act command", failed.failureReceipt?.action, "act chosen repair");
    equal("failure receipt records the executed symptom response", failed.failureReceipt?.executedAction, "water tomatoes");
    equal("failure coach focuses line 2", failed.coach?.focusLine, 2);
    equal("failure coach renders after Verify", failed.coach?.insertAfterLine, 4);
    equal("failure coach recommends the allowlisted decision repair", failed.coach?.suggestion, REPAIR_DECISION);
    equal("failure returns the lesson to Decide repair", failed.lesson.currentPhase, "decide");
    check(
      "Bert explains that the chosen response failed",
      failed.lesson.bertMessage?.text.includes("carried out the choice"),
    );
    check(
      "failure coach is visible",
      await page.getByTestId("coach-message").isVisible(),
    );
    equal(
      "Act is visibly labeled NO CHANGE rather than FAIL",
      (await page.locator('.trace-item.is-no-change[data-line="3"] .trace-state').textContent())?.trim(),
      "NO CHANGE",
    );
    equal(
      "Verify is the only trace row carrying the FAIL verdict",
      await page.locator('.trace-item.is-fail[data-line="4"]').count(),
      1,
    );
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForPaint(page);
    const failureTraceVisibility = await measureFailureTraceVisibility(page);
    const failureEditorContainment = await measureEditorContainment(page);
    check("failure trace marks line 2 as the coached cause", failureTraceVisibility.causeMarked, failureTraceVisibility);
    check("failure trace auto-follows Verify and Coach", failureTraceVisibility.scrollTop > 0, failureTraceVisibility);
    check(
      "failed Verify evidence is inside the visible trace viewport",
      failureTraceVisibility.failedVisibleRatio >= 0.98,
      failureTraceVisibility,
    );
    check(
      "Codex Coach repair guidance is inside the visible trace viewport",
      failureTraceVisibility.coachVisibleRatio >= 0.98,
      failureTraceVisibility,
    );
    check("failure trace guidance remains at least 10px", failureTraceVisibility.detailFontSize >= 10, failureTraceVisibility);
    check(
      "four-line editor stays inside its allocated area at 1280x720",
      failureEditorContainment.editorInsideArea,
      failureEditorContainment,
    );
    check(
      "all four program lines fit without editor scrolling at 1280x720",
      failureEditorContainment.allSourceVisible,
      failureEditorContainment,
    );
    equal(
      "redundant editor help collapses for a complete compact program",
      failureEditorContainment.helpDisplay,
      "none",
    );
    await captureViewport(page, screenshotPaths.failure);
    await page.setViewportSize({ width: 1600, height: 900 });
    await waitForPaint(page);

    await editor.fill(REPAIRED_PROGRAM);
    await compileButton.click();
    const compiledRepair = await readTextState(page, "compiled repair", check);
    equal("repair compiles", compiledRepair.program.compile.ok, true);
    equal("repair changes only the decision command", compiledRepair.program.plan[1]?.command, REPAIR_DECISION);
    equal("repair preserves the generic Act command", compiledRepair.program.plan[2]?.command, "act chosen repair");
    equal("repair binding selects blockage removal", compiledRepair.program.binding?.selectedAction, "clear blockage");
    equal("repair compile still leaves world unchanged", compiledRepair.world.worldHash, initialWorldHash);
    equal("repair compile cannot increment world revision", compiledRepair.world.revision, initialWorldRevision);
    equal("repair compile cannot issue a passing receipt", compiledRepair.receipt, null);
    check("Bert recognizes that the repair targets the cause", compiledRepair.lesson.bertMessage?.text.includes("targets the cause"));

    await editor.fill(DRAFT_PROGRAM);
    const restoredFailure = await readTextState(page, "restored failed source", check);
    equal("restoring the known-bad source returns to failure mode", restoredFailure.mode, "failure");
    equal("editing a compiled repair clears its executable plan", restoredFailure.program.plan.length, 0);
    equal("restored failed source returns verification to FAIL", restoredFailure.verification.status, "FAIL");
    check("restored failed source restores Bert's failure explanation", restoredFailure.lesson.bertMessage?.text.includes("carried out the choice"));
    check("restored failed source disables Run", await runButton.isDisabled());

    await editor.fill(REPAIRED_PROGRAM);
    await compileButton.click();
    const recompiledRepair = await readTextState(page, "recompiled repair", check);
    equal("repair recompiles after the stale-plan guard", recompiledRepair.program.plan[1]?.command, REPAIR_DECISION);

    await runButton.click();
    await advanceTime(page, 3300);
    const repairing = await readTextState(page, "active blockage repair", check);
    equal("renderer exposes Bert's active clear pose during repair", repairing.presentation?.bert?.pose, "clear");
    equal("active repair keeps Bert's clear action", repairing.presentation?.bert?.action, "clear");
    equal("active generic Act executes blockage removal", repairing.trace[2]?.executedAction, "clear blockage");
    check("Bert visibly carries his tool during repair", repairing.presentation?.bert?.renderedParts?.includes("tool"), repairing.presentation?.bert);
    await advanceTime(page, 1200);
    const grandPayoff = await readTextState(page, "grand payoff", check);
    equal("grand payoff remains visible before the receipt", grandPayoff.mode, "running");
    equal("grand payoff has already cleared the blockage", grandPayoff.world.blockage, "cleared");
    equal("grand payoff visibly waters all three beds", grandPayoff.world.visibleTomatoBedsWatered, 3);
    equal("grand payoff has completed all four trace entries", grandPayoff.trace.length, 4);
    equal("grand payoff does not issue proof before the hold completes", grandPayoff.receipt, null);
    equal("grand payoff keeps Bert's repair action active", grandPayoff.presentation?.bert?.action, "clear");
    equal("grand payoff celebrates the verified visible result", grandPayoff.presentation?.bert?.pose, "verify");
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForPaint(page);
    await captureViewport(page, screenshotPaths.grandPayoff1280);
    await page.setViewportSize({ width: 1600, height: 900 });
    await waitForPaint(page);
    await advanceTime(page, 800);
    const passed = await readTextState(page, "passing repair", check);
    stateSummary.success = summarizeMission(passed);
    equal("repair reaches PASS", passed.verification.status, "PASS");
    equal("completed lesson has no pending authoring phase", passed.lesson.currentPhase, null);
    equal("repair clears the blockage", passed.world.blockage, "cleared");
    equal("repair releases East Channel water", passed.world.eastChannel, "flowing");
    equal("repair waters all tomato beds", passed.world.tomatoBeds.watered, 3);
    equal("PASS settles Bert into a verify pose", passed.presentation?.bert?.pose, "verify");
    check("repair changes authoritative world hash", passed.world.worldHash !== initialWorldHash, {
      before: initialWorldHash,
      after: passed.world.worldHash,
    });
    equal("receipt verdict is PASS", passed.receipt?.verdict, "PASS");
    equal("receipt preserves mission session", passed.receipt?.sessionId, started.session.id);
    equal("receipt records the repaired decision", passed.receipt?.decision, REPAIR_DECISION);
    equal("receipt records the selected response", passed.receipt?.selectedAction, "clear blockage");
    equal("receipt preserves the generic Act instruction", passed.receipt?.action, "act chosen repair");
    equal("receipt records the executed repair", passed.receipt?.executedAction, "clear blockage");
    equal("receipt before state is blocked", passed.receipt?.before?.irrigationBlocked, true);
    equal("receipt after state is clear", passed.receipt?.after?.irrigationBlocked, false);
    equal("receipt after state releases water", passed.receipt?.after?.waterReleased, true);
    equal("receipt after state proves three watered beds", passed.receipt?.after?.tomatoBedsWatered, 3);
    check("receipt panel is visible", await page.getByTestId("receipt").isVisible());
    check("learning recap is exposed in automation state", passed.learningRecap !== null);
    equal("learning recap records the repair path", passed.learningRecap?.path, "repair");
    equal("learning recap names the learner accomplishment", passed.learningRecap?.title, "You changed the decision—and fixed the cause.");
    equal(
      "learning recap keeps the four phase order",
      passed.learningRecap?.phases.map(({ phase }) => phase).join(","),
      "observe,decide,act,verify",
    );
    equal("learning recap explains the repaired decision", passed.learningRecap?.phases[1]?.command, REPAIR_DECISION);
    equal("learning recap preserves the generic Act instruction", passed.learningRecap?.phases[2]?.command, "act chosen repair");
    equal("learning recap reports the verified crop total", passed.learningRecap?.result.tomatoBedsWateredAfter, 3);
    equal("learning recap credits an observed failure", passed.learningRecap?.learner.diagnosedFailure, true);
    equal("learning recap identifies the changed line", passed.learningRecap?.learner.changedLine, 2);
    equal("learning recap preserves the failed decision", passed.learningRecap?.learner.from, "decide water tomatoes when dry");
    equal("learning recap preserves the repaired decision", passed.learningRecap?.learner.to, REPAIR_DECISION);
    check("learning recap tile is visible", await page.getByTestId("learning-recap").isVisible());
    equal("learning recap renders four visible phase cards", await page.locator("[data-recap-phase]:visible").count(), 4);
    check(
      "learning takeaway tells the player they debugged an agent",
      (await page.getByTestId("learning-takeaway").textContent())?.includes("You debugged an agent’s decision."),
    );
    equal("PASS unlocks only a Lesson 02 teaser", passed.nextLesson?.status, "TEASER");
    check("Lesson 02 weather signal appears after proof", await page.getByTestId("lesson-alert").isVisible());
    check(
      "Lesson 02 teaser names a coherent planting weather window",
      (await page.getByTestId("lesson-alert").textContent())?.includes("Rain reaches AgentVille soon") &&
        (await page.getByTestId("lesson-alert").textContent())?.includes("Plant the east field"),
    );
    await page.waitForFunction(() => document.activeElement?.id === "receipt-panel");
    equal("keyboard focus moves to the mission debrief", await page.evaluate(() => document.activeElement?.id), "receipt-panel");
    check(
      "background controls become inert behind the debrief",
      await page.evaluate(() => [".topbar", ".stage-rail", ".workspace"].every((selector) => document.querySelector(selector)?.inert)),
    );
    check(
      "learning explanation uses readable body type",
      await page.getByTestId("recap-observe").locator("[data-recap-copy]").evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 12),
    );
    equal(
      "visible receipt session matches state",
      (await page.getByTestId("receipt-session-id").textContent())?.trim(),
      passed.receipt.sessionId,
    );
    equal(
      "visible debrief Decide command matches text state",
      (await page.getByTestId("recap-decide").locator("[data-recap-command]").textContent())?.trim(),
      passed.learningRecap.phases[1].command,
    );
    equal(
      "visible debrief Act command matches text state",
      (await page.getByTestId("recap-act").locator("[data-recap-command]").textContent())?.trim(),
      passed.learningRecap.phases[2].command,
    );
    equal(
      "visible debrief title matches text state",
      (await page.locator("#receipt-title").textContent())?.trim(),
      passed.learningRecap.title,
    );
    equal(
      "visible receipt action matches executed response and causal line",
      (await page.locator("#receipt-action").textContent())?.trim(),
      `${passed.receipt.executedAction} · selected on line 2`,
    );

    const feedbackUrl = new URL(passed.feedbackHref);
    equal("feedback link stays on the game origin", feedbackUrl.origin, allowedOrigin);
    equal(
      "feedback link uses the feedback route",
      feedbackUrl.pathname,
      new URL("./feedback/", normalizeBaseUrl(baseUrl)).pathname,
    );
    equal("feedback link carries exact receipt ID", feedbackUrl.searchParams.get("session_id"), passed.receipt.sessionId);
    equal(
      "visible Give feedback href matches state",
      await page.getByTestId("give-feedback").evaluate((node) => node.href),
      passed.feedbackHref,
    );
    await captureViewport(page, screenshotPaths.receipt);

    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForPaint(page);
    const debriefLayout = await page.evaluate(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        const bounds = node.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          height: bounds.height,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          width: bounds.width,
        };
      };
      const hitTest = (selector) => {
        const target = document.querySelector(selector);
        const bounds = target.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        return Boolean(hit && (hit === target || target.contains(hit)));
      };
      const tile = document.querySelector("#receipt-panel");
      return {
        document: {
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
        },
        tile: rect("#receipt-panel"),
        recap: rect('[data-testid="learning-recap"]'),
        lessonAlert: rect('[data-testid="lesson-alert"]'),
        actions: rect(".receipt-actions"),
        tileOverflow: {
          horizontal: tile.scrollWidth > tile.clientWidth,
          vertical: tile.scrollHeight > tile.clientHeight,
        },
        actionHeights: ["#copy-receipt", "#feedback-link", "#reset-button"].map((selector) => rect(selector).height),
        actionHitTests: ["#copy-receipt", "#feedback-link", "#reset-button"].map(hitTest),
        receiptValues: [...document.querySelectorAll(".receipt-grid dd")].map((node) => ({
          clientHeight: node.clientHeight,
          clientWidth: node.clientWidth,
          scrollHeight: node.scrollHeight,
          scrollWidth: node.scrollWidth,
          text: node.textContent.trim(),
        })),
      };
    });
    check(
      "1280 debrief stays fully inside the viewport",
      debriefLayout.tile.left >= 0 &&
        debriefLayout.tile.top >= 0 &&
        debriefLayout.tile.right <= 1280 &&
        debriefLayout.tile.bottom <= 720,
      debriefLayout,
    );
    check(
      "1280 page has no hidden document overflow",
      debriefLayout.document.width <= 1280 && debriefLayout.document.height <= 720,
      debriefLayout.document,
    );
    check(
      "1280 debrief needs no internal scrolling",
      !debriefLayout.tileOverflow.horizontal && !debriefLayout.tileOverflow.vertical,
      debriefLayout.tileOverflow,
    );
    check(
      "explanation remains above the receipt actions",
      debriefLayout.recap.bottom <= debriefLayout.actions.top,
      { recap: debriefLayout.recap, actions: debriefLayout.actions },
    );
    check(
      "Lesson 02 teaser stays between the recap and actions",
      debriefLayout.recap.bottom <= debriefLayout.lessonAlert.top &&
        debriefLayout.lessonAlert.bottom <= debriefLayout.actions.top,
      debriefLayout,
    );
    check("all debrief actions remain hit-testable", debriefLayout.actionHitTests.every(Boolean), debriefLayout.actionHitTests);
    check("all debrief actions remain at least 44px tall", debriefLayout.actionHeights.every((height) => height >= 44), debriefLayout.actionHeights);
    check(
      "receipt evidence values wrap without clipping",
      debriefLayout.receiptValues.every(
        (value) => value.scrollWidth <= value.clientWidth && value.scrollHeight <= value.clientHeight,
      ),
      debriefLayout.receiptValues,
    );
    await captureViewport(page, screenshotPaths.debrief1280);

    feedbackPage = await context.newPage();
    attachGuards(feedbackPage, "feedback");
    await feedbackPage.goto(passed.feedbackHref, { waitUntil: "networkidle" });
    await feedbackPage.getByTestId("feedback-session-id").waitFor({ state: "visible" });
    const feedbackBefore = await readTextState(feedbackPage, "feedback continuity", check);
    equal("feedback page preserves query session", feedbackBefore.sessionId, passed.receipt.sessionId);
    equal("feedback page matches stored PASS receipt", feedbackBefore.receiptMatched, true);
    equal(
      "visible feedback session matches receipt",
      (await feedbackPage.getByTestId("feedback-session-id").textContent())?.trim(),
      passed.receipt.sessionId,
    );
    const feedbackBackLink = await measureControlContrast(feedbackPage, ".back-link");
    check("feedback return control remains at least 44px tall", feedbackBackLink.height >= 44, feedbackBackLink);
    check("feedback return control has readable contrast", feedbackBackLink.contrastRatio >= 4.5, feedbackBackLink);

    await feedbackPage.locator('label:has(input[name="clarity"][value="5"])').click();
    await feedbackPage.locator("#learned").fill("Verification checks the changed farm, not just Bert's intention.");
    await feedbackPage.locator("#friction").fill("I paused at line 2 before choosing the blockage.");
    await feedbackPage.locator("#evidence-consent").check();
    await feedbackPage.locator("#submit-feedback").click();
    await feedbackPage.locator("#feedback-confirmation").waitFor({ state: "visible" });

    const feedbackAfter = await readTextState(feedbackPage, "saved feedback", check);
    equal("feedback state reports saved", feedbackAfter.feedbackSaved, true);
    const savedFeedback = await feedbackPage.evaluate((sessionId) => {
      return JSON.parse(localStorage.getItem(`agentville:feedback:${sessionId}`) ?? "null");
    }, passed.receipt.sessionId);
    equal("saved feedback preserves session ID", savedFeedback?.sessionId, passed.receipt.sessionId);
    equal("saved feedback carries PASS verdict", savedFeedback?.receiptVerdict, "PASS");
    equal("saved feedback preserves rating", savedFeedback?.clarity, 5);
    equal("saved feedback preserves evidence consent", savedFeedback?.evidenceConsent, true);

    const downloadPromise = feedbackPage.waitForEvent("download");
    await feedbackPage.getByTestId("feedback-export").click();
    const download = await downloadPromise;
    const downloadedPath = await download.path();
    check("feedback export produces a local download", typeof downloadedPath === "string", { downloadedPath });
    const exportedFeedback = JSON.parse(await readFile(downloadedPath, "utf8"));
    equal("feedback export preserves exact receipt ID", exportedFeedback.sessionId, passed.receipt.sessionId);
    equal("feedback export uses evidence schema", exportedFeedback.schema, "agentville.feedback.v1");
    stateSummary.feedback = {
      feedbackSaved: feedbackAfter.feedbackSaved,
      receiptMatched: feedbackAfter.receiptMatched,
      sessionId: feedbackAfter.sessionId,
    };
    await feedbackPage.evaluate(() => window.scrollTo(0, 0));
    await captureViewport(feedbackPage, screenshotPaths.feedback, { preserveScroll: true });

    await feedbackPage.setViewportSize({ width: 390, height: 844 });
    await waitForPaint(feedbackPage);
    const mobileFeedback = await feedbackPage.evaluate(() => {
      const labels = [...document.querySelectorAll(".rating-row label")];
      const captions = [...document.querySelectorAll(".rating-row small")];
      const consent = document.querySelector(".consent-row");
      return {
        captionDisplays: captions.map((node) => getComputedStyle(node).display),
        captionFontSizes: captions.map((node) => parseFloat(getComputedStyle(node).fontSize)),
        consentFontSize: parseFloat(getComputedStyle(consent).fontSize),
        consentHeight: consent.getBoundingClientRect().height,
        documentWidth: document.documentElement.scrollWidth,
        labelHeights: labels.map((node) => node.getBoundingClientRect().height),
        viewportWidth: window.innerWidth,
      };
    });
    check("390px feedback has no horizontal document overflow", mobileFeedback.documentWidth <= mobileFeedback.viewportWidth, mobileFeedback);
    check("mobile feedback rating targets remain at least 44px tall", mobileFeedback.labelHeights.every((height) => height >= 44), mobileFeedback);
    check(
      "mobile rating captions remain visible and readable",
      mobileFeedback.captionDisplays.every((display) => display !== "none") &&
        mobileFeedback.captionFontSizes.every((fontSize) => fontSize >= 9),
      mobileFeedback,
    );
    check(
      "mobile feedback consent remains a readable 44px target",
      mobileFeedback.consentHeight >= 44 && mobileFeedback.consentFontSize >= 12,
      mobileFeedback,
    );
    await feedbackPage.locator(".rating-row").scrollIntoViewIfNeeded();
    await captureViewport(feedbackPage, screenshotPaths.feedbackMobile390, { preserveScroll: true });
    await feedbackPage.close();
    feedbackPage = null;

    await page.bringToFront();
    const pageToken = await page.evaluate(() => {
      window.__agentvilleSmokePageToken = "same-document-reset";
      return window.__agentvilleSmokePageToken;
    });
    const navigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    await page.getByTestId("reset-mission").click();
    await waitForMode(page, "authoring");
    const reset = await readTextState(page, "reset mission", check);
    stateSummary.reset = summarizeMission(reset);
    equal("reset stays in the same page instance", await page.evaluate(() => window.__agentvilleSmokePageToken), pageToken);
    equal(
      "reset does not create a navigation entry",
      await page.evaluate(() => performance.getEntriesByType("navigation").length),
      navigationCount,
    );
    check("reset creates a new session", reset.session.id !== passed.session.id, {
      before: passed.session.id,
      after: reset.session.id,
    });
    equal("reset restores initial world hash", reset.world.worldHash, initialWorldHash);
    equal("reset restores blockage", reset.world.blockage, "debris-present");
    equal("reset restores three dry beds", reset.world.tomatoBeds.watered, 0);
    equal("reset clears attempts", reset.session.attemptCount, 0);
    equal("reset clears the program", reset.program.sourceLines.length, 0);
    equal("reset clears the receipt", reset.receipt, null);
    equal("reset clears the learning recap", reset.learningRecap, null);
    equal("reset clears the Lesson 02 teaser state", reset.nextLesson, null);
    equal("reset clears accepted lesson commands", reset.lesson.acceptedCommands.length, 0);
    equal("reset returns the lesson to Observe", reset.lesson.currentPhase, "observe");
    equal("reset hides discovered evidence", reset.lesson.evidenceLevel, 0);
    equal("reset clears Bert's teaching bubble", reset.lesson.bertMessage, null);
    equal("reset returns verification to NOT_RUN", reset.verification.status, "NOT_RUN");
    check("reset hides the mission debrief", await page.getByTestId("receipt").isHidden());
    check(
      "reset restores background controls to the focus order",
      await page.evaluate(() => [".topbar", ".stage-rail", ".workspace"].every((selector) => !document.querySelector(selector)?.inert)),
    );
    await page.waitForFunction(() => document.activeElement?.id === "program-editor");
    equal("reset returns focus to the program editor", await page.evaluate(() => document.activeElement?.id), "program-editor");

    await page.setViewportSize({ width: 390, height: 844 });
    await waitForPaint(page);
    const mobileLayout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const languageItems = [...document.querySelectorAll("#language-reference li")].map((node) => node.getBoundingClientRect());
      const stageLabel = document.querySelector('.stage-rail [data-stage="program"] b');
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        stageLabelDisplay: getComputedStyle(stageLabel).display,
        stageLabelFontSize: parseFloat(getComputedStyle(stageLabel).fontSize),
        stageLabelText: stageLabel.textContent.trim(),
        actionHeights: [rect("#compile-button").height, rect("#run-button").height],
        languageTops: languageItems.map((bounds) => Math.round(bounds.top)),
        workbench: { left: rect(".workbench").left, right: rect(".workbench").right },
      };
    });
    check("390px layout has no horizontal document overflow", mobileLayout.documentWidth <= mobileLayout.viewportWidth, mobileLayout);
    check(
      "mobile mission rail retains its stage label",
      mobileLayout.stageLabelDisplay !== "none" && mobileLayout.stageLabelText === "Program" && mobileLayout.stageLabelFontSize >= 9,
      mobileLayout,
    );
    check("mobile action blocks remain at least 44px tall", mobileLayout.actionHeights.every((height) => height >= 44), mobileLayout);
    check(
      "mobile safe-language slots form two rows",
      mobileLayout.languageTops[0] === mobileLayout.languageTops[1] && mobileLayout.languageTops[2] > mobileLayout.languageTops[0],
      mobileLayout,
    );
    check(
      "mobile Workbench remains inside the viewport",
      mobileLayout.workbench.left >= 0 && mobileLayout.workbench.right <= mobileLayout.viewportWidth,
      mobileLayout,
    );
    await page.evaluate(() => document.querySelector(".workbench").scrollIntoView({ block: "start" }));
    await captureViewport(page, screenshotPaths.mobile390, { preserveScroll: true });

    equal("browser emitted no console errors", diagnostics.consoleErrors.length, 0);
    equal("browser emitted no uncaught page errors", diagnostics.pageErrors.length, 0);
    equal("browser made no non-same-origin requests", diagnostics.externalRequests.length, 0);
    equal("browser had no failed same-origin requests", diagnostics.requestFailures.length, 0);
    equal("browser received no error responses", diagnostics.responseErrors.length, 0);
    equal("browser opened no unexpected dialogs", diagnostics.dialogs.length, 0);

    status = "PASS";
  } catch (error) {
    runnerError = serializeError(error);
    if (!error?.isSmokeAssertion) {
      assertions.push({
        name: "browser smoke completed without runner exception",
        passed: false,
        details: runnerError,
      });
    }
    const debugPage = feedbackPage && !feedbackPage.isClosed() ? feedbackPage : page;
    if (debugPage && !debugPage.isClosed()) {
      try {
        await captureViewport(debugPage, screenshotPaths.debug, { preserveScroll: true });
      } catch (screenshotError) {
        runnerError.debugScreenshotError = String(screenshotError);
      }
    }
  } finally {
    for (const [label, resource] of [
      ["feedback page", feedbackPage],
      ["browser", browser],
    ]) {
      if (!resource) continue;
      try {
        if (label === "feedback page" && !resource.isClosed()) await resource.close();
        if (label === "browser") await resource.close();
      } catch (error) {
        diagnostics.pageErrors.push({ page: "teardown", text: `${label}: ${String(error)}` });
        status = "FAIL";
      }
    }

    if (server) {
      try {
        await server.stop();
      } catch (error) {
        diagnostics.pageErrors.push({ page: "server teardown", text: String(error) });
        status = "FAIL";
      }
    }

    const finishedAt = new Date();
    const report = {
      schema: "agentville.browser-smoke.v1",
      status,
      invocation,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      target: url ? "public" : dist ? "dist" : "source",
      baseUrl,
      browser: {
        engine: "chromium",
        headless,
        playwrightVersion: PLAYWRIGHT_VERSION,
        viewport: { width: 1600, height: 900 },
      },
      assertions,
      stateSummary,
      artifacts: {
        ...ARTIFACTS,
        report: url ? "artifacts/evidence/latest-public-smoke.json" : ARTIFACTS.report,
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
    reportPath,
    runnerError,
    status,
  };
}

async function readTextState(page, label, check) {
  const raw = await page.evaluate(() => {
    return typeof window.render_game_to_text === "function" ? window.render_game_to_text() : null;
  });
  check(`${label} exposes render_game_to_text`, typeof raw === "string", { type: typeof raw });
  try {
    return JSON.parse(raw);
  } catch (error) {
    check(`${label} returns valid JSON state`, false, { error: String(error), raw });
    return null;
  }
}

async function waitForMode(page, mode) {
  await page.waitForFunction((expectedMode) => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      return JSON.parse(window.render_game_to_text()).mode === expectedMode;
    } catch {
      return false;
    }
  }, mode);
}

async function advanceTime(page, milliseconds) {
  await page.evaluate(async (amount) => {
    if (typeof window.advanceTime !== "function") throw new Error("window.advanceTime is unavailable");
    await window.advanceTime(amount);
  }, milliseconds);
}

async function captureViewport(page, path, { preserveScroll = false } = {}) {
  if (!preserveScroll) await page.evaluate(() => window.scrollTo(0, 0));
  let lastBuffer = null;
  let lastBlackRatio = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if (attempt > 1) {
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    }
    await waitForPaint(page);
    lastBuffer = await page.screenshot({
      caret: "hide",
      fullPage: false,
      type: "png",
    });
    lastBlackRatio = await measureBlackPixelRatio(page, lastBuffer);
    if (lastBlackRatio < 0.08) {
      await writeFile(path, lastBuffer);
      return;
    }
  }

  if (lastBuffer) await writeFile(path, lastBuffer);
  throw new Error(
    `Screenshot compositor remained incomplete after 4 attempts (${(lastBlackRatio * 100).toFixed(1)}% black pixels): ${path}`,
  );
}

async function captureBertDetail(page, path, bounds) {
  if (!bounds) throw new Error("Bert detail capture requires renderer bounds.");
  const dataUrl = await page.evaluate((bertBounds) => {
    const source = document.querySelector("#farm-canvas");
    const sourceRect = source.getBoundingClientRect();
    const scaleX = source.width / sourceRect.width;
    const scaleY = source.height / sourceRect.height;
    const padding = 22;
    const left = Math.max(0, bertBounds.left - padding);
    const top = Math.max(0, bertBounds.top - padding);
    const right = Math.min(sourceRect.width, bertBounds.right + padding);
    const bottom = Math.min(sourceRect.height, bertBounds.bottom + padding);
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const output = document.createElement("canvas");
    output.width = Math.round(width * 2);
    output.height = Math.round(height * 2);
    const context = output.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = false;
    context.drawImage(
      source,
      left * scaleX,
      top * scaleY,
      width * scaleX,
      height * scaleY,
      0,
      0,
      output.width,
      output.height,
    );
    return output.toDataURL("image/png");
  }, bounds);
  await writeFile(path, Buffer.from(dataUrl.split(",")[1], "base64"));
}

async function captureBertTeachingComposite(page, path, bounds) {
  if (!bounds) throw new Error("Bert teaching capture requires renderer bounds.");
  await waitForPaint(page);
  const clip = await page.evaluate((bertBounds) => {
    const canvas = document.querySelector("#farm-canvas").getBoundingClientRect();
    const bert = {
      left: canvas.left + bertBounds.left,
      top: canvas.top + bertBounds.top,
      right: canvas.left + bertBounds.right,
      bottom: canvas.top + bertBounds.bottom,
    };
    const visibleOverlays = ["#bert-speech", "#blockage-callout", "#agent-boundary-note"]
      .map((selector) => document.querySelector(selector))
      .filter((node) => node && !node.hidden)
      .map((node) => node.getBoundingClientRect());
    const left = Math.max(0, Math.min(bert.left, ...visibleOverlays.map((rect) => rect.left)) - 18);
    const top = Math.max(0, Math.min(bert.top, ...visibleOverlays.map((rect) => rect.top)) - 18);
    const right = Math.min(window.innerWidth, Math.max(bert.right, ...visibleOverlays.map((rect) => rect.right)) + 18);
    const bottom = Math.min(window.innerHeight, Math.max(bert.bottom, ...visibleOverlays.map((rect) => rect.bottom)) + 18);
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }, bounds);
  const buffer = await page.screenshot({ caret: "hide", clip, type: "png" });
  await writeFile(path, buffer);
}

async function measureBertOverlayVisibility(page, bounds) {
  if (!bounds) throw new Error("Bert overlay measurement requires renderer bounds.");
  return page.evaluate((bertBounds) => {
    const canvas = document.querySelector("#farm-canvas").getBoundingClientRect();
    const bert = {
      left: canvas.left + bertBounds.left,
      top: canvas.top + bertBounds.top,
      right: canvas.left + bertBounds.right,
      bottom: canvas.top + bertBounds.bottom,
    };
    const area = Math.max(1, (bert.right - bert.left) * (bert.bottom - bert.top));
    const overlays = ["#bert-speech", "#blockage-callout", "#agent-boundary-note"]
      .map((selector) => ({ selector, node: document.querySelector(selector) }))
      .filter(({ node }) => node && !node.hidden)
      .map(({ selector, node }) => {
        const rect = node.getBoundingClientRect();
        const width = Math.max(0, Math.min(bert.right, rect.right) - Math.max(bert.left, rect.left));
        const height = Math.max(0, Math.min(bert.bottom, rect.bottom) - Math.max(bert.top, rect.top));
        return { selector, overlapArea: width * height };
      });
    const coveredArea = overlays.reduce((total, overlay) => total + overlay.overlapArea, 0);
    return {
      bert,
      coveredArea,
      overlays,
      visibleRatio: 1 - Math.min(1, coveredArea / area),
    };
  }, bounds);
}

async function measureFailureTraceVisibility(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector("#trace-output");
    const cause = viewport.querySelector('.trace-item.is-coach-focus[data-line="2"]');
    const failed = viewport.querySelector('.trace-item.is-fail[data-line="4"]');
    const coach = viewport.querySelector('[data-testid="coach-message"]');
    const visibleRatio = (node) => {
      if (!node) return 0;
      const outer = viewport.getBoundingClientRect();
      const inner = node.getBoundingClientRect();
      const width = Math.max(0, Math.min(outer.right, inner.right) - Math.max(outer.left, inner.left));
      const height = Math.max(0, Math.min(outer.bottom, inner.bottom) - Math.max(outer.top, inner.top));
      return (width * height) / Math.max(1, inner.width * inner.height);
    };
    return {
      causeMarked: Boolean(cause),
      coachVisibleRatio: visibleRatio(coach),
      detailFontSize: failed
        ? parseFloat(getComputedStyle(failed.querySelector("small")).fontSize)
        : 0,
      failedVisibleRatio: visibleRatio(failed),
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
      viewportHeight: viewport.clientHeight,
    };
  });
}

async function measureEditorContainment(page) {
  return page.evaluate(() => {
    const area = document.querySelector(".editor-area");
    const editor = document.querySelector("#program-editor");
    const help = document.querySelector(".editor-help");
    const areaRect = area.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const epsilon = 1;
    return {
      allSourceVisible: editor.scrollHeight <= editor.clientHeight + epsilon,
      area: {
        bottom: areaRect.bottom,
        height: areaRect.height,
        top: areaRect.top,
      },
      editor: {
        bottom: editorRect.bottom,
        clientHeight: editor.clientHeight,
        height: editorRect.height,
        scrollHeight: editor.scrollHeight,
        top: editorRect.top,
      },
      editorInsideArea:
        editorRect.top >= areaRect.top - epsilon &&
        editorRect.bottom <= areaRect.bottom + epsilon,
      helpDisplay: getComputedStyle(help).display,
    };
  });
}

async function measureControlContrast(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    const parseColor = (value) => {
      const channels = value.match(/[\d.]+/gu)?.map(Number) ?? [0, 0, 0];
      return channels.slice(0, 3);
    };
    const luminance = (channels) => {
      const linear = channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const foreground = luminance(parseColor(style.color));
    const background = luminance(parseColor(style.backgroundColor));
    const lighter = Math.max(foreground, background);
    const darker = Math.min(foreground, background);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      contrastRatio: (lighter + 0.05) / (darker + 0.05),
      height: node.getBoundingClientRect().height,
    };
  });
}

async function measureCompositedScene(page) {
  const buffer = await page.locator(".scene-card").screenshot({ caret: "hide", type: "png" });
  const source = `data:image/png;base64,${buffer.toString("base64")}`;
  const raster = await page.evaluate(async (imageSource) => {
    const image = new Image();
    image.src = imageSource;
    await image.decode();
    const probe = document.createElement("canvas");
    probe.width = 120;
    probe.height = 80;
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    const edgeBuckets = new Set();
    let edgeLuminance = 0;
    let edgePixels = 0;
    for (let y = 0; y < probe.height; y += 1) {
      for (let x = 0; x < probe.width; x += 1) {
        if (x > probe.width * 0.25 && x < probe.width * 0.75 && y > probe.height * 0.15 && y < probe.height * 0.85) continue;
        const index = (y * probe.width + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        edgeLuminance += red * 0.2126 + green * 0.7152 + blue * 0.0722;
        edgeBuckets.add(`${Math.floor(red / 32)}:${Math.floor(green / 32)}:${Math.floor(blue / 32)}`);
        edgePixels += 1;
      }
    }
    return {
      edgeAverageLuminance: edgeLuminance / Math.max(1, edgePixels),
      edgeColorBuckets: edgeBuckets.size,
    };
  }, source);
  const overlayAlpha = await page.locator("#start-layer").evaluate((node) => {
    const channels = getComputedStyle(node).backgroundColor.match(/[\d.]+/gu)?.map(Number) ?? [];
    return channels.length >= 4 ? channels[3] : 1;
  });
  return { ...raster, overlayAlpha };
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

async function waitForPaint(page) {
  await page.evaluate(() => {
    return new Promise((resolvePaint) => {
      requestAnimationFrame(() => requestAnimationFrame(resolvePaint));
    });
  });
  await page.waitForTimeout(700);
}

async function measureBlackPixelRatio(page, buffer) {
  const source = `data:image/png;base64,${buffer.toString("base64")}`;
  return page.evaluate(async (imageSource) => {
    const image = new Image();
    image.src = imageSource;
    await image.decode();
    const probe = document.createElement("canvas");
    probe.width = 400;
    probe.height = 225;
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let black = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] <= 4 && pixels[index + 1] <= 4 && pixels[index + 2] <= 4 && pixels[index + 3] >= 250) {
        black += 1;
      }
    }
    return black / (pixels.length / 4);
  }, source);
}

function summarizeMission(state) {
  return {
    mode: state.mode,
    stage: state.stage,
    sessionId: state.session?.id ?? null,
    attemptCount: state.session?.attemptCount ?? null,
    worldHash: state.world?.worldHash ?? null,
    worldRevision: state.world?.revision ?? null,
    blockage: state.world?.blockage ?? null,
    eastChannel: state.world?.eastChannel ?? null,
    tomatoBedsWatered: state.world?.tomatoBeds?.watered ?? null,
    verification: state.verification?.status ?? null,
    coachLine: state.coach?.focusLine ?? null,
    receiptVerdict: state.receipt?.verdict ?? null,
  };
}

function isAllowedUrl(value, allowedOrigin) {
  try {
    const url = new URL(value);
    if (["about:", "blob:", "data:"].includes(url.protocol)) return true;
    return url.origin === allowedOrigin;
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
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
      throw new Error(`Static server exited before becoming ready with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // The child may not have reached listen() yet.
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
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectInvocation()) {
  const result = await runBrowserSmoke(parseSmokeArgs());
  if (result.ok) {
    console.log(`Browser smoke PASS · ${result.reportPath}`);
  } else {
    console.error(`Browser smoke FAIL · ${result.reportPath}`);
    if (result.runnerError) console.error(result.runnerError.stack ?? result.runnerError.message);
    process.exitCode = 1;
  }
}
