import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const DEFAULT_OPTIONS = {
  cpu: 6,
  duration: 12000,
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
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
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: options.deviceScaleFactor,
      isMobile: true,
      hasTouch: true
    });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: options.cpu });

    await page.goto(`http://127.0.0.1:${port}/codex/index.html`, {
      waitUntil: "networkidle",
      timeout: 20000
    });
    await page.waitForFunction(
      () => window.__FLAPPY_HIPPO_GAME__ && typeof draw === "function",
      null,
      { timeout: 15000 }
    );

    await page.evaluate((duration) => {
      window.__drawSamples = [];
      const originalDraw = draw;
      let last = performance.now();
      window.draw = function instrumentedDraw() {
        const now = performance.now();
        window.__drawSamples.push(now - last);
        last = now;
        return originalDraw();
      };

      window.__FLAPPY_HIPPO_GAME__.flap();
      const flap = setInterval(() => window.__FLAPPY_HIPPO_GAME__.flap(), 620);
      setTimeout(() => clearInterval(flap), duration - 1000);
    }, options.duration);

    await page.waitForTimeout(options.duration);
    const result = await page.evaluate(() => {
      const samples = window.__drawSamples.slice(5);
      const sorted = [...samples].sort((a, b) => a - b);
      const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const p95 = sorted[Math.floor(samples.length * 0.95)] || 0;
      const p99 = sorted[Math.floor(samples.length * 0.99)] || 0;
      const worst = sorted[sorted.length - 1] || 0;
      const roundValue = (value) => Number(value.toFixed(2));
      return {
        sampleCount: samples.length,
        avgFrameMs: roundValue(avg),
        fps: roundValue(1000 / avg),
        p95: roundValue(p95),
        p99: roundValue(p99),
        worst: roundValue(worst),
        over33: samples.filter((value) => value > 33.4).length,
        over50: samples.filter((value) => value > 50).length,
        snapshot: window.__FLAPPY_HIPPO_GAME__.snapshot()
      };
    });

    const failures = [];
    if (result.p95 > options.p95Budget) failures.push(`p95 ${result.p95}ms > ${options.p95Budget}ms`);
    if (result.p99 > options.p99Budget) failures.push(`p99 ${result.p99}ms > ${options.p99Budget}ms`);
    if (result.worst > options.worstBudget) failures.push(`worst ${result.worst}ms > ${options.worstBudget}ms`);
    if (result.over50 > options.over50Budget) failures.push(`over50 ${result.over50} > ${options.over50Budget}`);

    console.log(JSON.stringify({ options, result, failures }, null, 2));
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
