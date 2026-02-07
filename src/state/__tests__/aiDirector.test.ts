import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useGameStore } from '../store';

async function waitFor(cond: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function advanceToDayIndex(targetDayIndex: number) {
  const a = useGameStore.getState().actions;
  a.setSpeed(10);
  a.setPacing('fast'); // msPerDay=5000 (fewer loops)
  while (Math.floor(useGameStore.getState().t / useGameStore.getState().msPerDay) < targetDayIndex) {
    a.tick(200);
    // Let any queued async director work start.
    await Promise.resolve();
  }
}

function mockFetchOk(decision: any) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ decision }),
  })) as any;
}

describe('AI Director', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not request when disabled', async () => {
    const fetchMock = mockFetchOk({ version: 1, note: '', intent: 'hold', knobs: {} });
    vi.stubGlobal('fetch', fetchMock);

    useGameStore.getState().actions.startNewGame('architect', {
      pathogenType: 'virus',
      aiDirectorEnabled: false,
      seedMode: 'random',
      seedTarget: 'queens',
      seedAmount: 6000,
    });

    await advanceToDayIndex(7);
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never enables for non-virus types', async () => {
    const fetchMock = mockFetchOk({ version: 1, note: '', intent: 'hold', knobs: {} });
    vi.stubGlobal('fetch', fetchMock);

    useGameStore.getState().actions.startNewGame('architect', {
      pathogenType: 'bacteria',
      aiDirectorEnabled: true,
      seedMode: 'random',
      seedTarget: 'queens',
      seedAmount: 6000,
    });

    expect(useGameStore.getState().aiDirector?.enabled).toBe(false);
    useGameStore.getState().actions.setAiDirectorEnabled(true);
    expect(useGameStore.getState().aiDirector?.enabled).toBe(false);

    await advanceToDayIndex(7);
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests after the minimum in-game days and clamps per-decision multipliers', async () => {
    const fetchMock = mockFetchOk({
      version: 1,
      note: 'pressure response',
      intent: 'increase',
      knobs: {
        variantTransMultMul: 10,
        sigmaMul: 0.1,
        muBaseMul: 2,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    useGameStore.getState().actions.startNewGame('architect', {
      pathogenType: 'virus',
      aiDirectorEnabled: true,
      seedMode: 'random',
      seedTarget: 'queens',
      seedAmount: 6000,
    });

    await advanceToDayIndex(4);
    expect(fetchMock).not.toHaveBeenCalled();

    await advanceToDayIndex(5);
    await waitFor(() => Boolean(useGameStore.getState().aiDirector && !useGameStore.getState().aiDirector!.pending));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const ai = useGameStore.getState().aiDirector!;
    expect(ai.knobs.variantTransMultMul).toBeCloseTo(1.03, 4);
    expect(ai.knobs.sigmaMul).toBeCloseTo(0.97, 4);
    expect(ai.knobs.muBaseMul).toBeCloseTo(1.03, 4);
    expect(useGameStore.getState().events.some((e) => e.includes('AI variant drift'))).toBe(true);
  });

  it('controller mode never increases lethality (muBaseMul)', async () => {
    const fetchMock = mockFetchOk({
      version: 1,
      note: 'should not raise deaths',
      intent: 'increase',
      knobs: { muBaseMul: 1.03 },
    });
    vi.stubGlobal('fetch', fetchMock);

    useGameStore.getState().actions.startNewGame('controller', {
      pathogenType: 'virus',
      aiDirectorEnabled: true,
      initialPolicy: 'advisory',
      startingOps: 8,
    });
    // Release the start gate for test simulation.
    useGameStore.getState().actions.setAwaitingPatientZero(false);
    useGameStore.getState().actions.setPaused(false);

    await advanceToDayIndex(5);
    await waitFor(() => Boolean(useGameStore.getState().aiDirector && !useGameStore.getState().aiDirector!.pending));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const ai = useGameStore.getState().aiDirector!;
    expect(ai.knobs.muBaseMul).toBe(1);
  });

  it('handles fetch failures without crashing and leaves knobs unchanged', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    useGameStore.getState().actions.startNewGame('architect', {
      pathogenType: 'virus',
      aiDirectorEnabled: true,
      seedMode: 'random',
      seedTarget: 'queens',
      seedAmount: 6000,
    });

    await advanceToDayIndex(5);
    await waitFor(() => Boolean(useGameStore.getState().aiDirector && !useGameStore.getState().aiDirector!.pending));

    const ai = useGameStore.getState().aiDirector!;
    expect(ai.error).toContain('network down');
    expect(ai.knobs.variantTransMultMul).toBe(1);
    expect(ai.knobs.sigmaMul).toBe(1);
    expect(ai.knobs.muBaseMul).toBe(1);
  });

  it('disables the director on 404 (missing /api route) to avoid repeated ticker errors', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: 'Not found' }),
    })) as any;
    vi.stubGlobal('fetch', fetchMock);

    useGameStore.getState().actions.startNewGame('architect', {
      pathogenType: 'virus',
      aiDirectorEnabled: true,
      seedMode: 'random',
      seedTarget: 'queens',
      seedAmount: 6000,
    });

    await advanceToDayIndex(5);
    await waitFor(() => Boolean(useGameStore.getState().aiDirector && !useGameStore.getState().aiDirector!.pending));

    const ai = useGameStore.getState().aiDirector!;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ai.enabled).toBe(false);
    expect(useGameStore.getState().events.some((e) => e.includes('AI director disabled'))).toBe(true);
  });
});
