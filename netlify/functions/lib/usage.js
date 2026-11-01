const { normalizeEmail, usageStore } = require('./blobs');

// Lightweight counters in Netlify Blobs: one document per day and one per
// month listing how many times each endpoint was called, plus one document
// per account per day for its quotas. Each update is a read-then-write, so
// two calls in the same instant can occasionally count once — fine for
// monitoring and for limits that only need to be roughly right.
function utcDay(date) {
  return (date || new Date()).toISOString().slice(0, 10);
}

async function addTo(key, name, by) {
  const store = usageStore();
  const doc = (await store.get(key, { type: 'json' })) || {};
  doc[name] = (doc[name] || 0) + by;
  await store.setJSON(key, doc);
}

// Counts one call to `name` (an endpoint, or e.g. "sentence-cache-hit").
// Never throws: monitoring must not break the feature it's counting.
async function countUsage(name, by) {
  const day = utcDay();
  try {
    await Promise.all([addTo('day/' + day, name, by || 1), addTo('month/' + day.slice(0, 7), name, by || 1)]);
  } catch (err) {
    console.error('usage counter failed', name, err && err.message);
  }
}

async function readUsage(day) {
  const store = usageStore();
  const [today, month] = await Promise.all([
    store.get('day/' + day, { type: 'json' }),
    store.get('month/' + day.slice(0, 7), { type: 'json' }),
  ]);
  return { today: today || {}, month: month || {} };
}

// Takes one unit of today's `kind` quota for this account. Returns
// { ok: false } (and takes nothing) once the limit is reached.
async function takeQuota(email, kind, limit) {
  if (limit <= 0) return { ok: false, used: 0, limit: 0 };
  const store = usageStore();
  const key = 'quota/' + utcDay() + '/' + normalizeEmail(email);
  const doc = (await store.get(key, { type: 'json' })) || {};
  const used = doc[kind] || 0;
  if (used >= limit) return { ok: false, used, limit };
  doc[kind] = used + 1;
  await store.setJSON(key, doc);
  return { ok: true, used: used + 1, limit };
}

module.exports = { utcDay, countUsage, readUsage, takeQuota };
