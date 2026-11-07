const { safeEqual, jsonResponse } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { usersStore } = require('./lib/blobs');
const { accountFor, dailyLimit } = require('./lib/plans');
const { takeQuota, countUsage } = require('./lib/usage');

// The developer / beta access code (SITE_PASSWORD — once the site's front
// door, now an unlock for full access). Redeeming it marks the signed-in
// account as beta, so it's unlocked on every device and the server knows to
// give it the full quotas. A 4-digit code could be guessed by trying them
// all, so each account gets 10 tries a day.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method Not Allowed' });

  const expected = process.env.SITE_PASSWORD;
  if (!expected) return jsonResponse(500, { error: 'The access code is not configured on the server.' });

  const auth = requireSession(event);
  if (auth.error) return jsonResponse(401, { error: 'Create an account or sign in first, then enter your code.' });
  const email = auth.session.email;

  let code;
  try {
    code = JSON.parse(event.body || '{}').password;
  } catch {
    return jsonResponse(400, { error: 'Invalid request.' });
  }
  if (typeof code !== 'string' || !code.trim()) return jsonResponse(400, { error: 'Please enter your code.' });

  const account = await accountFor(email);
  if (!account.user && account.plan !== 'dev') return jsonResponse(404, { error: 'Account not found. Please sign in again.' });
  if (account.plan === 'dev' || account.plan === 'beta' || account.plan === 'paid') {
    return jsonResponse(200, { ok: true, plan: account.plan, already: true });
  }

  const attempt = await takeQuota(email, 'code', dailyLimit('code', account.plan));
  if (!attempt.ok) {
    return jsonResponse(429, { error: 'Too many tries today. Please try again tomorrow, or contact us for help.' });
  }
  if (!safeEqual(code.trim(), expected)) {
    await countUsage('access-code-wrong');
    return jsonResponse(401, { error: 'That code is not right. Please check it and try again.' });
  }

  const user = account.user || {};
  await usersStore().setJSON(email, { ...user, plan: 'beta', planChosen: true, betaUnlockedAt: new Date().toISOString() });
  await countUsage('access-code-redeemed');
  return jsonResponse(200, { ok: true, plan: 'beta' });
};
