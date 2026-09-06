const crypto = require('crypto');
const { jsonResponse } = require('./shared');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // "sign in again about once a week"
const SCRYPT_KEYLEN = 64;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash };
}

function verifyPasswordHash(password, salt, expectedHash) {
  const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

// Hand-rolled signed session token (base64url(payload).base64url(HMAC)) rather
// than a JWT library — this app has 1-2 users, and a ~20-line function gives
// the same guarantee (tamper-evident, time-limited) a dependency would.
function signSession({ email, name }) {
  const secret = process.env.SESSION_SECRET;
  const payload = JSON.stringify({ email, name, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS });
  const payloadPart = base64url(payload);
  const sig = crypto.createHmac('sha256', secret).update(payloadPart).digest('base64url');
  return `${payloadPart}.${sig}`;
}

function verifySession(token) {
  const secret = process.env.SESSION_SECRET;
  if (typeof token !== 'string' || !token.includes('.')) return null;

  const [payloadPart, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadPart).digest('base64url');

  const sigBuf = Buffer.from(sig || '');
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload.email || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

// Reads the Authorization header, verifies the session, and returns
// { session } on success or { error: <401 jsonResponse> } on failure — so
// callers can `const auth = requireSession(event); if (auth.error) return auth.error;`
function requireSession(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  const session = token ? verifySession(token) : null;

  if (!session) {
    return { error: jsonResponse(401, { error: 'Your session has expired. Please log in again.' }) };
  }
  return { session };
}

module.exports = { hashPassword, verifyPasswordHash, signSession, verifySession, requireSession };
