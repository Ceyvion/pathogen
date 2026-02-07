import { z } from 'zod';

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
    variantTransMultMul: z.number().min(0.85).max(1.15),
    sigmaMul: z.number().min(0.85).max(1.15),
    muBaseMul: z.number().min(0.85).max(1.15),
  }).strict(),
  params: z.object({
    beta: z.number().positive(),
    sigma: z.number().positive(),
    muBase: z.number().positive(),
    variantTransMult: z.number().positive(),
  }).strict(),
}).strict();

export const aiDirectorDecisionSchema = z.object({
  version: z.literal(1),
  note: z.string().max(120),
  intent: z.enum(['increase', 'decrease', 'hold']),
  knobs: z.object({
    variantTransMultMul: z.number().min(0.97).max(1.03).optional(),
    sigmaMul: z.number().min(0.97).max(1.03).optional(),
    muBaseMul: z.number().min(0.97).max(1.03).optional(),
  }).strict(),
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
      knobs: {
        type: 'object',
        additionalProperties: false,
        properties: {
          variantTransMultMul: { type: 'number', minimum: 0.97, maximum: 1.03 },
          sigmaMul: { type: 'number', minimum: 0.97, maximum: 1.03 },
          muBaseMul: { type: 'number', minimum: 0.97, maximum: 1.03 },
        },
      },
    },
  },
};

