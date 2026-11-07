const crypto = require('crypto');
const { jsonResponse, callGemini, geminiText, friendlyGeminiError } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { sentenceStore } = require('./lib/blobs');
const { accountFor, hasFullAccess, dailyLimit } = require('./lib/plans');
const { takeQuota, countUsage } = require('./lib/usage');

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

// Every account shares one sentence per word: the first request for a word
// asks Gemini and stores the result, and every later one — from anyone, on
// any device — is answered from storage at no AI cost. The key is the word
// in a fixed form, so "Dobrý deň", "dobrý deň " and "DOBRÝ DEŇ" share it.
function cacheKey(sk) {
  const norm = sk.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  return 'v1/' + crypto.createHash('sha1').update(norm).digest('hex');
}

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

  // Example sentences come with full access (Pro, beta or dev).
  const account = await accountFor(auth.session.email);
  if (!hasFullAccess(account.plan)) {
    return jsonResponse(403, { error: 'Example sentences are part of Pro. Upgrade, or enter a beta code in your account.', upgrade: true });
  }

  const store = sentenceStore();
  const key = cacheKey(sk);
  const cached = await store.get(key, { type: 'json' }).catch(() => null);
  if (cached && cached.sentence) {
    await countUsage('sentence-cache-hit');
    return jsonResponse(200, { ok: true, sentence: cached.sentence, translation: cached.translation || '', cached: true });
  }

  // Only a cache miss costs anything, so only misses count against the limit.
  const quota = await takeQuota(auth.session.email, 'sentence', dailyLimit('sentence', account.plan));
  if (!quota.ok) return jsonResponse(429, { error: "That's today's new example sentences. They reset tomorrow.", quota: true });

  let res;
  try {
    // One short sentence doesn't need the bigger model: Flash-Lite first.
    res = await callGemini(apiKey, {
      contents: [{ role: 'user', parts: [{ text: buildPrompt(sk, en) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SENTENCE_SCHEMA,
      },
    }, { preferFast: true });
  } catch (err) {
    return jsonResponse(502, { error: err.message || 'Could not reach Gemini.' });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return jsonResponse(res.status, { error: friendlyGeminiError(res.status, errText) });
  }

  const data = await res.json().catch(() => null);
  const text = geminiText(data);

  let parsed;
  try {
    parsed = JSON.parse(text || '');
  } catch {
    return jsonResponse(502, { error: 'Gemini returned something unexpected. Please try again.' });
  }

  if (!parsed || !parsed.sentence) {
    return jsonResponse(502, { error: 'No sentence came back. Please try again.' });
  }

  const entry = {
    sentence: String(parsed.sentence).trim(),
    translation: String(parsed.translation || '').trim(),
    word: sk,
    createdAt: new Date().toISOString(),
  };
  await countUsage('word-sentence');
  // A failed save just means the next request asks Gemini again.
  await store.setJSON(key, entry).catch(() => {});
  return jsonResponse(200, { ok: true, sentence: entry.sentence, translation: entry.translation });
};
