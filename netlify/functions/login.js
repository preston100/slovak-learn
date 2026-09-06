const { safeEqual, jsonResponse } = require('./lib/shared');
const { verifyPasswordHash, signSession } = require('./lib/auth');
const { normalizeEmail, usersStore } = require('./lib/blobs');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword || !process.env.SESSION_SECRET) {
    return jsonResponse(500, { error: 'Server is not configured. Missing SITE_PASSWORD or SESSION_SECRET.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const { sitePassword: providedSitePassword, email, password } = body;

  if (typeof providedSitePassword !== 'string' || !safeEqual(providedSitePassword, sitePassword)) {
    return jsonResponse(401, { error: 'Incorrect or missing site password.' });
  }

  const cleanEmail = normalizeEmail(email);
  const genericError = () => jsonResponse(401, { error: 'Incorrect email or password.' });

  if (!cleanEmail || typeof password !== 'string') return genericError();

  const user = await usersStore().get(cleanEmail, { type: 'json' });
  if (!user) return genericError();

  if (!verifyPasswordHash(password, user.salt, user.passwordHash)) return genericError();

  const token = signSession({ email: user.email, name: user.name });
  return jsonResponse(200, { ok: true, token, user: { name: user.name, email: user.email } });
};
