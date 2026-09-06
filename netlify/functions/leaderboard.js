const { jsonResponse } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { usersStore, progressStore } = require('./lib/blobs');

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const users = usersStore();
  const progress = progressStore();

  const { blobs } = await users.list();

  const entries = await Promise.all(
    blobs.map(async (blob) => {
      const [user, userProgress] = await Promise.all([
        users.get(blob.key, { type: 'json' }),
        progress.get(blob.key, { type: 'json' }),
      ]);
      // Only name + streak are ever exposed here — never email, password
      // hash, or per-word stats.
      return { name: (user && user.name) || 'Unknown', streakCount: (userProgress && userProgress.streakCount) || 0 };
    })
  );

  entries.sort((a, b) => b.streakCount - a.streakCount);

  return jsonResponse(200, { ok: true, entries });
};
