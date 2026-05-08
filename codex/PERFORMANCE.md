# Flappy Hippo Tuned Build Performance Notes

## Current State

The performance pass in commit `d61340b` targeted only the tuned `/codex/` version. The root `/` route was intentionally left as the restored original game route from `c39e760`.

The chosen target for mobile is a steady, cooler 30fps rather than chasing 60fps. The goal is responsive gameplay with fewer frame-time spikes on normal phones.

## Decisions

- Optimize `/codex/` first.
- Prefer a consistent 30fps mobile mode when needed.
- Start with conservative changes before a renderer rewrite.
- Preserve the visual style, but cap expensive extras under load.
- Validate with an automated browser FPS smoke test.

## Implemented Changes

- Mobile, touch, and narrow screens use `pixelDensity(1)` and `frameRate(30)`.
- Gameplay simulation compensates for the 30fps render target so movement speed does not halve.
- Cloud puffs are cached into a reusable `p5.Graphics` sprite instead of redrawing the ellipses every frame.
- The large music MP3 lazy-loads on first action instead of preloading.
- Sound effects use small reusable audio pools instead of cloning audio nodes per play.
- Particle and death effects are capped and scaled down in mobile/performance mode.
- Per-frame allocation was reduced in obstacle cleanup, collision checks, particle cleanup, and effect cleanup.
- `codex/perf-smoke.mjs` was added to run a repeatable mobile-viewport frame-time smoke test.

## Validation

Command:

```bash
rtk node codex/perf-smoke.mjs
```

Latest passing result from the implementation pass:

- Viewport: `390x844`
- Device scale factor: `3`
- CPU throttle: `6x`
- Average: `29.92fps`
- p95: `34.8ms`
- p99: `35.9ms`
- Worst frame: `67.5ms`
- Failures: none

Additional checks:

- `node --check codex/sketch.js`
- `node --check codex/perf-smoke.mjs`
- `rtk node /Users/mark/.codex/tools/html-checker/check-html.mjs codex/index.html`
- In-app browser smoke: `/codex/index.html` loaded, started, and produced no console logs.

## Known Residue

The local worktree had untracked `assets/` and `scripts/` extraction leftovers during this pass. They were intentionally not staged.

## Next Steps

Test on a real phone. If gameplay still feels uneven, the next pass should be a deeper renderer pass:

- Cache more static layers.
- Consider moving the renderer away from frequent p5 drawing calls.
- Add an optional live frame-time/debug overlay for real-device testing.
- Revisit effect budgets after real-device measurements.
