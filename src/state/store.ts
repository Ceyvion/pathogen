import { create } from 'zustand';
import { playMilestone } from '../audio/sfx';
import { immer } from 'zustand/middleware/immer';
import type { Country, CountryID, TravelEdge, Upgrade, WorldState, GameMode, Story, GeneId } from './types';
import { STORIES } from '../story/stories';

type Actions = {
  setSpeed: (s: 1 | 3 | 10) => void;
  togglePause: () => void;
  setPacing: (p: 'slow'|'normal'|'fast') => void;
  selectCountry: (id: CountryID | null) => void;
  tick: (dtMs: number) => void;
  purchaseUpgrade: (id: string) => void;
  saveGame: () => void;
  loadGame: () => void;
  addEvent: (text: string) => void;
  seedInfection: (target?: CountryID | 'all', amount?: number) => void;
  setPolicy: (id: CountryID, policy: Country['policy']) => void;
  startNewGame: (mode: GameMode, opts?: {
    difficulty?: 'casual'|'normal'|'brutal';
    genes?: GeneId[];
    storyId?: string;
    // optional campaign-specific setup
    seedMode?: 'pick'|'random'|'widespread';
    seedTarget?: CountryID;
    seedAmount?: number;
    initialPolicy?: Country['policy'];
    startingOps?: number;
  }) => void;
  addDNA: (delta: number) => void;
  adjustCure: (deltaPercent: number) => void;
  setAwaitingPatientZero: (v: boolean) => void;
};

export type GameStore = WorldState & { actions: Actions };

// Persistent accumulator for fixed-step integration. Without this, 1× (~16ms frames)
// rarely reaches the 50ms step threshold, making time appear stuck until 3×/10×.
let __simAccMs = 0;

const initialCountries = (): Record<CountryID, Country> => {
  const mk = (id: string, name: string, pop: number): Country => ({
    id,
    name,
    pop,
    S: pop,
    E: 0,
    I: 0,
    R: 0,
    H: 0,
    D: 0,
    policy: 'open',
  });
  // NYC boroughs (approximate 2020 populations)
  return {
    manhattan: mk('manhattan', 'Manhattan', 1_694_251),
    brooklyn: mk('brooklyn', 'Brooklyn', 2_736_074),
    queens: mk('queens', 'Queens', 2_405_464),
    bronx: mk('bronx', 'Bronx', 1_472_654),
    staten_island: mk('staten_island', 'Staten Island', 495_747),
  };
};

const baseUpgradesArchitect = (): Record<string, Upgrade> => ({
  tx1: { id: 'tx1', name: 'Aerosol Stability', branch: 'transmission', cost: 8, desc: '+10% transmission', effects: { betaMul: 1.10 } },
  tx2: { id: 'tx2', name: 'Surface Persistence', branch: 'transmission', cost: 16, desc: '+12% transmission', effects: { betaMul: 1.12 }, prereqs: ['tx1'] },
  tx3: { id: 'tx3', name: 'Shorter Incubation', branch: 'transmission', cost: 18, desc: '+10% incubation rate', effects: { sigmaMul: 1.10 }, prereqs: ['tx1'] },

  sym1: { id: 'sym1', name: 'Stealthy Symptoms', branch: 'symptoms', cost: 12, desc: 'Undercut policy (×1.2 resist)', effects: { policyResistMul: 1.2 } },
  sym2: { id: 'sym2', name: 'Aggressive Shedding', branch: 'symptoms', cost: 20, desc: '+8% transmission, +0.1 DNA/day', effects: { betaMul: 1.08, dnaRateAdd: 0.1 }, prereqs: ['sym1'] },

  ab1: { id: 'ab1', name: 'Immune Escape v1', branch: 'abilities', cost: 14, desc: '-5% recovery speed', effects: { gammaRecMul: 0.95 } },
  ab2: { id: 'ab2', name: 'Policy Evasion', branch: 'abilities', cost: 22, desc: 'Undercut policy (×1.5 resist)', effects: { policyResistMul: 1.5 }, prereqs: ['ab1'] },
  ab3: { id: 'ab3', name: 'Cold Resistant', branch: 'abilities', cost: 12, desc: '+5% transmission (cold season)', effects: { betaMul: 1.05 } },
  ab4: { id: 'ab4', name: 'Genetic Reshuffle', branch: 'abilities', cost: 24, desc: 'Slows cure progress (−20%)', effects: { cureRateMul: 0.8 } },
});

const baseUpgradesController = (): Record<string, Upgrade> => ({
  ops1: { id: 'ops1', name: 'Mask Mandate', branch: 'transmission', cost: 8, desc: 'Reduce contacts (−8% β)', effects: { betaMul: 0.92 } },
  ops2: { id: 'ops2', name: 'Testing Ramp-up', branch: 'abilities', cost: 10, desc: 'Faster recovery via isolation (+5% γ) and research (+0.05%/day)', effects: { gammaRecMul: 1.05, cureAddPerDay: 0.05 } as any },
  ops3: { id: 'ops3', name: 'Contact Tracing', branch: 'abilities', cost: 14, desc: 'Reduce effective contacts (−10% β) and research (+0.04%/day)', effects: { betaMul: 0.90, cureAddPerDay: 0.04 } as any, prereqs: ['ops2'] },
  ops4: { id: 'ops4', name: 'Border Screening', branch: 'transmission', cost: 12, desc: 'Lower importations (−50%)', effects: { importationMul: 0.5 } },
  ops5: { id: 'ops5', name: 'Public Campaigns', branch: 'symptoms', cost: 10, desc: 'Boost policy effectiveness (×1.25) and research (+0.03%/day)', effects: { policyResistMul: 1.25, cureAddPerDay: 0.03 } as any },
  ops6: { id: 'ops6', name: 'Vaccine R&D', branch: 'abilities', cost: 18, desc: 'Accelerate cure (+25%) and research (+0.25%/day)', effects: { cureRateMul: 1.25, cureAddPerDay: 0.25 } as any },
  ops7: { id: 'ops7', name: 'Vaccine Manufacturing', branch: 'abilities', cost: 22, desc: 'Accelerate cure (+35%) and research (+0.35%/day)', effects: { cureRateMul: 1.35, cureAddPerDay: 0.35 } as any, prereqs: ['ops6'] },
});

function upgradesFor(mode: GameMode, campaignId?: string): Record<string, Upgrade> {
  if (mode === 'architect') {
    if (campaignId === 'architect_patient_zero') {
      return {
        // Transmission branch – urban focus
        apz_tx1: { id: 'apz_tx1', name: 'Urban Transit Shedding', branch: 'transmission', cost: 8, desc: '+12% transmission via subways', effects: { betaMul: 1.12 } },
        apz_tx2: { id: 'apz_tx2', name: 'Household Spread', branch: 'transmission', cost: 14, desc: '+10% transmission (home clusters)', effects: { betaMul: 1.10 }, prereqs: ['apz_tx1'] },
        apz_tx3: { id: 'apz_tx3', name: 'Neighborhood Clusters', branch: 'transmission', cost: 18, desc: '+10% incubation rate, +6% transmission', effects: { sigmaMul: 1.10, betaMul: 1.06 }, prereqs: ['apz_tx2'] },
        apz_tx4: { id: 'apz_tx4', name: 'Workplace Spillover', branch: 'transmission', cost: 22, desc: '+12% transmission (weekday bias)', effects: { betaMul: 1.12 }, prereqs: ['apz_tx3'] },

        // Symptoms branch – stealth → shedding
        apz_sym1: { id: 'apz_sym1', name: 'Asymptomatic Carriers', branch: 'symptoms', cost: 12, desc: 'Stealth: undercut policy (×1.3)', effects: { policyResistMul: 1.3 } },
        apz_sym2: { id: 'apz_sym2', name: 'Cough Variant', branch: 'symptoms', cost: 18, desc: '+9% transmission, +0.1 DNA/day', effects: { betaMul: 1.09, dnaRateAdd: 0.1 }, prereqs: ['apz_sym1'] },
        apz_sym3: { id: 'apz_sym3', name: 'Aerosolized Droplets', branch: 'symptoms', cost: 22, desc: '+10% transmission, −5% recovery', effects: { betaMul: 1.10, gammaRecMul: 0.95 }, prereqs: ['apz_sym2'] },
        apz_sym4: { id: 'apz_sym4', name: 'Systemic Impact', branch: 'symptoms', cost: 26, desc: '+0.15 DNA/day', effects: { dnaRateAdd: 0.15 }, prereqs: ['apz_sym3'] },

        // Abilities branch – cure pressure + survivability
        apz_ab1: { id: 'apz_ab1', name: 'Immune Escape', branch: 'abilities', cost: 16, desc: '-7% recovery speed', effects: { gammaRecMul: 0.93 } },
        apz_ab2: { id: 'apz_ab2', name: 'Genetic Reshuffle', branch: 'abilities', cost: 22, desc: 'Slow cure (−25%)', effects: { cureRateMul: 0.75 }, prereqs: ['apz_ab1'] },
        apz_ab3: { id: 'apz_ab3', name: 'Cold Resistant', branch: 'abilities', cost: 16, desc: '+6% transmission (cold season)', effects: { betaMul: 1.06 } },
        apz_ab4: { id: 'apz_ab4', name: 'Policy Evasion', branch: 'abilities', cost: 20, desc: 'Undercut policy (×1.4 resist)', effects: { policyResistMul: 1.4 }, prereqs: ['apz_ab1'] },
        apz_ab5: { id: 'apz_ab5', name: 'Recombination Burst', branch: 'abilities', cost: 30, desc: 'Slow cure (−15%) and +8% transmission', effects: { cureRateMul: 0.85, betaMul: 1.08 }, prereqs: ['apz_ab2'] },
      };
    }
    return baseUpgradesArchitect();
  } else {
    // controller sets vary per campaign
    if (campaignId === 'controller_prologue') {
      return {
        // Measures (transmission)
        cp_m1: { id: 'cp_m1', name: 'Mask Mandate', branch: 'transmission', cost: 6, desc: 'Reduce contacts (−6% β)', effects: { betaMul: 0.94 } },
        cp_m2: { id: 'cp_m2', name: 'Gathering Limits', branch: 'transmission', cost: 10, desc: 'Reduce contacts (−9% β)', effects: { betaMul: 0.91 }, prereqs: ['cp_m1'] },
        cp_m3: { id: 'cp_m3', name: 'Targeted Closures', branch: 'transmission', cost: 14, desc: 'Reduce contacts (−12% β)', effects: { betaMul: 0.88 }, prereqs: ['cp_m2'] },

        // Public & Policy (symptoms label for controller)
        cp_p1: { id: 'cp_p1', name: 'Public Campaigns', branch: 'symptoms', cost: 8, desc: 'Boost policy effectiveness (×1.2) + research (+0.04%/day)', effects: { policyResistMul: 1.2, cureAddPerDay: 0.04 } as any },
        cp_p2: { id: 'cp_p2', name: 'School Protocols', branch: 'symptoms', cost: 12, desc: 'Reduce contacts (−6% β), +0.03% research/day', effects: { betaMul: 0.94, cureAddPerDay: 0.03 } as any, prereqs: ['cp_p1'] },
        cp_p3: { id: 'cp_p3', name: 'Economic Support', branch: 'symptoms', cost: 12, desc: 'Improve compliance (×1.2 policy)', effects: { policyResistMul: 1.2 }, prereqs: ['cp_p1'] },

        // Research & Ops (abilities)
        cp_r1: { id: 'cp_r1', name: 'Testing Ramp-up', branch: 'abilities', cost: 10, desc: 'Faster recovery (+5% γ) + research (+0.06%/day)', effects: { gammaRecMul: 1.05, cureAddPerDay: 0.06 } as any },
        cp_r2: { id: 'cp_r2', name: 'Contact Tracing', branch: 'abilities', cost: 14, desc: 'Reduce contacts (−8% β) + research (+0.05%/day)', effects: { betaMul: 0.92, cureAddPerDay: 0.05 } as any, prereqs: ['cp_r1'] },
        cp_r3: { id: 'cp_r3', name: 'Hospital Surge', branch: 'abilities', cost: 16, desc: 'Boost discharge (+10%), lower mortality (−10%)', effects: { dischargeMul: 1.10, muMul: 0.90 } },
        cp_r4: { id: 'cp_r4', name: 'Vaccine R&D', branch: 'abilities', cost: 18, desc: 'Accelerate cure (+25%) +0.25%/day', effects: { cureRateMul: 1.25, cureAddPerDay: 0.25 } as any, prereqs: ['cp_r1'] },
        cp_r5: { id: 'cp_r5', name: 'Vaccine Manufacturing', branch: 'abilities', cost: 24, desc: 'Accelerate cure (+35%) +0.35%/day', effects: { cureRateMul: 1.35, cureAddPerDay: 0.35 } as any, prereqs: ['cp_r4'] },
      };
    }
    return baseUpgradesController();
  }
}

const MAX_EVENTS = 50;

// Radiation-model-inspired commuting flows across the five boroughs
const boroughLL: Record<CountryID, [number, number]> = {
  manhattan: [-73.9712, 40.7831],
  brooklyn: [-73.9442, 40.6782],
  queens: [-73.7949, 40.7282],
  bronx: [-73.8648, 40.8448],
  staten_island: [-74.1502, 40.5795],
};
function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371; // km
  const dLat = (b[1]-a[1]) * Math.PI/180;
  const dLon = (b[0]-a[0]) * Math.PI/180;
  const lat1 = a[1]*Math.PI/180, lat2 = b[1]*Math.PI/180;
  const s = Math.sin;
  const d = 2*R*Math.asin(Math.sqrt(s(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*s(dLon/2)**2));
  return d;
}
function travelEdges(): TravelEdge[] {
  const pops = initialCountries();
  const ids = Object.keys(pops) as CountryID[];
  const m: Record<CountryID, number> = {} as any; ids.forEach(id => m[id] = pops[id].pop);
  const totalPop = ids.reduce((s,id)=>s+m[id],0);
  // Choose daily outbound commuters as a fraction of pop (calibrated small)
  const outFrac = 0.08; // ~8% daily cross-borough movements
  const sCum: Record<string, number> = {};
  // Precompute population within radius for each pair (intervening opportunities)
  const Sij: Record<string, number> = {};
  for (const i of ids) {
    for (const j of ids) {
      if (i===j) continue;
      const rij = haversineKm(boroughLL[i], boroughLL[j]);
      let s = 0;
      for (const k of ids) {
        if (k===i || k===j) continue;
        const rik = haversineKm(boroughLL[i], boroughLL[k]);
        if (rik < rij) s += m[k];
      }
      Sij[`${i}|${j}`] = s;
    }
  }
  // Radiation formula: Tij = Ti * (mi * mj) / ((mi + Sij) * (mi + mj + Sij))
  const edges: TravelEdge[] = [];
  for (const i of ids) {
    const Ti = m[i] * outFrac;
    let denomSum = 0;
    const temp: { j: CountryID; val: number }[] = [];
    for (const j of ids) {
      if (i===j) continue;
      const mi = m[i], mj = m[j], sij = Sij[`${i}|${j}`] || 0;
      const val = (mi * mj) / ((mi + sij) * (mi + mj + sij));
      temp.push({ j, val });
      denomSum += val;
    }
    for (const { j, val } of temp) {
      const Tij = denomSum > 0 ? (Ti * (val / denomSum)) : 0;
      // split both directions by default symmetry handled when j loops
      edges.push({ from: i, to: j, daily: Math.round(Tij) });
    }
  }
  return edges;
}

export const useGameStore = create<GameStore>()(
  immer((set, get) => ({
    t: 0,
    day: 0,
    paused: false,
    speed: 1,
    msPerDay: 1200, // default pacing: ~1.2s per in-game day at 1x
    pacing: 'normal' as 'slow'|'normal'|'fast',
    bubbleSpawnMs: 1400,
    dna: 0,
    countries: initialCountries(),
    selectedCountryId: null,
    mode: 'architect',
    cureProgress: 0,
    difficulty: 'normal',
    story: undefined,
    peakI: 0,
    // Advanced SEIR params
    params: {
      beta: 0.45,
      sigma: 1 / 5,
      gammaRec: 1 / 8,
      muBase: 0.0005,
      seasonalityAmp: 0.15,
      seasonalityPhase: 15,
      hospRate: 0.03,
      dischargeRate: 0.12,
      hospCapacityPerK: 4.5,
      mobilityScale: 1,
      importationPerDay: 5,
      variantTransMult: 1,
      symFrac: 0.65,
      symContactMul: 0.7,
      severityMobilityFactor: 0.5,
      // early-game pacing: short grace and gradual ramp
      startRampDelayDays: 2,
      startRampDurationDays: 10,
      earlyPointBoostDays: 8,
      earlyPointBoostMul: 1.5,
    },
    upgrades: baseUpgradesArchitect(),
    events: [],
    travel: travelEdges(),
    actions: {
      setSpeed: (s) => set((st) => { st.speed = s; }),
      togglePause: () => set((st) => {
        st.paused = !st.paused;
        if (st.paused) __simAccMs = 0; // clear leftover fractional time when pausing
      }),
      setPacing: (p) => set((st) => {
        st.pacing = p;
        if (p === 'slow') { st.msPerDay = 1800; st.bubbleSpawnMs = 1600; }
        else if (p === 'fast') { st.msPerDay = 800; st.bubbleSpawnMs = 1200; }
        else { st.msPerDay = 1200; st.bubbleSpawnMs = 1400; }
      }),
      selectCountry: (id) => set((st) => { st.selectedCountryId = id; }),
      addEvent: (text) => set((st) => { st.events.unshift(text); if (st.events.length > MAX_EVENTS) st.events.pop(); }),
      tick: (dtMs) => {
        const st = get();
        if (st.paused) return;
        // fixed-step integration ~50ms
        const stepMs = 50;
        __simAccMs += dtMs * st.speed;
        while (__simAccMs >= stepMs) {
          set((state) => {
            state.t += stepMs;
            const dtDays = stepMs / state.msPerDay;
            state.day += dtDays;
            // Early-game disease progression ramp (grace period)
            const delay = (state.params.startRampDelayDays ?? 0);
            const rampDur = Math.max(0.0001, (state.params.startRampDurationDays ?? 0));
            const raw = (state.day - delay) / rampDur;
            const prog = Math.max(0, Math.min(1, raw));
            // apply upgrade modifiers
            let betaMulUp = 1;
            let sigmaMulUp = 1;
            let gammaRecMulUp = 1;
            let muMulUp = 1;
            let hospRateMulUp = 1;
            let dischargeMulUp = 1;
            let importMulUp = 1;
            let policyResistMulUp = 1;
            // base accrual by difficulty & mode
            const baseDnaByDiff = state.difficulty === 'casual' ? 0.3 : state.difficulty === 'brutal' ? 0.15 : 0.2;
            const baseOpsByDiff = state.difficulty === 'casual' ? 2.6 : state.difficulty === 'brutal' ? 1.6 : 2.0;
            let dnaRate = state.mode === 'architect' ? baseDnaByDiff : baseOpsByDiff; // per day
            let cureRateMul = 1;
            let cureAddPerDay = 0; // additive % per day from ops
            let symFracMulUp = 1; // symptomatic fraction modifier
            let symContactMulUp2 = 1; // symptomatic contact multiplier modifier
            let severityMobilityMulUp = 1; // severity mobility scaling modifier
            for (const u of Object.values(state.upgrades)) {
              if (!u.purchased) continue;
              const e = u.effects;
              if (e.betaMul) betaMulUp *= e.betaMul;
              if (e.sigmaMul) sigmaMulUp *= e.sigmaMul;
              if (e.gammaRecMul) gammaRecMulUp *= e.gammaRecMul;
              if (e.muMul) muMulUp *= e.muMul;
              if (e.hospRateMul) hospRateMulUp *= e.hospRateMul;
              if (e.dischargeMul) dischargeMulUp *= e.dischargeMul;
              if (e.importationMul) importMulUp *= e.importationMul;
              if (e.policyResistMul) policyResistMulUp *= e.policyResistMul;
              if (e.dnaRateAdd) dnaRate += e.dnaRateAdd;
              if ((e as any).cureRateMul) cureRateMul *= (e as any).cureRateMul;
              if ((e as any).cureAddPerDay) cureAddPerDay += (e as any).cureAddPerDay;
              if ((e as any).symFracMul) symFracMulUp *= (e as any).symFracMul;
              if ((e as any).symContactMul) symContactMulUp2 *= (e as any).symContactMul;
              if ((e as any).severityMobilityMul) severityMobilityMulUp *= (e as any).severityMobilityMul;
            }
            const p = state.params as any;
            // seasonality
            const season = 1 + p.seasonalityAmp * Math.cos(2 * Math.PI * ((state.day - p.seasonalityPhase) / 365));
            const capPerPerson = (p.hospCapacityPerK / 1000);
            const symFracEff = Math.max(0, Math.min(1, p.symFrac * symFracMulUp));
            const symContactEff = Math.max(0, Math.min(1, p.symContactMul * symContactMulUp2));
            const sevMobEff = Math.max(0, p.severityMobilityFactor * severityMobilityMulUp);

            // helper: mild stochastic jitter to emulate demographic noise
            const jitter = (x: number, amp = 0.06) => x <= 0 ? 0 : Math.max(0, x * (1 + (Math.random() * 2 - 1) * amp));

            // disease dynamics per borough
            for (const c of Object.values(state.countries)) {
              const N = c.pop;
              if (N <= 0) continue;
              const policyBase = c.policy === 'open' ? 1.0 : c.policy === 'advisory' ? 0.75 : c.policy === 'restrictions' ? 0.5 : 0.25;
              // Pathogen policy resistance undermines damping
              const policyContactMul = 1 - (1 - policyBase) / policyResistMulUp;
              // Symptom-driven self-isolation reduces contacts proportional to symptomatic prevalence
              const symPrev = symFracEff * (c.I / N);
              const symContact = 1 - symPrev * (1 - symContactEff);
              const contactMul = policyContactMul * symContact;
              const betaEff = p.beta * betaMulUp * p.variantTransMult * season * contactMul;
              const sigma = p.sigma * sigmaMulUp;
              const gammaRec = p.gammaRec * gammaRecMulUp;
              let mu = p.muBase * muMulUp;

              // Hospital flows
              const symptomaticI = symFracEff * c.I;
              const newHosp = prog * (p.hospRate * hospRateMulUp) * symptomaticI * dtDays;
              const discharges = Math.min(c.H, (p.dischargeRate * dischargeMulUp) * c.H * dtDays);
              c.H += newHosp - discharges;
              c.R += discharges;

              // hospital strain effects
              const cap = capPerPerson * N;
              const strain = cap > 0 ? Math.min(2, Math.max(0, c.H / cap)) : 0;
              if (strain > 1) {
                mu *= 1 + (strain - 1) * 2;
              }

              // infection pressure + importations
              const lambda = betaEff * (c.I / N);
              const newE = Math.min(c.S, prog * (jitter(lambda * c.S * dtDays) + jitter((p.importationPerDay * importMulUp) * dtDays, 0.12)));
              const newI = Math.min(c.E, prog * jitter(sigma * c.E * dtDays));
              const rec = Math.min(c.I, jitter(gammaRec * c.I * dtDays));
              const deaths = Math.min(c.I - rec, jitter(mu * c.I * dtDays, 0.08));

              c.S -= newE;
              c.E += newE - newI;
              c.I += newI - rec - deaths;
              c.R += rec;
              c.D += deaths;
            }

            // mobility between boroughs
            const moveComp = ['S','E','I','R'] as const;
            const ids = Object.keys(state.countries) as CountryID[];
            const snapshot: Record<CountryID, Record<typeof moveComp[number], number>> = {} as any;
            for (const id of ids) {
              const c = state.countries[id];
              snapshot[id] = { S: c.S, E: c.E, I: c.I, R: c.R } as any;
            }
            for (const edge of (state as any).travel || []) {
              const from = state.countries[edge.from];
              const to = state.countries[edge.to];
              if (!from || !to) continue;
              const travelToday = edge.daily * p.mobilityScale * dtDays;
              if (travelToday <= 0) continue;
              const baseTravel = from.policy === 'open' ? 1.0 : from.policy === 'advisory' ? 0.6 : from.policy === 'restrictions' ? 0.3 : 0.1;
              let fromMul = 1 - (1 - baseTravel) / policyResistMulUp;
              // Severity reduces mobility from origin: symptomatic and hospitalized suppress travel
              const NfromEff = Math.max(1, from.pop);
              const severity = Math.min(1, (symFracEff * from.I + from.H) / NfromEff);
              fromMul *= 1 - Math.min(0.9, severity * sevMobEff);
              const allowed = travelToday * fromMul;
              const Nfrom = from.pop;
              const move = Math.min(allowed, Nfrom * 0.01 * dtDays);
              if (move <= 0) continue;
              const snap = snapshot[edge.from];
              const tot = snap.S + snap.E + snap.I + snap.R;
              if (tot <= 0) continue;
              const frac = move / tot;
              for (const k of moveComp) {
                const delta = snap[k] * frac;
                (from as any)[k] -= delta;
                (to as any)[k] += delta;
                (snapshot[edge.from] as any)[k] -= delta;
              }
            }

            // accrue points
            const earlyBoost = state.day < (state.params.earlyPointBoostDays ?? 0) ? (state.params.earlyPointBoostMul ?? 1) : 1;
            state.dna += dnaRate * dtDays * earlyBoost;

            // cure progress model (0..100)
            const totalPop = Object.values(state.countries).reduce((s, c) => s + c.pop, 0);
            const totalI = Object.values(state.countries).reduce((s, c) => s + c.I, 0);
            // Mode-aware: controller has baseline research independent of prevalence
            const prevalenceTerm = 6 * (totalI / Math.max(1, totalPop)); // up to ~6%/day at full infection
            const baseModeRaw = state.mode === 'controller' ? 0.25 : 0.02; // % per day base
            const baseMode = state.difficulty === 'casual' ? baseModeRaw * 1.2 : state.difficulty === 'brutal' ? baseModeRaw * 0.8 : baseModeRaw;
            let curePerDay = (baseMode + prevalenceTerm) * cureRateMul + cureAddPerDay;
            let cureDelta = curePerDay * dtDays;
            state.cureProgress = Math.min(100, state.cureProgress + cureDelta);

            // track peak I
            if (totalI > state.peakI) state.peakI = totalI;

            // daily event (integer day boundary)
            const prevDay = Math.floor((state.t - stepMs) / state.msPerDay);
            const nowDay = Math.floor(state.t / state.msPerDay);
            if (nowDay !== prevDay) {
              const I = Object.values(state.countries).reduce((s, c) => s + c.I, 0);
              state.events.unshift(`Day ${nowDay}: I=${I.toFixed(0)} | Cure ${state.cureProgress.toFixed(1)}%`);
              try { playMilestone('day'); } catch {}
              if (state.events.length > MAX_EVENTS) state.events.pop();
              // evaluate story objectives (simple completion only)
              if (state.story) {
                const allMet = state.story.objectives.every((o) => {
                  if (o.type === 'reach_cure') return state.cureProgress >= o.target;
                  if (o.type === 'days_survived') return state.day >= o.target;
                  if (o.type === 'limit_peak_I') return state.peakI <= o.target;
                  if (o.type === 'infect_all') {
                    const infected = Object.values(state.countries).filter(c => c.I > 0).length;
                    return infected >= o.target;
                  }
                  return false;
                });
                if (allMet) {
                  state.paused = true;
                  state.events.unshift('Victory: Objectives completed');
                  try { playMilestone('victory'); } catch {}
                }
              }
            }
          });
          __simAccMs -= stepMs;
        }
      },
      purchaseUpgrade: (id) => set((st) => {
        const up = st.upgrades[id];
        if (!up || up.purchased) return;
        if (up.prereqs && up.prereqs.some((pid) => !st.upgrades[pid]?.purchased)) return;
        if (st.dna < up.cost) return;
        st.dna -= up.cost;
        up.purchased = true;
      }),
      seedInfection: (target, amount) => set((st) => {
        const bump = amount ?? 20_000; // default boost
        const apply = (c: Country) => {
          const space = Math.max(0, c.S - 1);
          const delta = Math.min(space, bump);
          c.S -= delta;
          c.I += delta;
        };
        if (!target || target === 'all') {
          Object.values(st.countries).forEach(apply);
        } else if (st.countries[target]) {
          apply(st.countries[target]);
        }
        st.events.unshift('Seeded infections for demo');
      }),
      setPolicy: (id, policy) => set((st) => { const c = st.countries[id]; if (c) c.policy = policy; }),
      saveGame: () => {
        const st = get();
        const snapshot = {
          t: st.t,
          day: st.day,
          paused: st.paused,
          speed: st.speed,
          msPerDay: st.msPerDay,
          dna: st.dna,
          mode: st.mode,
          difficulty: st.difficulty,
          cureProgress: st.cureProgress,
          peakI: st.peakI,
          story: st.story,
          countries: st.countries,
          selectedCountryId: st.selectedCountryId,
          params: st.params,
          upgrades: st.upgrades,
          events: st.events.slice(0, 20),
          version: 1,
        };
        localStorage.setItem('gameSave', JSON.stringify(snapshot));
      },
      loadGame: () => {
        const raw = localStorage.getItem('gameSave');
        if (!raw) return;
        try {
          const snap = JSON.parse(raw);
          set((st) => {
            st.t = snap.t ?? st.t;
            st.day = snap.day ?? st.day;
            st.paused = snap.paused ?? st.paused;
            st.speed = snap.speed ?? st.speed;
            st.msPerDay = snap.msPerDay ?? st.msPerDay;
            st.dna = snap.dna ?? st.dna;
            st.countries = snap.countries ?? st.countries;
            st.selectedCountryId = snap.selectedCountryId ?? st.selectedCountryId;
            st.params = snap.params ?? st.params;
            st.upgrades = snap.upgrades ?? st.upgrades;
            st.events = Array.isArray(snap.events) ? snap.events : st.events;
            st.mode = snap.mode ?? st.mode;
            st.difficulty = snap.difficulty ?? st.difficulty;
            st.cureProgress = snap.cureProgress ?? st.cureProgress;
            st.peakI = snap.peakI ?? st.peakI;
            st.story = snap.story ?? st.story;
          });
        } catch {}
      },
      startNewGame: (mode, opts) => set((st) => {
        // reset accumulator when starting a fresh game
        __simAccMs = 0;
        st.t = 0;
        st.day = 0;
        st.paused = false;
        st.speed = 1;
        st.msPerDay = 1200;
        st.pacing = 'normal';
        st.bubbleSpawnMs = 1400;
        st.dna = 0;
        st.countries = initialCountries();
        st.selectedCountryId = null;
        st.mode = mode;
        st.cureProgress = 0;
        st.difficulty = opts?.difficulty ?? 'normal';
        st.campaignId = opts?.storyId;
        // attach story by id if provided
        if (opts?.storyId) {
          st.story = (STORIES as Story[]).find(s => s.id === opts!.storyId);
          st.upgrades = st.story?.upgrades || upgradesFor(mode, st.campaignId);
          // patient zero flow
          st.awaitingPatientZero = (mode === 'architect' && opts.storyId === 'architect_patient_zero');
        } else {
          st.story = undefined;
          st.upgrades = upgradesFor(mode, st.campaignId);
          st.awaitingPatientZero = false;
        }
        // Controller initial policy/ops
        if (mode === 'controller') {
          const pol = opts?.initialPolicy;
          if (pol) {
            for (const c of Object.values(st.countries)) c.policy = pol;
          }
          if (typeof opts?.startingOps === 'number') {
            st.dna = Math.max(0, opts.startingOps);
          }
        }
        // genes affect start
        const genes = opts?.genes || [];
        if (genes.includes('atp_boost')) st.dna += mode === 'architect' ? 10 : 12;
        if (genes.includes('efficient_bureaucracy')) st.cureProgress += mode === 'controller' ? 0.5 : 0;
        if (genes.includes('urban_adaptation') && mode === 'architect') st.params.beta *= 1.05;
        st.peakI = 0;
        st.events = ['New game started'];
        st.travel = travelEdges();
        // Architect seeding options
        if (mode === 'architect') {
          const seedMode = opts?.seedMode || (opts?.storyId === 'architect_patient_zero' ? 'pick' : 'random');
          const amount = Math.max(500, Math.min(200_000, opts?.seedAmount ?? 15_000));
          if (seedMode === 'pick') {
            st.awaitingPatientZero = true;
            (st as any).patientZeroSeedAmount = amount;
            st.events.unshift('Select a borough to place Patient Zero');
          } else if (seedMode === 'random') {
            const ids = Object.keys(st.countries) as CountryID[];
            const choice = ids[Math.floor(Math.random() * ids.length)];
            const c = st.countries[choice];
            const bump = Math.min(Math.max(1, c.S - 1), amount);
            c.S -= bump; c.I += bump;
            st.selectedCountryId = choice;
            st.events.unshift(`Patient Zero emerged in ${c.name}`);
          } else if (seedMode === 'widespread') {
            for (const c of Object.values(st.countries)) {
              const bump = Math.min(Math.max(1, c.S - 1), Math.floor(amount * (c.pop / 1_000_000)));
              c.S -= bump; c.I += bump;
            }
            st.events.unshift('Multiple introduction events seeded across NYC');
          }
        }
      }),
      addDNA: (delta) => set((st) => { st.dna = Math.max(0, st.dna + delta); }),
      adjustCure: (deltaPercent) => set((st) => { st.cureProgress = Math.max(0, Math.min(100, st.cureProgress + deltaPercent)); }),
      setAwaitingPatientZero: (v) => set((st) => { st.awaitingPatientZero = v; }),
    },
  }))
);
