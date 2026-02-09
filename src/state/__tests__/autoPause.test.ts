import { describe, it, expect, beforeEach } from 'vitest';

import { useGameStore } from '../store';
import type { GameEndStats } from '../types';

function withLocalStorageMock<T>(fn: () => T): T {
  const mem: Record<string, string> = {};
  const prev = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (k in mem ? mem[k] : null),
    setItem: (k: string, v: string) => { mem[k] = String(v); },
    removeItem: (k: string) => { delete mem[k]; },
    clear: () => { for (const k of Object.keys(mem)) delete mem[k]; },
  };

  try {
    return fn();
  } finally {
    if (typeof prev === 'undefined') delete (globalThis as any).localStorage;
    else (globalThis as any).localStorage = prev;
  }
}

describe('Auto-Pause + Persistence Edge Cases', () => {
  beforeEach(() => {
    useGameStore.getState().actions.startNewGame('architect', {
      seedMode: 'random',
      seedTarget: 'manhattan',
      seedAmount: 9000,
    } as any);
    // Ensure sim is running.
    useGameStore.getState().actions.setPaused(false);
    useGameStore.getState().actions.setAwaitingPatientZero(false);
  });

  it('stops sim integration immediately when a milestone auto-pauses during a tick', () => {
    // Force a day boundary every step so a single tick would otherwise advance many days.
    useGameStore.setState((st) => {
      st.msPerDay = 50; // stepMs is 50, so dtDays = 1 per step
      st.speed = 10;
      st.autoPauseEnabled = true;
      st.milestonesTriggered = [];
      // Trigger "First Cluster" milestone condition immediately.
      for (const c of Object.values(st.countries)) {
        c.I = 0;
        c.E = 0;
        c.R = 0;
        c.D = 0;
        c.H = 0;
      }
      st.countries.manhattan.I = 2000;
    });

    useGameStore.getState().actions.tick(200); // would be ~20 steps without the pause break
    const s = useGameStore.getState();
    expect(s.paused).toBe(true);
    expect(s.pauseReason).toMatch(/^milestone:First Cluster\|/);
    expect(s.day).toBeGreaterThanOrEqual(1);
    expect(s.day).toBeLessThan(2);
  });

  it('save/load preserves milestone + emergency unlock state to avoid re-triggering rewards on reload', () => {
    withLocalStorageMock(() => {
      useGameStore.setState((st) => {
        st.milestonesTriggered = ['first_cluster', 'spreading'];
        st.emergencyUnlocked = true;
        st.autoPauseEnabled = false;
        st.pauseReason = 'milestone:Test|Narrative';
        st.activeEmergencyEffects = [{ actionId: 'em_quarantine', startDay: 10, endDay: 14 }];
        st.emergencyCooldowns = { em_quarantine: 20 };
        st.gameResult = {
          outcome: 'victory',
          days: 42,
          totalDeaths: 1,
          totalRecovered: 2,
          totalInfected: 3,
          peakInfected: 4,
          cureProgress: 100,
          upgradesPurchased: 5,
          totalUpgrades: 10,
          mode: 'architect',
          pathogenType: 'virus',
          difficulty: 'normal',
          score: 1234,
          grade: 'A',
        } satisfies GameEndStats;
      });

      const a = useGameStore.getState().actions;
      a.saveGame();

      // Nuke the fields to prove load restores them.
      useGameStore.setState((st) => {
        st.milestonesTriggered = [];
        st.emergencyUnlocked = false;
        st.autoPauseEnabled = true;
        st.pauseReason = null;
        st.activeEmergencyEffects = [];
        st.emergencyCooldowns = {};
        st.gameResult = null;
      });

      a.loadGame();
      const s = useGameStore.getState();
      expect(s.milestonesTriggered).toEqual(['first_cluster', 'spreading']);
      expect(s.emergencyUnlocked).toBe(true);
      expect(s.autoPauseEnabled).toBe(false);
      expect(s.pauseReason).toBe('milestone:Test|Narrative');
      expect(s.activeEmergencyEffects.length).toBe(1);
      expect(s.emergencyCooldowns.em_quarantine).toBe(20);
      expect(s.gameResult?.outcome).toBe('victory');
      expect(s.gameResult?.score).toBe(1234);
    });
  });
});

