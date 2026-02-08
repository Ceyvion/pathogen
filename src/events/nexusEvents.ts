import type { NexusActionId, WorldState } from '../state/types';

// NYC locations for narrative flavor.
const LOCATIONS = [
  'Grand Central', 'Times Square', 'Barclays Center', 'Yankee Stadium',
  'Prospect Park', 'Coney Island', 'JFK arrivals', 'Flushing food court',
  'Arthur Avenue', 'St. George ferry terminal', 'The Strand bookstore',
  'Central Park', 'Brooklyn Bridge', 'Rockaway Beach', 'Jackson Heights',
];

function randomLoc() {
  return LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
}

function topBorough(state: WorldState): string {
  let best = '';
  let bestI = -1;
  for (const c of Object.values(state.countries)) {
    if (c.I > bestI) { bestI = c.I; best = c.name; }
  }
  return best || 'Manhattan';
}

function lowBorough(state: WorldState): string {
  let best = '';
  let bestRatio = Infinity;
  for (const c of Object.values(state.countries)) {
    const ratio = c.I / Math.max(1, c.pop);
    if (ratio < bestRatio) { bestRatio = ratio; best = c.name; }
  }
  return best || 'Staten Island';
}

const TEMPLATES: Record<NexusActionId, string[]> = {
  superspreader_event: [
    'NEXUS: A packed venue near {loc} becomes ground zero. {topBoro} braces for impact.',
    'NEXUS: Mass gathering detected at {loc}. Transmission spiking in {topBoro}.',
    'NEXUS: The pathogen found a crowd. {topBoro} will feel this within days.',
  ],
  cross_borough_seeding: [
    'NEXUS: Silent carriers have crossed into {lowBoro}. The infection spreads.',
    'NEXUS: New exposure cluster detected in {lowBoro}. Origin unknown.',
    'NEXUS: {lowBoro} reports unexplained cases. Cross-borough seeding confirmed.',
  ],
  mutation_surge: [
    'NEXUS: Genomic analysis shows accelerated drift. Transmissibility surging.',
    'NEXUS: A mutation surge is underway. Current countermeasures losing efficacy.',
    'NEXUS: Rapid antigenic shift detected. The pathogen is adapting faster.',
  ],
  virulence_spike: [
    'NEXUS: Case fatality rising sharply. The pathogen grows deadlier.',
    'NEXUS: Virulence spike detected. ICUs report deteriorating outcomes.',
    'NEXUS: Mortality trending upward. This strain means business.',
  ],
  hospital_strain: [
    'NEXUS: Hospital systems buckling under cascading demand.',
    'NEXUS: Staff shortages compounding. Effective capacity dropping.',
    'NEXUS: Supply chain failure. Hospitals operating below capacity.',
  ],
  treatment_resistance: [
    'NEXUS: Lab contamination detected. Cure research set back.',
    'NEXUS: The pathogen adapted to the latest treatment protocol.',
    'NEXUS: Treatment resistance emerging. Cure progress stalls.',
  ],
  silent_spread: [
    'NEXUS: Asymptomatic carriers proliferating. The threat goes unseen.',
    'NEXUS: Symptom expression dropping. Detection becomes harder.',
    'NEXUS: The pathogen learned to hide. Silent spread accelerating.',
  ],
  detection_evasion: [
    'NEXUS: Testing sensitivity degrading. Cases slipping through.',
    'NEXUS: Detection protocols compromised. True case count unknown.',
    'NEXUS: The pathogen evades standard diagnostics.',
  ],
  variant_emergence: [
    'NEXUS: A NEW VARIANT HAS EMERGED. Your countermeasures just became outdated.',
    'NEXUS: Genomic surveillance confirms a novel lineage. Permanent transmissibility increase.',
    'NEXUS: Variant detected with enhanced immune escape. The game has changed.',
  ],
  coordinated_surge: [
    'NEXUS: Coordinated outbreak across all boroughs. This is not random.',
    'NEXUS: Simultaneous surges detected citywide. A calculated escalation.',
    'NEXUS: Every borough reporting spikes. The pathogen strikes everywhere at once.',
  ],
  cure_sabotage: [
    'NEXUS: Critical research data corrupted. Cure progress rolled back.',
    'NEXUS: Lab supply chain disrupted. Weeks of research lost.',
    'NEXUS: The pathogen evolved past the current vaccine candidate.',
  ],
  infrastructure_attack: [
    'NEXUS: System breach detected. One of your upgrades has been compromised.',
    'NEXUS: Operational protocols disrupted. A key capability is temporarily offline.',
    'NEXUS: Infrastructure attack successful. Your defenses have a gap.',
  ],
};

/**
 * Generate a narrative event string for a NEXUS action.
 */
export function generateNexusEventText(actionId: NexusActionId, state: WorldState): string {
  const templates = TEMPLATES[actionId];
  if (!templates || templates.length === 0) return `NEXUS: Action ${actionId} executed.`;
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template
    .replace(/\{loc\}/g, randomLoc())
    .replace(/\{topBoro\}/g, topBorough(state))
    .replace(/\{lowBoro\}/g, lowBorough(state));
}
