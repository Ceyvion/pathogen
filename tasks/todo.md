# TODO

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
