import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { aiDirectorDecisionJsonSchema, aiDirectorDecisionSchema, aiDirectorInputSchema } from './aiDirectorSchema.js';
import { extractAssistantJson, openRouterChatCompletions } from './openrouter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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
  const model = process.env.OPENROUTER_MODEL || 'arcee-ai/trinity-large-preview:free';
  const referer = process.env.OPENROUTER_HTTP_REFERER;
  const title = process.env.OPENROUTER_APP_TITLE || 'Pathogen Webgame';

  const systemPrompt = [
    'You are the AI Evolution Director for a disease simulation game.',
    '',
    'Goal: make small, safe, reversible parameter nudges for a *virus* so the tension matches pacing and the current intensity direction.',
    '',
    'Rules:',
    '- Output MUST be valid JSON matching the provided JSON schema.',
    '- Each knob value is a per-decision multiplier close to 1.0 (0.97..1.03). The game multiplies these into running knobs and clamps hard bounds.',
    '- Prefer adjusting at most ONE knob unless there is a clear, simple reason to touch more.',
    '- If uncertain, choose intent "hold" and provide an empty knobs object.',
    '- Fairness: if mode is "controller", never increase lethality: muBaseMul must be <= 1.0.',
    '- If hospital load is >= 1.0 (at/over capacity) and direction is "rising", strongly prefer reducing pressure (lower variantTransMultMul or sigmaMul). Avoid increases that would worsen overload.',
    '',
    'Knobs:',
    '- variantTransMultMul: transmissibility (higher spreads faster)',
    '- sigmaMul: incubation speed (higher moves E->I faster)',
    '- muBaseMul: lethality (higher deaths/day from I)',
    '',
    'Return only JSON. No markdown, no commentary.',
  ].join('\n');

  try {
    const or = await openRouterChatCompletions({
      apiKey,
      model,
      referer,
      title,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: { type: 'json_schema', json_schema: aiDirectorDecisionJsonSchema },
      plugins: [{ id: 'response-healing' }],
      temperature: 0.2,
      max_tokens: 220,
    });

    const decisionObj = extractAssistantJson(or);
    const decisionParsed = aiDirectorDecisionSchema.safeParse(decisionObj);
    if (!decisionParsed.success) {
      return res.status(502).json({
        error: 'Model returned an invalid decision payload',
        details: decisionParsed.error.issues,
      });
    }

    const decision = decisionParsed.data;
    if (input.mode === 'controller' && typeof decision.knobs.muBaseMul === 'number' && decision.knobs.muBaseMul > 1) {
      decision.knobs.muBaseMul = 1;
    }

    return res.json({ decision });
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
