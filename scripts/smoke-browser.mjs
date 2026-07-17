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
  "decide if irrigation is blocked",
  "act water tomatoes",
  "verify tomatoes are watered",
].join("\n");

const INVALID_PROGRAM = [
  "observe irrigation",
  "decide if irrigation is blocked",
  "act fetch farm",
  "verify tomatoes are watered",
].join("\n");

const REPAIRED_PROGRAM = DRAFT_PROGRAM.replace("act water tomatoes", "act clear blockage");

const ARTIFACTS = Object.freeze({
  hero: "artifacts/screenshots/agentville-build-week-hero.png",
  compilerError: "artifacts/screenshots/agentville-build-week-compiler-error.png",
  failure: "artifacts/screenshots/agentville-build-week-failure.png",
  receipt: "artifacts/screenshots/agentville-build-week-receipt.png",
  debrief1280: "artifacts/screenshots/agentville-build-week-debrief-1280.png",
  feedback: "artifacts/screenshots/agentville-build-week-feedback.png",
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

    await page.getByTestId("start-mission").click();
    await waitForMode(page, "authoring");
    const started = await readTextState(page, "started mission", check);
    stateSummary.initial = summarizeMission(started);
    equal("start creates first deterministic session", started.session.id, "AVBW-TEST-0001");
    equal("start restores blocked irrigation", started.world.blockage, "debris-present");
    equal("start keeps channel stopped", started.world.eastChannel, "blocked");
    equal("start restores three dry beds", started.world.tomatoBeds.watered, 0);
    await captureViewport(page, screenshotPaths.hero);

    const initialWorldHash = started.world.worldHash;
    const initialWorldRevision = started.world.revision;
    const editor = page.getByTestId("program-editor");
    const compileButton = page.getByTestId("compile-program");
    const runButton = page.getByTestId("run-program");

    await editor.fill(INVALID_PROGRAM);
    await compileButton.click();
    const invalid = await readTextState(page, "invalid program", check);
    stateSummary.invalid = summarizeMission(invalid);
    equal("unsafe syntax is rejected", invalid.program.compile.ok, false);
    equal("unsafe syntax points to line 3", invalid.program.compile.error?.line, 3);
    equal("unsafe syntax reports forbidden token", invalid.program.compile.error?.code, "FORBIDDEN_TOKEN");
    equal("invalid syntax cannot change world hash", invalid.world.worldHash, initialWorldHash);
    equal("invalid syntax cannot increment world revision", invalid.world.revision, initialWorldRevision);
    equal("invalid syntax cannot create a receipt", invalid.receipt, null);
    check(
      "compiler error is visibly tied to line 3",
      (await page.getByTestId("compiler-trace").textContent())?.includes("LINE 3"),
    );
    await captureViewport(page, screenshotPaths.compilerError);

    await editor.fill(DRAFT_PROGRAM);
    await compileButton.click();
    const compiledDraft = await readTextState(page, "compiled water draft", check);
    stateSummary.compiledDraft = summarizeMission(compiledDraft);
    equal("valid draft compiles", compiledDraft.program.compile.ok, true);
    equal("valid draft exposes four plan steps", compiledDraft.program.plan.length, 4);
    equal(
      "compiled phases preserve observe-decide-act-verify order",
      compiledDraft.program.plan.map((step) => step.phase).join(","),
      "observe,decide,act,verify",
    );
    equal("compile leaves world unchanged", compiledDraft.world.worldHash, initialWorldHash);
    equal(
      "four planned steps are visible",
      await page.locator('[data-testid="compiler-trace"] .trace-item').count(),
      4,
    );

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
    await advanceTime(page, 3500);

    const failed = await readTextState(page, "failed water draft", check);
    stateSummary.failure = summarizeMission(failed);
    equal("first accepted draft reaches FAIL", failed.verification.status, "FAIL");
    equal("failed draft keeps blockage present", failed.world.blockage, "debris-present");
    equal("failed draft releases no water", failed.world.eastChannel, "blocked");
    equal("failed draft waters zero beds", failed.world.tomatoBeds.watered, 0);
    equal("failed draft leaves world hash unchanged", failed.world.worldHash, initialWorldHash);
    equal("failure coach focuses line 3", failed.coach?.focusLine, 3);
    equal("failure coach recommends the allowlisted repair", failed.coach?.suggestion, "act clear blockage");
    check(
      "failure coach is visible",
      await page.getByTestId("coach-message").isVisible(),
    );
    await captureViewport(page, screenshotPaths.failure);

    await editor.fill(REPAIRED_PROGRAM);
    await compileButton.click();
    const compiledRepair = await readTextState(page, "compiled repair", check);
    equal("repair compiles", compiledRepair.program.compile.ok, true);
    equal("repair changes only the action command", compiledRepair.program.plan[2]?.command, "act clear blockage");
    equal("repair compile still leaves world unchanged", compiledRepair.world.worldHash, initialWorldHash);

    await runButton.click();
    await advanceTime(page, 4500);
    const passed = await readTextState(page, "passing repair", check);
    stateSummary.success = summarizeMission(passed);
    equal("repair reaches PASS", passed.verification.status, "PASS");
    equal("repair clears the blockage", passed.world.blockage, "cleared");
    equal("repair releases East Channel water", passed.world.eastChannel, "flowing");
    equal("repair waters all tomato beds", passed.world.tomatoBeds.watered, 3);
    check("repair changes authoritative world hash", passed.world.worldHash !== initialWorldHash, {
      before: initialWorldHash,
      after: passed.world.worldHash,
    });
    equal("receipt verdict is PASS", passed.receipt?.verdict, "PASS");
    equal("receipt preserves mission session", passed.receipt?.sessionId, started.session.id);
    equal("receipt records the repair action", passed.receipt?.action, "act clear blockage");
    equal("receipt before state is blocked", passed.receipt?.before?.irrigationBlocked, true);
    equal("receipt after state is clear", passed.receipt?.after?.irrigationBlocked, false);
    equal("receipt after state releases water", passed.receipt?.after?.waterReleased, true);
    equal("receipt after state proves three watered beds", passed.receipt?.after?.tomatoBedsWatered, 3);
    check("receipt panel is visible", await page.getByTestId("receipt").isVisible());
    check("learning recap is exposed in automation state", passed.learningRecap !== null);
    equal("learning recap records the repair path", passed.learningRecap?.path, "repair");
    equal("learning recap names the learner accomplishment", passed.learningRecap?.title, "You fixed the cause—and proved it.");
    equal(
      "learning recap keeps the four phase order",
      passed.learningRecap?.phases.map(({ phase }) => phase).join(","),
      "observe,decide,act,verify",
    );
    equal("learning recap explains the repaired action", passed.learningRecap?.phases[2]?.command, "act clear blockage");
    equal("learning recap reports the verified crop total", passed.learningRecap?.result.tomatoBedsWateredAfter, 3);
    equal("learning recap credits an observed failure", passed.learningRecap?.learner.diagnosedFailure, true);
    equal("learning recap identifies the changed line", passed.learningRecap?.learner.changedLine, 3);
    equal("learning recap preserves the failed action", passed.learningRecap?.learner.from, "act water tomatoes");
    equal("learning recap preserves the repaired action", passed.learningRecap?.learner.to, "act clear blockage");
    check("learning recap tile is visible", await page.getByTestId("learning-recap").isVisible());
    equal("learning recap renders four visible phase cards", await page.locator("[data-recap-phase]:visible").count(), 4);
    check(
      "learning takeaway tells the player they debugged an agent",
      (await page.getByTestId("learning-takeaway").textContent())?.includes("You just debugged an agent."),
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
        actions: rect(".receipt-actions"),
        tileOverflow: {
          horizontal: tile.scrollWidth > tile.clientWidth,
          vertical: tile.scrollHeight > tile.clientHeight,
        },
        actionHitTests: ["#copy-receipt", "#feedback-link", "#reset-button"].map(hitTest),
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
    check("all debrief actions remain hit-testable", debriefLayout.actionHitTests.every(Boolean), debriefLayout.actionHitTests);
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

    await feedbackPage.locator('label:has(input[name="clarity"][value="5"])').click();
    await feedbackPage.locator("#learned").fill("Verification checks the changed farm, not just Bert's intention.");
    await feedbackPage.locator("#friction").fill("I paused at line 3 before clearing the blockage.");
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
    equal("reset returns verification to NOT_RUN", reset.verification.status, "NOT_RUN");
    check("reset hides the mission debrief", await page.getByTestId("receipt").isHidden());
    check(
      "reset restores background controls to the focus order",
      await page.evaluate(() => [".topbar", ".stage-rail", ".workspace"].every((selector) => !document.querySelector(selector)?.inert)),
    );
    await page.waitForFunction(() => document.activeElement?.id === "program-editor");
    equal("reset returns focus to the program editor", await page.evaluate(() => document.activeElement?.id), "program-editor");

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
