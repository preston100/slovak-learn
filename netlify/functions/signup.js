const { safeEqual, jsonResponse } = require('./lib/shared');
const { hashPassword, signSession } = require('./lib/auth');
const { normalizeEmail, usersStore, progressStore, DEFAULT_PROGRESS } = require('./lib/blobs');

const MAX_SNAPSHOT_BYTES = 200 * 1024;

// A snapshot is only ever trusted from the signup flow itself (never login),
// so a fresh/incognito browser sending an empty one is indistinguishable
// from "start at zero" — no separate code path needed for that case.
function sanitizeProgressSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_BYTES) return null;

  return {
    streakCount: Number(snapshot.streakCount) || 0,
    streakLastDate: typeof snapshot.streakLastDate === 'string' ? snapshot.streakLastDate : null,
    vocabStats: snapshot.vocabStats && typeof snapshot.vocabStats === 'object' ? snapshot.vocabStats : {},
    achievements: Array.isArray(snapshot.achievements) ? snapshot.achievements : [],
    roundProgress: snapshot.roundProgress && typeof snapshot.roundProgress === 'object' ? snapshot.roundProgress : {},
    roadmapProgress: Array.isArray(snapshot.roadmapProgress) ? snapshot.roadmapProgress : [],
    timeSpentMs: Number(snapshot.timeSpentMs) || 0,
    dailyGoalTarget: Number(snapshot.dailyGoalTarget) || 10,
    dailyPracticeCount:
      snapshot.dailyPracticeCount && typeof snapshot.dailyPracticeCount === 'object'
        ? snapshot.dailyPracticeCount
        : { date: null, count: 0 },
  };
}

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

  const { sitePassword: providedSitePassword, name, email, password, progressSnapshot } = body;

  if (typeof providedSitePassword !== 'string' || !safeEqual(providedSitePassword, sitePassword)) {
    return jsonResponse(401, { error: 'Incorrect or missing site password.' });
  }

  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  const cleanEmail = normalizeEmail(email);

  if (!cleanName) return jsonResponse(400, { error: 'Name is required.' });
  if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) return jsonResponse(400, { error: 'A valid email is required.' });
  if (typeof password !== 'string' || password.length < 8) {
    return jsonResponse(400, { error: 'Password must be at least 8 characters.' });
  }

  const users = usersStore();
  const existing = await users.get(cleanEmail, { type: 'json' });
  if (existing) {
    return jsonResponse(409, { error: 'An account with that email already exists. Try logging in instead.' });
  }

  const { salt, hash } = hashPassword(password);
  await users.setJSON(cleanEmail, {
    name: cleanName,
    email: cleanEmail,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  });

  const seededProgress = sanitizeProgressSnapshot(progressSnapshot) || { ...DEFAULT_PROGRESS };
  await progressStore().setJSON(cleanEmail, seededProgress);

  const token = signSession({ email: cleanEmail, name: cleanName });
  return jsonResponse(200, { ok: true, token, user: { name: cleanName, email: cleanEmail } });
};
