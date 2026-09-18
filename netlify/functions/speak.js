const { jsonResponse, callCloudTTS } = require('./lib/shared');
const { requireSession } = require('./lib/auth');

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

  return jsonResponse(200, { ok: true, audioBase64: data.audioContent });
};
