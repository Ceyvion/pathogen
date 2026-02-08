import type {
  NexusActionId,
  NexusActiveEffect,
  NexusPhase,
  NexusSeverity,
  AiDirectorFocus,
  AiDirectorMood,
  WorldState,
  CountryID,
} from '../state/types';

// ---------------------------------------------------------------------------
// Action catalog definition
// ---------------------------------------------------------------------------

export interface NexusActionDef {
  id: NexusActionId;
  severity: NexusSeverity;
  durationDays: number; // 0 = instant one-shot
  cooldownDays: number;
  focusAffinity: AiDirectorFocus[]; // which strategicFocus values weight this action
  moodAffinity: AiDirectorMood[];   // which moods weight this action
  endgameOnly?: boolean;
  label: string;
  // Build the effect. Returns params dict stored on the active effect.
  buildParams(state: WorldState): Record<string, number>;
}

export const NEXUS_ACTION_CATALOG: NexusActionDef[] = [
  // --- Transmission ---
  {
    id: 'superspreader_event',
    severity: 'minor',
    durationDays: 3,
    cooldownDays: 8,
    focusAffinity: ['transmissibility'],
    moodAffinity: ['aggressive', 'scheming', 'triumphant'],
    label: 'Superspreader Event',
    buildParams(state) {
      // Pick the borough with highest susceptible fraction
      const boroughs = Object.values(state.countries);
      const target = boroughs.reduce((best, c) =>
        (c.S / c.pop) > (best.S / best.pop) ? c : best, boroughs[0]);
      return { targetBorough: boroughIndex(state, target.id), betaMul: 1.20 };
    },
  },
  {
    id: 'cross_borough_seeding',
    severity: 'minor',
    durationDays: 0, // instant
    cooldownDays: 10,
    focusAffinity: ['transmissibility', 'stealth'],
    moodAffinity: ['scheming', 'calm'],
    label: 'Cross-Borough Seeding',
    buildParams(state) {
      // Pick borough with lowest infection ratio
      const boroughs = Object.values(state.countries);
      const target = boroughs.reduce((best, c) =>
        (c.I / c.pop) < (best.I / best.pop) ? c : best, boroughs[0]);
      const seedAmount = Math.max(50, Math.round(target.pop * 0.0005));
      return { targetBorough: boroughIndex(state, target.id), seedExposed: seedAmount };
    },
  },
  {
    id: 'mutation_surge',
    severity: 'major',
    durationDays: 3,
    cooldownDays: 12,
    focusAffinity: ['transmissibility', 'adaptation'],
    moodAffinity: ['aggressive', 'triumphant'],
    label: 'Mutation Surge',
    buildParams() {
      return { betaMul: 1.15 };
    },
  },

  // --- Lethality ---
  {
    id: 'virulence_spike',
    severity: 'major',
    durationDays: 2,
    cooldownDays: 10,
    focusAffinity: ['lethality'],
    moodAffinity: ['aggressive', 'desperate'],
    label: 'Virulence Spike',
    buildParams() {
      return { muMul: 1.20 };
    },
  },
  {
    id: 'hospital_strain',
    severity: 'major',
    durationDays: 3,
    cooldownDays: 12,
    focusAffinity: ['lethality', 'adaptation'],
    moodAffinity: ['aggressive', 'scheming'],
    label: 'Hospital Strain',
    buildParams() {
      return { hospCapacityMul: 0.85 };
    },
  },
  {
    id: 'treatment_resistance',
    severity: 'major',
    durationDays: 0, // instant one-shot
    cooldownDays: 15,
    focusAffinity: ['lethality', 'adaptation'],
    moodAffinity: ['scheming', 'desperate'],
    label: 'Treatment Resistance',
    buildParams() {
      return { cureSetback: 3 }; // roll back cure by 3%
    },
  },

  // --- Stealth ---
  {
    id: 'silent_spread',
    severity: 'minor',
    durationDays: 4,
    cooldownDays: 10,
    focusAffinity: ['stealth'],
    moodAffinity: ['scheming', 'calm'],
    label: 'Silent Spread',
    buildParams() {
      return { symFracMul: 0.80 }; // 20% fewer symptomatic
    },
  },
  {
    id: 'detection_evasion',
    severity: 'minor',
    durationDays: 3,
    cooldownDays: 8,
    focusAffinity: ['stealth', 'adaptation'],
    moodAffinity: ['scheming', 'calm'],
    label: 'Detection Evasion',
    buildParams() {
      return { detectionDelayAdd: 2 }; // +2 day detection delay
    },
  },

  // --- Escalation (endgame only) ---
  {
    id: 'variant_emergence',
    severity: 'critical',
    durationDays: -1, // permanent
    cooldownDays: 30,
    focusAffinity: ['transmissibility', 'adaptation'],
    moodAffinity: ['aggressive', 'triumphant'],
    endgameOnly: true,
    label: 'Variant Emergence',
    buildParams() {
      return { permanentBetaBoost: 1.06 }; // 6% permanent beta increase
    },
  },
  {
    id: 'coordinated_surge',
    severity: 'critical',
    durationDays: 2,
    cooldownDays: 20,
    focusAffinity: ['transmissibility', 'lethality'],
    moodAffinity: ['aggressive', 'triumphant'],
    endgameOnly: true,
    label: 'Coordinated Surge',
    buildParams() {
      return { allBoroughsBetaMul: 1.25 };
    },
  },
  {
    id: 'cure_sabotage',
    severity: 'critical',
    durationDays: 0, // instant
    cooldownDays: 25,
    focusAffinity: ['adaptation', 'stealth'],
    moodAffinity: ['desperate', 'scheming'],
    endgameOnly: true,
    label: 'Cure Sabotage',
    buildParams() {
      const setback = 3 + Math.floor(Math.random() * 6); // 3-8%
      return { cureSetback: setback };
    },
  },
  {
    id: 'infrastructure_attack',
    severity: 'critical',
    durationDays: 5,
    cooldownDays: 30,
    focusAffinity: ['adaptation'],
    moodAffinity: ['aggressive', 'desperate'],
    endgameOnly: true,
    label: 'Infrastructure Attack',
    buildParams(_state) {
      // Actual upgrade selection happens in store.ts when the action is applied
      return { active: 1 };
    },
  },
];

// ---------------------------------------------------------------------------
// Phase calculation
// ---------------------------------------------------------------------------

export function computeNexusPhase(dayIndex: number, cureProgress: number): NexusPhase {
  if (dayIndex >= 80 || cureProgress >= 75) return 'endgame';
  if (dayIndex >= 50 || cureProgress >= 50) return 'aggressive';
  if (dayIndex >= 25 || cureProgress >= 20) return 'adapting';
  if (dayIndex >= 10) return 'probing';
  return 'dormant';
}

// How often (in game days) NEXUS tries to take an action per phase.
const PHASE_ACTION_INTERVAL: Record<NexusPhase, [number, number]> = {
  dormant: [999, 999], // never
  probing: [4, 6],
  adapting: [2, 4],
  aggressive: [1, 2],
  endgame: [1, 1],
};

// Max severity allowed per phase.
const PHASE_MAX_SEVERITY: Record<NexusPhase, NexusSeverity> = {
  dormant: 'minor',
  probing: 'minor',
  adapting: 'major',
  aggressive: 'major',
  endgame: 'critical',
};

const SEVERITY_ORDER: Record<NexusSeverity, number> = { minor: 0, major: 1, critical: 2 };

// ---------------------------------------------------------------------------
// Action selection
// ---------------------------------------------------------------------------

export interface NexusActionResult {
  action: NexusActionDef;
  effect: NexusActiveEffect;
  narrative: string; // generated event string
}

/**
 * Determine if NEXUS should act this tick, and if so which action to take.
 * Returns null if no action should be taken.
 */
export function maybeSelectNexusAction(state: WorldState): NexusActionResult | null {
  const ai = state.aiDirector;
  if (!ai?.enabled || state.pathogenType !== 'virus') return null;
  if (ai.phase === 'dormant') return null;

  const dayIndex = Math.floor(state.day);
  const [minInterval, maxInterval] = PHASE_ACTION_INTERVAL[ai.phase];
  const interval = minInterval + Math.random() * (maxInterval - minInterval);
  if (dayIndex - ai.lastActionDay < interval) return null;

  const maxSev = SEVERITY_ORDER[PHASE_MAX_SEVERITY[ai.phase]];
  const focus = ai.strategicFocus ?? 'transmissibility';
  const mood = ai.mood;

  // Filter to eligible actions
  const eligible = NEXUS_ACTION_CATALOG.filter(a => {
    if (SEVERITY_ORDER[a.severity] > maxSev) return false;
    if (a.endgameOnly && ai.phase !== 'endgame') return false;
    const cdDay = ai.actionCooldowns[a.id] ?? 0;
    if (dayIndex < cdDay) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  // Score each action by affinity to current focus and mood
  const scored = eligible.map(a => {
    let score = 1;
    if (a.focusAffinity.includes(focus)) score += 3;
    if (a.moodAffinity.includes(mood)) score += 2;
    // Slight randomness for variety
    score += Math.random() * 1.5;
    return { action: a, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const chosen = scored[0].action;

  // Build the effect
  const params = chosen.buildParams(state);
  const effectId = ai.nextEffectId;
  const endDay = chosen.durationDays === -1 ? -1
    : chosen.durationDays === 0 ? dayIndex
    : dayIndex + chosen.durationDays;

  const effect: NexusActiveEffect = {
    id: effectId,
    actionId: chosen.id,
    startDay: dayIndex,
    endDay,
    params,
    label: chosen.label,
  };

  return { action: chosen, effect, narrative: '' }; // narrative filled by caller
}

// ---------------------------------------------------------------------------
// Apply active NEXUS effects to simulation parameters
// ---------------------------------------------------------------------------

export interface NexusEffectModifiers {
  betaMul: number;
  muMul: number;
  hospCapacityMul: number;
  symFracMul: number;
  detectionDelayAdd: number;
  cureSetback: number; // accumulated one-shot cure reduction
  // Per-borough overrides
  boroughBetaMul: Record<string, number>;
}

/**
 * Aggregate all active NEXUS effects into a single modifier struct.
 */
export function aggregateNexusEffects(
  effects: NexusActiveEffect[],
  dayIndex: number,
  state: WorldState,
): NexusEffectModifiers {
  const mods: NexusEffectModifiers = {
    betaMul: 1,
    muMul: 1,
    hospCapacityMul: 1,
    symFracMul: 1,
    detectionDelayAdd: 0,
    cureSetback: 0,
    boroughBetaMul: {},
  };

  const boroughIds = Object.keys(state.countries);

  for (const e of effects) {
    // Skip expired non-permanent effects
    if (e.endDay !== -1 && dayIndex >= e.endDay) continue;

    const p = e.params;
    switch (e.actionId) {
      case 'superspreader_event': {
        const bId = boroughIds[p.targetBorough] ?? boroughIds[0];
        mods.boroughBetaMul[bId] = (mods.boroughBetaMul[bId] ?? 1) * (p.betaMul ?? 1);
        break;
      }
      case 'mutation_surge':
        mods.betaMul *= p.betaMul ?? 1;
        break;
      case 'coordinated_surge':
        mods.betaMul *= p.allBoroughsBetaMul ?? 1;
        break;
      case 'variant_emergence':
        mods.betaMul *= p.permanentBetaBoost ?? 1;
        break;
      case 'virulence_spike':
        mods.muMul *= p.muMul ?? 1;
        break;
      case 'hospital_strain':
        mods.hospCapacityMul *= p.hospCapacityMul ?? 1;
        break;
      case 'treatment_resistance':
      case 'cure_sabotage':
        mods.cureSetback += p.cureSetback ?? 0;
        break;
      case 'silent_spread':
        mods.symFracMul *= p.symFracMul ?? 1;
        break;
      case 'detection_evasion':
        mods.detectionDelayAdd += p.detectionDelayAdd ?? 0;
        break;
      case 'cross_borough_seeding':
        // Instant effect handled at action time, not in aggregation
        break;
      case 'infrastructure_attack':
        // Handled separately via disabledUpgrades
        break;
    }
  }

  return mods;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function boroughIndex(state: WorldState, id: CountryID): number {
  return Object.keys(state.countries).indexOf(id);
}
