import type { HospResponseTier } from '../state/types';

export const HOSP_RESPONSE_TIERS: Record<
  HospResponseTier,
  { label: string; capMul: number; dischargeMul: number }
> = {
  0: { label: 'Normal operations', capMul: 1.0, dischargeMul: 1.0 },
  1: { label: 'Emergency triage expansion', capMul: 1.15, dischargeMul: 1.04 },
  2: { label: 'Field hospital deployment', capMul: 1.35, dischargeMul: 1.07 },
  3: { label: 'Federal surge response', capMul: 1.6, dischargeMul: 1.1 },
};

export function targetHospResponseTier(loadBase: number): HospResponseTier {
  if (loadBase >= 1.55) return 3;
  if (loadBase >= 1.25) return 2;
  if (loadBase >= 1.0) return 1;
  return 0;
}

export function nextHospResponseTier(
  cur: HospResponseTier,
  loadBase: number,
  loadEff: number
): HospResponseTier {
  const target = targetHospResponseTier(loadBase);
  if (target > cur) return target;

  // Hysteresis for stepping down. We use effective load (after current response)
  // so we don't flap when hovering near thresholds.
  if (cur === 3 && loadEff < 1.18) return 2;
  if (cur === 2 && loadEff < 0.98) return 1;
  if (cur === 1 && loadEff < 0.8) return 0;
  return cur;
}

