const { jsonResponse } = require('./lib/shared');
const { hashPassword, verifyPasswordHash, signSession } = require('./lib/auth');
const { normalizeEmail, usersStore, progressStore, DEFAULT_PROGRESS } = require('./lib/blobs');
const { accountFor } = require('./lib/plans');

const MAX_SNAPSHOT_BYTES = 200 * 1024;

// A snapshot is only ever trusted from the register flow itself (never
// login), so a fresh browser sending an empty one is the same as "start at
// zero" — no separate code path needed for that case.
function sanitizeProgressSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_BYTES) return null;
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    updatedAt: Date.now(),
    streakCount: Number(snapshot.streakCount) || 0,
    longestStreak: Number(snapshot.longestStreak) || 0,
    streakLastDate: typeof snapshot.streakLastDate === 'string' ? snapshot.streakLastDate : null,
    vocabStats: obj(snapshot.vocabStats),
    masteredWords: obj(snapshot.masteredWords),
    achievements: Array.isArray(snapshot.achievements) ? snapshot.achievements : [],
    roundProgress: obj(snapshot.roundProgress),
    roadmapProgress: obj(snapshot.roadmapProgress),
    timeSpentMs: Number(snapshot.timeSpentMs) || 0,
    dailyGoalTarget: Number(snapshot.dailyGoalTarget) || 10,
    dailyPracticeCount: obj(snapshot.dailyPracticeCount),
  };
}

async function signedIn(user) {
  const account = await accountFor(user.email);
  return jsonResponse(200, {
    ok: true,
    token: signSession({ email: user.email, name: user.name }),
    user: { name: user.name, email: user.email },
    account: { plan: account.plan, planChosen: account.planChosen },
  });
}

async function register(body) {
  const { name, email, password, confirmPassword, acceptTerms, progressSnapshot } = body;
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  const cleanEmail = normalizeEmail(email);

  if (!cleanName) return jsonResponse(400, { error: 'Please enter your name.' });
  if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) return jsonResponse(400, { error: 'Please enter a valid email address.' });
  if (typeof password !== 'string' || password.length < 8) {
    return jsonResponse(400, { error: 'Your password needs at least 8 characters.' });
  }
  if (password !== confirmPassword) return jsonResponse(400, { error: "The two passwords don't match." });
  if (acceptTerms !== true) {
    return jsonResponse(400, { error: 'Please agree to the Terms of Service and Privacy Policy.' });
  }

  const users = usersStore();
  if (await users.get(cleanEmail, { type: 'json' })) {
    return jsonResponse(409, { error: 'An account with that email already exists. Try signing in instead.' });
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    name: cleanName,
    email: cleanEmail,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
    termsAcceptedAt: new Date().toISOString(),
    plan: 'free', // stored explicitly: accounts with no plan predate plans and are beta
  };
  await users.setJSON(cleanEmail, user);
  await progressStore().setJSON(cleanEmail, sanitizeProgressSnapshot(progressSnapshot) || { ...DEFAULT_PROGRESS });
  return signedIn(user);
}

async function login(body) {
  const cleanEmail = normalizeEmail(body.email);
  const genericError = () => jsonResponse(401, { error: 'Incorrect email or password.' });
  if (!cleanEmail || typeof body.password !== 'string') return genericError();

  const user = await usersStore().get(cleanEmail, { type: 'json' });
  if (!user || !verifyPasswordHash(body.password, user.salt, user.passwordHash)) return genericError();
  return signedIn(user);
}

// Create Account and Sign In. Anyone can create an account now (it starts
// on the Free Preview); the old site code is the beta access code instead
// (see verify-password.js).
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method Not Allowed' });
  if (!process.env.SESSION_SECRET) {
    return jsonResponse(500, { error: 'Server is not configured. Missing SESSION_SECRET.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  if (body.action === 'register') return register(body);
  if (body.action === 'login') return login(body);
  return jsonResponse(400, { error: 'Unknown action.' });
};
