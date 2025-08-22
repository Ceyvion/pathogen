# Plague‑like Web Game (Web) — **Front‑End Design & Implementation Spec**

> Target: modern browsers (desktop + mobile), instant‑load, no installs.  
> Focus: crisp UI/UX, accessible data‑viz, buttery interactions, and maintainable TypeScript.

---

## 1) Goals & Constraints
- **Feel**: global‑strategy sim with clean, legible visuals and satisfying micro‑interactions.
- **Reach**: plays great on laptops and phones; keyboard & pointer first; touch OK.
- **Performance**: 60 fps render on mid‑range devices; stable sim tick under load.
- **Scope**: Plague‑like loop (SEIR + travel), upgrade trees, events, cure race. No IP cloning.

---

## 2) Player Experience Pillars
1. **At‑a‑glance clarity**: the map tells the story without reading a manual.
2. **Tactile control**: clicks, hover states, and sliders feel responsive (no UI lag from sim).
3. **Meaningful numbers**: charts and color encodings are interpretable and color‑blind safe.
4. **Tempo**: tight feedback cadence (news bursts, upgrade unlocks, progress bars).
5. **Focus**: minimal chrome; information progressively disclosed on demand (tooltips, drill‑ins).

---

## 3) Tech Stack (Front‑End‑first)
- **Language + Build**: TypeScript, Vite, ESLint, Prettier.
- **Render**: **Phaser 3** (Canvas/WebGL) for world map + particles + HUD overlays.
- **UI Layer**: **React 18** (DOM overlay) + **Headless UI** + **Radix Primitives** + **Tailwind** *or* CSS Modules.
  - Rationale: complex panels/menus are faster to build/accessibilize in DOM. Phaser owns only the canvas.
- **Data‑viz helpers**: d3‑geo (projection), topojson‑client (borders), tinycolor/culori (OkLCH conversions).
- **State**: **zustand** (serializable game state), **immer** for immutable ergonomics.
- **Audio**: Howler.js (or Phaser sound) with a central SFX bus honoring “Reduce Motion/Sound” prefs.
- **Routing**: none (single‑page), but componentized screens (Menu, Game, Summary).
- **Persistence**: LocalStorage (≤1MB) + optional IndexedDB for larger runs/snapshots.
- **Testing**: Vitest + Playwright (critical flows: start run, buy upgrade, save/load).

> Minimal alt‑stack: Phaser‑only UI via RexUI (fewer deps, more custom work for a11y).

---

## 4) UI Architecture
**Two loops** (decoupled):
- **Sim loop** (fixed timestep, e.g., 10–50 ms): SEIR updates, event queue, DNA accrual.
- **Render/UI loop** (requestAnimationFrame): draws map, updates HUD, animates transitions.

**Bridge pattern**:
- `GameStore` (zustand) is the **single source of truth**.
- Sim mutates `GameStore` via actions (in a web worker *optional*).
- React panels subscribe to slices (selectors). Phaser reads derived state each frame.
- All UI writes go through typed actions; no random cross‑writes.

**Threading (optional)**:
- Move SEIR tick + travel to a **Web Worker** to keep UI butter‑smooth; send deltas to main thread.

---

## 5) Visual Language & Design System
### Color (OkLCH‑first; WCAG AA 4.5:1 targets)
- Neutral UI: `--bg`, `--surface`, `--text`, `--muted`, `--border` in light/dark themes.
- Data encodings (color‑blind safe):
  - **S** (Susceptible): blue `#2B6CB0`
  - **E** (Exposed): amber `#D69E2E`
  - **I** (Infectious): red `#C53030`
  - **R** (Recovered/Removed): slate `#4A5568`
  - **D** (Deaths): black `#111827`
  - **Policy severity**: green → yellow → red scale for openness → lockdown.
- Use **opacity** / **value** to show intensity; never rely on hue alone.

### Type
- UI: Inter/Roboto Flex (variable), fallback system stack.  
- Numbers: tabular lining for dashboards (`font-variant-numeric: tabular-nums`).

### Spacing & Grid
- 4‑pt spacing scale (`4, 8, 12, 16, 24, 32, 48, 64`).  
- **Layout**: map center; **Left panel** (country/run stats), **Right panel** (Upgrades), **Bottom** ticker.
- **Mobile**: panels collapse into drawers; map remains at least 60% viewport height.

### Iconography
- Inline SVG sprites for crisp scaling. Icons for: DNA, cure, policy, climate, wealth, alerts.

### Themes
- Light / Dark / High‑Contrast (toggle). Persist per user; respect `prefers-color-scheme`.

---

## 6) Layout & Screens
**Screens**
1. **Boot** → **Main Menu** (New Run, Continue, Options).
2. **Game** (Map + HUD): left stats, right upgrades, bottom ticker, top controls (speed/pause, day counter).
3. **Summary** (Run recap charts, achievements, share).

**HUD Elements (desktop)**
- Top‑left: Day counter, speed controls (1×, 3×, 10×, pause), settings.
- Left panel (accordion): Global → Selected Country → Charts.
- Right panel: **Upgrades** (Transmission, Symptoms, Abilities) + DNA counter + costs.
- Bottom ticker: event feed with click‑through to details.

**Mobile adaptations**
- Speed controls fixed top.  
- Panels as swipeable drawers.  
- Ticker becomes a bell/Inbox modal with unread badge.

---

## 7) Component Inventory (DOM/React)
- **Buttons**: primary/secondary/quiet (loading, disabled, tooltip states).
- **Tabs** (Upgrade branches). **Accordion** (country → sections). **Modal** (event details).
- **Slider** (speed), **Toggle** (policies), **Select** (difficulty), **Checkbox** (options).
- **Progress** (cure bar, research). **Badge** (policy level). **Toast** (breaking news).
- **Tooltip/Popover** (rich content; country stats on hover).
- **Search** (country quick find). **Virtualized list** for countries (performance).
- **Charts**: mini‑sparklines (I(t)), stacked bars (S/E/I/R), cure progress timeline.

All components keyboard‑navigable. Roles + labels + focus rings present and tasteful.

---

## 8) Map Rendering & Interactions
### Rendering
- Base: Phaser **tileable world** with pre‑rendered landmass + borders layer.
- **Picking**:
  - **Mask‑click approach (fastest)**: hidden color‑ID texture (each country unique color). On click, sample pixel → country id.
  - Optional vector path prepass (TopoJSON + d3‑geo) at build time → atlas + mask.
- **Choropleth**: tint countries by selected metric (I%, trend, policy). Avoid fine outlines on mobile.
- **Particles**: outbreaks (pulses), travel lines (curving arcs) governed by frame budget.

### Interactions
- Hover: outline + tooltip with key stats; click locks selection.
- Drag to pan, wheel/pinch to zoom (bounded). Double‑tap to center on mobile.
- Keyboard: arrows to move focus between countries; Enter to select; `/` to search.

---

## 9) Data Visualization Rules
- Default map metric: **Infectious per 100k** (I/N × 100k).  
- Secondary metrics: growth rate (ΔI), policy level, hospital strain proxy.
- Choropleth color scale: perceptually uniform (e.g., OkLCH), 5–7 buckets with visible legends.
- Charts:
  - **S/E/I/R stacks over time** (log option for I).  
  - **Cure progress** line + milestone markers.  
  - **Selected country** sparkline comparing to global median.

Tooltips show exact values + last 7‑day trend arrow. Always include units.

---

## 10) Accessibility (A11y)
- **Keyboard**: Full navigation (map focus ring, panels, controls). Shortcuts: `Space` pause, `1/2/3` speeds, `F` find country, `Esc` close.
- **Screen Readers**: polite `aria-live` region for ticker; `assertive` only for critical events.
- **Contrast**: WCAG AA minimum; high‑contrast palette option.
- **Motion**: honor `prefers-reduced-motion` (disable most animations, particles become fades).
- **Text scaling**: 14–18 px base; respect browser zoom; layout remains usable at 200%.
- **Color blindness**: provide patterns / hatching on the choropleth when HC mode enabled.

---

## 11) Game Feel & Motion
- Easing: cubic‑bezier(0.2, 0.8, 0.2, 1) for UI. 150–250 ms for small transitions; 300–400 ms for panels.
- Micro‑interactions: DNA gain → coin pop; upgrade purchase → ripple + sound; severe event → brief screen shake (reduced with motion setting).
- Audio: subtle ambient loop; SFX channel volumes separate; mute toggle persists.

---

## 12) Performance Budget
- **Frame**: 16 ms target (60 fps). Canvas draw calls ≤ 500 per frame on mid devices.
- **Map**: raster layers, no per‑country vector redraw each frame; cache tints per bucket.
- **Particles**: cap counts by quality level; degrade gracefully on low power.
- **Lists**: virtualize.
- **Workers**: run SEIR + travel in Worker; send diffs (not full state).
- **Idle time**: `requestIdleCallback` for autosave, analytics, precomputation.

---

## 13) Save/Load & Persistence
- Schema‑versioned JSON snapshot with seed, upgrades, policies, elapsed time, RNG state.
- LocalStorage for autosave; “Export/Import” as .json for portability.
- Write throttled (e.g., every in‑game day or on pause/menu).

---

## 14) Internationalization (i18n)
- Strings externalized; ICU message format for pluralization.
- Numbers localized; `per 100k` remains explicit.
- Text expansion budget in UI (30–40%).

---

## 15) Security & Anti‑Cheat (lightweight)
- Client‑side sim; no true anti‑cheat. If leaderboards later: server‑side validation required.
- Do not eval user strings. Sanitize imported save files.

---

## 16) Game Loop & Systems (brief)
Use a metapopulation **SEIR** model per country `i` with travel matrix `Tᵢⱼ`:

- `dEᵢ = βᵢ * Sᵢ * (Iᵢ / Nᵢ) * Δt * modifiers`
- `dIᵢ += σ * Eᵢ * Δt` (σ = 1/incubation)
- `dRᵢ += γ * Iᵢ * Δt` (γ = 1/infectious period), track fatalities with CFR.
- **Mobility**: move fractions of S/E/I/R along Tᵢⱼ; scale by policies/closures.

**Modifiers**: climate, wealth/health index, urban %, vaccine coverage, player upgrades, policy states.

---

## 17) Milestones (front‑end emphasis)
**M1 — Graybox (Week 1–2)**
- Vite + TS + Phaser + React scaffold.  
- Map render + hover/click + tooltip.  
- Sim tick (1 seed country), time controls, left stats panel, autosave.

**M2 — Travel & Upgrades (Week 2–3)**
- Add travel matrix; animate arcs on infections crossing borders.  
- Right upgrade panel (3 trees), DNA counter, cost/affordance states.

**M3 — Events & Cure (Week 3–4)**
- Ticker with filters and unread badge; modal details.  
- Cure progress bar + milestones; policy UI per country.

**M4 — Feel & Polish (Week 4–5)**
- Particles, audio, high‑contrast/dark themes, i18n scaffolding, summary screen with charts.

---

## 18) Project Structure
```
/src
  /core        # time, rng, constants, config
  /model       # Country, World, SEIR, TravelMatrix
  /sim         # SEIRSystem, MobilitySystem, PolicySystem, CureSystem (worker-ready)
  /ui
    /components   # Buttons, Tabs, Slider, Tooltip, Modal, Progress, Charts
    /panels       # LeftStats, RightUpgrades, BottomTicker
    /screens      # Boot, MainMenu, Game, Summary
    /styles       # tokens.css (CSS variables), globals.css
  /map         # loaders, mask picking, choropleth helpers
  /audio       # sfx manager
  /assets      # sprites, fonts, sfx, data (json/csv)
  /phaser      # GameScene, Camera, Particles
  /state       # store.ts (zustand), selectors.ts, actions.ts
  /workers     # sim.worker.ts (optional)
```

---

## 19) Sample Types (trim/adapt)
```ts
// State
type CountryID = string;

interface Country {
  id: CountryID;
  name: string;
  pop: number;
  climate: 'hot'|'cold'|'temperate';
  wealth: 1|2|3;
  healthIndex: number; // 0..1
  S: number; E: number; I: number; R: number; D: number;
  policy: 'open'|'advisory'|'restrictions'|'lockdown';
}

interface TravelEdge { from: CountryID; to: CountryID; weight: number; } // daily pax

interface Upgrade {
  id: string; branch: 'transmission'|'symptoms'|'abilities';
  cost: number; effects: Record<string, number>; prereqs?: string[];
}

interface WorldState {
  t: number;
  countries: Record<CountryID, Country>;
  travel: TravelEdge[];
  dna: number;
  cureProgress: number; // 0..1
  params: { beta: number; sigma: number; gamma: number; cfr: number; };
}
```

---

## 20) Design Tokens (CSS variables)
```css
:root {
  /* Neutrals */
  --bg: #0B0F14;        /* dark default */
  --surface: #121821;
  --text: #E6EEF6;
  --muted: #94A3B8;
  --border: #263041;

  /* Light mode overrides via [data-theme="light"] */
  /* ... */

  /* Data encodings */
  --s: #2B6CB0; /* S */
  --e: #D69E2E; /* E */
  --i: #C53030; /* I */
  --r: #4A5568; /* R */
  --d: #111827; /* D */

  /* Feedback */
  --ok: #10B981;
  --warn: #F59E0B;
  --err: #EF4444;

  /* Radii, spacing, motion */
  --radius: 12px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --dur-fast: 150ms; --dur-med: 250ms; --dur-slow: 350ms;
}
```

---

## 21) Example: React + Phaser Overlay
```tsx
// App.tsx
export default function App() {
  return (
    <div className="app">
      <CanvasGame />   {/* Phaser canvas */}
      <Hud />          {/* React HUD: panels, ticker, controls */}
    </div>
  );
}
```

```tsx
// Hud.tsx (sketch)
export function Hud() {
  return (
    <div className="hud pointer-events-none">
      <TopBar />
      <LeftStats className="pointer-events-auto" />
      <RightUpgrades className="pointer-events-auto" />
      <BottomTicker className="pointer-events-auto" />
    </div>
  );
}
```

---

## 22) Day‑1 Tasks for GPT‑5 (copy/paste)
1. **Scaffold** Vite + TS + Phaser + React + Tailwind; add ESLint/Prettier configs.
2. Implement **GameScene** with time controls (pause/1×/3×/10×) + day counter.
3. Load a PNG world map + hidden color‑ID mask; hover tooltip shows country name.
4. Wire **zustand store** with one seed country; SEIR tick updates left panel numbers.
5. Build **Upgrade panel** with mock nodes (locked/affordable/purchased states).
6. Add `saveGame()` / `loadGame()` to LocalStorage with schema versioning.
7. Implement **High‑Contrast** theme + `prefers-reduced-motion` respect.
8. Playwright tests: start→buy upgrade→pause→save→reload→resume flow.

---

## 23) IP & Naming
Do not reuse names, icons, or UI layouts from existing titles. Create original upgrade names, event text, achievements, and UI design.

---

## 24) Nice‑to‑Have Twists
- **Pathogen archetypes** (virus/fungus/bacterium) as run modifiers altering visuals (map tint, particles).
- **Government AI personalities** per region affecting policy thresholds and UI badges.
- **Mutation events** with small UI puzzles (choose 1 of 3 mutations—clear affordances).

---

## Appendix A — Country & Travel Data (lean)
- Countries: name, pop, centroid, climate tag, wealth tier, health index.
- Travel CSV: `from,to,weight` (top ~100 routes + land neighbors).
- Upgrade tree JSON: `{id, branch, cost, effects, prereqs, flavor}`.
- Policy thresholds/effects JSON.

## Appendix B — QA Checklist (front‑end)
- [ ] Color contrast AA across themes.  
- [ ] Keyboard: full traversal and visible focus.  
- [ ] Map hover/selection works at all zooms.  
- [ ] Mobile drawers reachable; no overflow traps.  
- [ ] Performance: ≥55 fps on mid‑phones; sim worker keeps UI smooth.  
- [ ] Save/load stable across versions; invalid save fails gracefully.  
- [ ] i18n strings render; long German text doesn’t break layout.  
- [ ] Reduced motion + mute respected globally.
