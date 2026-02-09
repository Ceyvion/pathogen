import { create } from 'zustand';

import type { GameMode, GeneId, Country, PathogenType } from './types';

type UiState = {
  scene: 'boot' | 'title' | 'setup' | 'game' | 'gameover';
  // When true, the app should attempt to hydrate game state from localStorage
  // and jump directly into gameplay (used for browser refresh / reload continuity).
  resumeOnLoad: boolean;
  clearResumeOnLoad: () => void;
  theme: 'dark' | 'light';
  showStats: boolean;
  showUpgrades: boolean;
  mapOverlays: { hospitals: boolean; flows: boolean; bubbles: boolean; policy: boolean };
  routeWeights: Record<string, number>; // bridge route weight overrides
  cinematic: boolean;
  hudHovering: boolean;
  hudCompact: boolean;
  preset: 'default'|'neo'|'emergency';
  toggleStats: () => void;
  toggleUpgrades: () => void;
  toggleOverlay: (k: keyof UiState['mapOverlays']) => void;
  setRouteWeight: (id: string, w: number) => void;
  resetRouteWeights: () => void;
  toggleTheme: () => void;
  setTheme: (t: UiState['theme']) => void;
  toTitle: () => void;
  toGame: () => void;
  startMode: (m: GameMode) => void;
  pendingMode: GameMode | null;
  pendingStoryId?: string;
  setPendingStory: (id: string | undefined) => void;
  toSetup: (m: GameMode, storyId?: string) => void;
  setCinematic: (v: boolean) => void;
  toGameOver: () => void;
  setHudHovering: (v: boolean) => void;
  setHudCompact: (v: boolean) => void;
  setPreset: (p: 'default'|'neo'|'emergency') => void;
  // Tutorial / onboarding
  tutorialStep: number; // -1 = dismissed
  setTutorialStep: (v: number) => void;
  dismissTutorial: () => void;
  hospitalModalId: string | null;
  setHospitalModalId: (id: string | null) => void;
  setup: {
    difficulty: 'casual'|'normal'|'brutal';
    genes: GeneId[];
    // campaign-specific options
    seedMode: 'pick'|'random'|'widespread';
    seedAmount: number; // initial infections for Architect starts
    initialPolicy: Country['policy']; // Controller starts
    startingOps: number; // initial ops points for Controller
    pathogenType: PathogenType;
    aiDirectorEnabled: boolean;
  };
  setSetup: (s: Partial<{
    difficulty: 'casual'|'normal'|'brutal';
    genes: GeneId[];
    seedMode: 'pick'|'random'|'widespread';
    seedAmount: number;
    initialPolicy: Country['policy'];
    startingOps: number;
    pathogenType: PathogenType;
    aiDirectorEnabled: boolean;
  }>) => void;
};

const initialScene = (() => {
  try {
    const last = localStorage.getItem('sceneV1');
    const hasSave = Boolean(localStorage.getItem('gameSave'));
    if (last === 'game' && hasSave) return { scene: 'game' as const, resumeOnLoad: true };
  } catch {}
  return { scene: 'boot' as const, resumeOnLoad: false };
})();

const initialCinematic = (() => { try { return localStorage.getItem('cinematicV1') !== '0'; } catch { return true; } })();
const initialPreset = (() => { try { return (localStorage.getItem('presetV1') as any) || 'default'; } catch { return 'default'; } })();
const initialTheme = (() => {
  try {
    const saved = localStorage.getItem('theme') as UiState['theme'] | null;
    if (saved === 'dark' || saved === 'light') return saved;
    // Respect system preference on first run.
    const prefersLight = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
})() as UiState['theme'];
try { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-preset', initialPreset); } catch {}
try { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', initialTheme); } catch {}

export const useUiStore = create<UiState>((set) => ({
  scene: initialScene.scene,
  resumeOnLoad: initialScene.resumeOnLoad,
  clearResumeOnLoad: () => set(() => ({ resumeOnLoad: false })),
  theme: initialTheme,
  showStats: true,
  showUpgrades: false,
  cinematic: initialCinematic,
  hudHovering: false,
  hudCompact: false,
  preset: initialPreset,
  mapOverlays: { hospitals: true, flows: true, bubbles: true, policy: false },
  routeWeights: {},
  toggleStats: () => set((s) => ({ showStats: !s.showStats })),
  toggleUpgrades: () => set((s) => ({ showUpgrades: !s.showUpgrades })),
  toggleOverlay: (k) => set((s) => ({ mapOverlays: { ...s.mapOverlays, [k]: !s.mapOverlays[k] } })),
  setRouteWeight: (id, w) => set((s) => {
    const next = { ...(s.routeWeights || {}), [id]: w } as Record<string, number>;
    try { localStorage.setItem('routeWeightsV1', JSON.stringify(next)); } catch {}
    return { routeWeights: next } as any;
  }),
  resetRouteWeights: () => set(() => { try { localStorage.removeItem('routeWeightsV1'); } catch {}; return { routeWeights: {} } as any; }),
  setTheme: (t) => set(() => {
    try { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', t); } catch {}
    try { localStorage.setItem('theme', t); } catch {}
    return { theme: t } as any;
  }),
  toggleTheme: () => set((s) => {
    const next = s.theme === 'light' ? 'dark' : 'light';
    try { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', next); } catch {}
    try { localStorage.setItem('theme', next); } catch {}
    return { theme: next } as any;
  }),
  toTitle: () => set(() => {
    try { localStorage.setItem('sceneV1', 'title'); } catch {}
    return { scene: 'title', pendingMode: null, pendingStoryId: undefined } as any;
  }),
  toGame: () => set(() => {
    try { localStorage.setItem('sceneV1', 'game'); } catch {}
    return { scene: 'game' } as any;
  }),
  startMode: (m) => set(() => {
    try { localStorage.setItem('sceneV1', 'setup'); } catch {}
    return { scene: 'setup', pendingMode: m } as any;
  }),
  pendingMode: null,
  pendingStoryId: undefined,
  setPendingStory: (id) => set(() => ({ pendingStoryId: id })),
  toSetup: (m, storyId) => set(() => {
    try { localStorage.setItem('sceneV1', 'setup'); } catch {}
    return { scene: 'setup', pendingMode: m, pendingStoryId: storyId } as any;
  }),
  setCinematic: (v) => set(() => { try { localStorage.setItem('cinematicV1', v ? '1' : '0'); } catch {}; return { cinematic: v } as any; }),
  setup: { difficulty: 'normal', genes: [], seedMode: 'pick', seedAmount: 15000, initialPolicy: 'advisory', startingOps: 8, pathogenType: 'virus', aiDirectorEnabled: false },
  setSetup: (p) => set((s) => ({ setup: { ...s.setup, ...p, genes: p.genes ?? s.setup.genes } })),
  toGameOver: () => set(() => {
    try { localStorage.setItem('sceneV1', 'gameover'); } catch {}
    return { scene: 'gameover' } as any;
  }),
  setHudHovering: (v) => set(() => ({ hudHovering: v } as any)),
  setHudCompact: (v) => set(() => ({ hudCompact: v } as any)),
  setPreset: (p) => set(() => { try { localStorage.setItem('presetV1', p); } catch {}; return { preset: p } as any; }),
  tutorialStep: (() => { try { const v = localStorage.getItem('tutorialStepV1'); return v === null ? 0 : Number(v); } catch { return 0; } })(),
  setTutorialStep: (v) => set(() => { try { localStorage.setItem('tutorialStepV1', String(v)); } catch {}; return { tutorialStep: v } as any; }),
  dismissTutorial: () => set(() => { try { localStorage.setItem('tutorialStepV1', '-1'); } catch {}; return { tutorialStep: -1 } as any; }),
  hospitalModalId: null,
  setHospitalModalId: (id) => set(() => ({ hospitalModalId: id })),
}));
