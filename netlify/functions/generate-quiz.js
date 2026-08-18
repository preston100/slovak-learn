const { safeEqual, jsonResponse, callGemini, friendlyGeminiError } = require('./lib/shared');

// Netlify's synchronous function payload limit is 6MB. Base64 inflates size by
// ~33%, so we reject files that would risk crossing that ceiling well before
// hitting the hard limit.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const QUIZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          correctIndex: { type: 'INTEGER' },
          explanation: { type: 'STRING' },
        },
        required: ['question', 'options', 'correctIndex', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

function buildTopicPrompt(topic) {
  return `You are a Slovak language teacher creating a short quiz for an English-speaking student learning Slovak.

Create exactly 5 multiple-choice questions about this topic: "${topic}".

Rules:
- Each question must have exactly 4 answer options.
- Only one option is correct.
- Mix question types where sensible (translation, fill-in-the-blank, grammar choice).
- Keep questions clear and appropriate for a learner, not a native speaker.
- "explanation" should briefly explain why the correct answer is right, in plain English.
- correctIndex is the zero-based index of the correct option in the "options" array.`;
}

function buildFilePrompt() {
  return `You are a Slovak language teacher. Based on the attached document, create exactly 5 multiple-choice questions in English that test the reader's understanding of the Slovak language content in it (vocabulary, grammar, or comprehension — whatever fits the material best).

Rules:
- Each question must have exactly 4 answer options.
- Only one option is correct.
- "explanation" should briefly explain why the correct answer is right, in plain English.
- correctIndex is the zero-based index of the correct option in the "options" array.`;
}

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

  const { password, mode, topic, filename, mimeType, content, isBase64 } = body;

  // Server-side enforcement: this check cannot be bypassed by hiding the
  // password screen client-side, because it runs here before any Gemini call.
  if (typeof password !== 'string' || !safeEqual(password, sitePassword)) {
    return jsonResponse(401, { error: 'Incorrect or missing site password.' });
  }

  let parts;

  if (mode === 'topic') {
    if (typeof topic !== 'string' || !topic.trim()) {
      return jsonResponse(400, { error: 'A topic is required.' });
    }
    parts = [{ text: buildTopicPrompt(topic.trim().slice(0, 200)) }];
  } else if (mode === 'file') {
    if (typeof content !== 'string' || !content) {
      return jsonResponse(400, { error: 'File content is required.' });
    }

    const approxBytes = isBase64 ? Math.ceil((content.length * 3) / 4) : content.length;
    if (approxBytes > MAX_FILE_BYTES) {
      return jsonResponse(400, { error: 'File is too large. Please use a file under 4MB.' });
    }

    if (isBase64) {
      parts = [
        { text: buildFilePrompt() },
        {
          inlineData: {
            mimeType: mimeType || 'application/pdf',
            data: content,
          },
        },
      ];
    } else {
      parts = [{ text: `${buildFilePrompt()}\n\nDocument (${filename || 'upload'}):\n\n${content.slice(0, 50000)}` }];
    }
  } else {
    return jsonResponse(400, { error: 'Invalid mode. Expected "topic" or "file".' });
  }

  let geminiRes;
  try {
    geminiRes = await callGemini(geminiKey, {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: QUIZ_SCHEMA,
        temperature: 0.8,
      },
    });
  } catch (err) {
    return jsonResponse(502, { error: err.message || 'Could not reach the Gemini API.' });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '');
    return jsonResponse(502, { error: friendlyGeminiError(geminiRes.status, errText) });
  }

  let geminiData;
  try {
    geminiData = await geminiRes.json();
  } catch {
    return jsonResponse(502, { error: 'Gemini returned an unreadable response.' });
  }

  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    return jsonResponse(502, { error: 'Gemini returned no quiz content. Try again.' });
  }

  let quiz;
  try {
    quiz = JSON.parse(rawText);
  } catch {
    return jsonResponse(502, { error: 'Gemini returned invalid quiz JSON.' });
  }

  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    return jsonResponse(502, { error: 'Gemini returned an empty quiz.' });
  }

  return jsonResponse(200, quiz);
};
