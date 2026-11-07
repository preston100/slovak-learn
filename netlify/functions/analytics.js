const { jsonResponse } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { usersStore, progressStore } = require('./lib/blobs');
const { requireDev, planOf } = require('./lib/plans');
const { readUsage, readActiveDays, utcDay } = require('./lib/usage');

const DAY_MS = 24 * 60 * 60 * 1000;

// When this account last did anything: the progress save time, or failing
// that (progress saved before saves were timestamped) the last practice day.
function lastActive(progress) {
  if (progress && progress.updatedAt) return Number(progress.updatedAt);
  if (progress && progress.streakLastDate) return Date.parse(progress.streakLastDate + 'T12:00:00Z') || 0;
  return 0;
}

function trueKeys(obj) {
  return obj && typeof obj === 'object' && !Array.isArray(obj) ? Object.keys(obj).filter((k) => obj[k]) : [];
}

// The developer dashboard: accounts, activity, API usage, and where
// learners struggle. Developer accounts only. Section titles and word
// translations are filled in by the site, which already has the course.
exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method Not Allowed' });
  const auth = requireDev(requireSession(event));
  if (auth.error) return auth.error;

  const users = usersStore();
  const progress = progressStore();
  const { blobs } = await users.list();
  const now = Date.now();

  const rows = await Promise.all(
    blobs.map(async (blob) => {
      const [user, p] = await Promise.all([users.get(blob.key, { type: 'json' }), progress.get(blob.key, { type: 'json' })]);
      return { email: blob.key, user: user || {}, progress: p || {} };
    })
  );

  const plans = { dev: 0, beta: 0, free: 0, paid: 0 };
  const funnel = {};
  const misses = {};
  let sectionsCleared = 0;
  let active7 = 0;
  let active30 = 0;

  const roster = rows.map(({ email, user, progress: p }) => {
    const plan = planOf(email, user);
    plans[plan] = (plans[plan] || 0) + 1;
    const cleared = trueKeys(p.roadmapProgress);
    cleared.forEach((id) => { funnel[id] = (funnel[id] || 0) + 1; });
    sectionsCleared += cleared.length;
    Object.keys(p.vocabStats || {}).forEach((sk) => {
      const m = Number(p.vocabStats[sk] && p.vocabStats[sk].misses) || 0;
      if (!m) return;
      misses[sk] = misses[sk] || { sk, misses: 0, learners: 0 };
      misses[sk].misses += m;
      misses[sk].learners += 1;
    });
    const last = lastActive(p);
    if (last && now - last <= 7 * DAY_MS) active7++;
    if (last && now - last <= 30 * DAY_MS) active30++;
    return {
      name: user.name || '',
      email,
      plan,
      createdAt: user.createdAt || null,
      streak: Number(p.streakCount) || 0,
      bestStreak: Math.max(Number(p.longestStreak) || 0, Number(p.streakCount) || 0),
      cleared,
      wordsMastered: trueKeys(p.masteredWords).length,
      lastActive: last || null,
    };
  });

  const today = utcDay();
  const [usage, days] = await Promise.all([readUsage(today), readActiveDays(7)]);

  return jsonResponse(200, {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    day: today,
    accounts: { total: rows.length, byPlan: plans },
    active: { last7: active7, last30: active30 },
    sectionsCleared,
    usage,
    days,
    roster,
    funnel,
    missedWords: Object.values(misses).sort((a, b) => b.misses - a.misses).slice(0, 60),
  });
};
