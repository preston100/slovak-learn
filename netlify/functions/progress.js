const { jsonResponse } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { progressStore, DEFAULT_PROGRESS } = require('./lib/blobs');
const { accountFor } = require('./lib/plans');
const { markActive } = require('./lib/usage');
const { mergeProgress } = require('../../js/progress-merge');

const MAX_BODY_BYTES = 200 * 1024;

exports.handler = async function (event) {
  const auth = requireSession(event);
  if (auth.error) return auth.error;
  const email = auth.session.email;

  const store = progressStore();

  // Progress, plus the account's plan, so one request at page load tells the
  // site both what's been done and what's unlocked.
  if (event.httpMethod === 'GET') {
    const [progress, account] = await Promise.all([store.get(email, { type: 'json' }), accountFor(email)]);
    return jsonResponse(200, {
      ok: true,
      progress: progress || DEFAULT_PROGRESS,
      account: { plan: account.plan, planChosen: account.planChosen },
    });
  }

  if (event.httpMethod === 'POST') {
    if ((event.body || '').length > MAX_BODY_BYTES) {
      return jsonResponse(400, { error: 'Progress payload is too large.' });
    }

    let incoming;
    try {
      incoming = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body.' });
    }

    // Merged into what's stored rather than replacing it: a second device,
    // or a fresh browser that hasn't loaded this account's progress yet,
    // can only add to it — never wipe it.
    const stored = await store.get(email, { type: 'json' });
    const merged = mergeProgress(stored || DEFAULT_PROGRESS, { ...incoming, updatedAt: Date.now() });
    await store.setJSON(email, merged);
    await markActive(email); // for the Analytics tab's last-7-days chart
    return jsonResponse(200, { ok: true, progress: merged });
  }

  return jsonResponse(405, { error: 'Method Not Allowed' });
};
