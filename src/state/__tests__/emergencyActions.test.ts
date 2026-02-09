import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useGameStore } from '../store';

async function advanceToDayIndex(targetDayIndex: number) {
  const a = useGameStore.getState().actions;
  a.setSpeed(10);
  a.setPacing('fast'); // msPerDay=5000 (fewer loops)
  let safety = 0;
  while (Math.floor(useGameStore.getState().day) < targetDayIndex) {
    // Auto-unpause if game auto-paused (milestones, game over, etc.)
    if (useGameStore.getState().paused) a.setPaused(false);
    a.tick(200);
    await Promise.resolve();
    if (++safety > 50_000) break; // safety valve
  }
}

describe('Emergency Actions', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('expires timed effects even when AI director is disabled / non-virus', async () => {
    const a = useGameStore.getState().actions;
    a.startNewGame('controller', {
      pathogenType: 'bacteria',
      aiDirectorEnabled: false,
      startingOps: 100,
      initialPolicy: 'advisory',
    });
    // Release the start gate for test simulation.
    a.setAwaitingPatientZero(false);
    a.setPaused(false);

    a.activateEmergencyAction('em_testing');
    expect(useGameStore.getState().activeEmergencyEffects.length).toBe(1);

    const start = Math.floor(useGameStore.getState().day);
    const endExclusive = start + 3; // Surge Testing duration (days)
    await advanceToDayIndex(endExclusive);

    expect(useGameStore.getState().activeEmergencyEffects.length).toBe(0);
  });

  it('does not charge for targeted outbreak without a target borough', () => {
    const a = useGameStore.getState().actions;
    a.startNewGame('architect', {
      pathogenType: 'virus',
      aiDirectorEnabled: false,
      seedMode: 'random',
      seedTarget: 'queens',
      seedAmount: 6000,
    });
    a.addDNA(100);

    const before = useGameStore.getState().dna;
    a.activateEmergencyAction('em_targeted');
    expect(useGameStore.getState().dna).toBe(before);
    expect(useGameStore.getState().emergencyCooldowns.em_targeted).toBeUndefined();
  });
});
