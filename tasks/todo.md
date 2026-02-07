# TODO

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

## Task: Research Spawn + Ticker Best Practices (Web)

## Plan

- [ ] Identify primary sources for UI-safe pickup spawning and occlusion/safe-zone handling.
- [ ] Identify primary sources for game event/news ticker systems (templates, shuffle bag, cooldowns).
- [ ] Collect recommended simple algorithms (Poisson disk sampling, shuffle bag, weighted random with cooldown).
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
