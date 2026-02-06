Original prompt: Analyze the technical problems of the game. The game starts too quickly and feels like it picks a random spot and runs immediately; fix core mechanisms from the ground up (starting with startup/seeding flow).

Notes:
- Added initial investigation plan in `tasks/todo.md`.
- Implemented startup gating so the sim does not advance before patient zero/focus selection.
- Added Vitest coverage for start flow.
- Implemented pickup UX overhaul: safe spawn zones, UI-obstruction banking tray, and auto-collect toggle.
- Implemented reactive world event ticker: 100+ template pool, NYC grounding, shuffle-bag anti-repeat, and improved ticker UI categorization/marquee.
- Implemented pathogen type variety: virus/bacteria/fungus/bioweapon subsystems, type-specific upgrade levers, and controller bioweapon cordon tool + HUD surfacing.
