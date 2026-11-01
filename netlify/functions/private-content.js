const { jsonResponse } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { isDevEmail } = require('./lib/plans');
const { contentStore, DEFAULT_CONTENT } = require('./lib/blobs');
const { mergeGrammar, mergeVocab } = require('./lib/contentMerge');

exports.handler = async function (event) {
  const auth = requireSession(event);
  if (auth.error) return auth.error;
  const email = auth.session.email;

  const store = contentStore();

  if (event.httpMethod === 'GET') {
    const content = await store.get(email, { type: 'json' });
    return jsonResponse(200, { ok: true, ...(content || DEFAULT_CONTENT) });
  }

  // Saving new content is part of Add Content, which only the developer
  // accounts have; reading your own additions stays open to everyone.
  if (event.httpMethod === 'POST') {
    if (!isDevEmail(email)) return jsonResponse(403, { error: 'Only the developer accounts can add content.' });
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body.' });
    }

    const { grammarTopics, vocabGroups } = body;
    const hasGrammar = Array.isArray(grammarTopics) && grammarTopics.length > 0;
    const hasVocab = Array.isArray(vocabGroups) && vocabGroups.length > 0;

    if (!hasGrammar && !hasVocab) {
      return jsonResponse(400, { error: 'Nothing to save.' });
    }

    const current = (await store.get(email, { type: 'json' })) || DEFAULT_CONTENT;
    const updated = {
      grammarTopics: hasGrammar ? mergeGrammar(current.grammarTopics, grammarTopics) : current.grammarTopics,
      vocabGroups: hasVocab ? mergeVocab(current.vocabGroups, vocabGroups) : current.vocabGroups,
    };

    await store.setJSON(email, updated);
    return jsonResponse(200, { ok: true, grammarUpdated: hasGrammar, vocabUpdated: hasVocab });
  }

  return jsonResponse(405, { error: 'Method Not Allowed' });
};
