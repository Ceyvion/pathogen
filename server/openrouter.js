const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

function tryParseJsonLoose(s) {
  if (typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch {}
  // Try to salvage JSON if wrapped with extra text.
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = s.slice(start, end + 1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}

export async function openRouterChatCompletions({
  apiKey,
  model,
  messages,
  response_format,
  temperature,
  max_tokens,
  plugins,
  referer,
  title,
}) {
  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(referer ? { 'HTTP-Referer': referer } : {}),
      ...(title ? { 'X-Title': title } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      response_format,
      temperature,
      max_tokens,
      plugins,
    }),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = (json && typeof json.error === 'string')
      ? json.error
      : (json && typeof json.error?.message === 'string')
        ? json.error.message
        : (json && typeof json.message === 'string')
          ? json.message
          : `OpenRouter HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return json;
}

export function extractAssistantJson(openRouterResponse) {
  const content = openRouterResponse?.choices?.[0]?.message?.content;
  if (content && typeof content === 'object') return content;
  return tryParseJsonLoose(content);
}
