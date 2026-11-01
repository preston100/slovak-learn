const { jsonResponse } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { usersStore } = require('./lib/blobs');
const { accountFor } = require('./lib/plans');

// The signed-in account's plan, and the "Start Free Preview" choice (so the
// plan step isn't shown again at the next sign-in).
exports.handler = async function (event) {
  const auth = requireSession(event);
  if (auth.error) return auth.error;
  const email = auth.session.email;
  const account = await accountFor(email);

  if (event.httpMethod === 'GET') {
    return jsonResponse(200, { ok: true, plan: account.plan, planChosen: account.planChosen });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body.' });
    }
    if (body.action === 'start-free') {
      if (account.user && !account.user.planChosen) {
        await usersStore().setJSON(email, { ...account.user, planChosen: true });
      }
      return jsonResponse(200, { ok: true, plan: account.plan, planChosen: true });
    }
    return jsonResponse(400, { error: 'Unknown action.' });
  }

  return jsonResponse(405, { error: 'Method Not Allowed' });
};
