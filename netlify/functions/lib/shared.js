const crypto = require('crypto');

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

// Netlify's free tier hard-kills synchronous functions at 10 seconds, and a
// killed function returns a raw platform error with no useful message. So
// every attempt below is budgeted against a wall-clock deadline — each is
// aborted early enough that we can still return our own clean error response
// instead of getting killed by the platform.
const TOTAL_BUDGET_MS = 8500;

// Two models, each with its own capacity pool: the main Flash model, and the
// lighter, faster Flash-Lite as a fallback when it's overloaded or slow.
//
// The "-latest" aliases move to each new release. The current Flash
// (3.8) "thinks" at a medium level before answering by default, which alone
// can eat most of the 10 seconds — that's what made sentences and quizzes
// time out. These are short, simple jobs, so Flash is asked for its lowest
// level ("low"; it rejects "minimal"). Flash-Lite already defaults to
// minimal thinking, so it's left alone.
const GEMINI_MODELS = [
  { name: 'gemini-flash-latest', thinkingLevel: 'low' },
  { name: 'gemini-flash-lite-latest' },
];

// Time held back for the fallback, so a slow first model can never use up
// the whole budget and leave the fallback no chance to answer.
const FALLBACK_RESERVE_MS = 3000;

const TOO_SLOW = 'Gemini took too long to respond. Please try again.';

function geminiUrl(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function withThinkingLevel(requestBody, thinkingLevel) {
  if (!thinkingLevel) return requestBody;
  return {
    ...requestBody,
    generationConfig: {
      ...(requestBody.generationConfig || {}),
      thinkingConfig: { thinkingLevel },
    },
  };
}

async function postWithTimeout(url, body, ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw err.name === 'AbortError' ? new Error(TOO_SLOW) : err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// options.preferFast puts Flash-Lite first, for jobs too small to need the
// bigger model (one example sentence) where speed matters most.
async function callGemini(apiKey, requestBody, options) {
  const startedAt = Date.now();
  const models = options && options.preferFast ? GEMINI_MODELS.slice().reverse() : GEMINI_MODELS;
  const remainingMs = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);
  let lastRes;
  let lastErr;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isLast = i === models.length - 1;
    if (remainingMs() < 1200) break; // not enough time left to make another attempt worthwhile
    const attemptMs = () => (isLast ? remainingMs() : Math.max(1200, remainingMs() - FALLBACK_RESERVE_MS));

    let res;
    try {
      res = await postWithTimeout(geminiUrl(model.name, apiKey), withThinkingLevel(requestBody, model.thinkingLevel), attemptMs());
      // If a future model behind the alias refuses this thinking setting,
      // don't let that break the feature: ask again without it.
      if (res.status === 400 && model.thinkingLevel) {
        const errText = await res.text().catch(() => '');
        if (/thinking/i.test(errText) && remainingMs() >= 1200) {
          res = await postWithTimeout(geminiUrl(model.name, apiKey), requestBody, attemptMs());
        } else {
          res = new Response(errText, { status: 400 });
        }
      }
    } catch (err) {
      lastErr = err;
      continue;
    }

    if (res.ok) return res;

    if (res.status === 503 || res.status === 429 || res.status === 404) {
      // 503 = temporary overload, 429 = rate/quota limit, 404 = this alias
      // isn't available — all specific to one model, and each model has its
      // own quota, so it's worth trying the next one.
      lastRes = res;
      continue;
    }

    // Other errors (bad key, bad request, etc.) affect every model equally.
    return res;
  }

  if (lastRes) return lastRes;
  if (lastErr) throw lastErr;
  throw new Error(TOO_SLOW);
}

// The answer text from a Gemini response. Thinking models can attach
// thought parts too; those are skipped so only the real answer is read.
function geminiText(data) {
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts) || [];
  const part = parts.find((p) => typeof p.text === 'string' && !p.thought);
  return part ? part.text : '';
}

// Google Cloud Text-to-Speech — a separate, long-established Google product
// from the Gemini API (different key, different billing check), used here
// instead of Gemini's own TTS models because those failed unreliably in
// practice. sk-SK-Wavenet-A is Google's documented Slovak Wavenet voice.
const CLOUD_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const CLOUD_TTS_VOICE = { languageCode: 'sk-SK', name: 'sk-SK-Wavenet-A' };
const CLOUD_TTS_TIMEOUT_MS = 8500;

// Entries like "ujo / strýko" list alternatives; a voice would read the
// slash itself aloud ("lomka"), so it's spoken as a pause instead.
function speakableText(text) {
  return String(text)
    .replace(/\s*\/\/\s*/g, '. ')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/([.!?,])[.,]\s/g, '$1 '); // "stojí? / Koľko" → "stojí? Koľko", not "stojí?, Koľko"
}

async function callCloudTTS(apiKey, text) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOUD_TTS_TIMEOUT_MS);

  try {
    return await fetch(`${CLOUD_TTS_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: speakableText(text) },
        voice: CLOUD_TTS_VOICE,
        // Default output measures around -19 dB mean, which is quiet for
        // single words. Anything generated from now on comes out louder at
        // the source; the client also boosts playback, which covers the
        // files generated before this.
        audioConfig: { audioEncoding: 'MP3', volumeGainDb: 6 },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Google Text-to-Speech took too long to respond.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function friendlyGeminiError(status, errText) {
  if (status === 503) {
    return 'Gemini is under heavy load right now. Please wait a few seconds and try again.';
  }
  if (status === 429) {
    return "You've hit Gemini's rate limit (its free tier allows a limited number of requests per minute). Please wait about a minute and try again.";
  }
  return `Gemini API error (${status}). ${(errText || '').slice(0, 300)}`;
}

module.exports = { safeEqual, jsonResponse, callGemini, geminiText, callCloudTTS, friendlyGeminiError };
