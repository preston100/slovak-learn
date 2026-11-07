const { jsonResponse, callCloudTTS } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { accountFor, hasFullAccess, dailyLimit } = require('./lib/plans');
const { takeQuota, countUsage } = require('./lib/usage');

// Speaks arbitrary text with the same Slovak Wavenet voice as the rest of the
// app, WITHOUT saving it to the repo. generate-audio exists for the fixed
// phrase list — every clip there is committed and reused forever, which is
// right for vocabulary but wrong for one-off generated example sentences that
// are different every time.
const MAX_CHARS = 300;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const ttsKey = process.env.GOOGLE_TTS_API_KEY;
  if (!ttsKey) {
    return jsonResponse(500, { error: 'Server is not configured. Missing GOOGLE_TTS_API_KEY.' });
  }

  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const account = await accountFor(auth.session.email);
  if (!hasFullAccess(account.plan)) {
    return jsonResponse(403, { error: 'Example sentences are part of Pro.', upgrade: true });
  }
  const quota = await takeQuota(auth.session.email, 'speak', dailyLimit('speak', account.plan));
  if (!quota.ok) return jsonResponse(429, { error: "That's today's sentence audio. It resets tomorrow.", quota: true });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_CHARS) : '';
  if (!text) {
    return jsonResponse(400, { error: 'Text is required.' });
  }

  let res;
  try {
    res = await callCloudTTS(ttsKey, text);
  } catch (err) {
    return jsonResponse(502, { error: err.message || 'Text-to-speech failed.' });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return jsonResponse(res.status, { error: `Google TTS error (${res.status}). ${errText.slice(0, 200)}` });
  }

  const data = await res.json();
  if (!data || !data.audioContent) {
    return jsonResponse(502, { error: 'Google TTS returned no audio.' });
  }

  await countUsage('speak');
  return jsonResponse(200, { ok: true, audioBase64: data.audioContent });
};
