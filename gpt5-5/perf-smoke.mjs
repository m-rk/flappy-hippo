import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const SHARED_DEFAULTS = {
  runs: 1,
  duration: 12000,
  warmup: 1000,
  normalDuration: 2400,
  collectTarget: 20,
  collectEvery: 220,
  deathDelay: 400,
  flapEvery: 620,
  stressBaselineMs: 1800,
  stressWindowTimeout: 1600,
  stressTouchDelay: 0,
  stressRestMs: 80,
  stressRecoveryFrames: 8,
  stressGroundClearance: 42,
  stressBottomClearance: 22,
  stressFaceLead: 8,
  stressVelocity: 0.6,
  naturalDeathMs: 1800,
  stutterFrameMs: 66,
  inputDelayBudget: 70,
  traceWindowLimit: 5
};
const PROFILE_DEFAULTS = {
  mobile: {
    cpu: 6,
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    minSamples: 240,
    minFpsBudget: 28,
    p95Budget: 42,
    p99Budget: 70,
    worstBudget: 180,
    over50Budget: 6,
    over100Budget: 0
  },
  desktop: {
    cpu: 1,
    width: 1440,
    height: 1000,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    minSamples: 600,
    minFpsBudget: 55,
    p95Budget: 20,
    p99Budget: 33,
    worstBudget: 100,
    over50Budget: 2,
    over100Budget: 0
  }
};
const DEFAULT_OPTIONS = {
  ...SHARED_DEFAULTS,
  scenario: "perf",
  profile: "mobile",
  headed: false,
  summary: false,
  ...PROFILE_DEFAULTS.mobile
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
    browser = await chromium.launch({ headless: !options.headed });
    const runs = [];
    const runner =
      options.scenario === "public-start"
        ? runPublicStartScenario
        : options.scenario === "collection-stress"
          ? runCollectionStressScenario
          : runPerfScenario;
    for (let index = 1; index <= options.runs; index += 1) {
      runs.push(await runner(browser, port, index));
    }

    const failures = runs.flatMap((run) => run.failures.map((failure) => `run ${run.run}: ${failure}`));
    console.log(JSON.stringify(formatOutput({ options, runs, failures }), null, 2));
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
    isMobile: options.isMobile,
    hasTouch: options.hasTouch
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
  let cpuThrottleError = null;
  try {
    const client = await context.newCDPSession(page);
    if (options.cpu > 1) {
      await client.send("Emulation.setCPUThrottlingRate", { rate: options.cpu });
      cpuThrottleApplied = true;
    }
  } catch (error) {
    cpuThrottleApplied = false;
    cpuThrottleError = error.message;
  }

  await page.goto(`http://127.0.0.1:${port}/?perf=1`, {
    waitUntil: "networkidle",
    timeout: 20000
  });
  await page.waitForFunction(
    () => window.__FLAPPY_HIPPO_GAME__?.perf && typeof draw === "function",
    null,
    { timeout: 15000 }
  );
  await waitForSfxReady(page);

  await page.waitForTimeout(options.warmup);
  await page.evaluate(startPerfScenario, scenarioOptions(options));
  await page.waitForTimeout(options.duration);
  const pageResult = await page.evaluate(() => {
    if (window.__flappyPerf?.cleanup) window.__flappyPerf.cleanup();
    return {
      samples: window.__flappyPerf.samples,
      phaseSamples: window.__flappyPerf.phaseSamples,
      coverage: window.__flappyPerf.coverage,
      environment: {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        devicePixelRatio: window.devicePixelRatio,
        pointerCoarse: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
        userAgent: navigator.userAgent
      },
      snapshot: window.__FLAPPY_HIPPO_GAME__.snapshot()
    };
  });
  await context.close();

  const samples = pageResult.samples.slice(5);
  const result = {
    sampleCount: samples.length,
    ...summarizeSamples(samples),
    phaseMetrics: Object.fromEntries(
      Object.entries(pageResult.phaseSamples).map(([phase, values]) => [
        phase,
        summarizeSamples(phase === "gameplay" ? values.slice(5) : values)
      ])
    ),
    coverage: pageResult.coverage,
    environment: {
      profile: options.profile,
      requestedViewport: {
        width: options.width,
        height: options.height
      },
      actualViewport: pageResult.environment.viewport,
      requestedDeviceScaleFactor: options.deviceScaleFactor,
      actualDevicePixelRatio: pageResult.environment.devicePixelRatio,
      input: {
        isMobile: options.isMobile,
        hasTouch: options.hasTouch,
        pointerCoarse: pageResult.environment.pointerCoarse
      },
      browser: {
        engine: "chromium",
        headless: !options.headed,
        userAgent: pageResult.environment.userAgent
      },
      cpuThrottle: {
        requestedRate: options.cpu,
        applied: cpuThrottleApplied,
        error: cpuThrottleError
      }
    },
    snapshot: pageResult.snapshot,
    browser: {
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

async function runCollectionStressScenario(browser, port, run) {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch
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
  let cpuThrottleError = null;
  try {
    const client = await context.newCDPSession(page);
    if (options.cpu > 1) {
      await client.send("Emulation.setCPUThrottlingRate", { rate: options.cpu });
      cpuThrottleApplied = true;
    }
  } catch (error) {
    cpuThrottleApplied = false;
    cpuThrottleError = error.message;
  }

  await page.goto(`http://127.0.0.1:${port}/?perf=1`, {
    waitUntil: "networkidle",
    timeout: 20000
  });
  await page.waitForFunction(
    () =>
      window.__FLAPPY_HIPPO_GAME__?.perf?.placeCollectionObstacle &&
      window.__FLAPPY_HIPPO_GAME__?.perf?.snapshot &&
      typeof draw === "function",
    null,
    { timeout: 15000 }
  );
  await waitForSfxReady(page);

  await page.waitForTimeout(options.warmup);
  await page.evaluate(startCollectionStressScenario, scenarioOptions(options));
  await page.waitForTimeout(options.stressBaselineMs);

  for (let index = 0; index < options.collectTarget; index += 1) {
    const placement = await page.evaluate(
      ({ placementOptions }) => window.__flappyStress.placePickup(placementOptions),
      { placementOptions: stressPlacementOptions(options) }
    );
    if (placement.state !== "playing") break;

    await page.waitForTimeout(options.stressTouchDelay);
    if (options.hasTouch) {
      await page.touchscreen.tap(Math.floor(options.width / 2), Math.floor(options.height * 0.55));
    } else {
      await page.mouse.click(Math.floor(options.width / 2), Math.floor(options.height * 0.55));
    }

    try {
      await page.waitForFunction(
        (windowId) => {
          const status = window.__flappyStress.status();
          return status.lastCompletedWindowId >= windowId || status.state !== "playing";
        },
        placement.id,
        { timeout: options.stressWindowTimeout }
      );
    } catch (error) {
      await page.evaluate(
        ({ windowId, message }) => window.__flappyStress.markWindowTimeout(windowId, message),
        { windowId: placement.id, message: error.message }
      );
      break;
    }

    await page.waitForTimeout(options.stressRestMs);
    const status = await page.evaluate(() => window.__flappyStress.status());
    if (status.state !== "playing") break;
  }

  await page.evaluate(() => window.__flappyStress.beginNaturalDeath());
  await page.waitForTimeout(options.naturalDeathMs);
  const pageResult = await page.evaluate(() => {
    const stress = window.__flappyStress.finish();
    return {
      ...stress,
      environment: {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        devicePixelRatio: window.devicePixelRatio,
        pointerCoarse: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
        userAgent: navigator.userAgent
      },
      snapshot: window.__FLAPPY_HIPPO_GAME__.perf.snapshot()
    };
  });
  await context.close();

  const samples = pageResult.samples.slice(5);
  const collectionWindowSamples = [
    ...pageResult.phaseSamples.prePickup,
    ...pageResult.phaseSamples.pickup,
    ...pageResult.phaseSamples.recovery
  ];
  const baselineMetrics = summarizeSamples(pageResult.phaseSamples.baseline.slice(5));
  const collectionWindowMetrics = summarizeSamples(collectionWindowSamples);
  const inputDelays = pageResult.inputs
    .map((input) => input.nextFrameDelayMs)
    .filter((value) => Number.isFinite(value));
  const inputDelayMetrics = summarizeSamples(inputDelays);
  const stutterReproduced =
    collectionWindowMetrics.worst >= options.stutterFrameMs ||
    collectionWindowMetrics.over50 > baselineMetrics.over50 ||
    collectionWindowMetrics.over100 > 0 ||
    collectionWindowMetrics.worst - baselineMetrics.worst >= 16 ||
    inputDelayMetrics.p95 > options.inputDelayBudget ||
    pageResult.coverage.deathDuringPickup;

  const result = {
    sampleCount: samples.length,
    ...summarizeSamples(samples),
    phaseMetrics: Object.fromEntries(
      Object.entries(pageResult.phaseSamples).map(([phase, values]) => [phase, summarizeSamples(values)])
    ),
    collectionComparison: {
      baseline: baselineMetrics,
      collectionWindow: collectionWindowMetrics,
      worstDeltaMs: roundValue(collectionWindowMetrics.worst - baselineMetrics.worst),
      p95DeltaMs: roundValue(collectionWindowMetrics.p95 - baselineMetrics.p95),
      stutterFrameMs: options.stutterFrameMs,
      stutterReproduced
    },
    inputDelay: inputDelayMetrics,
    coverage: pageResult.coverage,
    windows: pageResult.windows,
    traceWindows: pageResult.traceWindows,
    inputs: pageResult.inputs,
    environment: {
      profile: options.profile,
      requestedViewport: {
        width: options.width,
        height: options.height
      },
      actualViewport: pageResult.environment.viewport,
      requestedDeviceScaleFactor: options.deviceScaleFactor,
      actualDevicePixelRatio: pageResult.environment.devicePixelRatio,
      input: {
        isMobile: options.isMobile,
        hasTouch: options.hasTouch,
        pointerCoarse: pageResult.environment.pointerCoarse
      },
      browser: {
        engine: "chromium",
        headless: !options.headed,
        userAgent: pageResult.environment.userAgent
      },
      cpuThrottle: {
        requestedRate: options.cpu,
        applied: cpuThrottleApplied,
        error: cpuThrottleError
      }
    },
    snapshot: pageResult.snapshot,
    browser: {
      consoleErrors,
      pageErrors
    }
  };

  return {
    run,
    result,
    failures: findCollectionStressFailures(result)
  };
}

async function waitForSfxReady(page) {
  await page
    .waitForFunction(
      () => {
        const api = window.__FLAPPY_HIPPO_GAME__;
        if (!api?.snapshot) return false;
        const audio = api.snapshot().audio || {};
        if (audio.sfxBackend !== "webaudio") return true;
        return Array.isArray(audio.sfxReady) && audio.sfxReady.length >= 5;
      },
      null,
      { timeout: 8000 }
    )
    .catch(() => {});
}

async function runPublicStartScenario(browser, port, run) {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch
  });
  await context.addInitScript(() => localStorage.clear());

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`http://127.0.0.1:${port}/`, {
    waitUntil: "networkidle",
    timeout: 20000
  });
  await page.waitForFunction(
    () => window.__FLAPPY_HIPPO_GAME__?.snapshot && typeof draw === "function",
    null,
    { timeout: 15000 }
  );
  await waitForSfxReady(page);
  await page.waitForTimeout(options.warmup);

  const before = await page.evaluate(publicPageState);
  if (options.hasTouch) {
    await page.touchscreen.tap(Math.floor(options.width / 2), Math.floor(options.height / 2));
  } else {
    await page.mouse.click(Math.floor(options.width / 2), Math.floor(options.height / 2));
  }
  await page
    .waitForFunction(() => window.__FLAPPY_HIPPO_GAME__.snapshot().state === "playing", null, { timeout: 2500 })
    .catch(() => {});
  const after = await page.evaluate(publicPageState);
  await context.close();

  const result = {
    environment: {
      profile: options.profile,
      requestedViewport: {
        width: options.width,
        height: options.height
      },
      requestedDeviceScaleFactor: options.deviceScaleFactor,
      browser: {
        engine: "chromium",
        headless: !options.headed
      },
      input: {
        isMobile: options.isMobile,
        hasTouch: options.hasTouch
      }
    },
    before,
    after,
    browser: {
      consoleErrors,
      pageErrors
    }
  };

  return {
    run,
    result,
    failures: findPublicStartFailures(result)
  };
}

function publicPageState() {
  return {
    title: document.title,
    path: location.pathname,
    hasPerfHelper: Boolean(window.__FLAPPY_HIPPO_GAME__.perf),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    devicePixelRatio: window.devicePixelRatio,
    pointerCoarse: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
    snapshot: window.__FLAPPY_HIPPO_GAME__.snapshot()
  };
}

function startCollectionStressScenario(config) {
  const api = window.__FLAPPY_HIPPO_GAME__;
  const stress = {
    samples: [],
    phaseSamples: {
      baseline: [],
      prePickup: [],
      pickup: [],
      recovery: [],
      naturalDeath: [],
      dying: [],
      nearDeath: []
    },
    windows: [],
    inputs: [],
    coverage: {
      targetCollections: config.collectTarget,
      realCollections: 0,
      pickupWindows: 0,
      nearDeathSamples: 0,
      maxScore: 0,
      maxParticles: 0,
      maxCollectionEffects: 0,
      maxDeathPieces: 0,
      maxDeathFaces: 0,
      firstDeath: null,
      deathDuringPickup: false,
      states: {}
    },
    cleanup: null
  };
  window.__flappyStress = stress;

  api.perf.startRun();
  const startedAt = performance.now();
  const originalDraw = draw;
  let last = performance.now();
  let frameIndex = 0;
  let inputIndex = 0;
  let activeWindow = null;
  let lastCompletedWindowId = 0;
  let naturalDeath = false;
  let lastScore = api.perf.snapshot().score;
  const recentFrames = [];
  const stabilizeTimer = setInterval(() => {
    if (!activeWindow && !naturalDeath) api.perf.stabilize();
  }, 120);

  window.__flappyStress = {
    placePickup,
    status,
    markWindowTimeout,
    beginNaturalDeath,
    finish,
    samples: stress.samples,
    phaseSamples: stress.phaseSamples,
    windows: stress.windows,
    inputs: stress.inputs,
    coverage: stress.coverage
  };

  window.addEventListener("touchstart", recordInput, { capture: true, passive: true });
  window.addEventListener("mousedown", recordInput, true);

  window.draw = function instrumentedStressDraw() {
    const now = performance.now();
    const frameMs = now - last;
    last = now;
    const drawResult = originalDraw();
    const snapshot = api.perf.snapshot();
    frameIndex += 1;

    for (const input of stress.inputs) {
      if (!input.nextFrameAt && input.at <= now) {
        input.nextFrameAt = elapsed(now);
        input.nextFrameDelayMs = metric(now - input.rawAt);
        input.nextFrame = compactSnapshot(snapshot);
      }
    }

    let phase = naturalDeath ? "naturalDeath" : "baseline";
    const scoreChanged = snapshot.score > lastScore;
    if (activeWindow && !activeWindow.done) {
      phase = activeWindow.pickupFrame ? "recovery" : "prePickup";
    }
    if (snapshot.state === "dying" || snapshot.effects.deathPieces > 0) {
      phase = "dying";
    }

    const frame = compactFrame(now, frameMs, snapshot, phase);
    if (scoreChanged) {
      stress.coverage.realCollections += snapshot.score - lastScore;
      if (activeWindow && !activeWindow.pickupFrame) {
        activeWindow.prePickupFrame = recentFrames[recentFrames.length - 1] || null;
        activeWindow.pickupFrame = frame;
        activeWindow.scoreAfter = snapshot.score;
        activeWindow.pickupAt = elapsed(now);
        activeWindow.inputToPickupMs = activeWindow.input ? metric(now - activeWindow.input.rawAt) : null;
        phase = "pickup";
        frame.phase = phase;
      }
    }

    if (activeWindow && !activeWindow.done) {
      activeWindow.frames.push(frame);
      if (activeWindow.pickupFrame) {
        activeWindow.recoveryFrameCount = (activeWindow.recoveryFrameCount || 0) + 1;
        if (!activeWindow.postPickupFrame && activeWindow.recoveryFrameCount > 1) {
          activeWindow.postPickupFrame = frame;
        }
        if (activeWindow.recoveryFrameCount >= config.stressRecoveryFrames || snapshot.state !== "playing") {
          if (snapshot.state !== "playing") stress.coverage.deathDuringPickup = true;
          completeActiveWindow(now, frame);
        }
      } else if (snapshot.state !== "playing") {
        stress.coverage.deathDuringPickup = true;
        completeActiveWindow(now, frame);
      }
    }

    stress.samples.push(frameMs);
    stress.phaseSamples[phase].push(frameMs);
    if (snapshot.clearance?.risk) {
      stress.coverage.nearDeathSamples += 1;
      stress.phaseSamples.nearDeath.push(frameMs);
    }
    recordCoverage(snapshot, frame);
    recentFrames.push(frame);
    if (recentFrames.length > 12) recentFrames.shift();
    lastScore = snapshot.score;
    return drawResult;
  };

  function placePickup(placementOptions) {
    const before = api.perf.snapshot();
    const placed = api.perf.placeCollectionObstacle(placementOptions);
    const id = stress.windows.length + 1;
    const windowRecord = {
      id,
      placedAt: elapsed(performance.now()),
      placedFrameIndex: frameIndex,
      scoreBefore: before.score,
      stateBefore: before.state,
      placement: compactSnapshot(placed),
      obstacle: placed.obstacleState[0] || null,
      input: null,
      prePickupFrame: null,
      pickupFrame: null,
      postPickupFrame: null,
      recoveryFrame: null,
      frames: [],
      done: false
    };
    stress.windows.push(windowRecord);
    activeWindow = windowRecord;
    return {
      id,
      state: placed.state,
      scoreBefore: before.score,
      placement: windowRecord.placement
    };
  }

  function recordInput(event) {
    const now = performance.now();
    const previous = stress.inputs[stress.inputs.length - 1];
    if (previous && now - previous.rawAt < 50) return;
    const input = {
      id: (inputIndex += 1),
      type: event.type,
      at: elapsed(now),
      rawAt: now,
      frameIndex,
      windowId: activeWindow ? activeWindow.id : null,
      snapshot: compactSnapshot(api.perf.snapshot())
    };
    stress.inputs.push(input);
    if (activeWindow && !activeWindow.input) {
      activeWindow.input = input;
    }
  }

  function completeActiveWindow(now, frame) {
    activeWindow.recoveryFrame = frame;
    activeWindow.doneAt = elapsed(now);
    activeWindow.done = true;
    activeWindow.frameMetrics = summarizeLocal(activeWindow.frames.map((item) => item.frameMs));
    activeWindow.minGroundClearance = metric(
      Math.min(...activeWindow.frames.map((item) => item.clearance.ground))
    );
    activeWindow.minPipeClearance = metric(
      Math.min(
        ...activeWindow.frames
          .map((item) => item.clearance.pipe?.min)
          .filter((value) => Number.isFinite(value))
      )
    );
    lastCompletedWindowId = activeWindow.id;
    stress.coverage.pickupWindows += activeWindow.pickupFrame ? 1 : 0;
    activeWindow = null;
  }

  function status() {
    const snapshot = api.perf.snapshot();
    return {
      state: snapshot.state,
      score: snapshot.score,
      lastCompletedWindowId,
      activeWindowId: activeWindow ? activeWindow.id : null
    };
  }

  function markWindowTimeout(windowId, message) {
    const windowRecord = stress.windows.find((item) => item.id === windowId);
    if (windowRecord) {
      windowRecord.timeout = message;
      windowRecord.done = true;
    }
    if (activeWindow && activeWindow.id === windowId) {
      activeWindow = null;
    }
    lastCompletedWindowId = Math.max(lastCompletedWindowId, windowId);
  }

  function beginNaturalDeath() {
    naturalDeath = true;
  }

  function finish() {
    clearInterval(stabilizeTimer);
    window.draw = originalDraw;
    window.removeEventListener("touchstart", recordInput, true);
    window.removeEventListener("mousedown", recordInput, true);
    return {
      samples: stress.samples,
      phaseSamples: stress.phaseSamples,
      windows: stress.windows.map(compactWindowSummary),
      traceWindows: selectedTraceWindows().map(compactWindow),
      inputs: stress.inputs.map(compactInput),
      coverage: stress.coverage
    };
  }

  function recordCoverage(snapshot, frame) {
    stress.coverage.maxScore = Math.max(stress.coverage.maxScore, snapshot.score);
    stress.coverage.maxParticles = Math.max(stress.coverage.maxParticles, snapshot.effects.particles);
    stress.coverage.maxCollectionEffects = Math.max(
      stress.coverage.maxCollectionEffects,
      snapshot.effects.collection
    );
    stress.coverage.maxDeathPieces = Math.max(stress.coverage.maxDeathPieces, snapshot.effects.deathPieces);
    stress.coverage.maxDeathFaces = Math.max(stress.coverage.maxDeathFaces, snapshot.effects.deathFaces);
    stress.coverage.states[snapshot.state] = (stress.coverage.states[snapshot.state] || 0) + 1;
    if (!stress.coverage.firstDeath && (snapshot.state === "dying" || snapshot.state === "crashed")) {
      stress.coverage.firstDeath = frame;
      if (activeWindow && !activeWindow.done) {
        stress.coverage.deathDuringPickup = true;
      }
    }
  }

  function compactFrame(now, frameMs, snapshot, phase) {
    return {
      at: elapsed(now),
      frameIndex,
      frameMs: metric(frameMs),
      phase,
      state: snapshot.state,
      score: snapshot.score,
      player: snapshot.player,
      clearance: snapshot.clearance,
      effects: snapshot.effects,
      obstacle: snapshot.obstacleState[0] || null,
      performance: snapshot.performance
    };
  }

  function compactSnapshot(snapshot) {
    return {
      state: snapshot.state,
      score: snapshot.score,
      player: snapshot.player,
      clearance: snapshot.clearance,
      effects: snapshot.effects,
      obstacle: snapshot.obstacleState[0] || null,
      performance: snapshot.performance
    };
  }

  function compactWindow(windowRecord) {
    const { frames, input, prePickupFrame, pickupFrame, postPickupFrame, recoveryFrame, ...rest } = windowRecord;
    return {
      ...rest,
      input: input ? compactInput(input) : null,
      traceFrames: [
        prePickupFrame,
        pickupFrame,
        postPickupFrame,
        recoveryFrame
      ].filter(Boolean)
    };
  }

  function compactWindowSummary(windowRecord) {
    return {
      id: windowRecord.id,
      placedAt: windowRecord.placedAt,
      placedFrameIndex: windowRecord.placedFrameIndex,
      scoreBefore: windowRecord.scoreBefore,
      stateBefore: windowRecord.stateBefore,
      scoreAfter: windowRecord.scoreAfter || windowRecord.scoreBefore,
      pickupAt: windowRecord.pickupAt || null,
      inputToPickupMs: windowRecord.inputToPickupMs || null,
      done: Boolean(windowRecord.done),
      timeout: windowRecord.timeout || null,
      frameMetrics: windowRecord.frameMetrics || null,
      minGroundClearance: windowRecord.minGroundClearance ?? null,
      minPipeClearance: windowRecord.minPipeClearance ?? null,
      placement: {
        player: windowRecord.placement.player,
        clearance: windowRecord.placement.clearance,
        obstacle: windowRecord.placement.obstacle
      },
      input: windowRecord.input ? compactInput(windowRecord.input) : null,
      traceFrameMs: {
        prePickup: windowRecord.prePickupFrame?.frameMs ?? null,
        pickup: windowRecord.pickupFrame?.frameMs ?? null,
        postPickup: windowRecord.postPickupFrame?.frameMs ?? null,
        recovery: windowRecord.recoveryFrame?.frameMs ?? null
      }
    };
  }

  function selectedTraceWindows() {
    const selected = new Map();
    const completed = stress.windows.filter((windowRecord) => windowRecord.done);
    if (completed[0]) selected.set(completed[0].id, completed[0]);
    if (completed.length > 0) selected.set(completed[completed.length - 1].id, completed[completed.length - 1]);

    const interesting = [...completed].sort(
      (a, b) => (b.frameMetrics?.worst || 0) - (a.frameMetrics?.worst || 0)
    );
    for (const windowRecord of interesting) {
      selected.set(windowRecord.id, windowRecord);
      if (selected.size >= config.traceWindowLimit) break;
    }

    return [...selected.values()]
      .sort((a, b) => a.id - b.id)
      .slice(0, config.traceWindowLimit);
  }

  function compactInput(input) {
    return {
      id: input.id,
      type: input.type,
      at: input.at,
      frameIndex: input.frameIndex,
      windowId: input.windowId,
      nextFrameAt: input.nextFrameAt || null,
      nextFrameDelayMs: input.nextFrameDelayMs || null
    };
  }

  function summarizeLocal(samples) {
    if (samples.length === 0) {
      return { avgFrameMs: 0, fps: 0, p50: 0, p95: 0, p99: 0, worst: 0, over33: 0, over50: 0, over100: 0 };
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return {
      avgFrameMs: metric(avg),
      fps: metric(1000 / avg),
      p50: metric(sorted[Math.floor(samples.length * 0.5)] || 0),
      p95: metric(sorted[Math.floor(samples.length * 0.95)] || 0),
      p99: metric(sorted[Math.floor(samples.length * 0.99)] || 0),
      worst: metric(sorted[sorted.length - 1] || 0),
      over33: samples.filter((value) => value > 33.4).length,
      over50: samples.filter((value) => value > 50).length,
      over100: samples.filter((value) => value > 100).length
    };
  }

  function elapsed(now) {
    return metric(now - startedAt);
  }

  function metric(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }
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
    flapEvery: parsedOptions.flapEvery,
    stressBaselineMs: parsedOptions.stressBaselineMs,
    stressWindowTimeout: parsedOptions.stressWindowTimeout,
    stressTouchDelay: parsedOptions.stressTouchDelay,
    stressRestMs: parsedOptions.stressRestMs,
    stressRecoveryFrames: parsedOptions.stressRecoveryFrames,
    stressGroundClearance: parsedOptions.stressGroundClearance,
    stressBottomClearance: parsedOptions.stressBottomClearance,
    stressFaceLead: parsedOptions.stressFaceLead,
    stressVelocity: parsedOptions.stressVelocity,
    naturalDeathMs: parsedOptions.naturalDeathMs,
    stutterFrameMs: parsedOptions.stutterFrameMs,
    inputDelayBudget: parsedOptions.inputDelayBudget,
    traceWindowLimit: parsedOptions.traceWindowLimit
  };
}

function stressPlacementOptions(parsedOptions) {
  return {
    groundClearance: parsedOptions.stressGroundClearance,
    bottomClearance: parsedOptions.stressBottomClearance,
    faceLead: parsedOptions.stressFaceLead,
    vy: parsedOptions.stressVelocity
  };
}

function formatOutput(output) {
  if (!options.summary) return output;
  return {
    options: output.options,
    failures: output.failures,
    runs: output.runs.map(summarizeRun)
  };
}

function summarizeRun(run) {
  const result = run.result;
  return {
    run: run.run,
    failures: run.failures,
    sampleCount: result.sampleCount,
    fps: result.fps,
    p50: result.p50,
    p95: result.p95,
    p99: result.p99,
    worst: result.worst,
    over33: result.over33,
    over50: result.over50,
    over100: result.over100,
    phaseMetrics: result.phaseMetrics,
    collectionComparison: result.collectionComparison,
    inputDelay: result.inputDelay,
    coverage: summarizeCoverage(result.coverage),
    maxWindowWorst: result.windows
      ? roundValue(Math.max(...result.windows.map((windowRecord) => windowRecord.frameMetrics?.worst || 0)))
      : undefined,
    maxInputDelay: result.inputs
      ? roundValue(Math.max(...result.inputs.map((input) => input.nextFrameDelayMs || 0)))
      : undefined,
    environment: result.environment,
    browser: result.browser
  };
}

function summarizeCoverage(coverage) {
  if (!coverage) return coverage;
  const summary = { ...coverage };
  if (summary.firstDeath) {
    summary.firstDeath = {
      at: summary.firstDeath.at,
      state: summary.firstDeath.state,
      score: summary.firstDeath.score,
      ground: summary.firstDeath.clearance?.ground,
      pipeMin: summary.firstDeath.clearance?.pipe?.min ?? null
    };
  }
  return summary;
}

function summarizeSamples(samples) {
  if (samples.length === 0) {
    return { avgFrameMs: 0, fps: 0, p50: 0, p95: 0, p99: 0, worst: 0, over33: 0, over50: 0, over100: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const p50 = sorted[Math.floor(samples.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(samples.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(samples.length * 0.99)] || 0;
  const worst = sorted[sorted.length - 1] || 0;
  return {
    avgFrameMs: roundValue(avg),
    fps: roundValue(1000 / avg),
    p50: roundValue(p50),
    p95: roundValue(p95),
    p99: roundValue(p99),
    worst: roundValue(worst),
    over33: samples.filter((value) => value > 33.4).length,
    over50: samples.filter((value) => value > 50).length,
    over100: samples.filter((value) => value > 100).length
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
  if (result.over100 > options.over100Budget) failures.push(`over100 ${result.over100} > ${options.over100Budget}`);
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
  if (options.cpu > 1 && !result.environment.cpuThrottle.applied) failures.push("CPU throttling was not applied");
  if (options.profile === "desktop" && result.environment.input.pointerCoarse) failures.push("desktop profile used coarse pointer mode");
  if (options.profile === "desktop" && result.snapshot.performance.mode !== "desktop") {
    failures.push(`game performance mode ${result.snapshot.performance.mode} was not desktop`);
  }
  if (options.profile === "mobile" && result.snapshot.performance.mode !== "mobile") {
    failures.push(`game performance mode ${result.snapshot.performance.mode} was not mobile`);
  }
  if (result.browser.consoleErrors.length > 0) failures.push(`console errors: ${result.browser.consoleErrors.join("; ")}`);
  if (result.browser.pageErrors.length > 0) failures.push(`page errors: ${result.browser.pageErrors.join("; ")}`);
  return failures;
}

function findCollectionStressFailures(result) {
  const failures = [];
  if (result.sampleCount < options.minSamples && !result.coverage.deathDuringPickup) {
    failures.push(`samples ${result.sampleCount} < ${options.minSamples}`);
  }
  if (result.coverage.pickupWindows === 0) failures.push("no real obstacle pickup windows completed");
  if (result.coverage.realCollections === 0) failures.push("no real obstacle collections were recorded");
  if (result.inputs.length === 0) failures.push("no real browser input events were recorded");
  if (result.coverage.nearDeathSamples === 0) failures.push("no near-death pipe/ground clearance was sampled");
  if (options.cpu > 1 && !result.environment.cpuThrottle.applied) failures.push("CPU throttling was not applied");
  if (options.profile === "mobile" && !result.environment.input.pointerCoarse) {
    failures.push("mobile collection stress did not use coarse pointer mode");
  }
  if (result.snapshot.performance.mode !== options.profile && options.profile === "mobile") {
    failures.push(`game performance mode ${result.snapshot.performance.mode} was not mobile`);
  }
  if (result.browser.consoleErrors.length > 0) failures.push(`console errors: ${result.browser.consoleErrors.join("; ")}`);
  if (result.browser.pageErrors.length > 0) failures.push(`page errors: ${result.browser.pageErrors.join("; ")}`);
  return failures;
}

function findPublicStartFailures(result) {
  const failures = [];
  if (result.before.hasPerfHelper || result.after.hasPerfHelper) failures.push("public page exposed perf helper");
  if (result.before.snapshot.state !== "ready") failures.push(`initial state ${result.before.snapshot.state} was not ready`);
  if (result.after.snapshot.state !== "playing") failures.push(`post-click state ${result.after.snapshot.state} was not playing`);
  if (options.profile === "desktop" && result.after.pointerCoarse) failures.push("desktop public start used coarse pointer mode");
  if (options.profile === "mobile" && !result.after.pointerCoarse) failures.push("mobile public start did not use coarse pointer mode");
  if (result.after.snapshot.audio.sfxReady.length === 0) failures.push("sound effects were not prepared");
  if (result.browser.consoleErrors.length > 0) failures.push(`console errors: ${result.browser.consoleErrors.join("; ")}`);
  if (result.browser.pageErrors.length > 0) failures.push(`page errors: ${result.browser.pageErrors.join("; ")}`);
  return failures;
}

function roundValue(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function parseArgs(args) {
  const raw = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "headed") {
      raw.headed = true;
      continue;
    }
    if (key === "headless") {
      raw.headed = false;
      continue;
    }
    if (key === "summary") {
      raw.summary = true;
      continue;
    }
    if (key === "profile" && typeof args[i + 1] === "string") {
      raw.profile = args[i + 1];
      i += 1;
      continue;
    }
    if (key === "scenario" && typeof args[i + 1] === "string") {
      raw.scenario = args[i + 1];
      i += 1;
      continue;
    }
    const value = Number(args[i + 1]);
    if (Number.isFinite(value)) {
      raw[key] = value;
      i += 1;
    }
  }

  const profile = Object.prototype.hasOwnProperty.call(PROFILE_DEFAULTS, raw.profile)
    ? raw.profile
    : DEFAULT_OPTIONS.profile;
  const parsed = {
    ...SHARED_DEFAULTS,
    scenario: "perf",
    profile,
    headed: false,
    summary: false,
    ...PROFILE_DEFAULTS[profile]
  };

  for (const [key, value] of Object.entries(raw)) {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      parsed[key] = value;
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
