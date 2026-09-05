const crypto = require('crypto');
const { safeEqual, jsonResponse, callCloudTTS } = require('./lib/shared');
const { updateJsonFile, putBinaryFile } = require('./lib/github');

// Keeps each invocation comfortably inside Netlify's 10-second function
// timeout: a handful of TTS calls plus their GitHub commits, not the whole
// vocabulary at once. The client loops over many small batches instead.
const MAX_PHRASES_PER_BATCH = 4;

function hashFor(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 16);
}

function friendlyCloudTTSError(status, errText) {
  let parsed;
  try {
    parsed = JSON.parse(errText);
  } catch {
    parsed = null;
  }
  const message = parsed && parsed.error && parsed.error.message;

  if (status === 403) {
    return (
      'Access denied (403). Almost always means either the "Cloud Text-to-Speech API" isn\'t enabled yet for this ' +
      'Google Cloud project, or billing isn\'t enabled on it — both are required even though usage at this scale is ' +
      'essentially free. ' + (message || '')
    );
  }
  if (status === 400 && message && /API key not valid/i.test(message)) {
    return 'The API key was rejected (400): API key not valid.';
  }
  return `Google TTS error (${status}). ${message || (errText || '').slice(0, 300)}`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  const ttsKey = process.env.GOOGLE_TTS_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;
  const githubBranch = process.env.GITHUB_BRANCH || 'main';

  if (!sitePassword || !ttsKey || !githubToken || !githubRepo) {
    return jsonResponse(500, {
      error: 'Server is not configured. Missing SITE_PASSWORD, GOOGLE_TTS_API_KEY, GITHUB_TOKEN, or GITHUB_REPO.',
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const { password, phrases } = body;

  if (typeof password !== 'string' || !safeEqual(password, sitePassword)) {
    return jsonResponse(401, { error: 'Incorrect or missing site password.' });
  }

  if (!Array.isArray(phrases) || phrases.length === 0) {
    return jsonResponse(400, { error: 'At least one phrase is required.' });
  }
  const batch = phrases.slice(0, MAX_PHRASES_PER_BATCH).filter((p) => typeof p === 'string' && p.trim());
  if (!batch.length) {
    return jsonResponse(400, { error: 'No valid phrases in this batch.' });
  }

  const generated = {};
  const errors = [];

  for (const text of batch) {
    try {
      const ttsRes = await callCloudTTS(ttsKey, text);
      if (!ttsRes.ok) {
        const errText = await ttsRes.text().catch(() => '');
        errors.push(`"${text}": ${friendlyCloudTTSError(ttsRes.status, errText)}`);
        continue;
      }

      const data = await ttsRes.json();
      const base64Mp3 = data && data.audioContent;
      if (!base64Mp3) {
        errors.push(`"${text}": Google TTS returned no audio.`);
        continue;
      }

      const mp3Buffer = Buffer.from(base64Mp3, 'base64');
      const filename = `audio/${hashFor(text)}.mp3`;

      await putBinaryFile(githubRepo, githubBranch, githubToken, filename, mp3Buffer, `Add pronunciation audio for "${text}"`);
      generated[text] = filename;
    } catch (err) {
      errors.push(`"${text}": ${err.message || 'Failed to generate audio.'}`);
    }
  }

  if (Object.keys(generated).length > 0) {
    try {
      await updateJsonFile(
        githubRepo,
        githubBranch,
        githubToken,
        'data/audio-manifest.json',
        (current) => ({ ...current, ...generated }),
        { createIfMissing: {}, message: 'Update pronunciation audio manifest' }
      );
    } catch (err) {
      return jsonResponse(502, { error: 'Generated audio but failed to update the manifest: ' + (err.message || '') });
    }
  }

  return jsonResponse(200, { ok: true, generated, errors });
};
