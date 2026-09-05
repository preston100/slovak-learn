const { safeEqual, jsonResponse } = require('./lib/shared');

const STT_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const STT_TIMEOUT_MS = 8500;
const ALLOWED_ENCODINGS = ['WEBM_OPUS', 'OGG_OPUS'];

function friendlySttError(status, errText) {
  let parsed;
  try {
    parsed = JSON.parse(errText);
  } catch {
    parsed = null;
  }
  const message = parsed && parsed.error && parsed.error.message;

  if (status === 403) {
    return (
      'Access denied (403). The "Cloud Speech-to-Text API" likely isn\'t enabled yet for this Google Cloud project ' +
      '(it\'s separate from Text-to-Speech — both need to be enabled on the same key). ' + (message || '')
    );
  }
  return `Google Speech-to-Text error (${status}). ${message || (errText || '').slice(0, 300)}`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  const sttKey = process.env.GOOGLE_TTS_API_KEY;

  if (!sitePassword || !sttKey) {
    return jsonResponse(500, { error: 'Server is not configured. Missing SITE_PASSWORD or GOOGLE_TTS_API_KEY.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const { password, audioBase64, encoding, sampleRateHertz } = body;

  if (typeof password !== 'string' || !safeEqual(password, sitePassword)) {
    return jsonResponse(401, { error: 'Incorrect or missing site password.' });
  }

  if (typeof audioBase64 !== 'string' || !audioBase64) {
    return jsonResponse(400, { error: 'No audio was provided.' });
  }
  if (ALLOWED_ENCODINGS.indexOf(encoding) === -1) {
    return jsonResponse(400, { error: 'Unsupported audio encoding.' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${STT_URL}?key=${encodeURIComponent(sttKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          encoding: encoding,
          sampleRateHertz: sampleRateHertz || 48000,
          languageCode: 'sk-SK',
        },
        audio: { content: audioBase64 },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const message = err.name === 'AbortError' ? 'Transcription took too long. Please try again.' : err.message || 'Could not reach Google Speech-to-Text.';
    return jsonResponse(502, { error: message });
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return jsonResponse(502, { error: friendlySttError(res.status, errText) });
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return jsonResponse(502, { error: 'Google Speech-to-Text returned an unreadable response.' });
  }

  const transcript =
    data && data.results && data.results[0] && data.results[0].alternatives && data.results[0].alternatives[0]
      ? data.results[0].alternatives[0].transcript
      : '';

  return jsonResponse(200, { ok: true, transcript: transcript });
};
