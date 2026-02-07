# Lessons

- Avoid "different stages, same winning plan": if a plague type or scenario can be solved with the same build order and play loop every time, it needs a unique mechanic or constraint that changes the decision space.
- Avoid UI interaction annoyance: never spawn short-lived clickable pickups over UI chrome or menus; if a pickup would overlap UI, bank it or respawn it in a safe zone.
- Avoid lazy world text and region modeling: event/ticker content must be state-reactive and location-grounded (specific NYC places, plausible institutions) rather than generic filler.
- Avoid cinematic UI deadlocks: never set `pointer-events: none` on UI elements that are the only way to re-enable/hover the HUD (creates an interaction catch-22). Keep core controls clickable at all times.
- Avoid modal overlays blocking core HUD: drawers/sheets can dim and block the map, but the command bar (pause/speed/theme) must remain clickable above overlays.
- Avoid broad MapLibre "error" fallbacks: the `error` event fires for transient tile/sprite failures too; switching the whole basemap style on any "Failed" can make the map disappear mid-zoom. Only fall back when the style JSON itself fails to load.
