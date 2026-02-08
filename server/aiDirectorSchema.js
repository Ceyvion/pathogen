import { z } from 'zod';

const nexusActionEnum = [
  'superspreader_event', 'cross_borough_seeding', 'mutation_surge',
  'virulence_spike', 'hospital_strain', 'treatment_resistance',
  'silent_spread', 'detection_evasion',
  'variant_emergence', 'coordinated_surge', 'cure_sabotage', 'infrastructure_attack',
];

export const aiDirectorInputSchema = z.object({
  version: z.literal(1),
  mode: z.enum(['architect', 'controller']),
  difficulty: z.enum(['casual', 'normal', 'brutal']),
  pacing: z.enum(['slow', 'normal', 'fast']),
  speed: z.union([z.literal(1), z.literal(3), z.literal(10)]),
  dayIndex: z.number().int().min(0),
  snapshot: z.object({
    dayIndex: z.number().int().min(0),
    totalPop: z.number().nonnegative(),
    totalI: z.number().nonnegative(),
    totalH: z.number().nonnegative(),
    prevalence: z.number().nonnegative(),
    per100k: z.number().nonnegative(),
    hospLoad: z.number().nonnegative(),
    cureProgress: z.number().min(0).max(100),
    intensity: z.number().min(0).max(1),
  }).strict(),
  trend: z.object({
    direction: z.enum(['rising', 'falling', 'flat']),
    intensityNow: z.number().min(0).max(1),
    intensities7d: z.array(z.number().min(0).max(1)).max(7),
  }).strict(),
  knobs: z.object({
    variantTransMultMul: z.number().min(0.75).max(1.25),
    sigmaMul: z.number().min(0.75).max(1.25),
    muBaseMul: z.number().min(0.75).max(1.25),
  }).strict(),
  params: z.object({
    beta: z.number().positive(),
    sigma: z.number().positive(),
    muBase: z.number().positive(),
    variantTransMult: z.number().positive(),
  }).strict(),
  // Player intelligence for NEXUS
  playerUpgrades: z.array(z.string()).max(50).optional(),
  cureProgress: z.number().min(0).max(100).optional(),
  totalDecisions: z.number().int().min(0).optional(),
  currentMood: z.enum(['calm', 'scheming', 'aggressive', 'desperate', 'triumphant']).optional(),
  // Enhanced context for NEXUS action engine
  currentPhase: z.enum(['dormant', 'probing', 'adapting', 'aggressive', 'endgame']).optional(),
  activeNexusEffects: z.array(z.string()).max(20).optional(),
  isEmergencyCall: z.boolean().optional(),
  emergencyReason: z.string().max(100).optional(),
}).strict();

const moodEnum = ['calm', 'scheming', 'aggressive', 'desperate', 'triumphant'];
const focusEnum = ['transmissibility', 'lethality', 'stealth', 'adaptation'];

export const aiDirectorDecisionSchema = z.object({
  version: z.literal(1),
  note: z.string().max(120),
  intent: z.enum(['increase', 'decrease', 'hold']),
  mood: z.enum(moodEnum).optional(),
  moodNote: z.string().max(80).optional(),
  strategicFocus: z.enum(focusEnum).optional(),
  knobs: z.object({
    variantTransMultMul: z.number().min(0.93).max(1.07).optional(),
    sigmaMul: z.number().min(0.93).max(1.07).optional(),
    muBaseMul: z.number().min(0.93).max(1.07).optional(),
  }).strict(),
  // Enhanced NEXUS output
  suggestedActions: z.array(z.enum(nexusActionEnum)).max(2).optional(),
  taunt: z.string().max(200).optional(),
  internalMonologue: z.string().max(150).optional(),
}).strict();

export const aiDirectorDecisionJsonSchema = {
  name: 'AiDirectorDecision',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'note', 'intent', 'knobs'],
    properties: {
      version: { type: 'integer', enum: [1] },
      note: { type: 'string', maxLength: 120 },
      intent: { type: 'string', enum: ['increase', 'decrease', 'hold'] },
      mood: { type: 'string', enum: moodEnum },
      moodNote: { type: 'string', maxLength: 80 },
      strategicFocus: { type: 'string', enum: focusEnum },
      knobs: {
        type: 'object',
        additionalProperties: false,
        properties: {
          variantTransMultMul: { type: 'number', minimum: 0.93, maximum: 1.07 },
          sigmaMul: { type: 'number', minimum: 0.93, maximum: 1.07 },
          muBaseMul: { type: 'number', minimum: 0.93, maximum: 1.07 },
        },
      },
      suggestedActions: {
        type: 'array',
        items: { type: 'string', enum: nexusActionEnum },
        maxItems: 2,
      },
      taunt: { type: 'string', maxLength: 200 },
      internalMonologue: { type: 'string', maxLength: 150 },
    },
  },
};
