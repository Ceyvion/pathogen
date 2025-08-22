import { create } from 'zustand';

import type { GameMode, GeneId, Country } from './types';

type UiState = {
  scene: 'title' | 'setup' | 'game';
  showStats: boolean;
  showUpgrades: boolean;
  mapOverlays: { hospitals: boolean; flows: boolean; bubbles: boolean; policy: boolean };
  routeWeights: Record<string, number>; // bridge route weight overrides
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

export const useUiStore = create<UiState>((set) => ({
  scene: 'title',
  showStats: true,
  showUpgrades: false,
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
  setup: { difficulty: 'normal', genes: [], seedMode: 'pick', seedAmount: 15000, initialPolicy: 'advisory', startingOps: 8 },
  setSetup: (p) => set((s) => ({ setup: { ...s.setup, ...p, genes: p.genes ?? s.setup.genes } })),
}));
