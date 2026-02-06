Original prompt: Analyze the technical problems of the game. The game starts too quickly and feels like it picks a random spot and runs immediately; fix core mechanisms from the ground up (starting with startup/seeding flow).

Notes:
- Added initial investigation plan in `tasks/todo.md`.
- Implemented startup gating so the sim does not advance before patient zero/focus selection.
- Added Vitest coverage for start flow.
