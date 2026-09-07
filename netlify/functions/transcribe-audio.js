const { jsonResponse } = require('./lib/shared');
const { requireSession } = require('./lib/auth');

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GOOGLE_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const ALLOWED_ENCODINGS = ['WEBM_OPUS', 'OGG_OPUS'];

// Netlify kills the function at 10s, so both providers share one wall-clock
// budget — Groq gets first go, and Google only gets attempted if enough time
// is left for it to realistically finish.
const TOTAL_BUDGET_MS = 8500;
const GROQ_MAX_MS = 6000;
const GOOGLE_MIN_MS = 2500;

// Whisper is prone to inventing speech for near-silent audio (stock phrases,
// subtitle credits). Segments it is confident contain no speech are dropped.
const NO_SPEECH_THRESHOLD = 0.6;

function friendlyGoogleError(status, errText) {
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

async function withTimeout(ms, run) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// Whisper on Groq. Much stronger than Google for smaller languages like
// Slovak, and the free tier is far beyond what this app can use.
async function transcribeWithGroq(key, audioBuffer, encoding, expected, budgetMs) {
  const isOgg = encoding === 'OGG_OPUS';
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: isOgg ? 'audio/ogg' : 'audio/webm' }), isOgg ? 'clip.ogg' : 'clip.webm');
  form.append('model', 'whisper-large-v3');
  form.append('language', 'sk');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  // Whisper's prompt biases decoding toward expected vocabulary, the same
  // job Google's speechContexts does.
  if (expected) form.append('prompt', String(expected).slice(0, 200));

  const res = await withTimeout(budgetMs, (signal) =>
    fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form,
      signal,
    })
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const segments = Array.isArray(data.segments) ? data.segments : [];
  if (segments.length && segments.every((s) => (s.no_speech_prob || 0) > NO_SPEECH_THRESHOLD)) {
    return '';
  }
  return (data.text || '').trim();
}

async function transcribeWithGoogle(key, audioBase64, encoding, expected, budgetMs) {
  const res = await withTimeout(budgetMs, (signal) =>
    fetch(`${GOOGLE_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          encoding: encoding,
          // Always 48000, never the microphone's reported rate: Opus always
          // encodes at 48kHz regardless of what the mic hardware reports.
          sampleRateHertz: 48000,
          languageCode: 'sk-SK',
          // No `model` — Google's named models aren't offered for sk-SK and
          // the API hard-fails rather than falling back.
          speechContexts: expected ? [{ phrases: [String(expected).slice(0, 100)], boost: 20 }] : undefined,
        },
        audio: { content: audioBase64 },
      }),
      signal,
    })
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(friendlyGoogleError(res.status, errText));
  }

  const data = await res.json();
  const alt =
    data && data.results && data.results[0] && data.results[0].alternatives && data.results[0].alternatives[0];
  return (alt && alt.transcript ? alt.transcript : '').trim();
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const groqKey = process.env.GROQ_API_KEY;
  // Deliberately a separate key from GOOGLE_TTS_API_KEY — each is restricted
  // to just one Google API, so a leaked key can't be used for the other.
  const googleKey = process.env.GOOGLE_STT_API_KEY;

  if (!groqKey && !googleKey) {
    return jsonResponse(500, { error: 'Server is not configured. Missing GROQ_API_KEY and GOOGLE_STT_API_KEY.' });
  }

  const auth = requireSession(event);
  if (auth.error) return auth.error;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const { audioBase64, encoding, expected } = body;

  if (typeof audioBase64 !== 'string' || !audioBase64) {
    return jsonResponse(400, { error: 'No audio was provided.' });
  }
  if (ALLOWED_ENCODINGS.indexOf(encoding) === -1) {
    return jsonResponse(400, { error: 'Unsupported audio encoding.' });
  }

  const startedAt = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);
  let groqError = null;

  if (groqKey) {
    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const transcript = await transcribeWithGroq(
        groqKey,
        audioBuffer,
        encoding,
        expected,
        Math.min(GROQ_MAX_MS, remaining())
      );
      return jsonResponse(200, { ok: true, transcript: transcript, provider: 'groq' });
    } catch (err) {
      // Fall through to Google rather than failing outright, so an outage or
      // a rate limit doesn't take voice practice down entirely.
      groqError = err.name === 'AbortError' ? 'Groq timed out.' : err.message || 'Groq request failed.';
    }
  }

  if (googleKey && remaining() > GOOGLE_MIN_MS) {
    try {
      const transcript = await transcribeWithGoogle(googleKey, audioBase64, encoding, expected, remaining());
      return jsonResponse(200, { ok: true, transcript: transcript, provider: 'google' });
    } catch (err) {
      const message = err.name === 'AbortError' ? 'Transcription took too long. Please try again.' : err.message;
      return jsonResponse(502, { error: message });
    }
  }

  return jsonResponse(502, { error: groqError || 'Transcription is unavailable right now. Please try again.' });
};
