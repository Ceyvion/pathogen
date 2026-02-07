import type { PathogenType } from '../state/types';

export type BoroKey = 'manhattan' | 'brooklyn' | 'queens' | 'bronx' | 'staten_island';

export interface BoroPersonality {
  key: BoroKey;
  displayName: string;
  tagline: string;
  character: string;
  accent: string;
}

export interface TreatmentProtocol {
  id: string;
  name: string;
  desc: string;
  boroKeys: BoroKey[];
  pathogenTypes: PathogenType[] | 'all';
  effectHint: string;
}

export const BORO_PERSONALITIES: Record<BoroKey, BoroPersonality> = {
  manhattan: {
    key: 'manhattan',
    displayName: 'Manhattan',
    tagline: 'THE FINANCIAL FORTRESS',
    character: 'Corporate-driven. Cutting-edge experimental protocols funded by private donors. Response is swift but serves the well-connected first.',
    accent: '#33ff66',
  },
  brooklyn: {
    key: 'brooklyn',
    displayName: 'Brooklyn',
    tagline: 'THE COMMUNITY SHIELD',
    character: 'Grassroots mutual aid networks supplement hospital capacity. Treatment approaches emphasize neighborhood solidarity and volunteer triage.',
    accent: '#66ccff',
  },
  queens: {
    key: 'queens',
    displayName: 'Queens',
    tagline: 'THE DIVERSE FRONT',
    character: 'Multilingual, multicultural response. Hospitals run culturally-adapted outreach and leverage immigrant community health workers. Translation services are critical infrastructure.',
    accent: '#ffcc33',
  },
  bronx: {
    key: 'bronx',
    displayName: 'Bronx',
    tagline: 'THE RESILIENT LINE',
    character: 'Chronically underfunded but unyielding. Hospitals stretch every resource, relying on experienced ER staff and improvised field solutions. The borough knows how to do more with less.',
    accent: '#ff6644',
  },
  staten_island: {
    key: 'staten_island',
    displayName: 'Staten Island',
    tagline: 'THE ISOLATED WARD',
    character: 'Geographically separated. Limited hospital count forces self-reliance. Response emphasizes ferry-based supply chains and island-wide quarantine protocols.',
    accent: '#aa88ff',
  },
};

export const TREATMENT_PROTOCOLS: TreatmentProtocol[] = [
  {
    id: 'tp_antiviral',
    name: 'Experimental Antiviral Protocol',
    desc: 'Wall Street-funded Phase II trial. Promising efficacy in early-stage viral load reduction. Side effects under review.',
    boroKeys: ['manhattan'],
    pathogenTypes: ['virus'],
    effectHint: 'Targets viral replication cycle',
  },
  {
    id: 'tp_triage',
    name: 'Emergency Triage Expansion',
    desc: 'Hallway beds, repurposed lobbies, and 12-hour nursing shifts. The math is simple: more space, more time.',
    boroKeys: ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten_island'],
    pathogenTypes: 'all',
    effectHint: 'Increases effective bed capacity',
  },
  {
    id: 'tp_quarantine_wing',
    name: 'Quarantine Wing Activation',
    desc: 'Sealed negative-pressure wards with decontamination airlocks. Reserved for the worst cases. Staff enter in pairs, never alone.',
    boroKeys: ['manhattan', 'bronx'],
    pathogenTypes: ['bioweapon'],
    effectHint: 'Isolates high-risk patients',
  },
  {
    id: 'tp_field_hospital',
    name: 'Field Hospital Deployment',
    desc: 'Tents in parking lots, cots in gymnasiums. Not pretty, but functional. The National Guard handles logistics.',
    boroKeys: ['brooklyn', 'bronx'],
    pathogenTypes: 'all',
    effectHint: 'Emergency overflow capacity',
  },
  {
    id: 'tp_chw_surge',
    name: 'Community Health Worker Surge',
    desc: 'Trained locals going door-to-door with thermometers, pamphlets in 40 languages, and empathy. Trust is the real PPE.',
    boroKeys: ['queens', 'brooklyn'],
    pathogenTypes: 'all',
    effectHint: 'Early detection and community compliance',
  },
  {
    id: 'tp_monoclonal',
    name: 'Monoclonal Antibody Distribution',
    desc: 'Refrigerated trucks. Armed escorts. A molecule that buys patients 72 hours. Allocation is... political.',
    boroKeys: ['manhattan', 'queens'],
    pathogenTypes: ['virus', 'bioweapon'],
    effectHint: 'Reduces hospitalization rate',
  },
  {
    id: 'tp_antibiotic_rotation',
    name: 'Antibiotic Rotation Protocol',
    desc: 'Cycling drug classes weekly to slow resistance buildup. The pathogen adapts; the doctors adapt faster. For now.',
    boroKeys: ['bronx', 'brooklyn'],
    pathogenTypes: ['bacteria'],
    effectHint: 'Counters antibiotic resistance',
  },
  {
    id: 'tp_spore_decon',
    name: 'Spore Decontamination Crews',
    desc: 'HEPA-filtered hazmat teams scrubbing ventilation systems borough-wide. Every duct, every filter, every forgotten basement.',
    boroKeys: ['queens', 'staten_island'],
    pathogenTypes: ['fungus'],
    effectHint: 'Reduces environmental fungal load',
  },
  {
    id: 'tp_ferry_medevac',
    name: 'Ferry Medevac System',
    desc: 'When the island\'s three hospitals fill, patients ride the ferry under medical escort. The Verrazzano becomes a lifeline.',
    boroKeys: ['staten_island'],
    pathogenTypes: 'all',
    effectHint: 'Cross-borough patient transfer',
  },
  {
    id: 'tp_mutual_aid',
    name: 'Mutual Aid Pharmacy Network',
    desc: 'Neighborhood pharmacies pooling stock, sharing deliveries, refusing to price-gouge. Brooklyn takes care of Brooklyn.',
    boroKeys: ['brooklyn'],
    pathogenTypes: 'all',
    effectHint: 'Medication access for underserved areas',
  },
  {
    id: 'tp_corporate_wellness',
    name: 'Corporate Wellness Mandate',
    desc: 'Midtown towers enforcing daily screenings. The CEO gets tested first, then everyone else. Compliance is... incentivized.',
    boroKeys: ['manhattan'],
    pathogenTypes: 'all',
    effectHint: 'Workplace transmission reduction',
  },
  {
    id: 'tp_navigator',
    name: 'Immigrant Health Navigator Program',
    desc: 'Bilingual navigators bridging the gap between fearful communities and the health system. No papers required. No questions asked.',
    boroKeys: ['queens'],
    pathogenTypes: 'all',
    effectHint: 'Increases healthcare access equity',
  },
  {
    id: 'tp_mobile_icu',
    name: 'Mobile ICU Fleet',
    desc: 'Converted ambulances with ventilator capacity, roaming the borough on 6-hour loops. If the patient can\'t reach the ICU, the ICU reaches them.',
    boroKeys: ['bronx', 'manhattan'],
    pathogenTypes: 'all',
    effectHint: 'Critical care capacity extension',
  },
  {
    id: 'tp_sewage',
    name: 'Sewage Surveillance Network',
    desc: 'Wastewater doesn\'t lie. Every borough\'s outflow is now a diagnostic tool. The sewers know before the hospitals do.',
    boroKeys: ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten_island'],
    pathogenTypes: 'all',
    effectHint: 'Early outbreak detection',
  },
  {
    id: 'tp_palliative',
    name: 'Palliative Care Expansion',
    desc: 'When cure isn\'t coming fast enough, comfort protocols activate. Chaplains on speed-dial. The hardest conversation in medicine.',
    boroKeys: ['bronx', 'staten_island'],
    pathogenTypes: ['bioweapon'],
    effectHint: 'End-of-life care when mortality spikes',
  },
  {
    id: 'tp_genomic',
    name: 'Rapid Genomic Sequencing Hub',
    desc: '48-hour turnaround on variant identification. The pathogen has a name before the patient does. Knowledge is the first weapon.',
    boroKeys: ['manhattan', 'queens'],
    pathogenTypes: ['virus', 'bacteria'],
    effectHint: 'Accelerates targeted treatment development',
  },
];

export function getProtocolsForBoro(boroKey: BoroKey, pathogenType: PathogenType): (TreatmentProtocol & { status: 'active' | 'standby' | 'classified' })[] {
  return TREATMENT_PROTOCOLS
    .filter((p) => p.boroKeys.includes(boroKey))
    .map((p) => {
      const pathogenMatch = p.pathogenTypes === 'all' || p.pathogenTypes.includes(pathogenType);
      return { ...p, status: pathogenMatch ? 'standby' as const : 'classified' as const };
    });
}
