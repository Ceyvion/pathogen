import type { Milestone, WorldState } from '../state/types';

function totalI(st: WorldState): number {
  return Object.values(st.countries).reduce((s, c) => s + c.I, 0);
}

function infectedBoroughs(st: WorldState): number {
  return Object.values(st.countries).filter(c => c.I > 100).length;
}

function totalD(st: WorldState): number {
  return Object.values(st.countries).reduce((s, c) => s + c.D, 0);
}

export const MILESTONES: Milestone[] = [
  // Early game
  {
    id: 'first_cluster',
    condition: (st) => totalI(st) >= 1000,
    title: 'First Cluster',
    narrative: 'Reports of an unusual illness are surfacing across the borough. The health department has opened an investigation.',
    reward: { type: 'dna', amount: 2 },
    autoPause: true,
  },
  {
    id: 'spreading',
    condition: (st) => infectedBoroughs(st) >= 2,
    title: 'Cross-Borough Spread',
    narrative: 'The pathogen has breached borough boundaries. Commuters are carrying it on the subway, in rideshares, across bridges.',
    reward: { type: 'dna', amount: 2 },
    autoPause: true,
  },
  // Mid game
  {
    id: 'hospital_strain',
    condition: (st) => st.hospResponseTier >= 1,
    title: 'Hospitals Under Pressure',
    narrative: 'Emergency rooms are overwhelmed. Triage protocols are now in effect. The mayor is holding a press conference.',
    autoPause: true,
  },
  {
    id: 'critical_mass',
    condition: (st) => infectedBoroughs(st) >= 4,
    title: 'Critical Mass',
    narrative: 'Four of five boroughs are reporting active outbreaks. The National Guard has been placed on standby.',
    reward: { type: 'dna', amount: 3 },
    autoPause: true,
  },
  {
    id: 'cure_25',
    condition: (st) => st.cureProgress >= 25,
    title: 'Cure Research: Phase I',
    narrative: 'Scientists have identified a promising compound. Early trials begin this week. The city holds its breath.',
    autoPause: true,
    modes: ['controller'],
  },
  {
    id: 'first_deaths',
    condition: (st) => totalD(st) >= 100,
    title: 'First Wave of Deaths',
    narrative: 'The city mourns its first hundred. Flags fly at half-mast. The obituary pages have doubled.',
    autoPause: true,
  },
  // Late game
  {
    id: 'cure_50',
    condition: (st) => st.cureProgress >= 50,
    title: 'Cure Research: Phase II',
    narrative: 'The cure is showing real promise. Manufacturing is scaling up. But the pathogen is evolving faster than expected.',
    autoPause: true,
  },
  {
    id: 'hospital_crisis',
    condition: (st) => st.hospResponseTier >= 2,
    title: 'Field Hospitals Deployed',
    narrative: 'Convention centers and gymnasiums are being converted to overflow wards. The healthcare system is at its breaking point.',
    autoPause: true,
  },
  {
    id: 'ten_thousand_dead',
    condition: (st) => totalD(st) >= 10_000,
    title: 'Ten Thousand',
    narrative: 'The death toll passes a grim milestone. Refrigerated trucks line hospital loading docks. The city is changed forever.',
    autoPause: true,
  },
  // Endgame
  {
    id: 'cure_75',
    condition: (st) => st.cureProgress >= 75,
    title: 'The Endgame',
    narrative: 'Distribution begins next week. Every hour counts now. The race between pathogen and cure reaches its final stretch.',
    reward: { type: 'dna', amount: 4 },
    autoPause: true,
  },
  {
    id: 'all_boroughs',
    condition: (st) => infectedBoroughs(st) >= 5,
    title: 'Total Spread',
    narrative: 'All five boroughs are infected. No corner of the city has been spared. Staten Island was the last to fall.',
    autoPause: true,
    modes: ['architect'],
  },
];

export function checkMilestones(state: WorldState): Milestone | null {
  for (const m of MILESTONES) {
    if (state.milestonesTriggered.includes(m.id)) continue;
    if (m.modes && !m.modes.includes(state.mode)) continue;
    if (m.condition(state)) return m;
  }
  return null;
}
