const crypto = require('crypto');
const { safeEqual, jsonResponse, callGeminiTTS, pcmToWav, friendlyGeminiError } = require('./lib/shared');
const { updateJsonFile, putBinaryFile } = require('./lib/github');

// Keeps each invocation comfortably inside Netlify's 10-second function
// timeout: a handful of TTS calls plus their GitHub commits, not the whole
// vocabulary at once. The client loops over many small batches instead.
const MAX_PHRASES_PER_BATCH = 4;

function hashFor(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 16);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  const geminiKey = process.env.GEMINI_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;
  const githubBranch = process.env.GITHUB_BRANCH || 'main';

  if (!sitePassword || !geminiKey || !githubToken || !githubRepo) {
    return jsonResponse(500, {
      error: 'Server is not configured. Missing SITE_PASSWORD, GEMINI_API_KEY, GITHUB_TOKEN, or GITHUB_REPO.',
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
      const ttsRes = await callGeminiTTS(geminiKey, text);
      if (!ttsRes.ok) {
        const errText = await ttsRes.text().catch(() => '');
        errors.push(`"${text}": ${friendlyGeminiError(ttsRes.status, errText)}`);
        continue;
      }

      const data = await ttsRes.json();
      const base64Pcm = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Pcm) {
        errors.push(`"${text}": Gemini returned no audio.`);
        continue;
      }

      const pcmBuffer = Buffer.from(base64Pcm, 'base64');
      const wavBuffer = pcmToWav(pcmBuffer, 24000, 1, 16);
      const filename = `audio/${hashFor(text)}.wav`;

      await putBinaryFile(githubRepo, githubBranch, githubToken, filename, wavBuffer, `Add pronunciation audio for "${text}"`);
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
