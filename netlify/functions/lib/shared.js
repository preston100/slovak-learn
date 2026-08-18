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

// Freshly-launched flagship models (like the current "-latest" alias) tend to
// get hit with a capacity crunch right after release. Falling back to the
// lighter "-lite" model spreads load across a separate, usually less
// congested capacity pool, and it's lower-latency too.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

function geminiUrl(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

async function callGemini(apiKey, requestBody) {
  const startedAt = Date.now();
  let lastRes;
  let lastErr;

  for (const model of GEMINI_MODELS) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < 1200) break; // not enough time left to make another attempt worthwhile

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), remaining);

    let res;
    try {
      res = await fetch(geminiUrl(model, apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err.name === 'AbortError' ? new Error('Gemini took too long to respond. Please try again.') : err;
      continue;
    }
    clearTimeout(timeoutId);

    if (res.ok) return res;

    if (res.status === 503 || res.status === 429) {
      // 503 = temporary overload, 429 = rate/quota limit — each Gemini model
      // has its own separate quota, so a 429 on one doesn't mean the other
      // is blocked too. Worth trying the next model either way.
      lastRes = res;
      continue;
    }

    // Other errors (bad key, bad request, etc.) affect every model equally.
    return res;
  }

  if (lastRes) return lastRes;
  if (lastErr) throw lastErr;
  throw new Error('Gemini took too long to respond. Please try again.');
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

module.exports = { safeEqual, jsonResponse, callGemini, friendlyGeminiError };
