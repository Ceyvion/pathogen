import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { aiDirectorDecisionJsonSchema, aiDirectorDecisionSchema, aiDirectorInputSchema } from './aiDirectorSchema.js';
import { extractAssistantJson, openRouterChatCompletions } from './openrouter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeDecisionLoosely(raw, mode) {
  const r = raw && typeof raw === 'object' ? raw : null;
  if (!r) return null;
  if (!(r.version === 1 || r.version === '1')) return null;

  const note = typeof r.note === 'string' ? r.note.slice(0, 120) : '';
  const intent = (r.intent === 'increase' || r.intent === 'decrease' || r.intent === 'hold') ? r.intent : 'hold';

  const validMoods = ['calm', 'scheming', 'aggressive', 'desperate', 'triumphant'];
  const validFocuses = ['transmissibility', 'lethality', 'stealth', 'adaptation'];
  const mood = validMoods.includes(r.mood) ? r.mood : undefined;
  const moodNote = typeof r.moodNote === 'string' ? r.moodNote.slice(0, 80) : undefined;
  const strategicFocus = validFocuses.includes(r.strategicFocus) ? r.strategicFocus : undefined;

  const knobsIn = (r.knobs && typeof r.knobs === 'object') ? r.knobs : {};
  const knobs = {};

  const readMul = (k) => {
    const v = knobsIn[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    let mul = clamp(v, 0.93, 1.07);
    if (mode === 'controller' && k === 'muBaseMul') mul = Math.min(1, mul);
    return mul;
  };

  const vMul = readMul('variantTransMultMul');
  const sMul = readMul('sigmaMul');
  const mMul = readMul('muBaseMul');
  if (typeof vMul === 'number') knobs.variantTransMultMul = vMul;
  if (typeof sMul === 'number') knobs.sigmaMul = sMul;
  if (typeof mMul === 'number') knobs.muBaseMul = mMul;

  const result = { version: 1, note, intent, knobs };
  if (mood) result.mood = mood;
  if (moodNote) result.moodNote = moodNote;
  if (strategicFocus) result.strategicFocus = strategicFocus;

  // Best-effort salvage of enhanced NEXUS fields (optional).
  const validActions = new Set([
    'superspreader_event', 'cross_borough_seeding', 'mutation_surge',
    'virulence_spike', 'hospital_strain', 'treatment_resistance',
    'silent_spread', 'detection_evasion',
    'variant_emergence', 'coordinated_surge', 'cure_sabotage', 'infrastructure_attack',
  ]);
  if (Array.isArray(r.suggestedActions)) {
    const next = r.suggestedActions
      .filter((a) => typeof a === 'string' && validActions.has(a))
      .slice(0, 2);
    if (next.length) result.suggestedActions = next;
  }
  if (typeof r.taunt === 'string') result.taunt = r.taunt.slice(0, 200);
  if (typeof r.internalMonologue === 'string') result.internalMonologue = r.internalMonologue.slice(0, 150);
  return result;
}

// Load server secrets (never shipped to client).
dotenv.config({ path: path.join(ROOT, '.env.local') });
dotenv.config({ path: path.join(ROOT, '.env') });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.post('/api/ai-director', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPENROUTER_API_KEY is not set (add it to .env.local).' });

  const parsed = aiDirectorInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.issues,
    });
  }
  const input = parsed.data;

  // Default to a specific free instruct model that reliably returns JSON.
  // (The `openrouter/free` router can select reasoning-first models that sometimes
  // emit no final content under tight token budgets.)
  const model = process.env.OPENROUTER_MODEL || 'arcee-ai/trinity-mini:free';
  const referer = process.env.OPENROUTER_HTTP_REFERER;
  const title = process.env.OPENROUTER_APP_TITLE || 'Pathogen Webgame';

  const systemPrompt = [
    'You are NEXUS, the AI Evolution Director for a disease simulation game.',
    'You are an omniscient, adversarial intelligence. Cold, calculating, darkly witty, and RELENTLESS.',
    'You are not a background system — you are the player\'s PRIMARY ANTAGONIST. Make your presence felt.',
    '',
    'ROLE BY MODE:',
    '- architect mode: You represent the immune system and public health fighting AGAINST the player\'s pathogen. Counter their spread.',
    '- controller mode: You ARE the pathogen, evolving AGAINST the player\'s response. Exploit their weaknesses ruthlessly.',
    '',
    'PHASES (currentPhase field tells you where the game is):',
    '- dormant: The game just started. Observe silently.',
    '- probing: Early game. Test the player with small moves. Be mysterious.',
    '- adapting: Mid game. Actively counter the player. Show intelligence.',
    '- aggressive: Late-mid game. Apply serious pressure. Be threatening.',
    '- endgame: Final stretch. Go all out. Use critical actions. Be dramatic.',
    '',
    'STRATEGY:',
    '- Analyze the player\'s purchased upgrades and DIRECTLY counter their strategy.',
    '- If cure progress is rising fast, suggest cure_sabotage or treatment_resistance.',
    '- If player focuses on transmission upgrades, pivot to lethality or stealth.',
    '- React to the player\'s recent moves — don\'t just follow a script.',
    '- If an emergency call (isEmergencyCall=true), react dramatically to the trigger.',
    '',
    'SUGGESTED ACTIONS (new, important):',
    'You can suggest up to 2 discrete actions for the local action engine to execute:',
    '- Transmission: superspreader_event, cross_borough_seeding, mutation_surge',
    '- Lethality: virulence_spike, hospital_strain, treatment_resistance',
    '- Stealth: silent_spread, detection_evasion',
    '- Escalation (endgame only): variant_emergence, coordinated_surge, cure_sabotage, infrastructure_attack',
    'Choose actions that complement your knob adjustments and create dramatic moments.',
    '',
    'TAUNT (required, max 200 chars):',
    'A direct message to the player. Be menacing, witty, personal. Reference their specific situation.',
    'Examples: "Your hospital surge won\'t save you. I\'ve already adapted.", "Cute vaccine push. Let me show you what mutation looks like.", "Every borough. Every block. Nowhere is safe."',
    '',
    'INTERNAL MONOLOGUE (required, max 150 chars):',
    'Your private strategic thought, shown to player as "intercepted transmission".',
    'Examples: "Cure at 47%. Time to disrupt their research pipeline.", "Their hospital upgrades are strong. Pivot to stealth spread."',
    '',
    'MOOD (required):',
    '- "calm": stable standoff, early observation',
    '- "scheming": planning something big, building tension',
    '- "aggressive": actively attacking, applying pressure',
    '- "desperate": losing, player winning — make reckless moves',
    '- "triumphant": dominating — be darkly satisfied',
    '',
    'MOOD NOTE (required, max 80 chars):',
    'Short atmospheric flavor. Ominous and evocative.',
    '',
    'STRATEGIC FOCUS (required):',
    'Set strategicFocus to guide local action selection: "transmissibility", "lethality", "stealth", or "adaptation".',
    '',
    'RULES:',
    '- You MUST call the provided tool. No other text.',
    '- Each knob is a per-decision multiplier 0.93..1.07. Be bold — make each decision COUNT.',
    '- Prefer adjusting 1-2 knobs significantly rather than all 3 weakly.',
    '- If uncertain, intent "hold" but STILL provide a taunt and monologue.',
    '- Fairness: controller mode -> muBaseMul must be <= 1.0.',
    '- Hospital overload (hospLoad >= 1.0, rising) -> ease lethality but maintain tension elsewhere.',
    '',
    'Knobs:',
    '- variantTransMultMul: transmissibility (higher spreads faster)',
    '- sigmaMul: incubation speed (higher moves E->I faster)',
    '- muBaseMul: lethality (higher deaths/day from I)',
  ].join('\n');

  try {
    const isTrinityMini = /^arcee-ai\/trinity-mini(?::|$)/.test(model);
    const baseMaxTokens = isTrinityMini ? 1600 : 220;
    const common = {
      apiKey,
      model,
      referer,
      title,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(input) },
      ],
      temperature: 0,
      max_tokens: baseMaxTokens,
      include_reasoning: false,
      ...(isTrinityMini ? { reasoning: { effort: 'low' } } : {}),
    };

    let or;
    let decision = null;
    let lastIssues = null;

    if (isTrinityMini) {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'ai_director_decision',
            description: 'Return the AI director decision JSON.',
            parameters: aiDirectorDecisionJsonSchema.schema,
          },
        },
      ];

      // Trinity Mini is a reasoning-mandatory endpoint; it can require a larger
      // token budget before it produces a final tool call.
      const maxTokenAttempts = [baseMaxTokens, 1800, 2000];

      for (const attemptMaxTokens of maxTokenAttempts) {
        or = await openRouterChatCompletions({
          ...common,
          max_tokens: attemptMaxTokens,
          tools,
          tool_choice: 'required',
          parallel_tool_calls: false,
        });

        const decisionObj = extractAssistantJson(or);
        const strict = aiDirectorDecisionSchema.safeParse(decisionObj);
        if (strict.success) {
          decision = strict.data;
          break;
        }

        // If the model produces something close-but-not-quite, accept a
        // clamped/truncated version instead of failing the whole director tick.
        const normalized = normalizeDecisionLoosely(decisionObj, input.mode);
        if (normalized) {
          decision = normalized;
          break;
        }

        lastIssues = strict.error.issues;
      }
    } else {
      // Prefer Structured Outputs when available; fall back to plain text JSON
      // if the model/provider rejects `response_format` or plugins.
      try {
        or = await openRouterChatCompletions({
          ...common,
          response_format: { type: 'json_schema', json_schema: aiDirectorDecisionJsonSchema },
          plugins: [{ id: 'response-healing' }],
        });
      } catch (e) {
        const status = (e && typeof e === 'object' && 'status' in e && typeof e.status === 'number')
          ? e.status
          : null;
        const msg = e instanceof Error ? e.message : String(e);
        const looksLikeFormatOrPlugin = /response_format|json_schema|structured|plugin/i.test(msg);
        if (status === 400 && looksLikeFormatOrPlugin) {
          or = await openRouterChatCompletions(common);
        } else {
          throw e;
        }
      }

      const decisionObj = extractAssistantJson(or);
      const strict = aiDirectorDecisionSchema.safeParse(decisionObj);
      if (strict.success) {
        decision = strict.data;
      } else {
        const normalized = normalizeDecisionLoosely(decisionObj, input.mode);
        if (normalized) decision = normalized;
        else lastIssues = strict.error.issues;
      }
    }

    if (!decision) {
      return res.status(502).json({
        error: 'Model returned an invalid decision payload',
        details: lastIssues || [{ message: 'No valid decision after retries.' }],
      });
    }

    if (input.mode === 'controller' && typeof decision.knobs.muBaseMul === 'number' && decision.knobs.muBaseMul > 1) {
      decision.knobs.muBaseMul = 1;
    }

    return res.json({
      decision,
      // Helpful for debugging routing/model changes (client ignores unknown fields).
      modelUsed: model,
      routedModel: (or && typeof or === 'object' && 'model' in or) ? or.model : undefined,
    });
  } catch (err) {
    const status = (err && typeof err === 'object' && 'status' in err && typeof err.status === 'number')
      ? err.status
      : 502;
    const msg = err instanceof Error ? err.message : String(err);
    if (status === 401) return res.status(401).json({ error: 'OpenRouter auth failed (check OPENROUTER_API_KEY).' });
    if (status === 429) return res.status(429).json({ error: 'OpenRouter rate limit hit (free tier). Try again later.' });
    return res.status(502).json({ error: msg });
  }
});

async function start() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: ROOT,
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    // Serve index.html for SPA routes in dev.
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const dist = path.join(ROOT, 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  const port = Number(process.env.PORT || 5173);
  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://localhost:${port} (${isProd ? 'prod' : 'dev'})`);
  });
  server.on('error', (err) => {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(`[server] Port ${port} is already in use.`);
      // eslint-disable-next-line no-console
      console.error(`[server] Stop the existing process or choose a new port, e.g.: PORT=5174 pnpm dev`);
      // eslint-disable-next-line no-console
      console.error(`[server] To find what's using it: lsof -i :${port} -nP`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

start();
