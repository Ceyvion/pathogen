import { create } from 'zustand';

import type { GameMode, GeneId, Country } from './types';

type UiState = {
  scene: 'boot' | 'title' | 'setup' | 'game';
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
  toTitle: () => void;
  toGame: () => void;
  startMode: (m: GameMode) => void;
  pendingMode: GameMode | null;
  pendingStoryId?: string;
  setPendingStory: (id: string | undefined) => void;
  toSetup: (m: GameMode, storyId?: string) => void;
  setCinematic: (v: boolean) => void;
  setHudHovering: (v: boolean) => void;
  setHudCompact: (v: boolean) => void;
  setPreset: (p: 'default'|'neo'|'emergency') => void;
  setup: {
    difficulty: 'casual'|'normal'|'brutal';
    genes: GeneId[];
    // campaign-specific options
    seedMode: 'pick'|'random'|'widespread';
    seedAmount: number; // initial infections for Architect starts
    initialPolicy: Country['policy']; // Controller starts
    startingOps: number; // initial ops points for Controller
  };
  setSetup: (s: Partial<{
    difficulty: 'casual'|'normal'|'brutal';
    genes: GeneId[];
    seedMode: 'pick'|'random'|'widespread';
    seedAmount: number;
    initialPolicy: Country['policy'];
    startingOps: number;
  }>) => void;
};

const initialCinematic = (() => { try { return localStorage.getItem('cinematicV1') !== '0'; } catch { return true; } })();
const initialPreset = (() => { try { return (localStorage.getItem('presetV1') as any) || 'default'; } catch { return 'default'; } })();

export const useUiStore = create<UiState>((set) => ({
  scene: 'boot',
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
  toTitle: () => set(() => ({ scene: 'title', pendingMode: null, pendingStoryId: undefined })),
  toGame: () => set(() => ({ scene: 'game' })),
  startMode: (m) => set(() => ({ scene: 'setup', pendingMode: m })),
  pendingMode: null,
  pendingStoryId: undefined,
  setPendingStory: (id) => set(() => ({ pendingStoryId: id })),
  toSetup: (m, storyId) => set(() => ({ scene: 'setup', pendingMode: m, pendingStoryId: storyId })),
  setCinematic: (v) => set(() => { try { localStorage.setItem('cinematicV1', v ? '1' : '0'); } catch {}; return { cinematic: v } as any; }),
  setup: { difficulty: 'normal', genes: [], seedMode: 'pick', seedAmount: 15000, initialPolicy: 'advisory', startingOps: 8 },
  setSetup: (p) => set((s) => ({ setup: { ...s.setup, ...p, genes: p.genes ?? s.setup.genes } })),
  setHudHovering: (v) => set(() => ({ hudHovering: v } as any)),
  setHudCompact: (v) => set(() => ({ hudCompact: v } as any)),
  setPreset: (p) => set(() => { try { localStorage.setItem('presetV1', p); } catch {}; return { preset: p } as any; }),
}));
