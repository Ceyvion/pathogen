import { create } from 'zustand';
import { playMilestone } from '../audio/sfx';
import { immer } from 'zustand/middleware/immer';
import type { Country, CountryID, TravelEdge, Upgrade, WorldState, GameMode, Story, GeneId, BubbleType, PathogenType, BankedPickup, Params, AiDirectorDecision, AiDirectorKnobs, AiDirectorState, HospResponseTier, NexusPhase, NexusActionId, EmergencyAction, GameEndStats } from './types';
import { STORIES } from '../story/stories';
import { maybeGenerateWorldEvent } from '../events/worldEvents';
import { computeDirection, computeVirusDirectorSnapshot } from '../sim/aiDirectorMetrics';
import { HOSP_RESPONSE_TIERS, nextHospResponseTier } from '../sim/hospResponse';
import { computeNexusPhase, maybeSelectNexusAction, aggregateNexusEffects, NEXUS_ACTION_CATALOG } from '../sim/nexusActions';
import { generateNexusEventText } from '../events/nexusEvents';
import { computeGameEndStats } from '../sim/scoring';
import { checkMilestones } from '../sim/milestones';

type Actions = {
  setSpeed: (s: 1 | 3 | 10) => void;
  togglePause: () => void;
  setPaused: (v: boolean) => void;
  setPacing: (p: 'slow'|'normal'|'fast') => void;
  setAutoCollectBubbles: (v: boolean) => void;
  bankPickup: (type: BubbleType, amount: number, ttlMs?: number) => void;
  collectBankedPickup: (id: number) => void;
  collectAllBankedPickups: () => void;
  purgeExpiredPickups: (nowMs: number) => void;
  collectPickup: (type: BubbleType, amount: number) => void;
  selectCountry: (id: CountryID | null) => void;
  tick: (dtMs: number) => void;
  purchaseUpgrade: (id: string) => void;
  saveGame: () => void;
  loadGame: () => void;
  addEvent: (text: string) => void;
  seedInfection: (target?: CountryID | 'all', amount?: number) => void;
  seedExposure: (target?: CountryID | 'all', amount?: number, label?: string) => void;
  setPolicy: (id: CountryID, policy: Country['policy']) => void;
  deployCordon: (id: CountryID) => void;
  startNewGame: (mode: GameMode, opts?: {
    difficulty?: 'casual'|'normal'|'brutal';
    genes?: GeneId[];
    storyId?: string;
    pathogenType?: PathogenType;
    aiDirectorEnabled?: boolean;
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
  setAiDirectorEnabled: (v: boolean) => void;
  requestAiDirectorDecision: () => Promise<void>;
  activateEmergencyAction: (actionId: string, targetBorough?: CountryID) => void;
};

export type GameStore = WorldState & { actions: Actions };

// Persistent accumulator for fixed-step integration. Without this, 1× (~16ms frames)
// rarely reaches the 50ms step threshold, making time appear stuck until 3×/10×.
let __simAccMs = 0;
let __pickupId = 1;

const PACING_PRESETS = {
  slow: { msPerDay: 12_000, bubbleSpawnMs: 15_000 },
  normal: { msPerDay: 8_000, bubbleSpawnMs: 11_000 },
  fast: { msPerDay: 5_000, bubbleSpawnMs: 7_000 },
} as const satisfies Record<'slow'|'normal'|'fast', { msPerDay: number; bubbleSpawnMs: number }>;

const BORO_IDS = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten_island'] as const satisfies readonly CountryID[];

const AI_DIRECTOR_CFG = {
  minInGameDays: 3,
  minRealTimeMs: 2 * 60_000,
  dailyBudget: 45,
  historyMaxDays: 14,
  perDecisionMulMin: 0.93,
  perDecisionMulMax: 1.07,
  knobMulMin: 0.75,
  knobMulMax: 1.25,
  dailyDecayTowardNeutral: 0.08,
  emergencyCallMinMs: 3 * 60_000, // min real-time between emergency LLM calls
} as const;

const AI_DEFAULT_KNOBS: AiDirectorKnobs = { variantTransMultMul: 1, sigmaMul: 1, muBaseMul: 1 };

// Late-game repeatable emergency actions (available after all upgrades purchased).
export const EMERGENCY_ACTIONS: EmergencyAction[] = [
  // Controller mode
  { id: 'em_staffing', name: 'Emergency Staffing', cost: 8, duration: 5, cooldown: 8, mode: 'controller', category: 'emergency', desc: '+20% hospital capacity for 5 days', effects: { hospCapacityMul: 1.20 } },
  { id: 'em_testing', name: 'Surge Testing', cost: 6, duration: 3, cooldown: 6, mode: 'controller', category: 'emergency', desc: '-8% transmission for 3 days', effects: { betaMul: 0.92 } },
  { id: 'em_research', name: 'Emergency Research Grant', cost: 12, duration: 5, cooldown: 10, mode: 'controller', category: 'emergency', desc: '+0.3% cure/day for 5 days', effects: { cureAddPerDay: 0.3 } },
  { id: 'em_lockdown', name: 'Lockdown Enforcement', cost: 10, duration: 3, cooldown: 7, mode: 'controller', category: 'emergency', desc: '-15% transmission for 3 days', effects: { betaMul: 0.85 } },
  { id: 'em_booster', name: 'Vaccine Booster Campaign', cost: 10, duration: 4, cooldown: 8, mode: 'controller', category: 'emergency', desc: '+0.2% cure/day, faster recovery for 4 days', effects: { cureAddPerDay: 0.2, gammaRecMul: 1.10 } },
  // Controller anti-NEXUS countermeasures
  { id: 'cn_firewall', name: 'Firewall', cost: 15, duration: -1, cooldown: 10, mode: 'controller', category: 'counter_nexus', desc: 'Cancel one active NEXUS effect', effects: {} },
  { id: 'cn_counter_evo', name: 'Counter-Evolution', cost: 20, duration: -1, cooldown: 12, mode: 'controller', category: 'counter_nexus', desc: 'Push NEXUS knobs 5% toward neutral', effects: {} },
  { id: 'cn_predict', name: 'Predictive Analysis', cost: 10, duration: -1, cooldown: 8, mode: 'controller', category: 'counter_nexus', desc: 'Reveal NEXUS cooldown state', effects: {} },
  // Architect mode
  { id: 'em_hypermut', name: 'Hypermutation Burst', cost: 8, duration: 3, cooldown: 6, mode: 'architect', category: 'emergency', desc: '+20% transmission for 3 days', effects: { betaMul: 1.20 } },
  { id: 'em_immune_evade', name: 'Immune Evasion Pulse', cost: 10, duration: 4, cooldown: 8, mode: 'architect', category: 'emergency', desc: '-15% recovery rate for 4 days', effects: { gammaRecMul: 0.85 } },
  { id: 'em_targeted', name: 'Targeted Outbreak', cost: 6, duration: -1, cooldown: 5, mode: 'architect', category: 'emergency', desc: 'Seed 5k exposed in chosen borough', effects: {} },
  { id: 'em_cure_disrupt', name: 'Cure Disruption', cost: 12, duration: -1, cooldown: 10, mode: 'architect', category: 'emergency', desc: 'Set back cure by 2%', effects: {} },
];

function localDateKey(nowMs: number) {
  const d = new Date(nowMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function clampAiKnob(v: number) {
  return clamp(v, AI_DIRECTOR_CFG.knobMulMin, AI_DIRECTOR_CFG.knobMulMax);
}

function decayTowardOne(v: number, frac: number) {
  return v + (1 - v) * frac;
}

function fmtPctDelta(mul: number) {
  const pct = Math.round((mul - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function createAiDirectorState(nowMs: number, enabled: boolean): AiDirectorState {
  return {
    enabled,
    pending: false,
    error: null,
    lastEvalDay: null,
    lastRequestAtMs: null,
    dailyUsage: { dateKey: localDateKey(nowMs), count: 0 },
    history: [],
    knobs: { ...AI_DEFAULT_KNOBS },
    mood: 'calm',
    moodNote: '',
    strategicFocus: null,
    playerThreatLevel: 0,
    totalDecisions: 0,
    lastSurpriseDay: 0,
    // NEXUS action engine
    phase: 'dormant',
    activeEffects: [],
    lastActionDay: 0,
    actionCooldowns: {},
    disabledUpgrades: [],
    nextEffectId: 1,
    // Enhanced LLM fields
    taunt: '',
    internalMonologue: '',
    lastEmergencyCallMs: null,
    cureThresholdsCrossed: [],
  };
}

function normalizeAiDecision(raw: unknown, mode: GameMode): AiDirectorDecision | null {
  const r = raw as any;
  if (!r || r.version !== 1) return null;
  const note = typeof r.note === 'string' ? r.note.slice(0, 120) : '';
  const intent: AiDirectorDecision['intent'] =
    r.intent === 'increase' || r.intent === 'decrease' || r.intent === 'hold' ? r.intent : 'hold';

  const validMoods = ['calm', 'scheming', 'aggressive', 'desperate', 'triumphant'] as const;
  const validFocuses = ['transmissibility', 'lethality', 'stealth', 'adaptation'] as const;
  const mood = validMoods.includes(r.mood) ? r.mood : undefined;
  const moodNote = typeof r.moodNote === 'string' ? r.moodNote.slice(0, 80) : undefined;
  const strategicFocus = validFocuses.includes(r.strategicFocus) ? r.strategicFocus : undefined;

  const knobsIn = (r.knobs && typeof r.knobs === 'object') ? r.knobs : {};
  const knobs: Partial<AiDirectorKnobs> = {};

  const readMul = (k: keyof AiDirectorKnobs) => {
    const v = (knobsIn as any)[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    let mul = clamp(v, AI_DIRECTOR_CFG.perDecisionMulMin, AI_DIRECTOR_CFG.perDecisionMulMax);
    if (mode === 'controller' && k === 'muBaseMul') mul = Math.min(1, mul);
    return mul;
  };

  const vMul = readMul('variantTransMultMul');
  const sMul = readMul('sigmaMul');
  const mMul = readMul('muBaseMul');
  if (typeof vMul === 'number') knobs.variantTransMultMul = vMul;
  if (typeof sMul === 'number') knobs.sigmaMul = sMul;
  if (typeof mMul === 'number') knobs.muBaseMul = mMul;

  // Enhanced NEXUS fields
  const validActions: NexusActionId[] = [
    'superspreader_event', 'cross_borough_seeding', 'mutation_surge',
    'virulence_spike', 'hospital_strain', 'treatment_resistance',
    'silent_spread', 'detection_evasion',
    'variant_emergence', 'coordinated_surge', 'cure_sabotage', 'infrastructure_attack',
  ];
  const suggestedActions = Array.isArray(r.suggestedActions)
    ? (r.suggestedActions as string[]).filter(a => validActions.includes(a as NexusActionId)).slice(0, 2) as NexusActionId[]
    : undefined;
  const taunt = typeof r.taunt === 'string' ? r.taunt.slice(0, 200) : undefined;
  const internalMonologue = typeof r.internalMonologue === 'string' ? r.internalMonologue.slice(0, 150) : undefined;

  return { version: 1, note, intent, knobs, mood, moodNote, strategicFocus, suggestedActions, taunt, internalMonologue };
}

function clampSeedAmount(n: unknown, fallback: number) {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.max(300, Math.min(60_000, Math.floor(v)));
}

function clampPct(v: number) {
  return Math.max(0, Math.min(100, v));
}

function applyPickupReward(st: { mode: GameMode; dna: number; cureProgress: number }, type: BubbleType, amount: number) {
  if (type === 'cure') {
    const sign = st.mode === 'controller' ? 1 : -1;
    st.cureProgress = clampPct(st.cureProgress + sign * amount);
    return;
  }
  st.dna = Math.max(0, st.dna + amount);
}

function seedExposureInPlace(
  st: { countries: Record<CountryID, Country>; events: string[] },
  target: CountryID | 'all',
  amount: number
) {
  const apply = (c: Country, bump: number) => {
    const space = Math.max(0, c.S - 1);
    const delta = Math.min(space, bump);
    c.S -= delta;
    c.E += delta;
  };

  if (target === 'all') {
    const ids = Object.keys(st.countries) as CountryID[];
    const per = Math.max(1, Math.floor(amount / Math.max(1, ids.length)));
    for (const id of ids) apply(st.countries[id], per);
    st.events.unshift('Widespread exposure seeded');
    return;
  }

  const c = st.countries[target];
  if (!c) return;
  apply(c, amount);
  st.events.unshift(`Exposure seeded in ${c.name}`);
}

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

function baseParams(): Params {
  return {
    beta: 0.22,
    sigma: 1 / 5.5,
    gammaRec: 1 / 9,
    muBase: 0.00035,
    seasonalityAmp: 0.15,
    seasonalityPhase: 15,
    hospRate: 0.03,
    dischargeRate: 0.12,
    hospCapacityPerK: 4.0,
    mobilityScale: 1,
    importationPerDay: 1,
    variantTransMult: 1,
    symFrac: 0.65,
    symContactMul: 0.7,
    severityMobilityFactor: 0.5,
    // early-game pacing: short grace and gradual ramp
    startRampDelayDays: 3,
    startRampDurationDays: 18,
    earlyPointBoostDays: 10,
    earlyPointBoostMul: 2.0,
  };
}

function paramsForType(type: PathogenType): Params {
  const p = baseParams();
  if (type === 'virus') {
    // Baseline: quick drift, moderate severity.
    return p;
  }
  if (type === 'bacteria') {
    // Slower transmission, longer infection, harder cure.
    p.beta *= 0.82;
    p.sigma *= 0.9;
    p.gammaRec *= 0.75;
    p.muBase *= 0.9;
    p.importationPerDay *= 0.7;
    p.startRampDelayDays = 4;
    p.startRampDurationDays = 24;
    return p;
  }
  if (type === 'fungus') {
    // Borders/chokepoints matter; fewer random sparks but bursts.
    p.beta *= 0.65;
    p.sigma *= 0.8;
    p.gammaRec *= 0.85;
    p.importationPerDay = 0;
    p.mobilityScale *= 0.9;
    p.symFrac = Math.min(0.8, p.symFrac * 0.8);
    p.startRampDelayDays = 3;
    p.startRampDurationDays = 15;
    return p;
  }
  // bioweapon
  p.beta *= 0.95;
  p.sigma *= 1.15;
  p.gammaRec *= 0.9;
  p.muBase *= 2.0;
  p.hospRate *= 1.15;
  p.importationPerDay *= 0.5;
  p.startRampDelayDays = 2;
  p.startRampDurationDays = 12;
  return p;
}

const baseUpgradesArchitect = (): Record<string, Upgrade> => ({
  tx1: { id: 'tx1', name: 'Aerosol Stability', branch: 'transmission', cost: 5, desc: '+10% transmission', effects: { betaMul: 1.10 } },
  tx2: { id: 'tx2', name: 'Surface Persistence', branch: 'transmission', cost: 16, desc: '+12% transmission', effects: { betaMul: 1.12 }, prereqs: ['tx1'] },
  tx3: { id: 'tx3', name: 'Shorter Incubation', branch: 'transmission', cost: 18, desc: '+10% incubation rate', effects: { sigmaMul: 1.10 }, prereqs: ['tx1'] },
  tx4: { id: 'tx4', name: 'Subway Aerosolization', branch: 'transmission', cost: 22, desc: 'Pathogen survives 6+ hours on stainless steel handrails. The morning commute becomes a vector.', effects: { betaMul: 1.14 }, prereqs: ['tx2'] },
  tx5: { id: 'tx5', name: 'Fomite Persistence', branch: 'transmission', cost: 28, desc: 'Doorknobs, elevator buttons, turnstiles -- every surface holds the pathogen for 48 hours.', effects: { betaMul: 1.08, sigmaMul: 1.05 }, prereqs: ['tx4'] },
  tx6: { id: 'tx6', name: 'Waterborne Transmission', branch: 'transmission', cost: 32, desc: 'Trace amounts detected in municipal water supply. Boil advisories issued too late.', effects: { betaMul: 1.10, importationMul: 1.15 }, prereqs: ['tx2'] },
  tx7: { id: 'tx7', name: 'Rodent Vector', branch: 'transmission', cost: 18, desc: "NYC's 2 million rats become unwitting carriers. Subterranean spread bypasses surface quarantines.", effects: { betaMul: 1.06, travelReductionMul: 1.08 }, prereqs: ['tx1'] },
  tx8: { id: 'tx8', name: 'Airborne Drift', branch: 'transmission', cost: 38, desc: 'Viability at distances exceeding 6 meters. Social distancing guidelines become obsolete overnight.', effects: { betaMul: 1.16 }, prereqs: ['tx5'] },
  tx9: { id: 'tx9', name: 'Vertical Transmission', branch: 'transmission', cost: 24, desc: 'Mother-to-child transmission confirmed. Neonatal wards enter crisis protocols.', effects: { betaMul: 1.05, exposedDurationMul: 0.9 }, prereqs: ['tx3'] },
  tx10: { id: 'tx10', name: 'Food Supply Chain', branch: 'transmission', cost: 30, desc: 'Contaminated shipments from Hunts Point Market distribute pathogen to every borough simultaneously.', effects: { importationMul: 1.25, betaMul: 1.06 }, prereqs: ['tx6'] },
  tx11: { id: 'tx11', name: 'Environmental Reservoir', branch: 'transmission', cost: 42, desc: 'The pathogen persists in soil, standing water, and HVAC systems. Reinfection becomes possible.', effects: { betaMul: 1.08, reinfectionRate: 0.002 }, prereqs: ['tx8'] },
  tx12: { id: 'tx12', name: 'Superspreader Events', branch: 'transmission', cost: 35, desc: 'Mass gatherings amplify spread exponentially. One concert. One subway car. One funeral.', effects: { betaMul: 1.20, dnaRateAdd: 0.08 }, prereqs: ['tx4'] },
  tx13: { id: 'tx13', name: 'Pandemic Adaptation', branch: 'transmission', cost: 50, desc: 'Total environmental integration. The pathogen is everywhere, in everything, undeniable.', effects: { betaMul: 1.12, policyResistMul: 1.15 }, prereqs: ['tx11', 'tx12'] },

  sym1: { id: 'sym1', name: 'Stealthy Symptoms', branch: 'symptoms', cost: 7, desc: 'Undercut policy (×1.2 resist)', effects: { policyResistMul: 1.2 } },
  sym2: { id: 'sym2', name: 'Aggressive Shedding', branch: 'symptoms', cost: 20, desc: '+8% transmission, +0.1 DNA/day', effects: { betaMul: 1.08, dnaRateAdd: 0.1 }, prereqs: ['sym1'] },
  sym3: { id: 'sym3', name: 'Subclinical Fatigue', branch: 'symptoms', cost: 16, desc: 'Infected feel tired but functional. They go to work. They ride the subway. They spread it.', effects: { policyResistMul: 1.15, asymptomaticSpreadMul: 1.10 }, prereqs: ['sym1'] },
  sym4: { id: 'sym4', name: 'Delayed Onset', branch: 'symptoms', cost: 22, desc: 'Incubation extends invisibly. By the time symptoms appear, everyone nearby is already exposed.', effects: { exposedDurationMul: 0.8, policyResistMul: 1.1 }, prereqs: ['sym3'] },
  sym5: { id: 'sym5', name: 'Neurological Fog', branch: 'symptoms', cost: 28, desc: 'Cognitive impairment makes patients forget protocols, miss doses, wander. Compliance collapses.', effects: { betaMul: 1.06, policyResistMul: 1.2 }, prereqs: ['sym2'] },
  sym6: { id: 'sym6', name: 'Hemorrhagic Presentation', branch: 'symptoms', cost: 34, desc: 'Visible bleeding triggers panic. Emergency rooms overflow. The fear spreads faster than the pathogen.', effects: { muMul: 1.3, dnaRateAdd: 0.15 }, prereqs: ['sym2'] },
  sym7: { id: 'sym7', name: 'Organ Tropism', branch: 'symptoms', cost: 40, desc: 'Multi-organ involvement. Patients need ventilators, dialysis, and interventions simultaneously.', effects: { hospRateMul: 1.25, muMul: 1.15 }, prereqs: ['sym6'] },
  sym8: { id: 'sym8', name: 'Immunosuppressive Cascade', branch: 'symptoms', cost: 36, desc: 'The immune system turns against itself. Recovery stalls. Secondary infections follow.', effects: { gammaRecMul: 0.85, cureRateMul: 0.9 }, prereqs: ['sym5'] },
  sym9: { id: 'sym9', name: 'Asymptomatic Shedding Peak', branch: 'symptoms', cost: 26, desc: 'Maximum viral load occurs before symptom onset. Testing cannot keep up.', effects: { betaMul: 1.12, asymptomaticSpreadMul: 1.2 }, prereqs: ['sym3'] },
  sym10: { id: 'sym10', name: 'Chronic Sequelae', branch: 'symptoms', cost: 32, desc: "Long-term effects. Recovered patients relapse. The 'recovered' category becomes unreliable.", effects: { gammaRecMul: 0.9, reinfectionRate: 0.001 }, prereqs: ['sym8'] },
  sym11: { id: 'sym11', name: 'Pain Suppression', branch: 'symptoms', cost: 20, desc: "Fewer show symptoms. More move freely. The pathogen hides behind the body's silence.", effects: { symFracMul: 0.85, betaMul: 1.05 }, prereqs: ['sym1'] },
  sym12: { id: 'sym12', name: 'Cytokine Storm Trigger', branch: 'symptoms', cost: 48, desc: 'Fatal immune overreaction in 15% of cases. Hospitals cannot intervene fast enough.', effects: { muMul: 1.4, hospRateMul: 1.3, dnaRateAdd: 0.2 }, prereqs: ['sym7', 'sym8'] },

  ab1: { id: 'ab1', name: 'Immune Escape v1', branch: 'abilities', cost: 8, desc: '-5% recovery speed', effects: { gammaRecMul: 0.95 } },
  ab2: { id: 'ab2', name: 'Policy Evasion', branch: 'abilities', cost: 22, desc: 'Undercut policy (×1.5 resist)', effects: { policyResistMul: 1.5 }, prereqs: ['ab1'] },
  ab3: { id: 'ab3', name: 'Cold Resistant', branch: 'abilities', cost: 7, desc: '+5% transmission (cold season)', effects: { betaMul: 1.05 } },
  ab4: { id: 'ab4', name: 'Genetic Reshuffle', branch: 'abilities', cost: 24, desc: 'Slows cure progress (−20%)', effects: { cureRateMul: 0.8 } },
  ab5: { id: 'ab5', name: 'Drug Resistance', branch: 'abilities', cost: 26, desc: 'Standard antivirals fail. Pharmaceutical companies scramble. The clock resets on treatment.', effects: { gammaRecMul: 0.88, cureRateMul: 0.85 }, prereqs: ['ab1'] },
  ab6: { id: 'ab6', name: 'Thermal Tolerance', branch: 'abilities', cost: 18, desc: 'Survives body temperature extremes. Fever is no longer a defense mechanism.', effects: { betaMul: 1.07 }, prereqs: ['ab3'] },
  ab7: { id: 'ab7', name: 'Immune Memory Evasion', branch: 'abilities', cost: 34, desc: 'Antigenic shift defeats prior immunity. Recovered patients are susceptible again.', effects: { gammaRecMul: 0.9, reinfectionRate: 0.003 }, prereqs: ['ab2'] },
  ab8: { id: 'ab8', name: 'Detection Evasion', branch: 'abilities', cost: 28, desc: 'False negatives in standard PCR tests. The pathogen hides from the diagnostic toolkit.', effects: { detectionDelayAdd: 3 }, prereqs: ['ab2'] },
  ab9: { id: 'ab9', name: 'Policy Fatigue Exploitation', branch: 'abilities', cost: 30, desc: 'Public compliance erodes. Lockdown violations spike. The pathogen waits for human nature.', effects: { policyResistMul: 1.35 }, prereqs: ['ab2'] },
  ab10: { id: 'ab10', name: 'Environmental Hardening', branch: 'abilities', cost: 22, desc: 'UV resistance, chlorine tolerance. Decontamination protocols become inadequate.', effects: { betaMul: 1.04, importationMul: 1.1 }, prereqs: ['ab3'] },
  ab11: { id: 'ab11', name: 'Death Dividend', branch: 'abilities', cost: 36, desc: 'Each fatality generates research data for the pathogen. A grim feedback loop.', effects: { dnaPerDeathAdd: 0.005, muMul: 1.1 }, prereqs: ['ab4'] },
  ab12: { id: 'ab12', name: 'Cross-Species Reservoir', branch: 'abilities', cost: 44, desc: 'Animal reservoirs in Central Park, Prospect Park, the Bronx Zoo. Eradication becomes impossible.', effects: { reinfectionRate: 0.004, importationMul: 1.2 }, prereqs: ['ab7'] },
  ab13: { id: 'ab13', name: 'Diagnostic Sabotage', branch: 'abilities', cost: 38, desc: 'Molecular mimicry confuses antibody tests. Every negative result is suspect.', effects: { cureRateMul: 0.75, detectionDelayAdd: 2 }, prereqs: ['ab8'] },
  ab14: { id: 'ab14', name: 'Total Immune Evasion', branch: 'abilities', cost: 55, desc: 'The pathogen is invisible to the immune system. Natural recovery approaches zero.', effects: { gammaRecMul: 0.8, cureRateMul: 0.7, policyResistMul: 1.2 }, prereqs: ['ab12', 'ab13'] },
});

const baseUpgradesController = (): Record<string, Upgrade> => ({
  ops1: { id: 'ops1', name: 'Mask Mandate', branch: 'transmission', cost: 5, desc: 'Reduce contacts (−8% β)', effects: { betaMul: 0.92 } },
  ops2: { id: 'ops2', name: 'Testing Ramp-up', branch: 'abilities', cost: 6, desc: 'Faster recovery via isolation (+5% γ) and research (+0.05%/day)', effects: { gammaRecMul: 1.05, cureAddPerDay: 0.05 } },
  ops3: { id: 'ops3', name: 'Contact Tracing', branch: 'abilities', cost: 14, desc: 'Reduce effective contacts (−10% β) and research (+0.04%/day)', effects: { betaMul: 0.90, cureAddPerDay: 0.04 }, prereqs: ['ops2'] },
  ops4: { id: 'ops4', name: 'Border Screening', branch: 'transmission', cost: 8, desc: 'Lower importations (−50%)', effects: { importationMul: 0.5 } },
  ops5: { id: 'ops5', name: 'Public Campaigns', branch: 'symptoms', cost: 6, desc: 'Boost policy effectiveness (×1.25) and research (+0.03%/day)', effects: { policyResistMul: 1.25, cureAddPerDay: 0.03 } },
  ops6: { id: 'ops6', name: 'Vaccine R&D', branch: 'abilities', cost: 18, desc: 'Accelerate cure (+25%) and research (+0.25%/day)', effects: { cureRateMul: 1.25, cureAddPerDay: 0.25 } },
  ops7: { id: 'ops7', name: 'Vaccine Manufacturing', branch: 'abilities', cost: 22, desc: 'Accelerate cure (+35%) and research (+0.35%/day)', effects: { cureRateMul: 1.35, cureAddPerDay: 0.35 }, prereqs: ['ops6'] },

  // Transmission branch (new)
  ops_tx1: { id: 'ops_tx1', name: 'Subway Sanitation Protocol', branch: 'transmission', cost: 14, desc: 'Nightly deep-clean of all MTA rolling stock. UV lamps in stations. The commute gets safer.', effects: { betaMul: 0.94 }, prereqs: ['ops1'] },
  ops_tx2: { id: 'ops_tx2', name: 'Ventilation Overhaul', branch: 'transmission', cost: 20, desc: 'MERV-13 filters mandatory in public buildings. Air quality sensors in every school.', effects: { betaMul: 0.92 }, prereqs: ['ops_tx1'] },
  ops_tx3: { id: 'ops_tx3', name: 'Water Treatment Enhancement', branch: 'transmission', cost: 18, desc: 'Enhanced chlorination and UV treatment at all municipal water facilities.', effects: { betaMul: 0.96, importationMul: 0.85 }, prereqs: ['ops4'] },
  ops_tx4: { id: 'ops_tx4', name: 'Rodent Control Blitz', branch: 'transmission', cost: 16, desc: 'Emergency pest control across all five boroughs. The rats retreat, the vectors diminish.', effects: { betaMul: 0.97, travelReductionMul: 0.95 }, prereqs: ['ops1'] },
  ops_tx5: { id: 'ops_tx5', name: 'Social Distance Enforcement', branch: 'transmission', cost: 24, desc: 'Capacity limits enforced with fines. Compliance improves but resentment builds.', effects: { betaMul: 0.88, policyResistMul: 1.15 }, prereqs: ['ops_tx2'] },
  ops_tx6: { id: 'ops_tx6', name: 'Travel Corridor Restrictions', branch: 'transmission', cost: 22, desc: 'Bridge and tunnel checkpoints. Inter-borough movement drops sharply.', effects: { importationMul: 0.6, travelReductionMul: 0.85 }, prereqs: ['ops4'] },
  ops_tx7: { id: 'ops_tx7', name: 'Air Filtration Mandate', branch: 'transmission', cost: 30, desc: 'HEPA requirements for all commercial spaces. Landlords protest. Tenants breathe easier.', effects: { betaMul: 0.9 }, prereqs: ['ops_tx2'] },
  ops_tx8: { id: 'ops_tx8', name: 'Gathering Ban', branch: 'transmission', cost: 28, desc: 'Events over 10 people prohibited. Bars, theaters, stadiums go dark.', effects: { betaMul: 0.85, policyResistMul: 1.2 }, prereqs: ['ops_tx5'] },
  ops_tx9: { id: 'ops_tx9', name: 'Essential Workers Only', branch: 'transmission', cost: 36, desc: 'Non-essential businesses shuttered. Streets empty. The city holds its breath.', effects: { travelReductionMul: 0.7, betaMul: 0.88 }, prereqs: ['ops_tx6'] },
  ops_tx10: { id: 'ops_tx10', name: 'Total Shelter-in-Place', branch: 'transmission', cost: 48, desc: 'Mandatory home confinement. National Guard patrols. Transmission plummets, but at what cost?', effects: { betaMul: 0.75, travelReductionMul: 0.5, policyResistMul: 1.4 }, prereqs: ['ops_tx8', 'ops_tx9'] },

  // Symptoms branch (new)
  ops_sym1: { id: 'ops_sym1', name: 'Early Warning System', branch: 'symptoms', cost: 12, desc: 'Syndromic surveillance in ERs across all boroughs. Clusters flagged within hours.', effects: { detectionDelayAdd: -1, cureAddPerDay: 0.02 }, prereqs: ['ops5'] },
  ops_sym2: { id: 'ops_sym2', name: 'School Screening Program', branch: 'symptoms', cost: 16, desc: 'Daily temperature checks and symptom questionnaires. Children become sentinels.', effects: { betaMul: 0.96, cureAddPerDay: 0.02 }, prereqs: ['ops5'] },
  ops_sym3: { id: 'ops_sym3', name: 'Workplace Health Mandate', branch: 'symptoms', cost: 20, desc: 'Employers required to report cases. Sick leave mandated. Compliance generates intelligence.', effects: { betaMul: 0.94, opsPerDayAdd: 0.3 }, prereqs: ['ops_sym2'] },
  ops_sym4: { id: 'ops_sym4', name: 'Sewage Surveillance', branch: 'symptoms', cost: 22, desc: "Wastewater monitoring reveals outbreaks 5 days before clinical data. The sewers know first.", effects: { detectionDelayAdd: -2, cureAddPerDay: 0.04 }, prereqs: ['ops_sym1'] },
  ops_sym5: { id: 'ops_sym5', name: 'Public Information Campaign', branch: 'symptoms', cost: 14, desc: 'Multilingual PSAs on every subway screen, bus stop, and bodega window.', effects: { policyResistMul: 1.3, cureAddPerDay: 0.02 }, prereqs: ['ops5'] },
  ops_sym6: { id: 'ops_sym6', name: 'Mental Health Response', branch: 'symptoms', cost: 18, desc: 'Crisis counselors deployed. Compliance improves when fear is addressed, not just mandated.', effects: { policyResistMul: 1.2 }, prereqs: ['ops_sym5'] },
  ops_sym7: { id: 'ops_sym7', name: 'Rapid Home Test Distribution', branch: 'symptoms', cost: 26, desc: 'Free test kits at every pharmacy and community center. Isolation begins at home.', effects: { betaMul: 0.93, gammaRecMul: 1.05 }, prereqs: ['ops_sym4'] },
  ops_sym8: { id: 'ops_sym8', name: 'Long-Term Care Protocols', branch: 'symptoms', cost: 24, desc: 'Specialized treatment pathways for chronic cases. Fewer deaths, faster turnover.', effects: { mortalityHospMul: 0.85, dischargeMul: 1.08 }, prereqs: ['ops_sym3'] },
  ops_sym9: { id: 'ops_sym9', name: 'Community Trust Building', branch: 'symptoms', cost: 30, desc: 'Town halls, religious leader partnerships, local influencer outreach. Trust is the real vaccine.', effects: { policyResistMul: 1.35, betaMul: 0.96 }, prereqs: ['ops_sym6'] },
  ops_sym10: { id: 'ops_sym10', name: 'Pandemic Preparedness Doctrine', branch: 'symptoms', cost: 42, desc: 'Total institutional readiness. Every hospital, school, and workplace has a plan that works.', effects: { policyResistMul: 1.4, cureAddPerDay: 0.06, betaMul: 0.94 }, prereqs: ['ops_sym9', 'ops_sym7'] },

  // Abilities branch (new)
  ops_ab1: { id: 'ops_ab1', name: 'Hospital Surge Capacity', branch: 'abilities', cost: 16, desc: 'Beds in hallways, tents in parking lots. Capacity stretches. Quality bends but does not break.', effects: { hospCapacityMul: 1.2, dischargeMul: 1.05 }, prereqs: ['ops2'] },
  ops_ab2: { id: 'ops_ab2', name: 'Experimental Therapeutics', branch: 'abilities', cost: 22, desc: 'Compassionate use protocols. Untested drugs with promising signals. Risk vs. time.', effects: { gammaRecMul: 1.1, cureAddPerDay: 0.08 }, prereqs: ['ops6'] },
  ops_ab3: { id: 'ops_ab3', name: 'International Data Sharing', branch: 'abilities', cost: 18, desc: 'NYC links its genomic data to WHO networks. Global cooperation accelerates the cure.', effects: { cureAddPerDay: 0.1, cureRateMul: 1.1 }, prereqs: ['ops2'] },
  ops_ab4: { id: 'ops_ab4', name: 'Quarantine Optimization', branch: 'abilities', cost: 24, desc: 'Dedicated quarantine facilities with monitoring. Compliance improves without coercion.', effects: { quarantineEffMul: 1.3, betaMul: 0.95 }, prereqs: ['ops3'] },
  ops_ab5: { id: 'ops_ab5', name: 'Mobile Testing Fleet', branch: 'abilities', cost: 20, desc: 'Repurposed food trucks with PCR capability. They come to you. No appointments, no excuses.', effects: { gammaRecMul: 1.08, cureAddPerDay: 0.04 }, prereqs: ['ops3'] },
  ops_ab6: { id: 'ops_ab6', name: 'Vaccine Fast-Track', branch: 'abilities', cost: 32, desc: 'Emergency use authorization. Phase III trials compressed. The timeline shrinks to months.', effects: { cureRateMul: 1.4, cureAddPerDay: 0.3 }, prereqs: ['ops7'] },
  ops_ab7: { id: 'ops_ab7', name: 'Mass Vaccination Sites', branch: 'abilities', cost: 38, desc: 'Javits Center, Citi Field, Barclays -- every arena becomes a vaccination hub.', effects: { cureRateMul: 1.3, cureAddPerDay: 0.4 }, prereqs: ['ops_ab6'] },
  ops_ab8: { id: 'ops_ab8', name: 'Healthcare Worker Protection', branch: 'abilities', cost: 20, desc: 'N95s, face shields, hazard pay. Protect the protectors or the system collapses.', effects: { hospCapacityMul: 1.15, mortalityHospMul: 0.9 }, prereqs: ['ops_ab1'] },
  ops_ab9: { id: 'ops_ab9', name: 'Supply Chain Resilience', branch: 'abilities', cost: 26, desc: 'Strategic stockpiles of PPE, ventilators, and medications. Never caught empty-handed again.', effects: { hospCapacityMul: 1.1, importationMul: 0.8 }, prereqs: ['ops_ab4'] },
  ops_ab10: { id: 'ops_ab10', name: 'Operation Endgame', branch: 'abilities', cost: 55, desc: 'Total mobilization. Every resource, every agency, every citizen aligned toward eradication.', effects: { cureRateMul: 1.5, cureAddPerDay: 0.5, betaMul: 0.9 }, prereqs: ['ops_ab7', 'ops_ab9'] },
});

function typeSpecificUpgrades(mode: GameMode, pathogenType: PathogenType): Record<string, Upgrade> {
  if (mode === 'architect') {
    if (pathogenType === 'virus') {
      return {
        vx_stab1: {
          id: 'vx_stab1',
          name: 'Genome Stabilization',
          branch: 'abilities',
          cost: 12,
          desc: 'Manage mutation debt: fewer bad mutations, faster debt decay.',
          effects: { mutationChanceMul: 0.85, mutationDebtDecayAdd: 1 },
        },
        vx_stab2: {
          id: 'vx_stab2',
          name: 'Error Checking',
          branch: 'abilities',
          cost: 18,
          desc: 'Further stabilize: reduced mutation chance and faster debt burn-off.',
          effects: { mutationChanceMul: 0.8, mutationDebtDecayAdd: 2 },
          prereqs: ['vx_stab1'],
        },
      };
    }
    if (pathogenType === 'bacteria') {
      return {
        bac_plasmid: {
          id: 'bac_plasmid',
          name: 'Plasmid Exchange',
          branch: 'abilities',
          cost: 14,
          desc: 'Resistance builds faster (slower cure), but costs speed.',
          effects: { resistancePressureMul: 1.25, betaMul: 0.96 },
        },
        bac_biofilm: {
          id: 'bac_biofilm',
          name: 'Biofilm Formation',
          branch: 'symptoms',
          cost: 18,
          desc: 'Harder to clear; resistance persists.',
          effects: { gammaRecMul: 0.92, resistanceDecayAdd: -0.5 },
        },
      };
    }
    if (pathogenType === 'fungus') {
      return {
        fun_spore1: {
          id: 'fun_spore1',
          name: 'Spore Reservoir',
          branch: 'abilities',
          cost: 12,
          desc: 'More frequent spore bursts (weather still matters).',
          effects: { fungusBurstChanceMul: 1.35 },
        },
        fun_spore2: {
          id: 'fun_spore2',
          name: 'Long-Haul Spores',
          branch: 'abilities',
          cost: 18,
          desc: 'Spore bursts last longer.',
          effects: { fungusBurstDurationAdd: 1 },
          prereqs: ['fun_spore1'],
        },
      };
    }
    // bioweapon
    return {
      bio_stable: {
        id: 'bio_stable',
        name: 'Stabilized Payload',
        branch: 'abilities',
        cost: 16,
        desc: 'Slower volatility ramp: more predictable spread, fewer sudden spikes.',
        effects: { bioweaponVolatilityRateMul: 0.75, betaMul: 1.03 },
      },
    };
  }

  // controller
  if (pathogenType === 'virus') {
    return {
      cvx_seq: {
        id: 'cvx_seq',
        name: 'Genomic Surveillance',
        branch: 'abilities',
        cost: 12,
        desc: 'Reduces mutation churn; improves research slightly.',
        effects: { mutationChanceMul: 0.9, cureAddPerDay: 0.05 },
      },
    };
  }
  if (pathogenType === 'bacteria') {
    return {
      cbac_stew: {
        id: 'cbac_stew',
        name: 'Antibiotic Stewardship',
        branch: 'symptoms',
        cost: 10,
        desc: 'Resistance decays faster; slows resistance buildup.',
        effects: { resistanceDecayAdd: 1.5, resistancePressureMul: 0.85 },
      },
    };
  }
  if (pathogenType === 'fungus') {
    return {
      cfun_vent: {
        id: 'cfun_vent',
        name: 'Ventilation Blitz',
        branch: 'symptoms',
        cost: 12,
        desc: 'Cuts spore-burst frequency and duration (at a cost).',
        effects: { fungusBurstChanceMul: 0.75, fungusBurstDurationAdd: -1, cureAddPerDay: -0.02 },
      },
    };
  }
  // bioweapon
  return {
    cbio_cordon1: {
      id: 'cbio_cordon1',
      name: 'Cordon Logistics',
      branch: 'abilities',
      cost: 12,
      desc: 'Containment cordons last longer.',
      effects: { cordonDaysAdd: 2 },
    },
    cbio_cordon2: {
      id: 'cbio_cordon2',
      name: 'Rapid Cordon Teams',
      branch: 'abilities',
      cost: 16,
      desc: 'Containment cordons cost less to deploy.',
      effects: { cordonCostDelta: -1 },
      prereqs: ['cbio_cordon1'],
    },
  };
}

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
        cp_p1: { id: 'cp_p1', name: 'Public Campaigns', branch: 'symptoms', cost: 8, desc: 'Boost policy effectiveness (×1.2) + research (+0.04%/day)', effects: { policyResistMul: 1.2, cureAddPerDay: 0.04 } },
        cp_p2: { id: 'cp_p2', name: 'School Protocols', branch: 'symptoms', cost: 12, desc: 'Reduce contacts (−6% β), +0.03% research/day', effects: { betaMul: 0.94, cureAddPerDay: 0.03 }, prereqs: ['cp_p1'] },
        cp_p3: { id: 'cp_p3', name: 'Economic Support', branch: 'symptoms', cost: 12, desc: 'Improve compliance (×1.2 policy)', effects: { policyResistMul: 1.2 }, prereqs: ['cp_p1'] },

        // Research & Ops (abilities)
        cp_r1: { id: 'cp_r1', name: 'Testing Ramp-up', branch: 'abilities', cost: 10, desc: 'Faster recovery (+5% γ) + research (+0.06%/day)', effects: { gammaRecMul: 1.05, cureAddPerDay: 0.06 } },
        cp_r2: { id: 'cp_r2', name: 'Contact Tracing', branch: 'abilities', cost: 14, desc: 'Reduce contacts (−8% β) + research (+0.05%/day)', effects: { betaMul: 0.92, cureAddPerDay: 0.05 }, prereqs: ['cp_r1'] },
        cp_r3: { id: 'cp_r3', name: 'Hospital Surge', branch: 'abilities', cost: 16, desc: 'Boost discharge (+10%), lower mortality (−10%)', effects: { dischargeMul: 1.10, muMul: 0.90 } },
        cp_r4: { id: 'cp_r4', name: 'Vaccine R&D', branch: 'abilities', cost: 18, desc: 'Accelerate cure (+25%) +0.25%/day', effects: { cureRateMul: 1.25, cureAddPerDay: 0.25 }, prereqs: ['cp_r1'] },
        cp_r5: { id: 'cp_r5', name: 'Vaccine Manufacturing', branch: 'abilities', cost: 24, desc: 'Accelerate cure (+35%) +0.35%/day', effects: { cureRateMul: 1.35, cureAddPerDay: 0.35 }, prereqs: ['cp_r4'] },
      };
    }
    return baseUpgradesController();
  }
}

const MAX_EVENTS = 120;
const MAX_BANKED_PICKUPS = 8;

const initialAutoCollect = (() => {
  try { const v = localStorage.getItem('autoCollectBubblesV1'); return v === null ? true : v === '1'; } catch { return true; }
})();

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
    msPerDay: PACING_PRESETS.normal.msPerDay, // ~8.0s per in-game day at 1x
    pacing: 'normal' as 'slow'|'normal'|'fast',
    bubbleSpawnMs: PACING_PRESETS.normal.bubbleSpawnMs,
    autoCollectBubbles: initialAutoCollect,
    bankedPickups: [],
    dna: 0,
    countries: initialCountries(),
    selectedCountryId: null,
    mode: 'architect',
    pathogenType: 'virus',
    hospResponseTier: 0,
    aiDirector: createAiDirectorState(Date.now(), false),
    activeEmergencyEffects: [],
    emergencyCooldowns: {},
    gameResult: null,
    milestonesTriggered: [],
    pauseReason: null,
    autoPauseEnabled: true,
    emergencyUnlocked: false,
    mutationDebt: 0,
    antibioticResistance: 0,
    fungusBurstDaysLeft: 0,
    bioweaponVolatility: 0,
    cordonDaysLeft: {},
    cureProgress: 0,
    difficulty: 'normal',
    story: undefined,
    peakI: 0,
    // Advanced SEIR params (set per pathogen type on new game)
    params: paramsForType('virus'),
    upgrades: baseUpgradesArchitect(),
    events: [],
    travel: travelEdges(),
    actions: {
      setSpeed: (s) => set((st) => { st.speed = s; }),
      togglePause: () => set((st) => {
        // Do not allow unpausing while we're still waiting for the player to
        // choose a starting location/focus. This is the real "game start" gate.
        if (st.paused && st.awaitingPatientZero) return;
        st.paused = !st.paused;
        if (!st.paused) st.pauseReason = null;
        if (st.paused) __simAccMs = 0; // clear leftover fractional time when pausing
      }),
      setPaused: (v) => set((st) => {
        if (!v && st.awaitingPatientZero) return;
        st.paused = v;
        if (!v) st.pauseReason = null;
        if (st.paused) __simAccMs = 0;
      }),
      setPacing: (p) => set((st) => {
        st.pacing = p;
        const cfg = PACING_PRESETS[p] ?? PACING_PRESETS.normal;
        st.msPerDay = cfg.msPerDay;
        st.bubbleSpawnMs = cfg.bubbleSpawnMs;
      }),
      setAutoCollectBubbles: (v) => set((st) => {
        st.autoCollectBubbles = v;
        try { localStorage.setItem('autoCollectBubblesV1', v ? '1' : '0'); } catch {}
      }),
      setAiDirectorEnabled: (v) => set((st) => {
        if (!st.aiDirector) st.aiDirector = createAiDirectorState(Date.now(), false);
        // Only virus can be AI-directed in this iteration.
        const nextEnabled = Boolean(v && st.pathogenType === 'virus');
        st.aiDirector.enabled = nextEnabled;
        st.aiDirector.error = null;
        if (nextEnabled) {
          // Treat enabling as a "fresh" start: wait a few in-game days before
          // calling out to the model so we have a trend signal.
          st.aiDirector.lastEvalDay = Math.max(0, Math.floor(st.day));
          st.aiDirector.pending = false;
        } else {
          st.aiDirector.pending = false;
          st.aiDirector.knobs = { ...AI_DEFAULT_KNOBS };
        }
      }),
      requestAiDirectorDecision: async () => {
        const st0 = get();
        const ai0 = st0.aiDirector;
        if (!ai0?.enabled) return;
        if (st0.pathogenType !== 'virus') return;
        if (ai0.pending) return;

        const nowMs = Date.now();
        const dayIndex = Math.max(0, Math.floor(st0.day));

        // If we've never applied a decision, treat the "last eval" as day 0 so
        // we wait a minimum amount of simulated time before the first call.
        const lastEvalDay = ai0.lastEvalDay ?? 0;
        if (dayIndex - lastEvalDay < AI_DIRECTOR_CFG.minInGameDays) return;
        const lastReq = ai0.lastRequestAtMs ?? 0;
        if (nowMs - lastReq < AI_DIRECTOR_CFG.minRealTimeMs) return;

        const dk = localDateKey(nowMs);
        const used = ai0.dailyUsage?.dateKey === dk ? ai0.dailyUsage.count : 0;
        if (used >= AI_DIRECTOR_CFG.dailyBudget) return;

        const latest = ai0.history?.[ai0.history.length - 1] ?? computeVirusDirectorSnapshot(st0);
        const hist = (ai0.history?.length ? ai0.history : [latest]).slice(-AI_DIRECTOR_CFG.historyMaxDays);
        if (hist.length < 3) return;
        const direction = computeDirection(hist);
        const intensities7d = hist.slice(-7).map((h) => h.intensity);
        const purchasedUpgradeNames = Object.values(st0.upgrades)
          .filter(u => u.purchased)
          .map(u => u.name);

        const payload = {
          version: 1,
          mode: st0.mode,
          difficulty: st0.difficulty,
          pacing: st0.pacing,
          speed: st0.speed,
          dayIndex,
          snapshot: latest,
          trend: { direction, intensityNow: latest.intensity, intensities7d },
          knobs: ai0.knobs,
          params: {
            beta: st0.params.beta,
            sigma: st0.params.sigma,
            muBase: st0.params.muBase,
            variantTransMult: st0.params.variantTransMult,
	          },
	          // Player intelligence for NEXUS
	          playerUpgrades: purchasedUpgradeNames.slice(0, 50),
	          cureProgress: st0.cureProgress,
	          totalDecisions: ai0.totalDecisions ?? 0,
	          currentMood: ai0.mood ?? 'calm',
	          // Enhanced context for NEXUS action engine
	          currentPhase: ai0.phase ?? 'dormant',
	          activeNexusEffects: (ai0.activeEffects ?? []).map(e => e.label).slice(0, 20),
	        } as const;

        set((st) => {
          if (!st.aiDirector) st.aiDirector = createAiDirectorState(nowMs, true);
          st.aiDirector.pending = true;
          st.aiDirector.error = null;
          st.aiDirector.lastRequestAtMs = nowMs;
          if (st.aiDirector.dailyUsage.dateKey !== dk) st.aiDirector.dailyUsage = { dateKey: dk, count: 0 };
          st.aiDirector.dailyUsage.count += 1;
        });

        try {
          const res = await fetch('/api/ai-director', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const text = await res.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch { json = null; }
          if (!res.ok) {
            const msg = (json && typeof json.error === 'string') ? json.error : `HTTP ${res.status}`;
            const e = new Error(msg) as any;
            e.status = res.status;
            throw e;
          }
          if (!json) {
            const e = new Error('AI director returned non-JSON response') as any;
            e.status = 502;
            throw e;
          }

          const decision = normalizeAiDecision(json?.decision, st0.mode);
          if (!decision) throw new Error('Invalid AI director response');

          set((st) => {
            const ai = st.aiDirector;
            if (!ai) return;
            // If the player disabled the director while this request was in-flight,
            // just clear the pending state and do not apply changes.
            if (!ai.enabled || st.pathogenType !== 'virus') {
              ai.pending = false;
              return;
            }

            const deltas = decision.knobs || {};
            const parts: string[] = [];

            if (typeof deltas.variantTransMultMul === 'number') {
              ai.knobs.variantTransMultMul = clampAiKnob(ai.knobs.variantTransMultMul * deltas.variantTransMultMul);
              if (deltas.variantTransMultMul !== 1) parts.push(`${fmtPctDelta(deltas.variantTransMultMul)} transmissibility`);
            }
            if (typeof deltas.sigmaMul === 'number') {
              ai.knobs.sigmaMul = clampAiKnob(ai.knobs.sigmaMul * deltas.sigmaMul);
              if (deltas.sigmaMul !== 1) parts.push(`${fmtPctDelta(deltas.sigmaMul)} incubation speed`);
            }
            if (typeof deltas.muBaseMul === 'number') {
              ai.knobs.muBaseMul = clampAiKnob(ai.knobs.muBaseMul * deltas.muBaseMul);
              if (deltas.muBaseMul !== 1) parts.push(`${fmtPctDelta(deltas.muBaseMul)} lethality`);
            }

            ai.lastEvalDay = dayIndex;
            ai.pending = false;
            ai.error = null;
            ai.totalDecisions = (ai.totalDecisions ?? 0) + 1;

            // Apply NEXUS personality fields
            if (decision.mood) ai.mood = decision.mood;
            if (decision.moodNote) ai.moodNote = decision.moodNote;
	            ai.strategicFocus = decision.strategicFocus ?? ai.strategicFocus;
	            if (decision.taunt) ai.taunt = decision.taunt;
	            if (decision.internalMonologue) ai.internalMonologue = decision.internalMonologue;

		            // LLM-suggested actions: execute them via the same phase/severity rules as the local engine.
		            // Guardrail: avoid stacking a suggested action on the same in-game day as a local NEXUS action.
		            if (decision.suggestedActions?.length) {
		              const curDay = Math.floor(st.day);
		              if (ai.lastActionDay !== curDay) {
		              const phaseNow = ai.phase;
		              const SEV_ORDER = { minor: 0, major: 1, critical: 2 } as const;
		              const PHASE_MAX_SEV = {
		                dormant: 'minor',
		                probing: 'minor',
		                adapting: 'major',
		                aggressive: 'major',
		                endgame: 'critical',
		              } as const satisfies Record<NexusPhase, keyof typeof SEV_ORDER>;
		              const maxSev = SEV_ORDER[PHASE_MAX_SEV[phaseNow]];

		              if (phaseNow !== 'dormant') {
		                for (const actionId of decision.suggestedActions) {
	                  const def = NEXUS_ACTION_CATALOG.find(a => a.id === actionId);
	                  if (!def) continue;
	                  // Respect phase limits (no endgame-only actions early, no critical pre-endgame).
	                  if (def.endgameOnly && phaseNow !== 'endgame') continue;
	                  if (SEV_ORDER[def.severity] > maxSev) continue;
	                  // Respect cooldowns
	                  const cd = ai.actionCooldowns[actionId] ?? 0;
	                  if (curDay < cd) continue;
	                  const params = def.buildParams(st);
	                  const endDay = def.durationDays === -1 ? -1
	                    : def.durationDays === 0 ? curDay : curDay + def.durationDays;
                ai.activeEffects.push({
                  id: ai.nextEffectId++,
                  actionId,
                  startDay: curDay,
                  endDay,
                  params,
                  label: def.label,
                });
                ai.actionCooldowns[actionId] = curDay + def.cooldownDays;
                ai.lastActionDay = curDay;
                // Handle instant effects
                if (actionId === 'cross_borough_seeding') {
                  const boroughIds = Object.keys(st.countries);
                  const bId = boroughIds[params.targetBorough] ?? boroughIds[0];
                  const c = st.countries[bId];
                  if (c) { const seed = Math.min(c.S, params.seedExposed ?? 0); c.S -= seed; c.E += seed; }
                }
                if (actionId === 'treatment_resistance' || actionId === 'cure_sabotage') {
                  st.cureProgress = Math.max(0, st.cureProgress - (params.cureSetback ?? 0));
                }
                if (actionId === 'infrastructure_attack') {
                  const purchased = Object.values(st.upgrades).filter(u => u.purchased);
                  if (purchased.length > 0) {
                    const tgt = purchased[Math.floor(Math.random() * purchased.length)];
                    if (!ai.disabledUpgrades.includes(tgt.id)) ai.disabledUpgrades.push(tgt.id);
                  }
                }
		                const narrative = generateNexusEventText(actionId, st);
		                st.events.unshift(narrative);
		              }
		            }
		          }
		        }

		            // Compute threat level from game state
		            const totalPop = Object.values(st.countries).reduce((s, c) => s + c.pop, 0);
            const totalI = Object.values(st.countries).reduce((s, c) => s + c.I, 0);
            const cureRatio = st.cureProgress / 100;
            const infRatio = totalI / Math.max(1, totalPop);
            const latestSnap = ai.history?.[ai.history.length - 1];
            const intensity = latestSnap?.intensity ?? 0;
            ai.playerThreatLevel = st.mode === 'controller'
              ? Math.max(0, Math.min(1, 0.5 * cureRatio + 0.3 * (1 - infRatio) + 0.2 * (1 - intensity)))
              : Math.max(0, Math.min(1, 0.5 * infRatio + 0.3 * intensity + 0.2 * (1 - cureRatio)));

            const core = parts.length ? parts.join(', ') : 'hold';
            const moodTag = ai.mood !== 'calm' ? ` [${ai.mood}]` : '';
            const tauntStr = decision.taunt ? ` "${decision.taunt}"` : (decision.moodNote ? ` "${decision.moodNote}"` : (decision.note ? ` — ${decision.note}` : ''));
            st.events.unshift(`NEXUS${moodTag}: ${core}${tauntStr}`);
            while (st.events.length > MAX_EVENTS) st.events.pop();
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const status = (err && typeof err === 'object' && 'status' in (err as any) && typeof (err as any).status === 'number')
            ? (err as any).status as number
            : null;
          set((st) => {
            if (!st.aiDirector) st.aiDirector = createAiDirectorState(Date.now(), false);
            st.aiDirector.pending = false;
            if (status === 404) {
              st.aiDirector.enabled = false;
              st.aiDirector.knobs = { ...AI_DEFAULT_KNOBS };
              st.aiDirector.error = 'API endpoint /api/ai-director not found. Run `pnpm dev` (Node proxy) instead of a Vite-only server.';
              st.events.unshift(`AI director disabled: ${st.aiDirector.error}`);
            } else {
              st.aiDirector.error = msg;
              st.events.unshift(`AI director unavailable: ${msg}`);
            }
            while (st.events.length > MAX_EVENTS) st.events.pop();
          });
        }
      },
      activateEmergencyAction: (actionId, targetBorough) => set((st) => {
        const def = EMERGENCY_ACTIONS.find(a => a.id === actionId);
        if (!def) return;
        if (def.mode !== st.mode) return;
        if (st.dna < def.cost) return;
        const curDay = Math.floor(st.day);
        const cd = st.emergencyCooldowns[actionId] ?? 0;
        if (curDay < cd) return;

        // Preconditions that avoid charging the player for a no-op.
        let firewallIdx = -1;
        if (def.category === 'counter_nexus') {
          const ai = st.aiDirector;
          if (!ai?.enabled) {
            st.events.unshift('Counter-NEXUS systems offline: AI director not active');
            return;
          }
          if (actionId === 'cn_firewall') {
            // Find the most recent *active* effect (decisions can add effects mid-day).
            for (let i = ai.activeEffects.length - 1; i >= 0; i--) {
              const e = ai.activeEffects[i];
              if (e.endDay === -1 || curDay < e.endDay) { firewallIdx = i; break; }
            }
            if (firewallIdx < 0) {
              st.events.unshift('Firewall deployed: no active NEXUS effects detected');
              return;
            }
          }
        }
        if (actionId === 'em_targeted') {
          if (!targetBorough || !st.countries[targetBorough]) {
            st.events.unshift('Targeted outbreak requires selecting a borough');
            return;
          }
        }

        st.dna -= def.cost;
        st.emergencyCooldowns[actionId] = curDay + def.cooldown;

        // Handle instant/special actions
        if (def.category === 'counter_nexus') {
          const ai = st.aiDirector;
          if (actionId === 'cn_firewall' && ai && firewallIdx >= 0) {
            const removed = ai.activeEffects.splice(firewallIdx, 1)[0];
            if (removed) {
              // Also remove from disabled upgrades if it was infrastructure_attack
              if (removed.actionId === 'infrastructure_attack') {
                ai.disabledUpgrades = [];
              }
              st.events.unshift(`Firewall deployed: neutralized NEXUS ${removed.label}`);
            }
          } else if (actionId === 'cn_counter_evo' && ai) {
            // Push knobs 5% toward neutral
            ai.knobs.variantTransMultMul = clampAiKnob(decayTowardOne(ai.knobs.variantTransMultMul, 0.05));
            ai.knobs.sigmaMul = clampAiKnob(decayTowardOne(ai.knobs.sigmaMul, 0.05));
            ai.knobs.muBaseMul = clampAiKnob(decayTowardOne(ai.knobs.muBaseMul, 0.05));
            st.events.unshift('Counter-Evolution deployed: NEXUS parameters neutralized');
          } else if (actionId === 'cn_predict' && ai) {
            // Reveal cooldown state - the UI will read this from the store
            st.events.unshift('Predictive Analysis: NEXUS action cooldowns revealed');
          }
          return;
        }

        if (actionId === 'em_targeted' && targetBorough) {
          const c = st.countries[targetBorough];
          if (c) {
            const seed = Math.min(c.S, 5000);
            c.S -= seed;
            c.E += seed;
            st.events.unshift(`Targeted outbreak: 5k exposed seeded in ${c.name}`);
          }
          return;
        }
        if (actionId === 'em_cure_disrupt') {
          st.cureProgress = Math.max(0, st.cureProgress - 2);
          st.events.unshift('Cure disruption: research set back 2%');
          return;
        }

        // Timed effects
        if (def.duration > 0) {
          st.activeEmergencyEffects.push({
            actionId,
            startDay: curDay,
            endDay: curDay + def.duration,
          });
          st.events.unshift(`${def.name} activated for ${def.duration} days`);
        }
      }),
      bankPickup: (type, amount, ttlMs = 12_000) => set((st) => {
        if (st.bankedPickups.length >= MAX_BANKED_PICKUPS) {
          // drop oldest to preserve "grace buffer" feel without infinite stacking
          st.bankedPickups.shift();
        }
        const now = Date.now();
        const item: BankedPickup = { id: __pickupId++, type, amount, createdAtMs: now, expiresAtMs: now + ttlMs };
        st.bankedPickups.push(item);
      }),
      purgeExpiredPickups: (nowMs) => set((st) => {
        if (!st.bankedPickups.length) return;
        const next = st.bankedPickups.filter((p) => p.expiresAtMs > nowMs);
        if (next.length === st.bankedPickups.length) return;
        st.bankedPickups = next;
      }),
      collectBankedPickup: (id) => set((st) => {
        const idx = st.bankedPickups.findIndex((p) => p.id === id);
        if (idx < 0) return;
        const p = st.bankedPickups[idx];
        st.bankedPickups.splice(idx, 1);
        applyPickupReward(st, p.type, p.amount);
      }),
      collectAllBankedPickups: () => set((st) => {
        if (!st.bankedPickups.length) return;
        for (const p of st.bankedPickups) applyPickupReward(st, p.type, p.amount);
        st.bankedPickups = [];
      }),
      collectPickup: (type, amount) => set((st) => {
        applyPickupReward(st, type, amount);
      }),
      selectCountry: (id) => set((st) => { st.selectedCountryId = id; }),
      addEvent: (text) => set((st) => { st.events.unshift(text); if (st.events.length > MAX_EVENTS) st.events.pop(); }),
      tick: (dtMs) => {
        const st = get();
        if (st.paused || st.awaitingPatientZero) {
          __simAccMs = 0;
          return;
        }
        // fixed-step integration ~50ms
        const stepMs = 50;
        const dtClamped = Math.max(0, Math.min(dtMs, 200)); // avoid huge catch-up jumps
        __simAccMs += dtClamped * st.speed;
        let steps = 0;
        const maxStepsPerTick = 20; // 1s of sim max per frame at 50ms steps
        while (__simAccMs >= stepMs && steps < maxStepsPerTick) {
          set((state) => {
            state.t += stepMs;
            const dtDays = stepMs / Math.max(1, state.msPerDay);
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
            const baseDnaByDiff = state.difficulty === 'casual' ? 0.55 : state.difficulty === 'brutal' ? 0.30 : 0.40;
            const baseOpsByDiff = state.difficulty === 'casual' ? 3.2 : state.difficulty === 'brutal' ? 2.0 : 2.6;
            let dnaRate = state.mode === 'architect' ? baseDnaByDiff : baseOpsByDiff; // per day
            let cureRateMul = 1;
            let cureAddPerDay = 0; // additive % per day from ops
            let symFracMulUp = 1; // symptomatic fraction modifier
            let symContactMulUp2 = 1; // symptomatic contact multiplier modifier
            let severityMobilityMulUp = 1; // severity mobility scaling modifier
            let mutationDebtDecayAdd = 0;
            let mutationChanceMul = 1;
            let resistanceDecayAdd = 0;
            let resistancePressureMul = 1;
            let fungusBurstChanceMul = 1;
            let fungusBurstDurationAdd = 0;
            let bioweaponVolatilityRateMul = 1;
            let hospCapacityMul = 1;
            let travelReductionMul = 1;
            let detectionDelayAdd = 0;
            let mortalityHospMul = 1;
            let dnaPerDeathAdd = 0;
            let exposedDurationMul = 1;
            let opsPerDayAdd = 0;
            let quarantineEffMul = 1;
            let reinfectionRate = 0;
            let asymptomaticSpreadMul = 1;
            const disabledUps = state.aiDirector?.disabledUpgrades ?? [];
            for (const u of Object.values(state.upgrades)) {
              if (!u.purchased) continue;
              if (disabledUps.includes(u.id)) continue; // NEXUS infrastructure_attack
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
              if (e.cureRateMul) cureRateMul *= e.cureRateMul;
              if (e.cureAddPerDay) cureAddPerDay += e.cureAddPerDay;
              if (e.symFracMul) symFracMulUp *= e.symFracMul;
              if (e.symContactMul) symContactMulUp2 *= e.symContactMul;
              if (e.severityMobilityMul) severityMobilityMulUp *= e.severityMobilityMul;
              if (e.mutationDebtDecayAdd) mutationDebtDecayAdd += e.mutationDebtDecayAdd;
              if (e.mutationChanceMul) mutationChanceMul *= e.mutationChanceMul;
              if (e.resistanceDecayAdd) resistanceDecayAdd += e.resistanceDecayAdd;
              if (e.resistancePressureMul) resistancePressureMul *= e.resistancePressureMul;
              if (e.fungusBurstChanceMul) fungusBurstChanceMul *= e.fungusBurstChanceMul;
              if (e.fungusBurstDurationAdd) fungusBurstDurationAdd += e.fungusBurstDurationAdd;
              if (e.bioweaponVolatilityRateMul) bioweaponVolatilityRateMul *= e.bioweaponVolatilityRateMul;
              if (e.hospCapacityMul) hospCapacityMul *= e.hospCapacityMul;
              if (e.travelReductionMul) travelReductionMul *= e.travelReductionMul;
              if (e.detectionDelayAdd) detectionDelayAdd += e.detectionDelayAdd;
              if (e.mortalityHospMul) mortalityHospMul *= e.mortalityHospMul;
              if (e.dnaPerDeathAdd) dnaPerDeathAdd += e.dnaPerDeathAdd;
              if (e.exposedDurationMul) exposedDurationMul *= e.exposedDurationMul;
              if (e.opsPerDayAdd) opsPerDayAdd += e.opsPerDayAdd;
              if (e.quarantineEffMul) quarantineEffMul *= e.quarantineEffMul;
              if (e.reinfectionRate) reinfectionRate += e.reinfectionRate;
              if (e.asymptomaticSpreadMul) asymptomaticSpreadMul *= e.asymptomaticSpreadMul;
	            }
	            const p = state.params as any;
	            const dayIndex = Math.floor(state.day);
	            // seasonality
	            const season = 1 + p.seasonalityAmp * Math.cos(2 * Math.PI * ((state.day - p.seasonalityPhase) / 365));

	            // AI Evolution Director knobs (virus-only, subtle multipliers).
	            const ai = state.aiDirector;
	            const aiOn = Boolean(ai?.enabled && state.pathogenType === 'virus');
	            const aiVariantMul = aiOn ? ai!.knobs.variantTransMultMul : 1;
	            const aiSigmaMul = aiOn ? ai!.knobs.sigmaMul : 1;
	            const aiMuMul = aiOn ? ai!.knobs.muBaseMul : 1;

	            // NEXUS active effects (action engine modifiers on top of LLM knobs).
	            const nexusMods = aiOn && ai!.activeEffects.length > 0
	              ? aggregateNexusEffects(ai!.activeEffects, dayIndex, state)
	              : null;
	            if (nexusMods) {
	              betaMulUp *= nexusMods.betaMul;
	              muMulUp *= nexusMods.muMul;
	              hospCapacityMul *= nexusMods.hospCapacityMul;
	              symFracMulUp *= nexusMods.symFracMul;
	              detectionDelayAdd += nexusMods.detectionDelayAdd;
	            }

	            // Emergency action effects (player late-game repeatable abilities).
	            for (const ea of state.activeEmergencyEffects) {
	              const eDef = EMERGENCY_ACTIONS.find(a => a.id === ea.actionId);
	              if (!eDef || dayIndex >= ea.endDay) continue;
	              const ef = eDef.effects;
	              if (ef.betaMul) betaMulUp *= ef.betaMul;
	              if (ef.muMul) muMulUp *= ef.muMul;
	              if (ef.hospCapacityMul) hospCapacityMul *= ef.hospCapacityMul;
	              if (ef.dischargeMul) dischargeMulUp *= ef.dischargeMul;
	              if (ef.cureRateMul) cureRateMul *= ef.cureRateMul;
	              if (ef.cureAddPerDay) cureAddPerDay += ef.cureAddPerDay;
	              if (ef.gammaRecMul) gammaRecMulUp *= ef.gammaRecMul;
	            }

	            // Derived values that depend on (potentially modified) multipliers.
	            const hospResp = HOSP_RESPONSE_TIERS[state.hospResponseTier];
	            const capPerPersonBase = (p.hospCapacityPerK / 1000) * hospCapacityMul;
	            const symFracEff = Math.max(0, Math.min(1, p.symFrac * symFracMulUp));
	            const symContactEff = Math.max(0, Math.min(1, p.symContactMul * symContactMulUp2));
	            const sevMobEff = Math.max(0, p.severityMobilityFactor * severityMobilityMulUp);

            // Pathogen-type mechanics.
            const isFungusBurst = state.pathogenType === 'fungus' && state.fungusBurstDaysLeft > 0;
            const fungusBetaMul = isFungusBurst ? 1.35 : 1;
            const fungusMobilityMul = isFungusBurst ? 1.25 : 1;

            const bioVol = state.pathogenType === 'bioweapon' ? state.bioweaponVolatility : 0;
            const bioweaponMuMul = 1 + bioVol * 1.4;
            const bioweaponBetaMul = 1 - bioVol * 0.15;
            const bioweaponHospMul = 1 + bioVol * 0.5;

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
              const nexusBoroBeta = nexusMods?.boroughBetaMul[c.id] ?? 1;
              const betaEff = p.beta * betaMulUp * (p.variantTransMult * aiVariantMul) * season * contactMul * fungusBetaMul * bioweaponBetaMul * nexusBoroBeta * (1 + (asymptomaticSpreadMul - 1) * (1 - symFracEff));
              const sigma = (p.sigma * sigmaMulUp * aiSigmaMul) / Math.max(0.1, exposedDurationMul);
              const gammaRec = p.gammaRec * gammaRecMulUp;
              let mu = p.muBase * muMulUp * aiMuMul * bioweaponMuMul;

              // Hospital flows
              const symptomaticI = symFracEff * c.I;
              // Admissions should reflect current symptomatic burden; do not gate by early-game ramp
              const newHosp = (p.hospRate * hospRateMulUp * bioweaponHospMul) * symptomaticI * dtDays;
              const discharges = Math.min(c.H, (p.dischargeRate * dischargeMulUp * hospResp.dischargeMul) * c.H * dtDays);
              c.H += newHosp - discharges;
              c.R += discharges;

              // hospital strain effects
              const cap = capPerPersonBase * hospResp.capMul * N;
              const strain = cap > 0 ? Math.min(2, Math.max(0, c.H / cap)) : 0;
              if (strain > 1) {
                mu *= 1 + (strain - 1) * 2;
              }
              mu *= mortalityHospMul;

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

              // Reinfection: recovered -> susceptible
              const clampedReinfection = Math.min(0.01, reinfectionRate);
              if (clampedReinfection > 0) {
                const reinfected = Math.min(c.R, c.R * clampedReinfection * dtDays);
                c.R -= reinfected;
                c.S += reinfected;
              }

              // Death dividend: bonus DNA per death
              if (dnaPerDeathAdd > 0 && deaths > 0) {
                state.dna += dnaPerDeathAdd * deaths;
              }
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
              const cordonFrom = state.cordonDaysLeft?.[edge.from] || 0;
              const cordonTo = state.cordonDaysLeft?.[edge.to] || 0;
              const cordonMul = (cordonFrom > 0 || cordonTo > 0) ? Math.max(0.02, 0.15 / quarantineEffMul) : 1;
              const travelToday = edge.daily * p.mobilityScale * fungusMobilityMul * cordonMul * travelReductionMul * dtDays;
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
            state.dna += (dnaRate + opsPerDayAdd) * dtDays * earlyBoost;

            // cure progress model (0..100)
            const totalPop = Object.values(state.countries).reduce((s, c) => s + c.pop, 0);
            const totalI = Object.values(state.countries).reduce((s, c) => s + c.I, 0);

            // Architect: infections generate passive DNA (diminishing returns)
            if (state.mode === 'architect') {
              const infRatio = totalI / Math.max(1, totalPop);
              state.dna += 0.3 * Math.sqrt(Math.min(1, infRatio * 10)) * dtDays;
            }

            // Milestone bonuses: one-time point grants at key thresholds
            const msPrevDay = Math.floor(state.day - dtDays);
            const msCurrDay = Math.floor(state.day);
            const milestones = [
              { day: 5, bonus: 2, msg: 'Early research grant: +2 points' },
              { day: 15, bonus: 3, msg: 'Funding milestone: +3 points' },
              { day: 30, bonus: 4, msg: 'Research breakthrough: +4 points' },
              { day: 60, bonus: 5, msg: 'Major funding round: +5 points' },
            ];
            for (const m of milestones) {
              if (msPrevDay < m.day && msCurrDay >= m.day) {
                state.dna += m.bonus;
                state.events.unshift(m.msg);
              }
            }
            // Mode-aware: controller has baseline research independent of prevalence
            const prevalenceTerm = 6 * (totalI / Math.max(1, totalPop)); // up to ~6%/day at full infection
            const baseModeRaw = state.mode === 'controller' ? 0.25 : 0.02; // % per day base
            const baseMode = state.difficulty === 'casual' ? baseModeRaw * 1.2 : state.difficulty === 'brutal' ? baseModeRaw * 0.8 : baseModeRaw;
            let curePerDay = (baseMode + prevalenceTerm) * cureRateMul + cureAddPerDay;
            if (state.pathogenType === 'bacteria') {
              curePerDay *= (1 - 0.65 * Math.max(0, Math.min(1, state.antibioticResistance)));
            }
            let cureDelta = curePerDay * dtDays;
            state.cureProgress = Math.min(100, state.cureProgress + cureDelta);

            // track peak I
            if (totalI > state.peakI) state.peakI = totalI;

            // Update pathogen-type subsystem state (continuous).
            const prevalence = totalI / Math.max(1, totalPop);
            if (state.pathogenType === 'bacteria') {
              // Selection pressure rises with prevalence and cure progress; decays slowly over time.
              const pressureBase = 0.02 + prevalence * 0.35 + (state.cureProgress / 100) * 0.06;
              const pressure = pressureBase * Math.max(0, Math.min(2.5, resistancePressureMul));
              const decay = Math.max(0, 0.018 + resistanceDecayAdd * 0.01);
              state.antibioticResistance = Math.max(0, Math.min(1, state.antibioticResistance + dtDays * (pressure - decay)));
            }
            if (state.pathogenType === 'bioweapon') {
              // Volatility ramps with prevalence; higher volatility increases lethality and suppresses spread.
              const target = Math.max(0, Math.min(1, 0.1 + prevalence * 2.4));
              const rate = 0.6 * Math.max(0.2, Math.min(2.5, bioweaponVolatilityRateMul));
              state.bioweaponVolatility = Math.max(0, Math.min(1, state.bioweaponVolatility + (target - state.bioweaponVolatility) * dtDays * rate));
            }

            // daily event (integer day boundary)
            const prevDay = Math.floor(state.day - dtDays);
            const nowDay = Math.floor(state.day);
            if (nowDay !== prevDay) {
              // Citywide hospital response: escalate capacity/turnover when demand breaches capacity.
              // This keeps the "story curve" (peaks/valleys) from spiraling into nonsensical overload.
              {
                let maxLoadBase = 0;
                for (const c of Object.values(state.countries)) {
                  const N = Math.max(1, c.pop);
                  const capBase = capPerPersonBase * N;
                  const loadBase = capBase > 0 ? (c.H / capBase) : 0;
                  if (loadBase > maxLoadBase) maxLoadBase = loadBase;
                }
                const curTier = state.hospResponseTier;
                const curMul = HOSP_RESPONSE_TIERS[curTier].capMul;
                const maxLoadEff = curMul > 0 ? (maxLoadBase / curMul) : maxLoadBase;
                const nextTier = nextHospResponseTier(curTier, maxLoadBase, maxLoadEff);
                if (nextTier !== curTier) {
                  state.hospResponseTier = nextTier;
                  const label = HOSP_RESPONSE_TIERS[nextTier].label;
                  if (nextTier > curTier) {
                    state.events.unshift(`Hospital response escalates: ${label}`);
                    // Auto-pause on escalation for strategic planning
                    if (state.autoPauseEnabled && nextTier >= 2) {
                      state.paused = true;
                      state.pauseReason = `milestone:Hospital Crisis: ${label}|The healthcare system is escalating its response. Take a moment to review your strategy.`;
                    }
                  } else {
                    state.events.unshift(`Hospital pressure eases: ${label}`);
                  }

                  // If the AI director is enabled, apply a one-time small "emergency brake"
                  // on escalations so the virus doesn't feel oblivious to system collapse.
                  const ai = state.aiDirector;
                  if (ai?.enabled && state.pathogenType === 'virus' && nextTier > curTier) {
                    const isController = state.mode === 'controller';
                    const txBrake = nextTier >= 3 ? 0.97 : nextTier >= 2 ? 0.98 : 0.99;
                    const incBrake = nextTier >= 3 ? 0.98 : 0.99;
                    const muBrake = nextTier >= 3 ? 0.98 : 0.99;
                    ai.knobs.variantTransMultMul = clampAiKnob(ai.knobs.variantTransMultMul * txBrake);
                    ai.knobs.sigmaMul = clampAiKnob(ai.knobs.sigmaMul * incBrake);
                    if (isController) {
                      // Controller mode: never increase lethality; braking is always allowed.
                      ai.knobs.muBaseMul = clampAiKnob(ai.knobs.muBaseMul * muBrake);
                    } else {
                      ai.knobs.muBaseMul = clampAiKnob(ai.knobs.muBaseMul * muBrake);
                    }
                    state.events.unshift(`AI director override: ${fmtPctDelta(txBrake)} transmissibility (hospital overflow)`);
                  }
                }
              }

              // AI director: store a compact daily snapshot and decay drift toward neutral.
              if (state.pathogenType === 'virus') {
                if (!state.aiDirector) state.aiDirector = createAiDirectorState(Date.now(), false);
                const snap = computeVirusDirectorSnapshot(state);
                state.aiDirector.history.push(snap);
                while (state.aiDirector.history.length > AI_DIRECTOR_CFG.historyMaxDays) state.aiDirector.history.shift();
                const k = state.aiDirector.knobs;
                k.variantTransMultMul = clampAiKnob(decayTowardOne(k.variantTransMultMul, AI_DIRECTOR_CFG.dailyDecayTowardNeutral));
                k.sigmaMul = clampAiKnob(decayTowardOne(k.sigmaMul, AI_DIRECTOR_CFG.dailyDecayTowardNeutral));
                k.muBaseMul = clampAiKnob(decayTowardOne(k.muBaseMul, AI_DIRECTOR_CFG.dailyDecayTowardNeutral));

                // NEXUS action engine: phase-based escalation with discrete visible actions.
                const aiDir = state.aiDirector;
                if (aiDir.enabled) {
                  const curDay = Math.floor(state.day);
	                  // Update phase (monotonic escalation: never de-escalate on cure setbacks)
	                  const computedPhase = computeNexusPhase(curDay, state.cureProgress);
	                  const PHASE_ORDER: Record<NexusPhase, number> = {
	                    dormant: 0,
	                    probing: 1,
	                    adapting: 2,
	                    aggressive: 3,
	                    endgame: 4,
	                  };
	                  if (PHASE_ORDER[computedPhase] > PHASE_ORDER[aiDir.phase]) {
	                    const prevPhase = aiDir.phase;
	                    aiDir.phase = computedPhase;
	                    if (computedPhase !== 'dormant') {
	                      state.events.unshift(`NEXUS phase: ${computedPhase.toUpperCase()} — threat escalation detected`);
	                      // Auto-pause on significant NEXUS phase changes
	                      if (state.autoPauseEnabled && (computedPhase === 'aggressive' || computedPhase === 'endgame')) {
	                        state.paused = true;
	                        state.pauseReason = `milestone:NEXUS: ${computedPhase.toUpperCase()} Phase|The AI adversary has escalated. ${computedPhase === 'endgame' ? 'This is the final push. Every decision counts.' : 'Expect more frequent and severe actions.'}`;
	                      }
	                    }
	                  }

	                  // Expire finished active effects
	                  aiDir.activeEffects = aiDir.activeEffects.filter(e =>
	                    e.endDay === -1 || curDay < e.endDay
	                  );
                  // Expire disabled upgrades whose infrastructure_attack effect ended
                  aiDir.disabledUpgrades = aiDir.disabledUpgrades.filter(uid =>
                    aiDir.activeEffects.some(e => e.actionId === 'infrastructure_attack')
                  );

                  // Try to select and execute a NEXUS action
                  const result = maybeSelectNexusAction(state);
                  if (result) {
                    const { action, effect } = result;
                    aiDir.activeEffects.push(effect);
                    aiDir.lastActionDay = curDay;
                    aiDir.nextEffectId = (aiDir.nextEffectId ?? 1) + 1;
                    aiDir.actionCooldowns[action.id] = curDay + action.cooldownDays;
                    aiDir.lastSurpriseDay = curDay;

                    // Handle instant effects
                    if (action.id === 'cross_borough_seeding') {
                      const boroughIds = Object.keys(state.countries);
                      const bId = boroughIds[effect.params.targetBorough] ?? boroughIds[0];
                      const c = state.countries[bId];
                      if (c) {
                        const seed = Math.min(c.S, effect.params.seedExposed ?? 0);
                        c.S -= seed;
                        c.E += seed;
                      }
                    }
                    if (action.id === 'treatment_resistance' || action.id === 'cure_sabotage') {
                      const setback = effect.params.cureSetback ?? 0;
                      state.cureProgress = Math.max(0, state.cureProgress - setback);
                    }
                    if (action.id === 'infrastructure_attack') {
                      // Find a random purchased upgrade to disable
                      const purchased = Object.values(state.upgrades).filter(u => u.purchased);
                      if (purchased.length > 0) {
                        const target = purchased[Math.floor(Math.random() * purchased.length)];
                        if (!aiDir.disabledUpgrades.includes(target.id)) {
                          aiDir.disabledUpgrades.push(target.id);
                        }
                      }
                    }

                    // Generate narrative event
                    const narrative = generateNexusEventText(action.id, state);
                    state.events.unshift(narrative);
	                  }
	                }
	              }

	              // Expire emergency effects (independent of AI director / pathogen type).
	              state.activeEmergencyEffects = state.activeEmergencyEffects.filter(
	                e => nowDay < e.endDay
	              );

	              // Countdown transient systems once per day.
	              for (const k of Object.keys(state.cordonDaysLeft || {})) {
                const days = state.cordonDaysLeft[k as any] || 0;
                if (days <= 0) continue;
                const next = days - 1;
                if (next <= 0) {
                  delete state.cordonDaysLeft[k as any];
                  const name = state.countries[k as any]?.name || k;
                  state.events.unshift(`Containment cordon lifted in ${name}`);
                } else {
                  state.cordonDaysLeft[k as any] = next;
                }
              }

              if (state.pathogenType === 'fungus') {
                if (state.fungusBurstDaysLeft > 0) {
                  state.fungusBurstDaysLeft -= 1;
                  if (state.fungusBurstDaysLeft === 0) state.events.unshift('Spore burst subsides');
                } else {
                  // Weather-driven burst chance (seasonality influences it).
                  const wet = Math.max(0, season - 1); // 0..~0.15
                  const chance = (0.06 + wet * 0.8) * Math.max(0, Math.min(3, fungusBurstChanceMul));
                  if (Math.random() < chance) {
                    const dur = Math.max(1, Math.min(6, 2 + Math.round(fungusBurstDurationAdd)));
                    state.fungusBurstDaysLeft = dur;
                    state.events.unshift(`Spore burst: airborne spread surges for ${dur} days`);
                  }
                }
              }

              if (state.pathogenType === 'virus') {
                // Debt decays daily; big debt increases negative-mutation likelihood.
                state.mutationDebt = Math.max(0, state.mutationDebt - (1 + Math.max(0, mutationDebtDecayAdd)));
                const debt = state.mutationDebt;
                const chance = (0.09 + debt * 0.0025) * Math.max(0.6, Math.min(1.8, mutationChanceMul));
                if (Math.random() < chance) {
                  const badBias = Math.min(0.75, debt / 120);
                  const isBad = Math.random() < badBias;
                  if (isBad) {
                    // Backfire: more lethal or less transmissible.
                    if (Math.random() < 0.5) {
                      state.params.variantTransMult = Math.max(0.6, state.params.variantTransMult * 0.94);
                      state.events.unshift('Mutation backfire: reduced transmissibility');
                    } else {
                      state.params.muBase = Math.min(0.01, state.params.muBase * 1.12);
                      state.events.unshift('Mutation backfire: higher lethality');
                    }
                  } else {
                    if (Math.random() < 0.6) {
                      state.params.variantTransMult = Math.min(2.0, state.params.variantTransMult * 1.06);
                      state.events.unshift('Mutation: increased transmissibility');
                    } else {
                      state.params.sigma = Math.min(1, state.params.sigma * 1.05);
                      state.events.unshift('Mutation: shorter incubation');
                    }
                  }
                }
              }

              // Mode enforcement: in Architect mode, the world reacts automatically via policy shifts.
              if (state.mode === 'architect') {
                const rank: Record<Country['policy'], number> = { open: 0, advisory: 1, restrictions: 2, lockdown: 3 };
                const unrank: Country['policy'][] = ['open', 'advisory', 'restrictions', 'lockdown'];
                let policyHeadline: string | null = null;
                for (const c of Object.values(state.countries)) {
                  const iPer100k = (c.I / Math.max(1, c.pop)) * 100_000;
                  const cap = capPerPersonBase * HOSP_RESPONSE_TIERS[state.hospResponseTier].capMul * Math.max(1, c.pop);
                  const load = cap > 0 ? (c.H / cap) : 0;
                  // Detection delay shifts policy trigger thresholds (positive = harder to detect = architect benefit)
                  const ddMul = 1 + detectionDelayAdd * 0.12; // each day of delay raises thresholds ~12%
                  let desired: Country['policy'] = 'open';
                  if (load >= 1.15 || iPer100k >= 650 * ddMul) desired = 'lockdown';
                  else if (load >= 0.85 || iPer100k >= 260 * ddMul) desired = 'restrictions';
                  else if (iPer100k >= 90 * ddMul) desired = 'advisory';

                  const cur = c.policy;
                  if (rank[desired] > rank[cur]) {
                    c.policy = desired;
                    if (!policyHeadline && (desired === 'lockdown' || c.id === state.selectedCountryId)) {
                      policyHeadline = `Policy tightened in ${c.name}: ${cur} -> ${desired}`;
                    }
                  } else if (rank[desired] < rank[cur]) {
                    // De-escalate slowly only when things are genuinely calm.
                    if (iPer100k < 25 && load < 0.35) {
                      const next = unrank[Math.max(0, rank[cur] - 1)];
                      c.policy = next;
                      if (!policyHeadline && c.id === state.selectedCountryId) {
                        policyHeadline = `Policy eased in ${c.name}: ${cur} -> ${next}`;
                      }
                    }
                  }
                }
                if (policyHeadline) state.events.unshift(policyHeadline);
              }

              const I = Object.values(state.countries).reduce((s, c) => s + c.I, 0);
              const per100k = (I / Math.max(1, totalPop)) * 100_000;
              state.events.unshift(`Day ${nowDay}: I=${I.toFixed(0)} (${per100k.toFixed(1)}/100k) | Cure ${state.cureProgress.toFixed(1)}%`);

              // World-flavor ticker line (reactive, non-repeating via shuffle-bag).
              const worldLine = maybeGenerateWorldEvent(state);
              if (worldLine) state.events.unshift(worldLine);

              try { playMilestone('day'); } catch {}
              while (state.events.length > MAX_EVENTS) state.events.pop();

              // --- Emergency action unlock check ---
              if (!state.emergencyUnlocked) {
                const purchasedCount = Object.values(state.upgrades).filter(u => u.purchased).length;
                const totalCount = Object.values(state.upgrades).length;
                const allPurchased = purchasedCount === totalCount;
                const threshold = (purchasedCount / Math.max(1, totalCount) >= 0.5 && state.day >= 30) || state.hospResponseTier >= 2;
                if (allPurchased || threshold) {
                  state.emergencyUnlocked = true;
                  state.events.unshift('Emergency actions are now available');
                  try { playMilestone('alert'); } catch {}
                }
              }

              // --- Milestone system ---
              const milestone = checkMilestones(state);
              if (milestone) {
                state.milestonesTriggered.push(milestone.id);
                state.events.unshift(`Milestone: ${milestone.title}`);
                if (milestone.reward) {
                  state.dna += milestone.reward.amount;
                  state.events.unshift(`+${milestone.reward.amount} ${state.mode === 'architect' ? 'DNA' : 'Ops'}`);
                }
                if (milestone.autoPause && state.autoPauseEnabled) {
                  state.paused = true;
                  state.pauseReason = `milestone:${milestone.title}|${milestone.narrative}`;
                  try { playMilestone('objective'); } catch {}
                }
              }

              // --- Victory / Defeat evaluation ---
              let outcome: 'victory' | 'defeat' | null = null;

              // Story mode objectives
              if (state.story && !state.gameResult) {
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
                if (allMet) outcome = 'victory';
              }

              // Free-play win/loss (only if no story or story didn't trigger)
              if (!state.story && !state.gameResult && !outcome) {
                const totalD = Object.values(state.countries).reduce((s, c) => s + c.D, 0);
                const totalActive = Object.values(state.countries).reduce((s, c) => s + c.I + c.E, 0);
                if (state.mode === 'controller') {
                  if (state.cureProgress >= 100) outcome = 'victory';
                  else if (state.hospResponseTier >= 3 && totalD > totalPop * 0.02) outcome = 'defeat';
                } else {
                  // Architect: lose if cure reaches 100%, win if all boroughs infected and cure < 50%
                  if (state.cureProgress >= 100) outcome = 'defeat';
                  else if (totalActive < 10 && state.day > 30 && state.cureProgress > 50) outcome = 'defeat';
                  const allInfected = Object.values(state.countries).every(c => c.I > 100 || c.R > c.pop * 0.1);
                  if (allInfected && state.cureProgress < 50) outcome = 'victory';
                }
              }

              if (outcome && !state.gameResult) {
                state.paused = true;
                state.gameResult = computeGameEndStats(state, outcome);
                state.events.unshift(outcome === 'victory' ? 'Victory!' : 'Defeat.');
                try { playMilestone(outcome === 'victory' ? 'victory' : 'day'); } catch {}
              }
            }
          });
          // Auto-pause/gameover can be triggered inside a sim step (e.g., milestone).
          // Stop integrating immediately so the game doesn't advance "under" the pause overlay.
          if (get().paused) {
            __simAccMs = 0;
            break;
          }
          __simAccMs -= stepMs;
          steps++;
        }
        if (steps >= maxStepsPerTick) {
          // Drop the remainder to avoid spiral-of-death when the tab was inactive.
          __simAccMs = 0;
        }

        // After sim integration, allow the AI director to evaluate and (rarely)
        // request an adjustment. This is intentionally fire-and-forget.
        const stAfter = get();
        const ai = stAfter.aiDirector;
        if (ai?.enabled && stAfter.pathogenType === 'virus' && !ai.pending) {
          void stAfter.actions.requestAiDirectorDecision();
        }
      },
      purchaseUpgrade: (id) => set((st) => {
        const up = st.upgrades[id];
        if (!up || up.purchased) return;
        if (up.prereqs && up.prereqs.some((pid) => !st.upgrades[pid]?.purchased)) return;
        if (st.dna < up.cost) return;
        const prevDebt = st.mutationDebt;
        st.dna -= up.cost;
        up.purchased = true;
        if (st.mode === 'architect' && st.pathogenType === 'virus') {
          const isStabilizer = id.startsWith('vx_stab');
          if (isStabilizer) {
            st.mutationDebt = Math.max(0, st.mutationDebt - 12);
            if (prevDebt >= 50 && st.mutationDebt < 50) st.events.unshift('Genome instability reduced');
            else st.events.unshift('Genome stabilized');
          } else {
            st.mutationDebt = Math.min(100, st.mutationDebt + 10);
            if (prevDebt < 50 && st.mutationDebt >= 50) st.events.unshift('Genome instability rising');
            if (prevDebt < 80 && st.mutationDebt >= 80) st.events.unshift('Mutation debt critical');
          }
          while (st.events.length > MAX_EVENTS) st.events.pop();
        }
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
      // Seed into Exposed for gentler onset (used by Patient Zero + architect starts)
      seedExposure: (target?: CountryID | 'all', amount?: number, label?: string) => set((st) => {
        const bump = amount ?? 10_000;
        const apply = (c: Country) => {
          const space = Math.max(0, c.S - 1);
          const delta = Math.min(space, bump);
          c.S -= delta;
          c.E += delta;
        };
        if (!target || target === 'all') {
          Object.values(st.countries).forEach(apply);
        } else if (st.countries[target]) {
          apply(st.countries[target]);
        }
        st.events.unshift(label || 'Seeded exposure');
      }),
      setPolicy: (id, policy) => set((st) => { const c = st.countries[id]; if (c) c.policy = policy; }),
      deployCordon: (id) => set((st) => {
        if (st.mode !== 'controller') return;
        if (st.pathogenType !== 'bioweapon') return;
        const c = st.countries[id];
        if (!c) return;
        let cost = 6;
        let days = 4;
        for (const u of Object.values(st.upgrades)) {
          if (!u.purchased) continue;
          const e = u.effects;
          if (typeof e.cordonCostDelta === 'number') cost += e.cordonCostDelta;
          if (typeof e.cordonDaysAdd === 'number') days += e.cordonDaysAdd;
        }
        cost = Math.max(1, Math.round(cost));
        days = Math.max(1, Math.min(10, Math.round(days)));
        if (st.dna < cost) return;
        if ((st.cordonDaysLeft[id] || 0) > 0) return;
        st.dna -= cost;
        st.cordonDaysLeft[id] = days;
        st.events.unshift(`Containment cordon deployed in ${c.name} (${days} days)`);
        while (st.events.length > MAX_EVENTS) st.events.pop();
      }),
	      saveGame: () => {
	        try {
	          const st = get();
	          const snapshot = {
	            t: st.t,
	            day: st.day,
	            paused: st.paused,
	            pauseReason: st.pauseReason,
	            autoPauseEnabled: st.autoPauseEnabled,
	            awaitingPatientZero: Boolean(st.awaitingPatientZero),
	            patientZeroSeedAmount: (st as any).patientZeroSeedAmount ?? null,
	            speed: st.speed,
	            msPerDay: st.msPerDay,
	            pacing: st.pacing,
	            bubbleSpawnMs: st.bubbleSpawnMs,
	            autoCollectBubbles: st.autoCollectBubbles,
	            dna: st.dna,
	            mode: st.mode,
	            pathogenType: st.pathogenType,
	            hospResponseTier: st.hospResponseTier,
	            mutationDebt: st.mutationDebt,
	            antibioticResistance: st.antibioticResistance,
	            fungusBurstDaysLeft: st.fungusBurstDaysLeft,
	            bioweaponVolatility: st.bioweaponVolatility,
	            cordonDaysLeft: st.cordonDaysLeft,
	            difficulty: st.difficulty,
	            cureProgress: st.cureProgress,
	            peakI: st.peakI,
	            story: st.story,
	            // Meta-systems
	            milestonesTriggered: st.milestonesTriggered,
	            emergencyUnlocked: st.emergencyUnlocked,
	            activeEmergencyEffects: st.activeEmergencyEffects,
	            emergencyCooldowns: st.emergencyCooldowns,
	            gameResult: st.gameResult,
	            countries: st.countries,
	            selectedCountryId: st.selectedCountryId,
	            params: st.params,
	            upgrades: st.upgrades,
	            aiDirector: st.aiDirector ? { ...st.aiDirector, pending: false } : undefined,
	            events: st.events.slice(0, 20),
	            version: 1,
	          };
	          localStorage.setItem('gameSave', JSON.stringify(snapshot));
	        } catch {}
	      },
	      loadGame: () => {
	        try {
	          const raw = localStorage.getItem('gameSave');
	          if (!raw) return;
	          const snap = JSON.parse(raw);
	          set((st) => {
	            // Sanitize core clock fields; corrupt localStorage should never brick the sim.
	            const msPerDayIn = (typeof snap.msPerDay === 'number' && Number.isFinite(snap.msPerDay) && snap.msPerDay > 500)
	              ? snap.msPerDay
	              : null;
	            if (msPerDayIn) st.msPerDay = msPerDayIn;

	            const tIn = (typeof snap.t === 'number' && Number.isFinite(snap.t) && snap.t >= 0) ? snap.t : null;
	            if (tIn !== null) st.t = tIn;

	            const dayIn = (typeof snap.day === 'number' && Number.isFinite(snap.day) && snap.day >= 0) ? snap.day : null;
	            if (dayIn !== null) st.day = dayIn;
	            else if (tIn !== null) st.day = tIn / Math.max(1, st.msPerDay);

	            if (typeof snap.paused === 'boolean') st.paused = snap.paused;
	            if (typeof snap.pauseReason === 'string' || snap.pauseReason === null) st.pauseReason = snap.pauseReason;
	            if (typeof snap.autoPauseEnabled === 'boolean') st.autoPauseEnabled = snap.autoPauseEnabled;
	            if (Object.prototype.hasOwnProperty.call(snap, 'awaitingPatientZero')) {
	              st.awaitingPatientZero = Boolean((snap as any).awaitingPatientZero);
	            } else {
	              // Back-compat for older saves.
	              st.awaitingPatientZero = false;
	            }
	            if (typeof (snap as any).patientZeroSeedAmount === 'number' && Number.isFinite((snap as any).patientZeroSeedAmount)) {
	              (st as any).patientZeroSeedAmount = (snap as any).patientZeroSeedAmount;
	            }
	            if (snap.speed === 1 || snap.speed === 3 || snap.speed === 10) st.speed = snap.speed;
	            if (snap.pacing === 'slow' || snap.pacing === 'normal' || snap.pacing === 'fast') st.pacing = snap.pacing;
	            if (typeof snap.bubbleSpawnMs === 'number' && Number.isFinite(snap.bubbleSpawnMs) && snap.bubbleSpawnMs > 0) {
	              st.bubbleSpawnMs = snap.bubbleSpawnMs;
	            }
	            if (typeof snap.autoCollectBubbles === 'boolean') st.autoCollectBubbles = snap.autoCollectBubbles;
	            st.dna = snap.dna ?? st.dna;
	            st.countries = snap.countries ?? st.countries;
	            st.selectedCountryId = snap.selectedCountryId ?? st.selectedCountryId;
            st.params = snap.params ?? st.params;
            st.upgrades = snap.upgrades ?? st.upgrades;
            st.events = Array.isArray(snap.events) ? snap.events : st.events;
            st.mode = snap.mode ?? st.mode;
            st.pathogenType = snap.pathogenType ?? st.pathogenType;
            {
              const t = (snap as any).hospResponseTier;
              st.hospResponseTier = (t === 0 || t === 1 || t === 2 || t === 3) ? (t as HospResponseTier) : 0;
            }
            // AI director: best-effort restore with safe defaults.
            if (snap.aiDirector && typeof snap.aiDirector === 'object') {
              const incoming = snap.aiDirector as Partial<AiDirectorState>;
              const base = createAiDirectorState(Date.now(), false);
              const incomingKnobs = (incoming.knobs && typeof incoming.knobs === 'object') ? incoming.knobs : undefined;
              const incomingHistory = Array.isArray(incoming.history) ? incoming.history : [];
              st.aiDirector = {
                ...base,
                ...incoming,
                pending: false,
                knobs: { ...AI_DEFAULT_KNOBS, ...(incomingKnobs || {}) },
                history: incomingHistory,
              };
            }
            if (!st.aiDirector) st.aiDirector = createAiDirectorState(Date.now(), false);
            if (st.pathogenType !== 'virus') {
              st.aiDirector.enabled = false;
              st.aiDirector.pending = false;
              st.aiDirector.knobs = { ...AI_DEFAULT_KNOBS };
            }
            st.mutationDebt = snap.mutationDebt ?? st.mutationDebt;
            st.antibioticResistance = snap.antibioticResistance ?? st.antibioticResistance;
            st.fungusBurstDaysLeft = snap.fungusBurstDaysLeft ?? st.fungusBurstDaysLeft;
            st.bioweaponVolatility = snap.bioweaponVolatility ?? st.bioweaponVolatility;
            st.cordonDaysLeft = snap.cordonDaysLeft ?? st.cordonDaysLeft;
            st.difficulty = snap.difficulty ?? st.difficulty;
            st.cureProgress = snap.cureProgress ?? st.cureProgress;
            st.peakI = snap.peakI ?? st.peakI;
            st.story = snap.story ?? st.story;

	            // Milestones/emergency unlocks: restore so reload doesn't re-trigger rewards or hide unlocked actions.
	            if (Array.isArray(snap.milestonesTriggered)) {
	              st.milestonesTriggered = snap.milestonesTriggered.filter((x: any) => typeof x === 'string');
	            }
	            if (typeof snap.emergencyUnlocked === 'boolean') st.emergencyUnlocked = snap.emergencyUnlocked;
	            if (Array.isArray(snap.activeEmergencyEffects)) {
	              st.activeEmergencyEffects = snap.activeEmergencyEffects.filter((e: any) =>
	                e && typeof e === 'object'
	                && typeof e.actionId === 'string'
	                && typeof e.startDay === 'number'
	                && typeof e.endDay === 'number'
	              );
	            }
	            if (snap.emergencyCooldowns && typeof snap.emergencyCooldowns === 'object') {
	              st.emergencyCooldowns = { ...(snap.emergencyCooldowns as any) };
	            }
	            if (snap.gameResult && typeof snap.gameResult === 'object') {
	              const gr = snap.gameResult as Partial<GameEndStats>;
	              if ((gr.outcome === 'victory' || gr.outcome === 'defeat') && typeof gr.score === 'number' && typeof gr.days === 'number') {
	                st.gameResult = gr as GameEndStats;
	              }
	            }
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
        st.msPerDay = PACING_PRESETS.normal.msPerDay;
        st.pacing = 'normal';
        st.bubbleSpawnMs = PACING_PRESETS.normal.bubbleSpawnMs;
        st.dna = 0;
        st.countries = initialCountries();
        st.selectedCountryId = null;
        st.mode = mode;
        st.pathogenType = (opts?.pathogenType ?? 'virus') as PathogenType;
        st.hospResponseTier = 0;
        st.aiDirector = createAiDirectorState(Date.now(), Boolean(opts?.aiDirectorEnabled && st.pathogenType === 'virus'));
        if (st.aiDirector.enabled) st.aiDirector.lastEvalDay = 0;
        st.mutationDebt = 0;
        st.antibioticResistance = 0;
        st.fungusBurstDaysLeft = 0;
        st.bioweaponVolatility = 0;
        st.cordonDaysLeft = {};
        st.activeEmergencyEffects = [];
        st.emergencyCooldowns = {};
        st.gameResult = null;
        st.milestonesTriggered = [];
        st.pauseReason = null;
        st.autoPauseEnabled = true;
        st.emergencyUnlocked = false;
        st.bankedPickups = [];
        st.cureProgress = 0;
        st.params = paramsForType(st.pathogenType);
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
          st.upgrades = { ...st.upgrades, ...typeSpecificUpgrades(mode, st.pathogenType) };
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

        // Start gating: do not advance sim until the start condition is satisfied.
        // Architect: Patient Zero placement (or explicit auto-seed mode).
        // Controller: choose initial focus (we also seed an initial outbreak deterministically).

        if (mode === 'architect') {
          const isStoryPick = Boolean(opts?.storyId && opts.storyId === 'architect_patient_zero');
          const seedMode = isStoryPick ? 'pick' : (opts?.seedMode ?? 'pick');
          const amount = clampSeedAmount(opts?.seedAmount, 6_000);

          if (seedMode === 'pick') {
            st.awaitingPatientZero = true;
            st.paused = true;
            (st as any).patientZeroSeedAmount = amount;
            st.events.unshift('Select a borough to place Patient Zero');
          } else if (seedMode === 'random') {
            const target = opts?.seedTarget
              ?? (BORO_IDS[Math.floor(Math.random() * BORO_IDS.length)] as CountryID);
            seedExposureInPlace(st as any, target, amount);
            st.selectedCountryId = target;
            st.awaitingPatientZero = false;
            st.paused = false;
            st.events.unshift(`Patient Zero established in ${st.countries[target]?.name || target}`);
          } else if (seedMode === 'widespread') {
            seedExposureInPlace(st as any, 'all', amount);
            st.awaitingPatientZero = false;
            st.paused = false;
            st.events.unshift('Widespread seeding initiated');
          }
        }

        if (mode === 'controller') {
          st.awaitingPatientZero = true;
          st.paused = true;
          // Controller start is player-driven: they choose where the outbreak begins (and focus).
          const base =
            st.difficulty === 'casual' ? 8000 :
            st.difficulty === 'brutal' ? 4500 :
            6000;
          const amount = clampSeedAmount(opts?.seedAmount, base);
          (st as any).patientZeroSeedAmount = amount;
          st.events.unshift('Select a borough to begin the outbreak and set your initial focus');
        }
      }),
      addDNA: (delta) => set((st) => { st.dna = Math.max(0, st.dna + delta); }),
      adjustCure: (deltaPercent) => set((st) => { st.cureProgress = Math.max(0, Math.min(100, st.cureProgress + deltaPercent)); }),
      setAwaitingPatientZero: (v) => set((st) => { st.awaitingPatientZero = v; }),
    },
  }))
);
