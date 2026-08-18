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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Netlify's free tier hard-kills synchronous functions at 10 seconds, and a
// killed function returns a raw platform error with no useful message. So
// retries here are budgeted against a wall-clock deadline (not just a retry
// count) — each attempt is aborted early enough that we can still return our
// own clean error response instead of getting killed by the platform.
const TOTAL_BUDGET_MS = 8500;

async function callGeminiWithRetry(url, requestBody, maxRetries = 1) {
  const startedAt = Date.now();
  let lastRes;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < 1200) break; // not enough time left to make another attempt worthwhile

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), remaining);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Gemini took too long to respond. Please try again.');
      }
      if (attempt === maxRetries) throw err;
      continue;
    }
    clearTimeout(timeoutId);

    if (res.ok || res.status !== 503 || attempt === maxRetries) {
      return res;
    }

    lastRes = res;
    await sleep(250);
  }

  return lastRes;
}

module.exports = { safeEqual, jsonResponse, callGeminiWithRetry };
