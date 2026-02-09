import type { Country, CountryID, PathogenType, WorldState } from '../state/types';
import { HOSP_RESPONSE_TIERS } from '../sim/hospResponse';

type Loc = { name: string; boro: CountryID };

const NYC_LOCS: Loc[] = [
  { name: "McSorley's", boro: 'manhattan' },
  { name: 'Stonewall Inn', boro: 'manhattan' },
  { name: 'The Dead Rabbit', boro: 'manhattan' },
  { name: "Rudy's Bar", boro: 'manhattan' },
  { name: "Please Don't Tell", boro: 'manhattan' },
  { name: 'Bemelmans Bar', boro: 'manhattan' },
  { name: "Katz's Deli", boro: 'manhattan' },
  { name: 'Tompkins Square Park', boro: 'manhattan' },
  { name: 'Grand Central', boro: 'manhattan' },
  { name: 'The Strand', boro: 'manhattan' },
  { name: 'Union Square', boro: 'manhattan' },
  { name: 'Harlem Hospital lobby', boro: 'manhattan' },

  { name: 'Barclays Center plaza', boro: 'brooklyn' },
  { name: 'Brooklyn Brewery taproom', boro: 'brooklyn' },
  { name: 'Union Hall', boro: 'brooklyn' },
  { name: "Peter Luger's", boro: 'brooklyn' },
  { name: 'Coney Island boardwalk', boro: 'brooklyn' },
  { name: 'Prospect Park loop', boro: 'brooklyn' },
  { name: 'Brooklyn Navy Yard', boro: 'brooklyn' },
  { name: 'Bushwick warehouse party', boro: 'brooklyn' },
  { name: 'Red Hook pier', boro: 'brooklyn' },

  { name: 'Flushing food court', boro: 'queens' },
  { name: 'Bohemian Hall beer garden', boro: 'queens' },
  { name: 'Astoria beer garden', boro: 'queens' },
  { name: 'JFK arrivals', boro: 'queens' },
  { name: 'Citi Field concourse', boro: 'queens' },
  { name: 'Queensboro Plaza platform', boro: 'queens' },
  { name: 'Jackson Heights street fair', boro: 'queens' },

  { name: 'Yankee Stadium gates', boro: 'bronx' },
  { name: 'Fordham Road shopping strip', boro: 'bronx' },
  { name: 'Bronx Zoo entrance', boro: 'bronx' },
  { name: 'Arthur Avenue bakery', boro: 'bronx' },
  { name: 'Arthur Avenue market', boro: 'bronx' },
  { name: 'Mott Haven waterfront', boro: 'bronx' },

  { name: 'St. George ferry terminal', boro: 'staten_island' },
  { name: 'Snug Harbor courtyard', boro: 'staten_island' },
  { name: 'Staten Island Mall', boro: 'staten_island' },
  { name: 'Conference House lawn', boro: 'staten_island' },
  { name: 'Verrazzano overlook', boro: 'staten_island' },
];

const FAKE_CELEBS = [
  // Intentionally "almost real" without being real.
  'Talia Swyft',
  'Kane Westley',
  'Billie Eyelash',
  'The Weekday',
  'Draek Lake',
  'Dua Limo',
  'Ariana Grandeur',
  'Elon Husk',
  'Milo Gold',
  'Lena Varn',
  'Nora Vale',
  'Sable Monroe',
  'Vince Halden',
];

type Metrics = {
  totalPop: number;
  totalI: number;
  totalD: number;
  totalH: number;
  per100kI: number;
  top: Country;
  topId: CountryID;
  topPer100k: number;
  topPolicy: Country['policy'];
  maxHospLoad: number; // 0..2 (overload >1)
};

function computeMetrics(st: WorldState): Metrics {
  const vals = Object.values(st.countries);
  const totalPop = vals.reduce((s, c) => s + c.pop, 0);
  const totalI = vals.reduce((s, c) => s + c.I, 0);
  const totalD = vals.reduce((s, c) => s + c.D, 0);
  const totalH = vals.reduce((s, c) => s + c.H, 0);
  const per100kI = (totalI / Math.max(1, totalPop)) * 100_000;

  let top = vals[0];
  let topId = (vals[0]?.id || 'manhattan') as CountryID;
  let topPer100k = 0;
  for (const c of vals) {
    const v = (c.I / Math.max(1, c.pop)) * 100_000;
    if (v >= topPer100k) { topPer100k = v; top = c; topId = c.id as any; }
  }

  let hospCapacityMulUp = 1;
  for (const u of Object.values(st.upgrades || {})) {
    if (!u.purchased) continue;
    const e: any = u.effects;
    if (typeof e.hospCapacityMul === 'number') hospCapacityMulUp *= e.hospCapacityMul;
  }
  const respCapMul = HOSP_RESPONSE_TIERS[st.hospResponseTier]?.capMul ?? 1;
  const capPerPerson = (st.params.hospCapacityPerK / 1000) * hospCapacityMulUp * respCapMul;
  let maxHospLoad = 0;
  for (const c of vals) {
    const cap = capPerPerson * Math.max(1, c.pop);
    const load = cap > 0 ? (c.H / cap) : 0;
    if (load > maxHospLoad) maxHospLoad = load;
  }

  return {
    totalPop,
    totalI,
    totalD,
    totalH,
    per100kI,
    top,
    topId,
    topPer100k,
    topPolicy: top.policy,
    maxHospLoad: Math.min(2, Math.max(0, maxHospLoad)),
  };
}

function pick<T>(arr: readonly T[], rng: () => number) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const bags: Record<string, number[]> = {};
function pickFromBag(key: string, templates: string[], rng: () => number) {
  const bag = bags[key] || (bags[key] = []);
  if (bag.length === 0) {
    bag.push(...templates.map((_, i) => i));
    shuffle(bag, rng);
  }
  const idx = bag.pop()!;
  return templates[idx];
}

type Ctx = {
  day: number;
  mode: WorldState['mode'];
  pathogenType: PathogenType;
  topBoro: string;
  topPolicy: string;
  per100k: string;
  cure: string;
  hosp: string;
  debt: string;
  res: string;
  vol: string;
  burst: string;
  loc: string;
  cele: string;
};

function fmt(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : '0.0';
}

function makeCtx(st: WorldState, m: Metrics, rng: () => number): Ctx {
  const loc = pick(NYC_LOCS.filter(l => l.boro === (m.topId as any)).map(l => l.name), rng)
    || pick(NYC_LOCS.map(l => l.name), rng);
  const cele = pick(FAKE_CELEBS, rng);
  return {
    day: Math.floor(st.day),
    mode: st.mode,
    pathogenType: st.pathogenType,
    topBoro: m.top.name,
    topPolicy: m.topPolicy,
    per100k: fmt(m.per100kI, m.per100kI >= 100 ? 0 : 1),
    cure: fmt(st.cureProgress, 1),
    hosp: fmt(m.maxHospLoad * 100, 0),
    debt: String(Math.round(Math.max(0, Math.min(100, st.mutationDebt || 0)))),
    res: fmt(Math.max(0, Math.min(1, st.antibioticResistance || 0)) * 100, 0),
    vol: fmt(Math.max(0, Math.min(1, st.bioweaponVolatility || 0)) * 100, 0),
    burst: String(Math.max(0, Math.floor(st.fungusBurstDaysLeft || 0))),
    loc,
    cele,
  };
}

function fill(tpl: string, ctx: Ctx) {
  return tpl
    .replaceAll('{day}', String(ctx.day))
    .replaceAll('{topBoro}', ctx.topBoro)
    .replaceAll('{topPolicy}', ctx.topPolicy)
    .replaceAll('{per100k}', ctx.per100k)
    .replaceAll('{cure}', ctx.cure)
    .replaceAll('{hosp}', ctx.hosp)
    .replaceAll('{debt}', ctx.debt)
    .replaceAll('{res}', ctx.res)
    .replaceAll('{vol}', ctx.vol)
    .replaceAll('{burst}', ctx.burst)
    .replaceAll('{loc}', ctx.loc)
    .replaceAll('{cele}', ctx.cele)
    .replaceAll('{mode}', ctx.mode === 'controller' ? 'response' : 'outbreak')
    .replaceAll('{pathogen}', ctx.pathogenType);
}

const EARLY = [
  "Whispers at {loc}: a 'weird cough' is going around {topBoro}.",
  "A bodega sign in {topBoro} reads: 'MASKS RECOMMENDED'... then gets crossed out... then re-written.",
  "A late-night caller to WNYC: 'I'm fine. My roommate is not.' ({per100k}/100k).",
  "{cele} posts: 'NYC feels... different tonight.' Replies: 12k. DMs: closed.",
  "The MTA quietly adds more sanitizer stations near {topBoro}.",
  "Rumor: one bartender at {loc} has started serving everything 'to-go' only.",
  "A school in {topBoro} sends a cautious email: 'out of an abundance of caution...'",
  "A deli owner in {topBoro}: 'If you're sick, stay home. If you're not, tip.'",
  "A hand-written flyer at {loc}: 'If you can read this, you can wash your hands.'",
  "City Hall aide: 'It's probably nothing.' City Hall aide, later: 'It's not nothing.'",
  "Someone tapes a thermometer to a lamppost in {topBoro}. It's wildly inaccurate. People still line up.",
  "A tourist at {loc}: 'Is this normal?' A local: 'No.'",
  "A commuter mutters: 'Not again.' Nobody laughs.",
  "Subway announcement: 'Please stand clear of the closing doors.' Nobody stands clear of anything.",
  "A 'free masks' box appears outside {loc}. It empties fast.",
  "A group chat name changes to: 'cough watch'.",
  "A neighborhood forum in {topBoro} argues about windows. Lots of windows.",
  "Someone in {topBoro} starts tracking case rumors on a spreadsheet. It's already messy.",
  "Street vendor: 'Hot dogs and hand sanitizer.' Both selling out.",
  "The word of the day in {topBoro}: 'precaution'.",
];

const WATCH = [
  "Health officials: 'No panic.' Everyone: 'So... panic later?' ({per100k}/100k).",
  "At {loc}, two strangers argue about airflow like it's a sport.",
  "A pharmacy in {topBoro} puts up a sign: 'Limit 2 per customer.' Nobody knows '2 of what'.",
  "A subway musician in {topBoro} switches to instrumentals only. 'Less aerosols,' he says.",
  "{cele} cancels a pop-up event: 'for vibes and safety.'",
  "A manager at {loc}: 'If you feel sick, don't come in.' A patron: 'I feel broke.'",
  "A rumor spreads faster than the outbreak: 'It started in {topBoro}.'",
  "NYC parks: more joggers, fewer smiles.",
  "Someone in {topBoro} starts carrying a tiny bottle of soap like it's luxury perfume.",
  "A local radio host: 'We'll keep you updated.' Voice: already tired.",
  "Grocery shelves in {topBoro}: the pasta aisle goes first, as tradition demands.",
  "A subway conductor in {topBoro} sounds like he's reading the news through a sigh.",
  "A community board in {topBoro} debates 'temporary closures.' The word 'temporary' does heavy lifting.",
  "A cafe in {topBoro} moves tables outside. The sidewalk becomes a dining room.",
  "Line outside {loc}: not for drinks. For 'just to be around people.'",
  "A delivery rider says: 'I'm seeing more gloves. Not more tips.'",
  "A nurse texts: 'We're okay.' Then: 'We're not.'",
  "Public messaging in {topBoro}: 'Stay calm.' People: 'Stay home.'",
  "A chain email makes the rounds. It is wrong in 12 different ways.",
  "Someone tries to start a 'handshake revival' at {loc}. It fails instantly.",
];

const SURGE = [
  "Hospital triage in {topBoro} goes 'temporary' in a hallway. Hallways are now a plan.",
  "A mayoral presser: 'We are monitoring.' Reporter: 'Monitoring what, exactly?'",
  "The phrase 'essential worker' returns to the city's vocabulary with a thud.",
  "{loc} is closed tonight. That sentence lands like bad weather.",
  "Crowd at {loc}: smaller, quieter, watching phones.",
  "A neighborhood in {topBoro} starts doing groceries for elders. The spreadsheet gets serious.",
  "MTA ridership dips. Then dips again. Then stays down.",
  "A comedian bombs with a cough joke. Nobody forgives it.",
  "{cele} tweets: 'I thought I was invincible.' Deletes it. Too late.",
  "A line outside urgent care in {topBoro} forms before sunrise.",
  "NYC EMS notes: response times are 'strained'. The quotes are implied.",
  "A parent in {topBoro}: 'The kids are fine.' The parent is not fine.",
  "The corner store in {topBoro} starts selling masks next to gum. Civilization, summarized.",
  "Sanitation crews in {topBoro} do an extra pass. People clap. It feels wrong.",
  "A ferry announcement: 'Service delays.' The crowd doesn't even groan anymore.",
  "An office in {topBoro} announces 'hybrid work.' Everyone hears: 'good luck.'",
  "A protest sign appears: 'DON'T SACRIFICE US.' The counter-sign: 'DON'T SACRIFICE THEM.'",
  "A neighborhood rumor: 'It's peaking.' Nobody believes it.",
  "Subway platform in {topBoro}: fewer tourists, more quiet math.",
  "A street preacher declares: 'This is a test.' A passerby: 'We're failing.'",
];

const CRISIS = [
  "Hospitals report load {hosp}% in hotspots. 'Hotspot' stops sounding like a metaphor.",
  "In {topBoro}, sirens become the city's metronome.",
  "A pop-up clinic opens near {loc}. The line wraps. The line stays.",
  "A food pantry in {topBoro} runs low. Donations run later than need.",
  "Public messaging changes tone: less 'recommend', more 'must'.",
  "A subway worker in {topBoro}: 'We're still here.' Voice says: 'why.'",
  "A nightly ritual begins: checking case counts like weather. Weather feels kinder.",
  "{cele} appears in a PSA. Nobody makes jokes about it this time.",
  "A borough official in {topBoro}: 'We're moving to {topPolicy}.' The room exhales and tenses.",
  "A bartender at {loc}: 'We're not heroes. We're just open.'",
  "Two friends in {topBoro} argue: 'It's the policy.' 'No, it's the people.' Both are right.",
  "A supermarket in {topBoro} limits entry. The sidewalk becomes a waiting room.",
  "An ambulance idles. Then another. Then three. Everyone notices.",
  "A nurse in {topBoro}: 'We're out of beds.' A reporter: 'How many?' A laugh: 'Beds.'",
  "A church near {loc} turns into a supply depot. Boxes everywhere. Silence too.",
  "A late-night text: 'Are you okay?' A reply: 'Define okay.'",
  "A subway ad in {topBoro} still says 'COME SEE A SHOW'. Nobody tears it down.",
  "A landlord in {topBoro} posts a notice about 'cleanliness'. Tenants post a notice about rent.",
  "Someone in {topBoro} starts selling fake cures. People still buy them.",
  "The city's mood: tired, sharp, and still moving.",
];

const CURE = [
  "Lab update: cure progress {cure}%. The applause is careful.",
  "Trial results leak: 'promising.' Commenters fight over what 'promising' means.",
  "{cele} announces a fundraiser 'for research'. It actually raises money. Weirdly wholesome.",
  "A biotech rep says: 'Weeks, not months.' Everyone hears: 'months.'",
  "A headline: 'Cure races outbreak.' The next headline: 'Outbreak sprints.'",
  "A hospital in {topBoro} posts a photo: scientists in masks, thumbs up. Everyone stares at it too long.",
  "A rumor at {loc}: 'They've got something.' The rumor is the city's favorite drug.",
  "A grant gets approved. Someone cheers. Someone else says: 'Finally.'",
  "A researcher says: 'We're close.' Their eyes say: 'we're tired.'",
  "Cure progress {cure}%. City reaction: hope with a side of suspicion.",
];

const POLICY = [
  "{topBoro} shifts policy toward {topPolicy}. Sidewalk conversations get shorter.",
  "A borough official: 'Compliance is improving.' A resident: 'We're just exhausted.'",
  "A sign at {loc}: 'No entry without a mask.' Under it: 'We mean it.'",
  "A subway poster reads: 'Protect each other.' Someone adds: 'PLEASE.'",
  "Policy debate on local TV: nobody wins; everyone talks louder.",
  "A rumor: 'Restrictions coming.' People rush to do the thing they'll soon be told not to do.",
  "A neighborhood forum in {topBoro} declares: 'Lock it down.' Another thread: 'Never.'",
  "A politician says: 'Targeted measures.' Everyone asks: 'targeted at who?'",
  "A shopkeeper at {loc}: 'Rules change daily.' A customer: 'So do prices.'",
  "Curfew talk spreads. Nightlife quietly goes missing first.",
];

const TYPE_SPECIFIC: Record<PathogenType, string[]> = {
  virus: [
    "Genomics note: '{pathogen}' shows new drift markers in {topBoro}.",
    "A scientist: 'It's mutating.' A resident: 'So am I.'",
    "Lab memo: mutation pressure rising. Debates get heated. Coffee gets colder.",
    "Variant chatter spikes. Nobody agrees on names, everyone agrees on worry.",
    "{cele} says: 'I read a thread.' Scientists: 'Please don't.'",
  ],
  bacteria: [
    "Clinicians warn of resistance signals in {topBoro}. 'It's stubborn,' one says.",
    "Pharmacy note: antibiotic demand surges. Stewardship posters go up anyway.",
    "A lab tech: 'It's not fast. It's persistent.' The city hears: 'forever.'",
    "An ER doc: 'Treatments are less effective.' Nobody posts a laughing emoji.",
    "A headline: 'Bacterial clusters linger in {topBoro}.' People stop using the word 'cluster'.",
  ],
  fungus: [
    "Weather watch: spore conditions trending up over {topBoro}.",
    "Public Works: 'Check your vents.' The city: '...my what?'",
    "A subway tunnel crew reports 'unusual growth'. Nobody likes that phrase.",
    "A building super in {topBoro}: 'We're sealing cracks.' Cracks: not the only thing spreading.",
    "A rumor at {loc}: 'It's in the walls.' Nobody laughs. Someone leaves.",
  ],
  bioweapon: [
    "Briefing leak: 'unusual lethality profile' flagged in {topBoro}.",
    "A responder: 'This isn't normal.' A second responder: 'Nothing is.'",
    "Hospitals request containment support. 'Now' is the most repeated word.",
    "{cele} goes silent. That's the loud part.",
    "An emergency memo: 'Do not speculate.' Everyone speculates anyway.",
  ],
};

const VIRUS_DEBT = [
  "Genomics note: mutation debt trending high ({debt}/100). Scientists argue. The city coughs.",
  "A lab tech at {loc}: 'We're chasing a moving target.' The target moves again.",
  "Variant drift accelerates. Nobody likes the new nickname. Everyone uses it anyway.",
  "A press briefing mentions 'genome instability'. The comments section misreads it as 'ghost instability'.",
  "A grad student in {topBoro}: 'The tree keeps branching.' Someone whispers: 'So do we.'",
];

const BACTERIA_RESIST = [
  "Resistance estimate rises to {res}%. Clinicians stop saying 'standard protocol' out loud.",
  "A pharmacy sign: 'Antibiotics limited.' The next sign: 'Please stop yelling at staff.'",
  "An ER doc: 'This is the part where it doesn't respond.' Silence does the rest.",
  "Stewardship teams beg the public: 'Do not self-medicate.' The public tries anyway.",
  "Hospital note: 'Multiple drug classes less effective.' The city hears: 'less hope.'",
];

const FUNGUS_BURST = [
  "Spore burst day {burst}: air feels heavier in {topBoro}. Masks come back without a debate.",
  "Ventilation crews in {topBoro} work overnight. Nobody complains about noise this time.",
  "A building super near {loc}: 'We sealed gaps.' The gaps disagree.",
  "Weather app adds a new line: 'spore advisory'. Everyone updates instantly.",
  "Someone writes 'CHECK YOUR FILTERS' on a subway ad. Nobody takes it down.",
];

const BIO_VOL = [
  "Briefing leak: volatility estimate {vol}%. The phrase 'high consequence' starts appearing everywhere.",
  "A responder at {loc}: 'We need containment now.' Nobody asks what 'now' means.",
  "Hospitals report sudden severity spikes. Nobody calls it a spike twice.",
  "A memo says 'lethality profile shifting'. Everyone reads it as 'goodbye profile'.",
  "A quiet, blunt headline: 'This looks engineered.' City mood: colder.",
];

const CORDON = [
  "Containment cordon expands around {topBoro}. Commutes reroute. Tempers reroute too.",
  "A checkpoint appears near {loc}. People argue about freedom. Nobody argues about fear.",
  "City advisory: 'Avoid non-essential travel.' The essential list grows by the hour.",
  "A borough official: 'Short-term disruption.' Residents: 'Define short.'",
  "A helicopter circles {topBoro}. That's the whole update.",
];

const TREATMENT = [
  "Field hospitals rising in {topBoro}. The parking lot is now a ward.",
  "Community health workers deployed across {topBoro}. Knock knock. Thermometer check.",
  "{topBoro} activates experimental antiviral protocol. Early results: cautiously encouraging.",
  "Mobile ICU fleet spotted circling {topBoro}. Six-hour loops. No rest.",
  "Sewage surveillance in {topBoro} detects spike 5 days before clinical data confirms it.",
  "Emergency triage expansion in {topBoro}: hallway beds, repurposed lobbies, 12-hour shifts.",
  "Monoclonal antibody shipment arrives at {topBoro}. Armed escort. Refrigerated truck. Political allocation.",
  "{topBoro} hospitals rotating antibiotic classes weekly. The pathogen adapts; so do they.",
  "Ferry medevac running double shifts to Staten Island. The Verrazzano is a lifeline tonight.",
  "Mutual aid pharmacy network in Brooklyn pooling stock. No price gouging. Not tonight.",
  "Corporate wellness mandate in Manhattan: daily screenings in every tower above 40 floors.",
  "Bilingual health navigators deployed in Queens. 40 languages. Zero questions about papers.",
  "{topBoro} palliative care teams activated. Chaplains on speed-dial. The hardest conversation.",
  "Rapid genomic sequencing hub in {topBoro}: 48-hour variant ID. The pathogen has a name now.",
  "Spore decontamination crews in hazmat gear scrubbing HVAC systems across {topBoro}.",
];

// Curated intro events that fire deterministically on the first few days
const INTRO_EVENTS: Record<number, string> = {
  1: "A cough echoes through the subway. Nobody notices. Yet.",
  2: "Hospital admissions are slightly above average this week. Probably nothing.",
  3: "A cluster of fevers in {topBoro}. The health department is investigating.",
};

export function maybeGenerateWorldEvent(st: WorldState, rng: () => number = Math.random): string | null {
  const m = computeMetrics(st);
  const ctx = makeCtx(st, m, rng);

  // Fire curated intro events on days 1-3
  const dayIndex = Math.floor(st.day);
  const introEvent = INTRO_EVENTS[dayIndex];
  if (introEvent) return fill(introEvent, ctx);

  let tier: 'early'|'watch'|'surge'|'crisis' = 'early';
  if (m.per100kI >= 250 || m.maxHospLoad >= 1.05) tier = 'crisis';
  else if (m.per100kI >= 90) tier = 'surge';
  else if (m.per100kI >= 20) tier = 'watch';

  // Not every day needs a flavor line; scale with severity.
  const p = tier === 'early' ? 0.35 : tier === 'watch' ? 0.5 : tier === 'surge' ? 0.65 : 0.8;
  if (rng() > p) return null;

  const cordonsActive = Boolean(st.cordonDaysLeft && Object.keys(st.cordonDaysLeft).some((k) => (st.cordonDaysLeft as any)[k] > 0));
  const highDebt = st.pathogenType === 'virus' && (st.mutationDebt || 0) >= 60;
  const highRes = st.pathogenType === 'bacteria' && (st.antibioticResistance || 0) >= 0.55;
  const burst = st.pathogenType === 'fungus' && (st.fungusBurstDaysLeft || 0) > 0;
  const highVol = st.pathogenType === 'bioweapon' && (st.bioweaponVolatility || 0) >= 0.55;

  const pickTypeSpecific = rng() < 0.22;
  let tpl: string;
  if (cordonsActive && rng() < 0.28) {
    tpl = pickFromBag('cordon', CORDON, rng);
  } else if (burst && rng() < 0.55) {
    tpl = pickFromBag('fungusBurst', FUNGUS_BURST, rng);
  } else if (highDebt && rng() < 0.5) {
    tpl = pickFromBag('virusDebt', VIRUS_DEBT, rng);
  } else if (highRes && rng() < 0.5) {
    tpl = pickFromBag('bacteriaRes', BACTERIA_RESIST, rng);
  } else if (highVol && rng() < 0.5) {
    tpl = pickFromBag('bioVol', BIO_VOL, rng);
  } else if (pickTypeSpecific) {
    tpl = pickFromBag(`type:${st.pathogenType}`, TYPE_SPECIFIC[st.pathogenType], rng);
  } else if (m.maxHospLoad >= 0.7 && rng() < 0.22) {
    tpl = pickFromBag('treatment', TREATMENT, rng);
  } else if (m.maxHospLoad >= 1.0 && rng() < 0.45) {
    tpl = pickFromBag('crisis', CRISIS, rng);
  } else if (st.cureProgress >= 35 && rng() < 0.25) {
    tpl = pickFromBag('cure', CURE, rng);
  } else if (rng() < 0.18) {
    tpl = pickFromBag('policy', POLICY, rng);
  } else if (tier === 'surge' || tier === 'crisis') {
    tpl = pickFromBag('surge', SURGE.concat(CRISIS), rng);
  } else if (tier === 'watch') {
    tpl = pickFromBag('watch', WATCH, rng);
  } else {
    tpl = pickFromBag('early', EARLY, rng);
  }
  return fill(tpl, ctx);
}
