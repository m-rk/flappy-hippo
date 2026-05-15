# Flappy Hippo GPT 5.5 Build Performance Notes

## Scope

This pass targets only the tuned GPT 5.5 build, now served as the default root `/` game.

The GPT 5.5 visual identity, game rules, controls, sounds, collection/growth effects, milestone effects, death burst, and public gameplay are preserved. New game hooks are perf-only and exposed only behind `?perf=1`.

## Browser Strategy

Repeated evidence runs use headless Playwright Chromium. This avoids Mark's normal Chrome profile and avoids opening repeated visible tabs or windows.

If headed mobile evidence is needed later, use one explicitly approved persistent visible browser session for the whole batch, then close it cleanly.

## Changes

- `gpt5-5/perf-smoke.mjs` supports `--scenario collection-stress`.
- `collection-stress` uses mobile/touch emulation, actual Playwright `touchscreen.tap()` input events, DPR/CPU options, real obstacle placement, and active pipe/ground collision risk.
- The stress run captures non-collection baseline pacing, pre-pickup, pickup, recovery, natural death, near-death frames, input-to-next-frame latency, score/state/scale, effects, death pieces/faces, viewport, DPR, browser mode, CPU throttle, and console/page errors.
- `--summary` prints compact JSON for repeated runs; the default output still includes inspectable trace windows.
- `gpt5-5/sketch.js` adds perf-only clearance snapshots and a perf-only real obstacle placer. It does not change public gameplay.

## Validation Commands

```bash
node --check gpt5-5/sketch.js
node --check gpt5-5/perf-smoke.mjs
node gpt5-5/perf-smoke.mjs --runs 5 --summary
node gpt5-5/perf-smoke.mjs --scenario collection-stress --profile mobile --runs 3 --traceWindowLimit 1 --summary
node gpt5-5/perf-smoke.mjs --scenario collection-stress --profile mobile --runs 2 --cpu 4 --traceWindowLimit 1 --summary
node gpt5-5/perf-smoke.mjs --scenario collection-stress --profile mobile --runs 2 --cpu 8 --traceWindowLimit 1 --summary
node gpt5-5/perf-smoke.mjs --scenario collection-stress --profile mobile --runs 2 --deviceScaleFactor 4 --traceWindowLimit 1 --summary
```

All commands passed with no console or page errors.

## Existing Score-20 Gate

Command:

```bash
node gpt5-5/perf-smoke.mjs --runs 5 --summary
```

Environment: headless Chromium, `390x844`, DPR `3`, touch/mobile emulation, `pointerCoarse: true`, 6x CPU throttle, p5 pixel density `1`, 30fps game target.

This gate still stabilizes the player and calls the perf collection helper directly. It does not exercise real touch timing, real pickup collision clearance, or missed-flap death risk.

| Run | FPS | p95 | p99 | Worst | >50ms | Collection Worst | Score 20 | Death Faces |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | 29.99 | 35.0ms | 35.9ms | 45.9ms | 0 | 45.9ms | yes | 20 |
| 2 | 29.81 | 37.0ms | 41.4ms | 43.3ms | 0 | 41.8ms | yes | 20 |
| 3 | 29.65 | 37.1ms | 41.9ms | 44.9ms | 0 | 40.0ms | yes | 20 |
| 4 | 29.69 | 37.3ms | 40.7ms | 42.4ms | 0 | 37.9ms | yes | 20 |
| 5 | 29.62 | 37.0ms | 40.9ms | 45.9ms | 0 | 41.1ms | yes | 20 |

Result: the old gate passed and did not reproduce a >50ms collection-window stall in this final five-run batch.

## Collection-Stress Result

Command:

```bash
node gpt5-5/perf-smoke.mjs --scenario collection-stress --profile mobile --runs 3 --traceWindowLimit 1 --summary
```

Environment: headless Chromium, `390x844`, DPR `3`, touch/mobile emulation, `pointerCoarse: true`, 6x CPU throttle, p5 pixel density `1`, 30fps game target.

Stress setup per pickup: one real obstacle is placed near the player with roughly `42px` ground clearance and `22px` bottom-pipe clearance, then a real touch tap is sent. Every run reached 20 real obstacle pickups, recorded near-death samples, then naturally died after score 20.

| Run | FPS | Worst | >50ms | Baseline Worst | Collection Window Worst | Delta | Input p95 | Reproduced |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 29.87 | 89.5ms | 1 | 37.9ms | 89.5ms | +51.6ms | 40.4ms | yes |
| 2 | 29.95 | 43.2ms | 0 | 39.4ms | 43.2ms | +3.8ms | 25.7ms | no |
| 3 | 29.95 | 42.1ms | 0 | 35.3ms | 42.1ms | +6.8ms | 25.5ms | no |

Coverage in every stress run:

- Real obstacle collections: `20`
- Completed pickup windows: `20`
- Max score: `20`
- Near-death samples: `78-82`
- Max particles: `42-46`
- Max collection effects: `3`
- Max death pieces / face pieces: `46` / `20`
- First death: natural post-score-20 death, not forced
- Console/page errors: none

Interpretation: the mobile stutter was reproduced intermittently. The strongest evidence is run 1: a pickup-window frame took `89.5ms`, while the non-collection baseline worst frame in that same run was `37.9ms`. That is a visible two-plus-frame miss at a 30fps target while pipe/ground risk was being sampled.

## Variants

| Command Variant | Runs | Reproduced | Worst Collection Window | Notes |
| --- | ---: | --- | ---: | --- |
| `--cpu 4` | 2 | yes, run 1 | 66.1ms | Baseline worst `42.6ms`; collection delta `+23.5ms`; input p95 `27.6ms`. |
| `--cpu 8` | 2 | no | 43.9ms | Both runs completed 20 pickups with near-death samples. |
| `--deviceScaleFactor 4` | 2 | no | 43.3ms | Actual DPR `4`; both runs completed 20 pickups with near-death samples. |

## Suspected Area

The reproduced stalls line up with the collection window, not raw touch delivery. Input-to-next-frame latency stayed below `50ms` in reproduced runs, while collection-window frame time exceeded the non-collection baseline by `+51.6ms` at 6x CPU and `+23.5ms` at 4x CPU.

The next fix pass should inspect collection/growth rendering and side effects in `gpt5-5/sketch.js`: `collectFace()`, `burst()`, `drawCollectionEffects()`, growth-scaled sprite/face drawing, SFX start behavior, and `localStorage.setItem()` during collection.

## Remaining Risk

This is still headless Chromium evidence on this Mac, not a real-phone thermal or browser trace. It is enough to show the old score-20 gate missed/masked Mark's mobile risk because it forced collections while stabilized and did not use real touch input or real obstacle clearance.

For device-specific follow-up, collect Mark's exact phone/browser, OS version, DPR/display scaling, battery or low-power mode, and a recording or remote-debug performance trace.
