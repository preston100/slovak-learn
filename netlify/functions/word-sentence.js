const { jsonResponse, callGemini, friendlyGeminiError } = require('./lib/shared');
const { requireSession } = require('./lib/auth');

// One short, natural Slovak sentence using a given word, so any word can be
// heard in context rather than only in isolation. Text only — audio for the
// sentence comes from the separate speak endpoint, keeping each call well
// inside Netlify's 10s function timeout.
const SENTENCE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sentence: { type: 'STRING' },
    translation: { type: 'STRING' },
  },
  required: ['sentence', 'translation'],
};

function buildPrompt(sk, en) {
  return `You are a Slovak teacher helping an English-speaking beginner.

Write ONE short example sentence in Slovak that uses the word "${sk}"${en ? ` (which means "${en}")` : ''}.

Rules:
- Keep it beginner-friendly: at most 8 words, everyday vocabulary, present tense where possible.
- The sentence MUST contain the word "${sk}" (an inflected form of it is fine and often more natural).
- Correct, natural Slovak with proper diacritics.
- Also give a natural English translation of that sentence.
- Return JSON only.`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: 'Server is not configured. Missing GEMINI_API_KEY.' });
  }

  const auth = requireSession(event);
  if (auth.error) return auth.error;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const sk = typeof body.sk === 'string' ? body.sk.trim().slice(0, 100) : '';
  const en = typeof body.en === 'string' ? body.en.trim().slice(0, 100) : '';
  if (!sk) {
    return jsonResponse(400, { error: 'A word is required.' });
  }

  let res;
  try {
    res = await callGemini(apiKey, {
      contents: [{ role: 'user', parts: [{ text: buildPrompt(sk, en) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SENTENCE_SCHEMA,
        temperature: 0.4,
      },
    });
  } catch (err) {
    return jsonResponse(502, { error: err.message || 'Could not reach Gemini.' });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return jsonResponse(res.status, { error: friendlyGeminiError(res.status, errText) });
  }

  const data = await res.json();
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  let parsed;
  try {
    parsed = JSON.parse(text || '');
  } catch {
    return jsonResponse(502, { error: 'Gemini returned something unexpected. Please try again.' });
  }

  if (!parsed || !parsed.sentence) {
    return jsonResponse(502, { error: 'No sentence came back. Please try again.' });
  }

  return jsonResponse(200, {
    ok: true,
    sentence: String(parsed.sentence).trim(),
    translation: String(parsed.translation || '').trim(),
  });
};
