const { safeEqual, jsonResponse, callGemini } = require('./lib/shared');

const MAX_TOTAL_BYTES = 4.5 * 1024 * 1024; // stays well under Netlify's 6MB sync function body limit
const MAX_FILES = 6;

const EXTRACT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    grammarTopics: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          topic: { type: 'STRING' },
          summary: { type: 'STRING' },
          explanation: { type: 'STRING' },
          examples: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { sk: { type: 'STRING' }, en: { type: 'STRING' } },
              required: ['sk', 'en'],
            },
          },
        },
        required: ['id', 'topic', 'summary', 'explanation', 'examples'],
      },
    },
    vocabGroups: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING' },
          words: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { sk: { type: 'STRING' }, en: { type: 'STRING' } },
              required: ['sk', 'en'],
            },
          },
        },
        required: ['topic', 'words'],
      },
    },
  },
  required: ['grammarTopics', 'vocabGroups'],
};

const EXTRACT_PROMPT = `You are helping build a Slovak-learning website. You are given one or more photos or documents of Slovak study notes: vocabulary lists, grammar rules, conjugation tables, phrases, dialogs, etc.

Extract the content into two categories:

1. grammarTopics — for grammar rules, verb conjugation tables, and sentence-structure explanations. Each topic needs:
   - id: a short kebab-case identifier (e.g. "dative-case")
   - topic: a short title
   - summary: one sentence shown on a collapsed card
   - explanation: a longer explanation. Use \\n for line breaks. For conjugation tables, list each form on its own line clearly labeled.
   - examples: 2-5 example sentences, each with "sk" (Slovak) and "en" (English translation)

2. vocabGroups — for word lists and standalone phrases. Group related words under a short topic name. Each word needs "sk" (Slovak) and "en" (English).

Rules:
- If handwritten answers/translations are present in the image, use them as the correct translation — they are usually the actual answer key.
- Preserve Slovak diacritics exactly (á, ä, č, ď, é, í, ĺ, ľ, ň, ó, ô, ŕ, š, ť, ú, ý, ž).
- Only extract content that is actually present in the images. Do not invent vocabulary or rules that aren't shown.
- Skip personal handwritten exercise answers that are clearly a student's own free-form practice (e.g. "describe your own day"), unless they contain new vocabulary/phrases worth keeping.
- If a document doesn't fit either category well, use your best judgment on where it belongs, or omit it.
- If nothing usable is found, return empty arrays for both fields.`;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!sitePassword || !geminiKey) {
    return jsonResponse(500, { error: 'Server is not configured. Missing environment variables.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const { password, files } = body;

  if (typeof password !== 'string' || !safeEqual(password, sitePassword)) {
    return jsonResponse(401, { error: 'Incorrect or missing site password.' });
  }

  if (!Array.isArray(files) || files.length === 0) {
    return jsonResponse(400, { error: 'At least one file is required.' });
  }
  if (files.length > MAX_FILES) {
    return jsonResponse(400, { error: `Please upload at most ${MAX_FILES} files at a time.` });
  }

  let totalBytes = 0;
  const parts = [{ text: EXTRACT_PROMPT }];

  for (const f of files) {
    if (!f || typeof f.data !== 'string' || !f.mimeType) {
      return jsonResponse(400, { error: 'Each file needs mimeType and base64 data.' });
    }
    totalBytes += Math.ceil((f.data.length * 3) / 4);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return jsonResponse(400, { error: 'Files are too large in total. Try uploading fewer photos at once.' });
    }
    parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
  }

  let geminiRes;
  try {
    geminiRes = await callGemini(geminiKey, {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: EXTRACT_SCHEMA,
        temperature: 0.3,
      },
    });
  } catch (err) {
    return jsonResponse(502, { error: err.message || 'Could not reach the Gemini API.' });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '');
    const friendly =
      geminiRes.status === 503
        ? 'Gemini is under heavy load right now. Please wait a few seconds and try again.'
        : `Gemini API error (${geminiRes.status}). ${errText.slice(0, 300)}`;
    return jsonResponse(502, { error: friendly });
  }

  let geminiData;
  try {
    geminiData = await geminiRes.json();
  } catch {
    return jsonResponse(502, { error: 'Gemini returned an unreadable response.' });
  }

  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    return jsonResponse(502, { error: 'Gemini returned no content. Try again.' });
  }

  let extracted;
  try {
    extracted = JSON.parse(rawText);
  } catch {
    return jsonResponse(502, { error: 'Gemini returned invalid JSON.' });
  }

  return jsonResponse(200, {
    grammarTopics: Array.isArray(extracted.grammarTopics) ? extracted.grammarTopics : [],
    vocabGroups: Array.isArray(extracted.vocabGroups) ? extracted.vocabGroups : [],
  });
};
