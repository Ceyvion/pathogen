import { describe, it, expect } from 'vitest';

import { useGameStore } from '../../state/store';
import { computeVirusDirectorSnapshot } from '../aiDirectorMetrics';

describe('AI Director Metrics', () => {
  it('uses state.day as the canonical day index (stable across pacing changes)', () => {
    useGameStore.getState().actions.startNewGame('architect', {
      pathogenType: 'virus',
      aiDirectorEnabled: false,
      seedMode: 'random',
      seedTarget: 'queens',
      seedAmount: 6000,
    });

    // Simulate: the run advanced under a faster pacing (so `t` is relatively high),
    // then pacing was switched to slow. `state.day` is the authoritative timeline.
    useGameStore.setState((st) => {
      st.day = 10.2;
      st.t = 50_000;
      st.msPerDay = 12_000;
    });

    const snap = computeVirusDirectorSnapshot(useGameStore.getState());
    expect(snap.dayIndex).toBe(10);
  });
});

