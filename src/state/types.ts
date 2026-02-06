export type CountryID = string;

export type GameMode = 'architect' | 'controller';

export type PathogenType = 'virus' | 'bacteria' | 'fungus' | 'bioweapon';

export interface Country {
  id: CountryID;
  name: string;
  pop: number;
  S: number; E: number; I: number; R: number; H: number; D: number;
  policy: 'open'|'advisory'|'restrictions'|'lockdown';
}

export type Branch = 'transmission' | 'symptoms' | 'abilities';

export interface Upgrade {
  id: string;
  name: string;
  branch: Branch;
  cost: number;
  effects: Record<string, number>;
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
