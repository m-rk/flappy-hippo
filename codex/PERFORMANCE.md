# Flappy Hippo Tuned Build Performance Notes

## Current State

This pass targets only the tuned `/codex/` build. The root `/` game is intentionally unchanged.

The mobile target remains a steady 30fps rather than 60fps. The current proof uses a browser harness with a mobile viewport, touch input, DPR 3, and 6x CPU throttling. It now covers normal gameplay, active face collection effects, the score-20 milestone collection, and the score-20 death burst.

## Fresh Baseline

The previous `codex/perf-smoke.mjs` still passed frame budgets, but it only exercised incidental gameplay. In this pass it reached score `1` before death, with `22` death pieces and `1` face piece, so it did not prove the requested score-20+ collection/death case.

## Changes

- `codex/perf-smoke.mjs` now supports `--runs` and executes a deterministic performance scenario.
- The scenario starts normal gameplay, samples gameplay with obstacles, triggers repeated real face collections up to score `20`, then forces a death at score `20`.
- The harness records overall and per-phase frame metrics, coverage gates, score, game state, particles, collection effects, death pieces, death face pieces, console errors, page errors, and CPU throttle status.
- `codex/sketch.js` exposes perf-only helpers behind `?perf=1`; the public `/codex/` page keeps the same normal API.
- The snapshot API now reports particle, collection-effect, death-piece, and death-face counts without allocating a filtered death-piece array each sample.

## Validation Commands

```bash
node --check codex/sketch.js
node --check codex/perf-smoke.mjs
node codex/perf-smoke.mjs --runs 5
node /Users/mark/.codex/tools/html-checker/check-html.mjs codex/index.html
```

The html checker needed to run outside the sandbox so Chromium could launch. It passed desktop `1440x1000` and mobile `390x844` with `0` errors and `0` warnings.

## Five-Run Performance Result

Environment:

- Viewport: `390x844`
- Device scale factor: `3`
- Touch/mobile emulation: enabled
- CPU throttle: `6x`, applied in every run
- Duration per run: `12000ms`
- Required budgets: fps `>=28`, p95 `<=42ms`, p99 `<=70ms`, worst `<=180ms`, frames over 50ms `<=6`

| Run | Samples | FPS | p95 | p99 | Worst | >50ms | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 355 | 29.90 | 35.0ms | 39.0ms | 67.5ms | 1 | none |
| 2 | 356 | 30.00 | 34.9ms | 35.8ms | 45.6ms | 0 | none |
| 3 | 356 | 29.99 | 34.9ms | 37.6ms | 40.2ms | 0 | none |
| 4 | 355 | 29.98 | 34.7ms | 35.4ms | 50.5ms | 1 | none |
| 5 | 355 | 29.99 | 34.9ms | 40.6ms | 47.0ms | 0 | none |

Coverage in every run:

- Normal gameplay samples: `73`
- Gameplay samples with obstacles: `50-51`
- Collection samples: `144-145`
- Collection-active samples: `144-145`
- Death samples: `142-143`
- Death-effect samples: `25`
- Max score: `20`
- Score-20 collection reached: `true`
- Death triggered at score: `20`
- Max particles: `41`
- Max collection effects: `4`
- Max death pieces: `46`
- Max death face pieces: `20`
- Console/page errors: none

## Remaining Risk

This is still automated browser evidence, not a real-phone thermal test. The harness is intentionally stricter than the old smoke test for animation coverage, but real-device testing is still the best follow-up if the game feels uneven on specific phones.
