# Repository Guidelines

## Project Structure & Module Organization
- Source lives in `src/` with submodules per spec: `core/`, `model/`, `sim/`, `state/`, `phaser/`, `ui/{components,panels,screens,styles}`, `map/`, `audio/`, `assets/`, `workers/`.
- Tests: unit tests alongside code in `src/**/__tests__/*.{test,spec}.ts(x)`; E2E in `e2e/*.spec.ts`.
- Specs and docs: `pandemic-webgame-frontend-spec.md` at repo root informs architecture and UX decisions.

## Build, Test, and Development Commands
- Install: `pnpm i` (or `npm i`).
- Dev server: `pnpm dev` → Vite + React with hot reload.
- Build: `pnpm build` → production bundle; preview with `pnpm preview`.
- Unit tests: `pnpm test` (Vitest, watch mode via `pnpm test --watch`).
- E2E tests: `pnpm e2e` (Playwright; first run: `npx playwright install`).
- Lint/format: `pnpm lint` / `pnpm format` (ESLint + Prettier).

## Coding Style & Naming Conventions
- TypeScript strict; no `any` in core/sim/state; prefer typed actions/selectors.
- Indentation: 2 spaces; max line length ~100.
- Naming: `camelCase` vars/functions, `PascalCase` React components, `kebab-case` non‑component files; CSS variables in `tokens.css` (OkLCH‑first).
- React: colocate UI with `ui/` and keep Phaser‑only code in `phaser/`. DOM owns panels; canvas owns map/particles.
- State: All writes through `state/actions.ts`; avoid cross‑module mutations.

## Testing Guidelines
- Frameworks: Vitest (unit), Playwright (critical flows). Aim ≥80% coverage for `core/`, `model/`, `sim/`.
- Names: `*.test.ts` or `*.test.tsx`. Keep tests deterministic (seeded RNG).
- E2E must cover: start run → buy upgrade → save → reload → resume.
- Run locally: `pnpm test` then `pnpm e2e` (use `--headed` to debug).

## Commit & Pull Request Guidelines
- Convention: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`). Scope examples: `sim`, `ui`, `state`, `map`.
- PRs: concise description, link issues, outline UI/UX impacts; include screenshots or short clips for visual changes.
- Quality gate: `pnpm lint && pnpm test` must pass; attach E2E run notes for gameplay changes.

## Security & Configuration Tips
- Never `eval` or execute imported save data; validate and sanitize JSON.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`; default to least surprising behavior.
- Environment: expose client config via `VITE_*` env vars only.

