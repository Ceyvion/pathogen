import { describe, it, expect, beforeEach } from 'vitest';

import { useGameStore } from '../store';

function snapshot() {
  const s = useGameStore.getState();
  return {
    t: s.t,
    day: s.day,
    paused: s.paused,
    awaiting: Boolean((s as any).awaitingPatientZero),
    countries: s.countries,
    selected: s.selectedCountryId,
    mode: s.mode,
  };
}

describe('Start Flow Gating', () => {
  beforeEach(() => {
    useGameStore.getState().actions.startNewGame('architect', { seedMode: 'pick', seedAmount: 6000 });
  });

  it('architect(pick) starts paused+awaiting and does not advance time before placement', () => {
    const s0 = snapshot();
    expect(s0.mode).toBe('architect');
    expect(s0.paused).toBe(true);
    expect(s0.awaiting).toBe(true);

    useGameStore.getState().actions.tick(1000);
    const s1 = snapshot();
    expect(s1.t).toBe(0);
    expect(s1.day).toBe(0);
  });

  it('cannot unpause while awaiting patient zero', () => {
    const a = useGameStore.getState().actions;
    expect(snapshot().paused).toBe(true);
    a.togglePause();
    expect(snapshot().paused).toBe(true);
  });

  it('architect(pick) advances after awaiting cleared + unpaused', () => {
    const a = useGameStore.getState().actions;
    a.setAwaitingPatientZero(false);
    a.setPaused(false);
    a.tick(60);
    expect(snapshot().t).toBeGreaterThan(0);
  });

  it('architect(random) honors seedTarget and does not await placement', () => {
    useGameStore.getState().actions.startNewGame('architect', {
      seedMode: 'random',
      seedTarget: 'queens',
      seedAmount: 9000,
    });
    const s = snapshot();
    expect(s.paused).toBe(false);
    expect(s.awaiting).toBe(false);
    expect(s.countries.queens.E).toBeGreaterThan(0);
  });

  it('architect(widespread) seeds multiple boroughs', () => {
    useGameStore.getState().actions.startNewGame('architect', {
      seedMode: 'widespread',
      seedAmount: 15000,
    });
    const s = snapshot();
    expect(s.paused).toBe(false);
    expect(s.awaiting).toBe(false);
    const seeded = Object.values(s.countries).filter((c) => c.E > 0).length;
    expect(seeded).toBeGreaterThan(1);
  });

  it('controller starts paused+awaiting focus and has a deterministic index case', () => {
    useGameStore.getState().actions.startNewGame('controller', { initialPolicy: 'advisory', startingOps: 8 });
    const s = snapshot();
    expect(s.mode).toBe('controller');
    expect(s.paused).toBe(true);
    expect(s.awaiting).toBe(true);
    const anySeeded = Object.values(s.countries).some((c) => c.E > 0 || c.I > 0);
    expect(anySeeded).toBe(false);
  });

  it('save/load preserves awaitingPatientZero gating (refresh continuity)', () => {
    // Store save/load uses localStorage; provide a minimal mock for node test env.
    const mem: Record<string, string> = {};
    const prev = (globalThis as any).localStorage;
    (globalThis as any).localStorage = {
      getItem: (k: string) => (k in mem ? mem[k] : null),
      setItem: (k: string, v: string) => { mem[k] = String(v); },
      removeItem: (k: string) => { delete mem[k]; },
      clear: () => { for (const k of Object.keys(mem)) delete mem[k]; },
    };

    const a = useGameStore.getState().actions;
    // We start in architect pick mode in beforeEach: paused + awaiting with seed amount.
    expect(snapshot().awaiting).toBe(true);
    const amt0 = (useGameStore.getState() as any).patientZeroSeedAmount;
    expect(amt0).toBe(6000);

    try {
      a.saveGame();

      // Mutate state to ensure load restores it.
      useGameStore.setState((st) => {
        st.awaitingPatientZero = false;
        (st as any).patientZeroSeedAmount = 123;
        st.paused = false;
      });

      a.loadGame();
      expect(snapshot().awaiting).toBe(true);
      const amt1 = (useGameStore.getState() as any).patientZeroSeedAmount;
      expect(amt1).toBe(6000);
      expect(snapshot().paused).toBe(true);
    } finally {
      if (typeof prev === 'undefined') delete (globalThis as any).localStorage;
      else (globalThis as any).localStorage = prev;
    }
  });
});
