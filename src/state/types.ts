export type CountryID = string;

export type GameMode = 'architect' | 'controller';

export type PathogenType = 'virus' | 'bacteria' | 'fungus' | 'bioweapon';

// Citywide emergency posture for hospital systems. This is a simple "story beat"
// style lever (peaks/valleys) that activates when demand exceeds capacity.
export type HospResponseTier = 0 | 1 | 2 | 3;

export interface Country {
  id: CountryID;
  name: string;
  pop: number;
  S: number; E: number; I: number; R: number; H: number; D: number;
  policy: 'open'|'advisory'|'restrictions'|'lockdown';
}

export type Branch = 'transmission' | 'symptoms' | 'abilities';

// Upgrade effect keys are intentionally strict so typos in `effects: { ... }` are
// caught by TypeScript at author time. When adding new effects, wire them into
// the simulation tick and extend this list.
export const UPGRADE_EFFECT_KEYS = [
  // Core SEIR params
  'betaMul',
  'sigmaMul',
  'gammaRecMul',
  'muMul',
  'importationMul',

  // Hospital + cure dynamics
  'hospRateMul',
  'dischargeMul',
  'hospCapacityMul',
  'mortalityHospMul',
  'cureRateMul',
  'cureAddPerDay',

  // Economy/agency/metasystems
  'policyResistMul',
  'dnaRateAdd',
  'dnaPerDeathAdd',
  'opsPerDayAdd',

  // Mobility / containment
  'travelReductionMul',
  'quarantineEffMul',

  // Detection / symptom mechanics
  'detectionDelayAdd',
  'symFracMul',
  'symContactMul',
  'severityMobilityMul',
  'asymptomaticSpreadMul',

  // Disease shape / persistence
  'exposedDurationMul',
  'reinfectionRate',

  // Pathogen-type subsystems
  'mutationDebtDecayAdd',
  'mutationChanceMul',
  'resistanceDecayAdd',
  'resistancePressureMul',
  'fungusBurstChanceMul',
  'fungusBurstDurationAdd',
  'bioweaponVolatilityRateMul',

  // Bioweapon containment tool config
  'cordonDaysAdd',
  'cordonCostDelta',
] as const;

export type UpgradeEffectKey = (typeof UPGRADE_EFFECT_KEYS)[number];
export type UpgradeEffects = Partial<Record<UpgradeEffectKey, number>>;

export interface Upgrade {
  id: string;
  name: string;
  branch: Branch;
  cost: number;
  effects: UpgradeEffects;
  prereqs?: string[];
  purchased?: boolean;
  desc?: string;
}

export type BubbleType = 'dna' | 'ops' | 'cure';

export interface BankedPickup {
  id: number;
  type: BubbleType;
  amount: number;
  createdAtMs: number; // Date.now()-based timestamp
  expiresAtMs: number; // Date.now()-based timestamp
}

export interface Params {
  beta: number; // base transmission rate (per day)
  sigma: number; // incubation -> infectious (per day)
  gammaRec: number; // recovery rate from I (per day)
  muBase: number; // base death rate from I (per day)
  seasonalityAmp: number; // 0..1
  seasonalityPhase: number; // day of peak [0..365)
  hospRate: number; // I -> H per day
  dischargeRate: number; // H -> R per day
  hospCapacityPerK: number; // hospital beds per 1000 pop (capacity proxy)
  mobilityScale: number; // scale travel flows
  importationPerDay: number; // new exposures per day per borough
  variantTransMult: number; // multiplier on beta for current variant
  symFrac: number; // fraction of infections that are symptomatic
  symContactMul: number; // contact multiplier for symptomatic individuals (e.g., 0.7 means 30% fewer contacts)
  severityMobilityFactor: number; // scaling of how severity reduces mobility
  // Early-game pacing helpers
  startRampDelayDays?: number; // days with minimal spread before ramp begins
  startRampDurationDays?: number; // days to ramp from 0 -> 1 progression
  earlyPointBoostDays?: number; // days to boost DNA/Ops accrual
  earlyPointBoostMul?: number; // multiplier for early accrual
}

export interface AiDirectorKnobs {
  // Multipliers that are applied on top of base params. These are designed to be
  // subtle, reversible, and clamped.
  variantTransMultMul: number;
  sigmaMul: number;
  muBaseMul: number;
}

export type AiDirectorMood = 'calm' | 'scheming' | 'aggressive' | 'desperate' | 'triumphant';
export type AiDirectorFocus = 'transmissibility' | 'lethality' | 'stealth' | 'adaptation';

// NEXUS escalation phases – driven by game progress, not LLM calls.
export type NexusPhase = 'dormant' | 'probing' | 'adapting' | 'aggressive' | 'endgame';

// Discrete actions NEXUS can take between LLM calls.
export type NexusActionId =
  // Transmission
  | 'superspreader_event'
  | 'cross_borough_seeding'
  | 'mutation_surge'
  // Lethality
  | 'virulence_spike'
  | 'hospital_strain'
  | 'treatment_resistance'
  // Stealth
  | 'silent_spread'
  | 'detection_evasion'
  // Escalation (endgame)
  | 'variant_emergence'
  | 'coordinated_surge'
  | 'cure_sabotage'
  | 'infrastructure_attack';

export interface NexusActiveEffect {
  id: number;
  actionId: NexusActionId;
  startDay: number;
  endDay: number; // exclusive end day index (-1 for permanent effects)
  params: Record<string, number>; // action-specific params (e.g. targetBorough, magnitude)
  label: string; // short display label
}

export type NexusSeverity = 'minor' | 'major' | 'critical';

export interface AiDirectorDecision {
  version: 1;
  note: string;
  intent: 'increase' | 'decrease' | 'hold';
  mood?: AiDirectorMood;
  moodNote?: string;
  strategicFocus?: AiDirectorFocus;
  // Per-decision multipliers (close to 1.0). The client multiplies these into
  // the running knobs and clamps to hard bounds.
  knobs: Partial<AiDirectorKnobs>;
  // Enhanced NEXUS personality fields
  suggestedActions?: NexusActionId[];
  taunt?: string;
  internalMonologue?: string;
}

export interface AiDirectorDaySnapshot {
  dayIndex: number;
  totalPop: number;
  totalI: number;
  totalH: number;
  prevalence: number; // I / pop
  per100k: number;
  hospLoad: number; // avg load ratio vs capacity proxy
  cureProgress: number; // 0..100
  intensity: number; // 0..1
}

export interface AiDirectorState {
  enabled: boolean;
  pending: boolean;
  error: string | null;
  lastEvalDay: number | null; // dayIndex of the most recent applied decision
  lastRequestAtMs: number | null;
  dailyUsage: { dateKey: string; count: number };
  history: AiDirectorDaySnapshot[]; // capped ring buffer
  knobs: AiDirectorKnobs;
  // NEXUS personality & presence
  mood: AiDirectorMood;
  moodNote: string;
  strategicFocus: AiDirectorFocus | null;
  playerThreatLevel: number; // 0..1
  totalDecisions: number;
  lastSurpriseDay: number;
  // NEXUS action engine state
  phase: NexusPhase;
  activeEffects: NexusActiveEffect[];
  lastActionDay: number;
  actionCooldowns: Partial<Record<NexusActionId, number>>; // day when action available again
  disabledUpgrades: string[]; // upgrade IDs temporarily knocked out by infrastructure_attack
  nextEffectId: number;
  // Enhanced LLM fields
  taunt: string;
  internalMonologue: string;
  lastEmergencyCallMs: number | null; // rate-limit emergency LLM calls
  cureThresholdsCrossed: number[]; // which cure % thresholds triggered emergency calls
}

// Repeatable late-game actions that cost resources and have cooldowns.
export interface EmergencyAction {
  id: string;
  name: string;
  cost: number;
  duration: number; // game days (-1 = instant)
  cooldown: number; // game days before reuse
  effects: UpgradeEffects;
  desc: string;
  mode: GameMode; // which mode this action is available in
  category: 'emergency' | 'counter_nexus';
}

export interface ActiveEmergencyEffect {
  actionId: string;
  startDay: number;
  endDay: number; // exclusive end day index
}

export interface WorldState {
  t: number; // ms elapsed
  day: number; // in-game days elapsed (float)
  paused: boolean;
  speed: 1 | 3 | 10;
  msPerDay: number;
  pacing: 'slow'|'normal'|'fast';
  bubbleSpawnMs: number;
  autoCollectBubbles: boolean;
  bankedPickups: BankedPickup[];
  dna: number; // points for pathogen upgrades (architect) or ops points (controller)
  countries: Record<CountryID, Country>;
  selectedCountryId: CountryID | null;
  mode: GameMode;
  pathogenType: PathogenType;
  mutationDebt: number; // virus mechanic (0..100)
  antibioticResistance: number; // bacteria mechanic (0..1)
  fungusBurstDaysLeft: number; // fungus mechanic
  bioweaponVolatility: number; // bioweapon mechanic (0..1)
  cordonDaysLeft: Partial<Record<CountryID, number>>; // controller containment tool
  cureProgress: number; // 0..100
  difficulty: 'casual'|'normal'|'brutal';
  params: Params;
  upgrades: Record<string, Upgrade>;
  events: string[];
  travel: TravelEdge[];
  story?: Story;
  peakI: number;
  campaignId?: string;
  awaitingPatientZero?: boolean;
  patientZeroSeedAmount?: number;
  aiDirector?: AiDirectorState;
  hospResponseTier: HospResponseTier;
  // Late-game emergency actions
  activeEmergencyEffects: ActiveEmergencyEffect[];
  emergencyCooldowns: Record<string, number>; // actionId -> day when available again
}

export interface TravelEdge { from: CountryID; to: CountryID; daily: number; }

// Story mode scaffolding
export interface Objective {
  id: string;
  title: string;
  type: 'reach_cure' | 'limit_peak_I' | 'infect_all' | 'days_survived';
  target: number; // percentage or absolute as per type
  completed?: boolean;
}

export interface Story {
  id: string;
  title: string;
  mode: GameMode;
  objectives: Objective[];
  description?: string;
  upgrades?: Record<string, Upgrade>; // optional: story-defined upgrade tree
}

export type GeneId = 'atp_boost' | 'efficient_bureaucracy' | 'urban_adaptation';
export interface Gene { id: GeneId; name: string; desc: string; category: 'dna'|'ops'|'env'; }
