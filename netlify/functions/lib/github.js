const GITHUB_API = 'https://api.github.com';

async function githubRequest(path, token, options = {}) {
  return fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'slovak-learn-site',
      ...(options.headers || {}),
    },
  });
}

// Reads a JSON file from the repo, runs `transform` on its parsed content, and
// commits the result back. If the file doesn't exist yet and `createIfMissing`
// is provided, starts from that value instead of erroring (used for files
// like the audio manifest that may not exist on first run).
async function updateJsonFile(repo, branch, token, filePath, transform, opts = {}) {
  const getRes = await githubRequest(`/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`, token);

  let currentJson;
  let sha;

  if (getRes.status === 404 && opts.createIfMissing !== undefined) {
    currentJson = opts.createIfMissing;
  } else if (getRes.ok) {
    const fileData = await getRes.json();
    currentJson = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));
    sha = fileData.sha;
  } else {
    const t = await getRes.text().catch(() => '');
    throw new Error(`Could not read ${filePath} from GitHub (${getRes.status}). ${t.slice(0, 200)}`);
  }

  const updatedJson = transform(currentJson);
  const updatedText = JSON.stringify(updatedJson, null, 2) + '\n';

  const putRes = await githubRequest(`/repos/${repo}/contents/${filePath}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: opts.message || `Update ${filePath}`,
      content: Buffer.from(updatedText, 'utf8').toString('base64'),
      sha,
      branch,
    }),
  });

  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '');
    throw new Error(`Could not save ${filePath} to GitHub (${putRes.status}). ${t.slice(0, 200)}`);
  }

  return updatedJson;
}

// Commits a binary file (e.g. a generated .wav). Looks up any existing sha
// first so re-generating the same file overwrites cleanly instead of erroring.
async function putBinaryFile(repo, branch, token, filePath, buffer, message) {
  const getRes = await githubRequest(`/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`, token);
  let sha;
  if (getRes.ok) {
    const fileData = await getRes.json();
    sha = fileData.sha;
  }

  const putRes = await githubRequest(`/repos/${repo}/contents/${filePath}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || `Add ${filePath}`,
      content: buffer.toString('base64'),
      sha,
      branch,
    }),
  });

  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '');
    throw new Error(`Could not save ${filePath} to GitHub (${putRes.status}). ${t.slice(0, 200)}`);
  }
}

module.exports = { githubRequest, updateJsonFile, putBinaryFile };
