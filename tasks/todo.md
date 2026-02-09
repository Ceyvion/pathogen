# TODO

## Task: Review "10 Improvements" Implementation (2026-02-09)

## Plan

- [x] Inspect actual diffs for new/modified files (scoring, milestones, gameover routing, auto-pause, tutorial, HUD controls).
- [x] Run `pnpm check`, `pnpm test --run`, `pnpm build` to catch typing/regressions.
- [x] Manually sanity-check high-risk flows: milestone trigger dedupe, pause/unpause, gameover transition, localStorage usage, keyboard shortcuts cleanup.
- [x] Record findings (bugs, edge cases, or "looks good but watch X") in Review.

## Verification

- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

## Review

- Fixed a real gameplay bug: milestones / auto-pause / gameover could set `state.paused = true` mid-tick, but the sim loop would keep integrating the remaining accumulated time. Now `tick()` stops integrating immediately when `paused` flips inside the step.
- Fixed persistence edge cases: new fields (`milestonesTriggered`, `emergencyUnlocked`, `pauseReason`, `autoPauseEnabled`, emergency effect state, `gameResult`, `autoCollectBubbles`) are now included in save/load so reloads do not re-trigger milestone rewards or hide unlocked emergency actions.
- Added regression coverage for both in `src/state/__tests__/autoPause.test.ts`.

## Task: Fix In-Game Day Drift When Pacing Changes (2026-02-08)

## Plan

- [x] Make `state.day` the single source of truth for "day index" everywhere (UI, AI director, daily tick boundaries).
- [x] Add regression coverage: changing pacing mid-run must not make `dayIndex` jump backwards/forwards or mislabel daily events.
- [x] Run `pnpm check`, `pnpm test --run`, `pnpm build`.

## Verification

- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

## Review

- Fixed a pacing-dependent bug where multiple systems derived "day index" from `t / msPerDay`, causing the displayed day and AI cadence to jump when pacing changed.
- Standardized on `state.day` for UI day display, AI director dayIndex, and daily boundary logic.
- Added a regression test ensuring AI director snapshots use `state.day` even after a pacing change.

## Task: Map Fails To Load After Reload (2026-02-08)

## Plan

- [x] Repro in browser (dev + preview) and capture console errors/network failures.
- [x] Identify whether this is MapLibre init, style loading, GeoJSON source load, or deck.gl overlay failure.
- [x] Implement minimal fix (persist scene + auto-save on reload + auto-resume).
- [x] Add regression coverage where feasible (Playwright smoke repro).

## Verification

- [x] Manual-ish: Playwright repro script shows `.nyc-map` exists after reload and is not stuck on Title.
- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

## Review

- Persisted last UI scene (`sceneV1`) and added `resumeOnLoad` so browser refresh returns to gameplay when a save exists.
- Added auto-save on `pagehide`/`beforeunload` while in-game so refresh always has a snapshot to restore.

## Task: NEXUS Action Cadence Guardrails (Suggested Action Dedup + Monotonic Phase) (2026-02-08)

## Plan

- [x] Prevent LLM `suggestedActions` from firing on the same in-game day as a local daily NEXUS action (dedupe via `aiDirector.lastActionDay`).
- [x] Make `aiDirector.phase` monotonic (never decreases on cure progress setbacks).
- [x] Add Vitest coverage for both behaviors.

## Verification

- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

## Review

- Suggested actions are skipped if `aiDirector.lastActionDay === curDay`, preventing same-day action spikes from LLM + local engine overlap.
- NEXUS phase escalates monotonically (only updates when the computed phase is higher), so cure setbacks no longer de-escalate the phase.
- Added tests covering both behaviors in `src/state/__tests__/aiDirector.test.ts`.

## Task: Hospital Overload Response + AI Director Guardrails (2026-02-07)

## Plan

- [x] Add citywide `hospResponseTier` + tier logic (`src/sim/hospResponse.ts`) and update it daily in `src/state/store.ts`.
- [x] Apply response multipliers to effective hospital capacity + discharge in the sim tick.
- [x] Update hospital UI + map overlay to compute load vs effective capacity; show overflow instead of implying impossible occupancy.
- [x] Make AI director see hotspot reality: `hospLoad` uses max load (not avg) and includes capacity multipliers; apply a small “director override” on response escalations.
- [x] Add unit tests for tier transitions and loosen AI-director tests that assumed `events[0]` ordering.

## Verification

- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

## Task: Investigate Title/Setup Screen Styling (2026-02-07)

## Plan

- [x] Identify the markup/components used for title and setup screens and their associated stylesheets.
- [x] Catalog any existing background/vignette effects or layout constraints tied to those screens.
- [x] Determine safe CSS hooks or component locations where a full-screen canvas background effect can be mounted without breaking layout.
- [x] Summarize findings and propose integration points for the new canvas effect.

## Verification

- [x] Confirm that the summary covers the relevant CSS files, existing visual effects, and recommended integration spots.

## Notes

- Screens: `src/ui/screens/TitleScreen.tsx` and `src/ui/screens/SetupScreen.tsx`
- Styling: `src/styles/globals.css` (`.title-screen`, `.setup-screen`, plus pseudo-element grid/glow overlays)
- Global overlays: `src/styles/globals.css` (`.app-root::before/after` scanlines + phosphor burn)
- Safe mount point for a full-screen effect: render an absolutely-positioned canvas as a first child of `.title-screen`, keep `pointer-events: none`, then layer pseudo elements + the `.title-panel` above via `z-index`.

## Task: Virus-Themed UI/Loading Effects (TSL Morphing Particles) (2026-02-07)

## Plan

- [x] Review `tsl-morphing-particles` (Three.js TSL + WebGPU) and extract a minimal technique we can ship without its demo assets.
- [x] Add a `VirusMorphingBackdrop` UI component that mounts a full-screen canvas.
- [x] Implement the WebGPU renderer path (Three `WebGPURenderer` + TSL `SpriteNodeMaterial` morphing instanced particles).
- [x] Implement a graceful fallback (disable effect if WebGPU init fails / reduced-motion is set).
- [x] Integrate backdrop into Title + Setup screens (behind panels; no pointer interception).
- [x] CSS layering: ensure pseudo-elements (grid/glow) sit above the canvas, and the panel sits above everything.
- [x] Add an attribution comment + note about upstream repo license (no `LICENSE` in repo as of 2026-02-07).

## Verification

- [x] Manual: `pnpm dev` -> Title screen shows subtle virus-like particle morphing in the background.
- [x] Manual: Setup screen shows the same background; UI remains clickable.
- [ ] Manual: `prefers-reduced-motion: reduce` disables the effect.
- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`


## Task: AI Evolution Director (OpenRouter) (2026-02-07)

## Plan

- [x] Add AI director types to `src/state/types.ts`.
- [x] Add director metrics helper `src/sim/aiDirectorMetrics.ts`.
- [x] Wire into sim tick + save/load + `startNewGame()` in `src/state/store.ts`.
- [x] Add Setup + TopBar UI toggles.
- [x] Add Node API proxy server (`server/`) that calls OpenRouter and validates JSON schema.
- [x] Add Vitest coverage for gating/clamping/error handling.

## Verification

- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

## Notes

- Add `OPENROUTER_API_KEY` to `.env.local` to enable.
- Free-model calls are conservative (cooldowns + daily budget).

## Task: OpenRouter Model Switch (Trinity Mini) (2026-02-08)

## Plan

- [x] Switch server default model to `arcee-ai/trinity-mini:free`.
- [x] Update OpenRouter client to support pass-through params and extract tool-call JSON (`tool_calls[].function.arguments`).
- [x] Update `/api/ai-director` to use tool-calling + retries and bump token budget for Trinity Mini (reasoning-mandatory endpoint).
- [x] Verify `/api/ai-director` returns 200 with valid `decision` for architect + controller inputs.

## Verification

- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

## Task: Fix Borough Overlay Flicker (2026-02-08)

## Plan

- [x] Identify flicker source in deck.gl infection speckles/dust overlays (layers were only rendered for a single frame per update window).
- [x] Persist the infection FX buffers and fade particles in/out to avoid blinking.
- [x] Disable depth testing for the speckle/dust/death overlays to prevent shimmer against 3D buildings.

## Verification

- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

## Task: Harden Upgrade Effect Typing (Remove `as any`) (2026-02-07)

## Plan

- [x] Define a strict `UpgradeEffects` type (union of allowed effect keys) in `src/state/types.ts`.
- [x] Update `Upgrade.effects` to use `UpgradeEffects` so unknown keys are a type error.
- [x] Remove effect-related `as any` casts in `src/state/store.ts` (upgrade definitions + sim aggregation + cordon logic).

## Verification

- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

## Task: Slow Day Progression + Improve First-Run HUD Clarity (2026-02-07)

## Plan

- [x] Find the in-game clock constants (`msPerDay`) and how day progression is displayed.
- [x] Slow default day pacing and retune pacing presets (slow/normal/fast).
- [x] Add first-run onboarding hints (overlay copy + one-time toasts) so the HUD reads without hovering tooltips.

## Verification

- [ ] Manual: start a new game, pick a borough, watch Day counter pacing at 1× for ~30s (should feel readable).
- [ ] Manual: confirm the onboarding toast shows only once (reload and start again).
- [x] Automated: `pnpm test --run`.
- [x] Automated: `pnpm build`.

## Task: Make Map Overlay Icons Clickable (Fix Drag-Pan Stealing Clicks) (2026-02-07)

## Plan

- [x] Repro: clicking hospital icons feels like drag-pan activates (grab), preventing selection.
- [x] Make map clicks more tolerant of small motion (`clickTolerance`).
- [x] Prevent MapLibre drag-pan from stealing deck.gl icon/bubble clicks (stop propagation + suppress drag-pan on hover).

## Verification

- [ ] Manual: click a hospital icon several times; it should reliably trigger the event/camera behavior without dragging.
- [ ] Manual: bubbles should still be clickable; dragging empty map should still pan as normal.
- [x] Automated: `pnpm test --run`.
- [x] Automated: `pnpm build`.

## Task: Remove Map Attribution "Info" Icon (Keep Credits Visible) (2026-02-07)

## Plan

- [x] Switch MapLibre attribution control from compact (icon) to non-compact (text only).

## Verification

- [ ] Manual: confirm the “i” attribution icon is gone; attribution text remains visible.

## Task: Research Spawn + Ticker Best Practices (Web)

## Plan

- [ ] Identify primary sources for UI-safe pickup spawning and occlusion/safe-zone handling.
- [ ] Identify primary sources for game event/news ticker systems (templates, shuffle bag, cooldowns).
- [ ] Collect recommended simple algorithms (Poisson disk sampling, shuffle bag, weighted random with cooldown).

## Task: Research Plague Inc Popularity Evolution (2015-2021+) (Web) (2026-02-07)

## Plan

- [ ] Collect primary sources for Plague Inc platform milestones (Steam/PC, major updates/DLCs, downloads).
- [ ] Collect coverage of outbreak-driven popularity spikes (late Ebola period + COVID-19) across mobile + Steam.
- [ ] Find credible mentions of educational/public-health relevance (WHO/CEPI/academic/press) and charity actions.
- [ ] Pull streamer/YouTube amplification evidence (credible coverage of streaming/YouTube trends, not anecdotes).
- [ ] Synthesize: dated timeline + 5-10 fame drivers + 5-10 sources w/ URLs + actionable lessons for our game.

## Verification

- [ ] Timeline includes concrete dates and explicitly calls out spike windows vs baseline periods.
- [ ] Each key claim is backed by at least one credible source (primary preferred; reputable press acceptable).
- [ ] Synthesize actionable bullet points with citations/links.

## Verification

- [ ] Confirm each recommendation is backed by at least one primary source.

## Problem Statement

When starting a new game, the simulation advances immediately and can generate infections without the player placing Patient Zero or selecting a starting focus. This feels like the game "picks a random spot and goes" and it ramps too quickly before the player has any agency.

## Current Root Causes (Initial Findings)

- `src/state/store.ts` runs disease dynamics as soon as `paused` is `false`, and does not gate on `awaitingPatientZero`.
- The model includes a background `importationPerDay`, so after the ramp delay it can create new exposures even with no seeded outbreak.
- `startNewGame()` sets `paused = false` even when it sets `awaitingPatientZero = true`.
- Architect free-play `seedMode` selected in UI is ignored (`startNewGame()` currently hardcodes `seedMode = 'pick'`).
- `tick(dtMs)` can "catch up" by running many fixed steps if `dtMs` is large (tab switch / first frame), accelerating perceived start.

## Plan

- [ ] Reproduce: start each mode, do not click map; confirm day advances and infections appear anyway; measure time-to-outbreak.
- [x] Define a proper run phase/state machine (minimum viable: gate sim advancement while `awaitingPatientZero`).
- [x] Fix `startNewGame()` to honor setup options and to not advance sim until a real start condition is met:
  - Architect `seedMode: pick`: set `paused=true`, `awaitingPatientZero=true`, store `patientZeroSeedAmount`.
  - Architect `seedMode: random`: pick a borough deterministically, seed immediately, then start running.
  - Architect `seedMode: widespread`: seed across all boroughs, then start running.
  - Controller: decide whether to start paused until focus selected; ensure outbreak state is defined (no hidden random seeding unless intended).
- [x] Fix `tick()` to prevent infection generation before the outbreak is seeded:
  - Early-return while awaiting placement/focus.
  - Alternatively: keep advancing time but disable disease dynamics and importations until seeded (less preferred).
  - Clamp `dtMs` (or cap fixed steps) to prevent huge catch-up jumps.
- [ ] Add deterministic hooks for verification (`window.advanceTime(ms)` and `window.render_game_to_text()`), so automated tests can validate startup behavior.
- [x] Add unit tests (Vitest) for the gating behavior and seed mode behavior.

## Verification

- [ ] Manual: Start Architect (pick) and do nothing for 30 seconds; confirm day/infections do not advance until you click a borough.
- [ ] Manual: Start Architect (random/widespread); confirm outbreak is seeded as configured and starts immediately after seeding.
- [ ] Manual: Start Controller; confirm intended behavior is consistent (player chooses outbreak start; no surprise outbreak before any explicit start condition).
- [x] Automated: run unit tests (Vitest) confirming no sim advance during awaiting.
- [x] Automated: `pnpm exec tsc --noEmit` passes.
- [x] Automated: `pnpm build` passes.

## Next: UX + Variety

- [x] Bubble pickup system (fix UI overlap + pacing):
  - [x] Placement rules: never spawn bubbles under UI chrome/menus; enforce a “safe map click zone”.
  - [x] Grace buffer: if a bubble would spawn under UI (or becomes obstructed after UI opens), auto-bank it into a tray for ~5s.
  - [x] Accessibility toggle: optional auto-collect bubbles (reduced value).
  - [x] Spawn pacing: cap active bubbles, cap catch-up spawns, and tie spawn interval to pacing.
- [x] World event ticker overhaul:
  - [x] Add a state-reactive event system (templates + shuffle-bag) that can output 100+ authored-feeling events.
  - [x] Include NYC-specific locations and near-real fake celebrity names; tone mostly straight with occasional dark humor.
  - [x] Reduce filler: lines are parameterized by borough/policy/hosp load/cure progress and trigger on subsystem thresholds.
- [x] Plague type variety (force different minds, not skins):
  - [x] Add pathogen “type modules” that change mechanics (virus/bacteria/fungus/bioweapon).
  - [x] Add type-specific levers (upgrades + containment tools) and surface subsystems in HUD so play patterns differ.
  - [x] Research design/mechanics patterns that differentiate pathogen types beyond numbers (Plague Inc-like), focusing on actionable levers and anti-solved-strategy techniques.
    - [x] Collect sources for distinct pathogen mechanics (fungus, virus, bacteria, bio-weapon).
    - [x] Extract actionable mechanics levers and anti-dominant-strategy patterns.
    - [x] Synthesize concise recommendations with source links.
    - [x] Record findings in Review section.

## Review (Implementation Notes)

- Startup gating now uses both `paused` and `awaitingPatientZero`:
  - `tick()` returns early and clears the accumulator while awaiting.
  - `togglePause()` and `setPaused(false)` refuse to unpause while awaiting.
- Architect `seedMode` is now honored (`pick`, `random`, `widespread`). `seedTarget` is supported to make random seeding testable/deterministic.
- Controller no longer relies on background importations to "randomly" start the outbreak. The player selects the outbreak origin and focus; the clock starts after the click.
- Fixed TypeScript correctness for `pacing`/`bubbleSpawnMs` state and deck.gl blending parameter keys (`blendFunc` instead of missing `GL.BLEND_FUNC`).
- Bubble pickup UX:
  - Safe-zone spawn sampling avoids HUD chrome; when UI opens or bubbles are toggled off, on-map bubbles are auto-banked into a short-lived tray so they are never stuck behind menus.
  - Added an accessibility auto-collect toggle (reduced value) and tuned spawn pacing (caps + anti-catch-up spam).
- World event ticker:
  - Added a reactive template system with shuffle-bag anti-repeat and severity tiers; includes NYC-specific locations + near-real fake celebrity names.
  - Added ticker categorization (mutation/resistance/spore/cordon/bioweapon) and marquee scrolling for long headlines.
- Plague types:
  - Added explicit subsystem mechanics (virus mutation debt + random drift, bacteria antibiotic resistance, fungus spore bursts, bioweapon volatility).
  - Added type-specific upgrade levers and exposed controller-only bioweapon cordon deployment in the Intel panel.

## Task: Research Plague Inc Fame Drivers (Case Study) (2026-02-07)

## Plan

- [x] Collect sources covering early chart breakout (2012), outbreak-driven spikes (2014 Ebola, 2020 COVID), and long-tail support (updates + Steam/PC).
- [x] Synthesize actionable product/PR lessons into `tasks/lessons.md`.
- [x] Record source links for later deep dives.

## Verification

- [x] `tasks/lessons.md` contains actionable bullets plus a short list of source links.

## Review (2026-02-07)

- Captured a Plague Inc fame case study in `tasks/lessons.md` (pitch clarity, early velocity, update/platform long tail, outbreak-related PR posture), with source links for deeper reading.

---

### Research Review (2026-02-06)

- Confirmed Plague Inc. differentiates types via unique mechanics: fungus uses spore-burst/eruption/hardening to actively reseed countries, bacteria gets resilience that boosts survivability across environments, virus increases random mutation and devolution pressure, and bio-weapon has passive lethality growth with abilities to reset or slow it.
- Evidence supports levers around detectability vs transmission and asymptomatic spread as a meaningful gameplay axis.

---

## Task: Fix Theme/Map Sync + Banked Tray UX (2026-02-06)

### Plan

- [x] Remove fragile remote neighborhood GeoJSON + live NYC Open Data hospital fetches (404/CORS noise).
- [x] Generate synthetic "neighborhood" points from borough polygons for pickups/speckles/policy heat.
- [x] Prevent MapLibre style fallback from triggering on transient tile errors (map can disappear mid-zoom).
- [x] Sync MapTiler basemap to UI theme even when `VITE_MAP_STYLE` is set to a `*-dark` style.
- [x] Fix banked pickup tray popup: make it less intrusive (dock bottom-right) and increase TTL.

### Verification

- [x] Manual (Playwright): no 404/CORS console errors on game start; zoom does not blank the map.
- [x] Manual (Playwright): theme toggle flips MapTiler sprite between `dataviz` and `dataviz-dark`.
- [x] `pnpm exec tsc --noEmit` passes.
- [x] `pnpm test --run` passes.

---

## Task: Fix HUD Clickability + Overlay Polish (2026-02-06)

### Problem Statement

- When the Lab drawer is open, the full-screen overlay can intercept pointer events, making the command bar (pause/speed/pacing/theme) hard or impossible to click.
- The banked pickup tray can overlap MapLibre controls (zoom/attribution) on some viewports.
- Theme toggle and basemap style should never desync (light UI must not show a dark basemap unless explicitly requested).
- Overlay UI should feel intentional (not like debug buttons sitting on top of the ticker/map).

### Plan

- [ ] Repro the click-interception issue with the Lab drawer open (Playwright + manual).
- [ ] Adjust drawer overlay layering so command bar stays clickable while the drawer remains modal for the map.
- [ ] Reposition/tune the banked pickup tray so it never overlaps MapLibre controls.
- [ ] Make basemap style selection depend on `ui.theme` directly (not DOM attribute timing).
- [ ] Light aesthetic pass on Setup + overlay dock (spacing, contrast, glass styling).

### Verification

- [ ] Automated (Playwright): open Lab drawer, click command bar buttons successfully, zoom in/out, toggle theme; no console/page errors.
- [ ] Manual: verify tray does not block zoom controls or ticker on narrow width.
- [ ] `pnpm exec tsc --noEmit` passes.
- [ ] `pnpm test --run` passes.

---

## Task: Install TrackWeight (2026-02-07)

### Plan

- [ ] Clone `https://github.com/KrishKrosh/TrackWeight.git` into `external/TrackWeight/`.
- [ ] Follow repo README to install dependencies.
- [ ] Run the repo's recommended smoke check (tests/build/dev start).

### Verification

- [ ] Install step completes without errors.
- [ ] At least one runnable command succeeds (tests/build/dev start), per README.
