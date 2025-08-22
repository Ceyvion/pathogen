import type { Story } from '../state/types';

export const STORIES: Story[] = [
  {
    id: 'controller_prologue',
    title: 'First Wave: Hold the Line',
    mode: 'controller',
    description: 'Stabilize NYC during the first surge. Keep hospitals afloat and buy time for a vaccine.',
    upgrades: {
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
    },
    objectives: [
      { id: 'cure60', title: 'Reach 60% cure progress', type: 'reach_cure', target: 60 },
      { id: 'peakI', title: 'Keep peak I below 150k', type: 'limit_peak_I', target: 150_000 },
      { id: 'survive', title: 'Survive 90 days', type: 'days_survived', target: 90 },
    ],
  },
  {
    id: 'architect_patient_zero',
    title: 'Patient Zero: Urban Spread',
    mode: 'architect',
    description: 'Seed infection stealthily and outpace the cure across the boroughs.',
    upgrades: {
      // Transmission – urban focus
      apz_tx1: { id: 'apz_tx1', name: 'Urban Transit Shedding', branch: 'transmission', cost: 8, desc: '+12% transmission via subways', effects: { betaMul: 1.12 } },
      apz_tx2: { id: 'apz_tx2', name: 'Household Spread', branch: 'transmission', cost: 14, desc: '+10% transmission (home clusters)', effects: { betaMul: 1.10 }, prereqs: ['apz_tx1'] },
      apz_tx3: { id: 'apz_tx3', name: 'Neighborhood Clusters', branch: 'transmission', cost: 18, desc: '+10% incubation rate, +6% transmission', effects: { sigmaMul: 1.10, betaMul: 1.06 }, prereqs: ['apz_tx2'] },
      apz_tx4: { id: 'apz_tx4', name: 'Workplace Spillover', branch: 'transmission', cost: 22, desc: '+12% transmission (weekday bias)', effects: { betaMul: 1.12 }, prereqs: ['apz_tx3'] },
      // Symptoms – stealth → shedding
      apz_sym1: { id: 'apz_sym1', name: 'Asymptomatic Carriers', branch: 'symptoms', cost: 12, desc: 'Stealth: undercut policy (×1.3)', effects: { policyResistMul: 1.3 } },
      apz_sym2: { id: 'apz_sym2', name: 'Cough Variant', branch: 'symptoms', cost: 18, desc: '+9% transmission, +0.1 DNA/day', effects: { betaMul: 1.09, dnaRateAdd: 0.1 }, prereqs: ['apz_sym1'] },
      apz_sym3: { id: 'apz_sym3', name: 'Aerosolized Droplets', branch: 'symptoms', cost: 22, desc: '+10% transmission, −5% recovery', effects: { betaMul: 1.10, gammaRecMul: 0.95 }, prereqs: ['apz_sym2'] },
      apz_sym4: { id: 'apz_sym4', name: 'Systemic Impact', branch: 'symptoms', cost: 26, desc: '+0.15 DNA/day', effects: { dnaRateAdd: 0.15 }, prereqs: ['apz_sym3'] },
      // Abilities – cure pressure + survivability
      apz_ab1: { id: 'apz_ab1', name: 'Immune Escape', branch: 'abilities', cost: 16, desc: '-7% recovery speed', effects: { gammaRecMul: 0.93 } },
      apz_ab2: { id: 'apz_ab2', name: 'Genetic Reshuffle', branch: 'abilities', cost: 22, desc: 'Slow cure (−25%)', effects: { cureRateMul: 0.75 }, prereqs: ['apz_ab1'] },
      apz_ab3: { id: 'apz_ab3', name: 'Cold Resistant', branch: 'abilities', cost: 16, desc: '+6% transmission (cold season)', effects: { betaMul: 1.06 } },
      apz_ab4: { id: 'apz_ab4', name: 'Policy Evasion', branch: 'abilities', cost: 20, desc: 'Undercut policy (×1.4 resist)', effects: { policyResistMul: 1.4 }, prereqs: ['apz_ab1'] },
      apz_ab5: { id: 'apz_ab5', name: 'Recombination Burst', branch: 'abilities', cost: 30, desc: 'Slow cure (−15%) and +8% transmission', effects: { cureRateMul: 0.85, betaMul: 1.08 }, prereqs: ['apz_ab2'] },
    },
    objectives: [
      { id: 'infect_all', title: 'Infect all five boroughs', type: 'infect_all', target: 5 },
      { id: 'cure_lt_50', title: 'Reach 50% city infected before 50% cure', type: 'reach_cure', target: 50 },
    ],
  },
];
