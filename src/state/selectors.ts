import type { GameStore } from './store';
import type { CountryID } from './types';

export type ISLMetrics = { infectivity: number; severity: number; lethality: number };

function aggregateUpgradeMultipliers(st: GameStore) {
  let betaMulUp = 1, sigmaMulUp = 1, gammaRecMulUp = 1, muMulUp = 1;
  let policyResistMulUp = 1, symFracMulUp = 1, symContactMulUp2 = 1, severityMobilityMulUp = 1;
  for (const u of Object.values(st.upgrades)) {
    if (!u.purchased) continue;
    const e = u.effects || {};
    if ((e as any).betaMul) betaMulUp *= (e as any).betaMul;
    if ((e as any).sigmaMul) sigmaMulUp *= (e as any).sigmaMul;
    if ((e as any).gammaRecMul) gammaRecMulUp *= (e as any).gammaRecMul;
    if ((e as any).muMul) muMulUp *= (e as any).muMul;
    if ((e as any).policyResistMul) policyResistMulUp *= (e as any).policyResistMul;
    if ((e as any).symFracMul) symFracMulUp *= (e as any).symFracMul;
    if ((e as any).symContactMul) symContactMulUp2 *= (e as any).symContactMul;
    if ((e as any).severityMobilityMul) severityMobilityMulUp *= (e as any).severityMobilityMul;
  }
  return { betaMulUp, sigmaMulUp, gammaRecMulUp, muMulUp, policyResistMulUp, symFracMulUp, symContactMulUp2, severityMobilityMulUp };
}

export function selectISL(st: GameStore): ISLMetrics {
  const p = st.params as any;
  const up = aggregateUpgradeMultipliers(st);
  // Seasonality factor (same as sim tick)
  const season = 1 + p.seasonalityAmp * Math.cos(2 * Math.PI * ((st.day - p.seasonalityPhase) / 365));
  const symFracEff = Math.max(0, Math.min(1, p.symFrac * up.symFracMulUp));
  const symContactEff = Math.max(0, Math.min(1, p.symContactMul * up.symContactMulUp2));

  // Infectivity: average effective contact-adjusted transmission relative to a reference
  let totalN = 0, contactAccum = 0;
  for (const c of Object.values(st.countries)) {
    const N = Math.max(1, c.pop);
    totalN += N;
    const basePolicy = c.policy === 'open' ? 1.0 : c.policy === 'advisory' ? 0.75 : c.policy === 'restrictions' ? 0.5 : 0.25;
    const policyContactMul = 1 - (1 - basePolicy) / up.policyResistMulUp;
    const symPrev = symFracEff * (c.I / N);
    const symContact = 1 - symPrev * (1 - symContactEff);
    const contactMul = policyContactMul * symContact;
    contactAccum += contactMul * N;
  }
  const avgContactMul = totalN > 0 ? (contactAccum / totalN) : 1;
  const betaEff = p.beta * up.betaMulUp * p.variantTransMult * season * avgContactMul;
  // Normalize infectivity around a nominal range (0..1) relative to baseline beta
  const infectivity = Math.max(0, Math.min(1, betaEff / (p.beta * 1.6)));

  // Severity: combine hospitalization strain and symptomatic prevalence
  let strainAccum = 0, symPrevAccum = 0;
  for (const c of Object.values(st.countries)) {
    const N = Math.max(1, c.pop);
    const capPerPerson = (p.hospCapacityPerK / 1000);
    const cap = capPerPerson * N;
    const strain = cap > 0 ? Math.min(2, Math.max(0, c.H / cap)) : 0; // 0..2, >1 indicates overload
    const symPrev = symFracEff * (c.I / N);
    strainAccum += strain * N; symPrevAccum += symPrev * N;
  }
  const avgStrain = totalN > 0 ? (strainAccum / totalN) : 0;
  const avgSymPrev = totalN > 0 ? (symPrevAccum / totalN) : 0;
  const severity = Math.max(0, Math.min(1, 0.6 * avgSymPrev + 0.4 * Math.min(1, avgStrain)));

  // Lethality: effective mortality under strain relative to a nominal upper bound
  const muEffBase = p.muBase * up.muMulUp;
  // approximate average overload amplification as in sim
  const overloadAmp = avgStrain > 1 ? (1 + (avgStrain - 1) * 2) : 1;
  const muEff = muEffBase * overloadAmp;
  const lethality = Math.max(0, Math.min(1, muEff / 0.003)); // scale vs. ~0.3%/day upper target

  return { infectivity: infectivity * 100, severity: severity * 100, lethality: lethality * 100 };
}

export function selectSelectedCountryId(st: GameStore): CountryID | null {
  return st.selectedCountryId ?? null;
}

// Approximate effective reproduction number R_eff across the city
export function selectReff(st: GameStore): number {
  const up = aggregateUpgradeMultipliers(st);
  const p: any = st.params;
  const season = 1 + p.seasonalityAmp * Math.cos(2 * Math.PI * ((st.day - p.seasonalityPhase) / 365));
  let num = 0, den = 0;
  for (const c of Object.values(st.countries)) {
    const N = Math.max(1, c.pop);
    const basePolicy = c.policy === 'open' ? 1.0 : c.policy === 'advisory' ? 0.75 : c.policy === 'restrictions' ? 0.5 : 0.25;
    const policyContactMul = 1 - (1 - basePolicy) / up.policyResistMulUp;
    const symPrev = Math.max(0, Math.min(1, (p.symFrac * (c.I / N))));
    const symContact = 1 - symPrev * (1 - Math.max(0, Math.min(1, p.symContactMul * up.symContactMulUp2)));
    const contactMul = policyContactMul * symContact;
    const betaEff = p.beta * up.betaMulUp * p.variantTransMult * season * contactMul;
    const gammaRec = p.gammaRec * up.gammaRecMulUp;
    const mu = p.muBase * up.muMulUp;
    const Seff = Math.max(0, c.S / N);
    const Reff = (betaEff * Seff) / Math.max(1e-6, (gammaRec + mu));
    num += Reff * N; den += N;
  }
  return den > 0 ? num / den : 0;
}
