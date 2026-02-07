# Lessons

- Avoid "different stages, same winning plan": if a plague type or scenario can be solved with the same build order and play loop every time, it needs a unique mechanic or constraint that changes the decision space.
- Avoid UI interaction annoyance: never spawn short-lived clickable pickups over UI chrome or menus; if a pickup would overlap UI, bank it or respawn it in a safe zone.
- Avoid lazy world text and region modeling: event/ticker content must be state-reactive and location-grounded (specific NYC places, plausible institutions) rather than generic filler.
- Avoid cinematic UI deadlocks: never set `pointer-events: none` on UI elements that are the only way to re-enable/hover the HUD (creates an interaction catch-22). Keep core controls clickable at all times.
- Avoid modal overlays blocking core HUD: drawers/sheets can dim and block the map, but the command bar (pause/speed/theme) must remain clickable above overlays.
- Avoid broad MapLibre "error" fallbacks: the `error` event fires for transient tile/sprite failures too; switching the whole basemap style on any "Failed" can make the map disappear mid-zoom. Only fall back when the style JSON itself fails to load.
- When adding a client feature that depends on a backend route, assume users will accidentally run a frontend-only server: detect `404`/missing endpoints, disable the feature automatically, and surface a concrete “run this command” fix instead of spamming generic errors.

## Case Study: Plague Inc (Why It Broke Out)

- Optimize for a 10-second pitch: Plague Inc had a one-sentence premise (“infect the world”) and an instantly readable world-map UI; our first-run loop should be equally legible and narratable without explaining subsystems.
- Design for chart/word-of-mouth velocity: fast time-to-fun, replayable runs, and strong personalization hooks (e.g. naming/identity) are disproportionately valuable early, because they increase conversion and sharing.
- Build long-tail fame via updates and platform expansion: sustained content updates plus a PC/Steam path can turn an initial hit into a multi-year evergreen (and gives press a reason to cover new beats).
- Expect real-world outbreak news to create traffic spikes: treat them as a reputational risk as much as an acquisition opportunity; ship explicit “this is a game, not a model” copy and link to trusted public-health sources.
- Make the game “pressable” without claiming scientific authority: Plague Inc benefited from mainstream coverage; we should avoid overstating realism, but keep the simulation coherent enough that journalists/streamers can explain what happened in a run.

### Timeline Anchors (So We Remember The Shape)

- 2012-05: initial mobile launch and rapid top-chart breakout (see Wired profile).
- 2014-10: Ebola outbreak news coincided with a download boost (see GameSpot coverage and Ndemic’s “Ebola report card” post).
- 2014: Steam Early Access expansion (see Ndemic announcement).
- 2020-01: COVID-19 outbreak drove renewed attention; Ndemic published a statement asking players not to spread misinformation (see Ndemic/Ars).
- 2020-02-26: Removed from China App Stores (see Ndemic statement).

### Source Links (For Future Deep Dives)

- https://www.wired.com/2012/12/plague-inc/
- https://www.ndemiccreations.com/en/22-plague-inc-evolved-enters-steam-early-access
- https://www.ndemiccreations.com/en/news/163-statement-on-coronavirus
- https://www.ndemiccreations.com/en/news/153-about-removal-from-china-app-stores
- https://www.gamespot.com/articles/plague-inc-sees-download-boost-from-ebola-outbreak/1100-6422647/
- https://www.ndemiccreations.com/en/news/25-plague-inc-ebola-report-card
- https://arstechnica.com/gaming/2020/03/plague-inc-game-maker-asks-players-not-to-spread-coronavirus-misinformation/
