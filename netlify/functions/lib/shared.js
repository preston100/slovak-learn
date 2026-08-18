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

// Gemini's free-tier Flash models occasionally return 503 "high demand" errors.
// These are transient, so a couple of short retries clears most of them up
// without the user having to notice or re-click anything.
async function callGeminiWithRetry(url, requestBody, maxRetries = 2) {
  let lastRes;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(600 * (attempt + 1));
      continue;
    }

    if (res.ok || res.status !== 503 || attempt === maxRetries) {
      return res;
    }

    lastRes = res;
    await sleep(600 * (attempt + 1));
  }
  return lastRes;
}

module.exports = { safeEqual, jsonResponse, callGeminiWithRetry };
