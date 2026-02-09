import type { AiDirectorDaySnapshot, WorldState } from '../state/types';
import { HOSP_RESPONSE_TIERS } from './hospResponse';

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function computeIntensity(s: Pick<AiDirectorDaySnapshot, 'per100k' | 'hospLoad'>): number {
  // Rough crisis proxy: cases per 100k + hospital overload. This is intentionally
  // simple, stable, and bounded so the director sees consistent signals.
  const iTerm = clamp01(s.per100k / 650); // ~lockdown threshold in Architect policy logic
  const hTerm = clamp01(s.hospLoad / 1.0); // 1.0 means capacity reached
  return clamp01(0.65 * iTerm + 0.35 * hTerm);
}

export function computeVirusDirectorSnapshot(state: WorldState): AiDirectorDaySnapshot {
  const totalPop = Object.values(state.countries).reduce((acc, c) => acc + Math.max(0, c.pop), 0);
  const totalI = Object.values(state.countries).reduce((acc, c) => acc + Math.max(0, c.I), 0);
  const totalH = Object.values(state.countries).reduce((acc, c) => acc + Math.max(0, c.H), 0);
  const prevalence = totalPop > 0 ? (totalI / totalPop) : 0;
  const per100k = prevalence * 100_000;

  // Use *max* hospital load across boroughs (worst hotspot), and include any
  // capacity multipliers currently active so the director sees the same reality
  // the sim is using.
  let hospCapacityMulUp = 1;
  for (const u of Object.values(state.upgrades || {})) {
    if (!u.purchased) continue;
    const e = u.effects as any;
    if (typeof e.hospCapacityMul === 'number' && Number.isFinite(e.hospCapacityMul)) hospCapacityMulUp *= e.hospCapacityMul;
  }
  const respCapMul = HOSP_RESPONSE_TIERS[state.hospResponseTier]?.capMul ?? 1;
  const capPerPerson = (state.params.hospCapacityPerK / 1000) * hospCapacityMulUp * respCapMul;
  let hospLoad = 0;
  for (const c of Object.values(state.countries)) {
    const N = Math.max(0, c.pop);
    if (N <= 0) continue;
    const cap = capPerPerson * N;
    const load = cap > 0 ? (c.H / cap) : 0;
    if (load > hospLoad) hospLoad = load;
  }

  // `state.day` is the authoritative in-game time. Deriving a day index from
  // `t / msPerDay` breaks when pacing changes (it retroactively reinterprets `t`).
  const dayIndex = Math.max(0, Math.floor(state.day));
  const intensity = computeIntensity({ per100k, hospLoad });

  return {
    dayIndex,
    totalPop,
    totalI,
    totalH,
    prevalence,
    per100k,
    hospLoad,
    cureProgress: Math.max(0, Math.min(100, state.cureProgress)),
    intensity,
  };
}

export function computeDirection(history: AiDirectorDaySnapshot[]): 'rising' | 'falling' | 'flat' {
  const window = history.slice(-7);
  if (window.length < 3) return 'flat';
  const first = window[0].intensity;
  const last = window[window.length - 1].intensity;
  const delta = last - first;
  if (delta > 0.03) return 'rising';
  if (delta < -0.03) return 'falling';
  return 'flat';
}
