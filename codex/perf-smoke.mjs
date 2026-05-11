import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const DEFAULT_OPTIONS = {
  runs: 1,
  cpu: 6,
  duration: 12000,
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  normalDuration: 2400,
  collectTarget: 20,
  collectEvery: 220,
  deathDelay: 400,
  flapEvery: 620,
  minSamples: 240,
  minFpsBudget: 28,
  p95Budget: 42,
  p99Budget: 70,
  worstBudget: 180,
  over50Budget: 6
};

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav"
};

const options = parseArgs(process.argv.slice(2));
const { chromium } = loadPlaywright();

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const file = path.join(ROOT, pathname === "/" ? "index.html" : pathname.slice(1));

  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end("not found");
    return;
  }

  response.writeHead(200, { "content-type": MIME_TYPES[path.extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(response);
});

server.listen(0, "127.0.0.1", async () => {
  let browser;
  try {
    const port = server.address().port;
    browser = await chromium.launch({ headless: true });
    const runs = [];
    for (let index = 1; index <= options.runs; index += 1) {
      runs.push(await runPerfScenario(browser, port, index));
    }

    const failures = runs.flatMap((run) => run.failures.map((failure) => `run ${run.run}: ${failure}`));
    console.log(JSON.stringify({ options, runs, failures }, null, 2));
    await browser.close();
    server.close(() => process.exit(failures.length > 0 ? 1 : 0));
  } catch (error) {
    if (browser) await browser.close();
    server.close(() => {
      console.error(error);
      process.exit(1);
    });
  }
});

async function runPerfScenario(browser, port, run) {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: true,
    hasTouch: true
  });
  await context.addInitScript(() => localStorage.clear());

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  let cpuThrottleApplied = false;
  try {
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: options.cpu });
    cpuThrottleApplied = true;
  } catch (error) {
    cpuThrottleApplied = false;
  }

  await page.goto(`http://127.0.0.1:${port}/codex/index.html?perf=1`, {
    waitUntil: "networkidle",
    timeout: 20000
  });
  await page.waitForFunction(
    () => window.__FLAPPY_HIPPO_GAME__?.perf && typeof draw === "function",
    null,
    { timeout: 15000 }
  );

  await page.evaluate(startPerfScenario, scenarioOptions(options));
  await page.waitForTimeout(options.duration);
  const pageResult = await page.evaluate(() => {
    if (window.__flappyPerf?.cleanup) window.__flappyPerf.cleanup();
    return {
      samples: window.__flappyPerf.samples,
      phaseSamples: window.__flappyPerf.phaseSamples,
      coverage: window.__flappyPerf.coverage,
      snapshot: window.__FLAPPY_HIPPO_GAME__.snapshot()
    };
  });
  await context.close();

  const samples = pageResult.samples.slice(5);
  const result = {
    sampleCount: samples.length,
    ...summarizeSamples(samples),
    phaseMetrics: Object.fromEntries(
      Object.entries(pageResult.phaseSamples).map(([phase, values]) => [phase, summarizeSamples(values)])
    ),
    coverage: pageResult.coverage,
    snapshot: pageResult.snapshot,
    browser: {
      cpuThrottleApplied,
      consoleErrors,
      pageErrors
    }
  };
  return {
    run,
    result,
    failures: findFailures(result)
  };
}

function startPerfScenario(config) {
  const api = window.__FLAPPY_HIPPO_GAME__;
  const perf = {
    samples: [],
    phaseSamples: {
      gameplay: [],
      collection: [],
      death: []
    },
    phase: "gameplay",
    coverage: {
      gameplaySamples: 0,
      gameplayObstacleSamples: 0,
      collectionSamples: 0,
      collectionActiveSamples: 0,
      deathSamples: 0,
      deathEffectSamples: 0,
      maxScore: 0,
      score20Collected: false,
      deathTriggeredAtScore: null,
      maxParticles: 0,
      maxCollectionEffects: 0,
      maxDeathPieces: 0,
      maxDeathFaces: 0,
      states: {}
    },
    cleanup: null
  };
  window.__flappyPerf = perf;

  api.perf.startRun();
  const startedAt = performance.now();
  const originalDraw = draw;
  let last = performance.now();

  window.draw = function instrumentedDraw() {
    const now = performance.now();
    const frameMs = now - last;
    last = now;
    const drawResult = originalDraw();
    const snapshot = api.snapshot();
    perf.samples.push(frameMs);
    perf.phaseSamples[perf.phase].push(frameMs);
    recordCoverage(snapshot);
    return drawResult;
  };

  function recordCoverage(snapshot) {
    perf.coverage.maxScore = Math.max(perf.coverage.maxScore, snapshot.score);
    perf.coverage.maxParticles = Math.max(perf.coverage.maxParticles, snapshot.effects.particles);
    perf.coverage.maxCollectionEffects = Math.max(perf.coverage.maxCollectionEffects, snapshot.effects.collection);
    perf.coverage.maxDeathPieces = Math.max(perf.coverage.maxDeathPieces, snapshot.effects.deathPieces);
    perf.coverage.maxDeathFaces = Math.max(perf.coverage.maxDeathFaces, snapshot.effects.deathFaces);
    perf.coverage.states[snapshot.state] = (perf.coverage.states[snapshot.state] || 0) + 1;

    if (perf.phase === "gameplay") {
      perf.coverage.gameplaySamples += 1;
      if (snapshot.state === "playing" && snapshot.obstacles > 0) {
        perf.coverage.gameplayObstacleSamples += 1;
      }
    } else if (perf.phase === "collection") {
      perf.coverage.collectionSamples += 1;
      if (snapshot.effects.collection > 0) {
        perf.coverage.collectionActiveSamples += 1;
      }
    } else if (perf.phase === "death") {
      perf.coverage.deathSamples += 1;
      if (snapshot.state === "dying" || snapshot.effects.deathPieces > 0) {
        perf.coverage.deathEffectSamples += 1;
      }
    }
  }

  let collections = 0;
  let deathTriggered = false;

  const flapTimer = setInterval(() => api.flap(), config.flapEvery);
  const stabilizeTimer = setInterval(() => {
    if (performance.now() - startedAt >= config.normalDuration && !deathTriggered) {
      api.perf.stabilize();
    }
  }, 120);
  const collectTimer = setInterval(() => {
    const elapsed = performance.now() - startedAt;
    if (elapsed < config.normalDuration) return;
    if (collections < config.collectTarget) {
      perf.phase = "collection";
      const snapshot = api.perf.collectFace();
      collections += 1;
      if (snapshot.score >= config.collectTarget) {
        perf.coverage.score20Collected = true;
      }
      return;
    }

    if (!deathTriggered && elapsed >= config.normalDuration + config.collectTarget * config.collectEvery + config.deathDelay) {
      perf.phase = "death";
      const snapshot = api.perf.forceDeath();
      perf.coverage.deathTriggeredAtScore = snapshot.score;
      deathTriggered = true;
      clearInterval(flapTimer);
      clearInterval(stabilizeTimer);
      clearInterval(collectTimer);
    }
  }, config.collectEvery);

  perf.cleanup = () => {
    clearInterval(flapTimer);
    clearInterval(stabilizeTimer);
    clearInterval(collectTimer);
  };
}

function scenarioOptions(parsedOptions) {
  return {
    duration: parsedOptions.duration,
    normalDuration: parsedOptions.normalDuration,
    collectTarget: parsedOptions.collectTarget,
    collectEvery: parsedOptions.collectEvery,
    deathDelay: parsedOptions.deathDelay,
    flapEvery: parsedOptions.flapEvery
  };
}

function summarizeSamples(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const p95 = sorted[Math.floor(samples.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(samples.length * 0.99)] || 0;
  const worst = sorted[sorted.length - 1] || 0;
  return {
    avgFrameMs: roundValue(avg),
    fps: roundValue(1000 / avg),
    p95: roundValue(p95),
    p99: roundValue(p99),
    worst: roundValue(worst),
    over33: samples.filter((value) => value > 33.4).length,
    over50: samples.filter((value) => value > 50).length
  };
}

function findFailures(result) {
  const failures = [];
  if (result.sampleCount < options.minSamples) failures.push(`samples ${result.sampleCount} < ${options.minSamples}`);
  if (result.fps < options.minFpsBudget) failures.push(`fps ${result.fps} < ${options.minFpsBudget}`);
  if (result.p95 > options.p95Budget) failures.push(`p95 ${result.p95}ms > ${options.p95Budget}ms`);
  if (result.p99 > options.p99Budget) failures.push(`p99 ${result.p99}ms > ${options.p99Budget}ms`);
  if (result.worst > options.worstBudget) failures.push(`worst ${result.worst}ms > ${options.worstBudget}ms`);
  if (result.over50 > options.over50Budget) failures.push(`over50 ${result.over50} > ${options.over50Budget}`);
  if (result.coverage.gameplaySamples === 0) failures.push("normal gameplay phase not sampled");
  if (result.coverage.gameplayObstacleSamples === 0) failures.push("normal gameplay never included an obstacle");
  if (result.coverage.collectionActiveSamples === 0) failures.push("collection effects were never active");
  if (!result.coverage.score20Collected) failures.push(`score ${options.collectTarget} collection was not reached`);
  if ((result.coverage.deathTriggeredAtScore || 0) < options.collectTarget) {
    failures.push(`death triggered at score ${result.coverage.deathTriggeredAtScore} < ${options.collectTarget}`);
  }
  if (result.coverage.deathEffectSamples === 0) failures.push("death effect was not sampled");
  if (result.coverage.maxDeathFaces < options.collectTarget) {
    failures.push(`death face pieces ${result.coverage.maxDeathFaces} < ${options.collectTarget}`);
  }
  if (!result.browser.cpuThrottleApplied) failures.push("CPU throttling was not applied");
  if (result.browser.consoleErrors.length > 0) failures.push(`console errors: ${result.browser.consoleErrors.join("; ")}`);
  if (result.browser.pageErrors.length > 0) failures.push(`page errors: ${result.browser.pageErrors.join("; ")}`);
  return failures;
}

function roundValue(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function parseArgs(args) {
  const parsed = { ...DEFAULT_OPTIONS };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = Number(args[i + 1]);
    if (Number.isFinite(value) && Object.prototype.hasOwnProperty.call(parsed, key)) {
      parsed[key] = value;
      i += 1;
    }
  }
  return parsed;
}

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    "playwright",
    path.join(process.env.CODEX_HOME || path.join(homedir(), ".codex"), "tools/html-checker/node_modules/playwright")
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      // Try the next candidate.
    }
  }

  throw new Error("Playwright is required. Install it locally or set PLAYWRIGHT_PATH to a Playwright module path.");
}
