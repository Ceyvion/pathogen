Original prompt: Analyze the technical problems of the game. The game starts too quickly and feels like it picks a random spot and runs immediately; fix core mechanisms from the ground up (starting with startup/seeding flow).

Notes:
- Added initial investigation plan in `tasks/todo.md`.
- Implemented startup gating so the sim does not advance before patient zero/focus selection.
- Added Vitest coverage for start flow.
- Implemented pickup UX overhaul: safe spawn zones, UI-obstruction banking tray, and auto-collect toggle.
- Implemented reactive world event ticker: 100+ template pool, NYC grounding, shuffle-bag anti-repeat, and improved ticker UI categorization/marquee.
- Implemented pathogen type variety: virus/bacteria/fungus/bioweapon subsystems, type-specific upgrade levers, and controller bioweapon cordon tool + HUD surfacing.

2026-02-06
- Fixed MapLibre "map disappears on zoom" behavior by narrowing raster-style fallback to style.json failures only.
- Removed fragile remote neighborhood GeoJSON + NYC Open Data hospital fetches (404/CORS). Now generates synthetic neighborhood points from borough polygons and uses bundled hospitals dataset.
- Theme toggle now also switches MapTiler basemap between light/dark variants even when `VITE_MAP_STYLE` is set to `*-dark`.
- Banked pickup tray is now docked bottom-right, less intrusive, with longer default TTL.

- Fixed HUD click interception: lowered the Lab drawer overlay z-index so the command bar remains clickable even while the drawer is open.
- Moved banked pickup tray away from MapLibre bottom-right controls and raised its z-index so it stays collectible above drawers.
- Bundled borough GeoJSON locally (`src/assets/nyc-boroughs.geojson`) and load via Vite asset URL to remove reliance on GitHub raw fetch.
- Styled MapLibre controls to match the game's glass HUD.
- Setup screen theme toggle now shows the current theme (“Theme: Light/Dark”) instead of the next theme label.
