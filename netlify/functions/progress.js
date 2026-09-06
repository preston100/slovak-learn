const { jsonResponse } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { progressStore, DEFAULT_PROGRESS } = require('./lib/blobs');

const MAX_BODY_BYTES = 200 * 1024;

exports.handler = async function (event) {
  const auth = requireSession(event);
  if (auth.error) return auth.error;
  const email = auth.session.email;

  const store = progressStore();

  if (event.httpMethod === 'GET') {
    const progress = await store.get(email, { type: 'json' });
    return jsonResponse(200, { ok: true, progress: progress || DEFAULT_PROGRESS });
  }

  if (event.httpMethod === 'POST') {
    if ((event.body || '').length > MAX_BODY_BYTES) {
      return jsonResponse(400, { error: 'Progress payload is too large.' });
    }

    let progress;
    try {
      progress = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body.' });
    }

    // Client always sends its full current snapshot, so an overwrite is
    // correct — there's no concurrent-editor case to reconcile for one
    // person's own progress.
    await store.setJSON(email, progress);
    return jsonResponse(200, { ok: true });
  }

  return jsonResponse(405, { error: 'Method Not Allowed' });
};
