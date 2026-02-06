# TODO

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
- [ ] Manual: Start Controller; confirm intended behavior is consistent (no surprise outbreak before any explicit start condition).
- [x] Automated: run unit tests (Vitest) confirming no sim advance during awaiting.

## Review (Implementation Notes)

- Startup gating now uses both `paused` and `awaitingPatientZero`:
  - `tick()` returns early and clears the accumulator while awaiting.
  - `togglePause()` and `setPaused(false)` refuse to unpause while awaiting.
- Architect `seedMode` is now honored (`pick`, `random`, `widespread`). `seedTarget` is supported to make random seeding testable/deterministic.
- Controller no longer relies on background importations to "randomly" start the outbreak. It seeds a deterministic index case in Manhattan and waits for the player to pick a focus before starting the clock.
