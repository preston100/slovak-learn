const { safeEqual, jsonResponse } = require('./lib/shared');

const GITHUB_API = 'https://api.github.com';

async function githubRequest(path, token, options = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'slovak-learn-site',
      ...(options.headers || {}),
    },
  });
  return res;
}

function mergeGrammar(existing, incoming) {
  const existingIds = new Set(existing.map((t) => t.id));
  const merged = existing.slice();

  incoming.forEach((topic) => {
    let id = topic.id || 'topic';
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${topic.id || 'topic'}-${suffix}`;
      suffix += 1;
    }
    existingIds.add(id);
    merged.push({ ...topic, id });
  });

  return merged;
}

function mergeVocab(existing, incoming) {
  const merged = existing.map((g) => ({ topic: g.topic, words: g.words.slice() }));

  incoming.forEach((group) => {
    const match = merged.find((g) => g.topic.trim().toLowerCase() === (group.topic || '').trim().toLowerCase());
    if (match) {
      const existingSk = new Set(match.words.map((w) => w.sk));
      (group.words || []).forEach((w) => {
        if (!existingSk.has(w.sk)) {
          match.words.push(w);
          existingSk.add(w.sk);
        }
      });
    } else {
      merged.push({ topic: group.topic, words: group.words || [] });
    }
  });

  return merged;
}

async function updateFile(repo, branch, token, filePath, transform) {
  const getRes = await githubRequest(`/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`, token);
  if (!getRes.ok) {
    const t = await getRes.text().catch(() => '');
    throw new Error(`Could not read ${filePath} from GitHub (${getRes.status}). ${t.slice(0, 200)}`);
  }
  const fileData = await getRes.json();
  const currentText = Buffer.from(fileData.content, 'base64').toString('utf8');
  const currentJson = JSON.parse(currentText);

  const updatedJson = transform(currentJson);
  const updatedText = JSON.stringify(updatedJson, null, 2) + '\n';

  const putRes = await githubRequest(`/repos/${repo}/contents/${filePath}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Add content to ${filePath} via Add Content tool`,
      content: Buffer.from(updatedText, 'utf8').toString('base64'),
      sha: fileData.sha,
      branch,
    }),
  });

  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '');
    throw new Error(`Could not save ${filePath} to GitHub (${putRes.status}). ${t.slice(0, 200)}`);
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;
  const githubBranch = process.env.GITHUB_BRANCH || 'main';

  if (!sitePassword || !githubToken || !githubRepo) {
    return jsonResponse(500, {
      error: 'Server is not configured. Missing SITE_PASSWORD, GITHUB_TOKEN, or GITHUB_REPO.',
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const { password, grammarTopics, vocabGroups } = body;

  if (typeof password !== 'string' || !safeEqual(password, sitePassword)) {
    return jsonResponse(401, { error: 'Incorrect or missing site password.' });
  }

  const hasGrammar = Array.isArray(grammarTopics) && grammarTopics.length > 0;
  const hasVocab = Array.isArray(vocabGroups) && vocabGroups.length > 0;

  if (!hasGrammar && !hasVocab) {
    return jsonResponse(400, { error: 'Nothing to save.' });
  }

  try {
    if (hasGrammar) {
      await updateFile(githubRepo, githubBranch, githubToken, 'data/grammar.json', (current) =>
        mergeGrammar(current, grammarTopics)
      );
    }
    if (hasVocab) {
      await updateFile(githubRepo, githubBranch, githubToken, 'data/vocab.json', (current) =>
        mergeVocab(current, vocabGroups)
      );
    }
  } catch (err) {
    return jsonResponse(502, { error: err.message || 'Failed to save content to GitHub.' });
  }

  return jsonResponse(200, { ok: true, grammarUpdated: hasGrammar, vocabUpdated: hasVocab });
};
