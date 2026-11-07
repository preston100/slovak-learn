const { jsonResponse, callGemini, geminiText, friendlyGeminiError } = require('./lib/shared');
const { requireSession } = require('./lib/auth');
const { accountFor, hasFullAccess, dailyLimit } = require('./lib/plans');
const { takeQuota, countUsage } = require('./lib/usage');

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
          // The Slovak word from the list this question tests (if any), so
          // the site can count the answer towards that word's progress.
          word: { type: 'STRING' },
        },
        required: ['question', 'options', 'correctIndex', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

// A quiz is 10 questions, made as two batches of 5 asked for at the same
// time: one of translation and meaning questions, one of fill-in-the-blank
// and word-form questions. That mixes the kinds of question, and takes no
// longer than the old 5-question quiz — 10 in one go risks Netlify's
// 10-second limit.
const BATCH_SIZE = 5;
const FOCUS = [
  'translation both ways (Slovak to English and English to Slovak) and what words or phrases mean',
  'fill in the blank in a short Slovak sentence, choosing the right word form or ending, and using the words in context',
];

const RULES = `Rules:
- Each question must have exactly 4 answer options.
- Only one option is correct, and no option may be a second correct answer.
- Keep questions clear and appropriate for a beginner (A1), not a native speaker.
- "explanation" is one short sentence in plain English saying why the answer is right.
- correctIndex is the zero-based index of the correct option in the "options" array.`;

// What the learner has actually been taught on this topic, sent by the
// site: the topic's words (the ones not mastered yet come first) or a
// grammar topic's summary and examples. Questions stick to it. The words
// are dealt out between the batches, so the two halves of a quiz test
// different words.
function materialText(material, batch) {
  if (!material || typeof material !== 'object') return '';
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const pairs = (list) =>
    (Array.isArray(list) ? list : [])
      .slice(0, 24)
      .map((x) => x && clean(x.sk) && `- ${clean(x.sk)} = ${clean(x.en)}`)
      .filter(Boolean)
      .join('\n');
  const allWords = Array.isArray(material.words) ? material.words : [];
  const mine = allWords.filter((w, i) => i % FOCUS.length === batch);
  const words = pairs(mine.length ? mine : allWords);
  if (words) {
    return `Base every question on these words, in this order of priority (the first ones are the ones the student most needs to practise). Each question tests one of them — cover each word before using one again — and "word" must be that word exactly as written below (the Slovak side).\n${words}`;
  }
  const examples = pairs(material.examples);
  const summary = clean(material.summary);
  if (!examples && !summary) return '';
  return `This is what the student has been taught on this topic — keep to it:\n${summary ? summary + '\n' : ''}${examples}\nLeave "word" empty.`;
}

function buildTopicPrompt(topic, material, batch) {
  return `You are a Slovak language teacher creating a short quiz for an English-speaking student learning Slovak.

Create exactly ${BATCH_SIZE} multiple-choice questions about this topic: "${topic}".
These questions should be about: ${FOCUS[batch]}.

${materialText(material, batch)}

${RULES}`;
}

function buildFilePrompt(batch) {
  return `You are a Slovak language teacher. Based on the attached document, create exactly ${BATCH_SIZE} multiple-choice questions in English that test the reader's understanding of the Slovak language content in it.
These questions should be about: ${FOCUS[batch]}.

${RULES}
- Leave "word" empty.`;
}

// One batch: ask Gemini, then keep only well-formed questions.
async function generateBatch(geminiKey, parts) {
  const res = await callGemini(geminiKey, {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: QUIZ_SCHEMA,
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(friendlyGeminiError(res.status, errText));
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Gemini returned an unreadable response.');
  }
  const rawText = geminiText(data);
  if (!rawText) throw new Error('Gemini returned no quiz content. Try again.');
  let quiz;
  try {
    quiz = JSON.parse(rawText);
  } catch {
    throw new Error('Gemini returned invalid quiz JSON.');
  }
  return (Array.isArray(quiz.questions) ? quiz.questions : []).filter(
    (q) =>
      q &&
      typeof q.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      Number.isInteger(q.correctIndex) &&
      q.correctIndex >= 0 &&
      q.correctIndex < q.options.length
  );
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return jsonResponse(500, { error: 'Server is not configured. Missing environment variables.' });
  }

  const auth = requireSession(event);
  if (auth.error) return auth.error;

  // AI quizzes come with full access (Pro, beta or dev), 25 a day.
  const account = await accountFor(auth.session.email);
  if (!hasFullAccess(account.plan)) {
    return jsonResponse(403, { error: 'AI quizzes are part of Pro. Upgrade, or enter a beta code in your account.', upgrade: true });
  }
  const quota = await takeQuota(auth.session.email, 'quiz', dailyLimit('quiz', account.plan));
  if (!quota.ok) return jsonResponse(429, { error: "That's today's " + quota.limit + ' AI quizzes. They reset tomorrow.', quota: true });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const { mode, topic, filename, mimeType, content, isBase64, material } = body;
  // Which halves to make: both, or (a follow-up when one failed) only the
  // missing one.
  const wanted = Array.isArray(body.batches)
    ? FOCUS.map((_, i) => i).filter((i) => body.batches.indexOf(i) !== -1)
    : FOCUS.map((_, i) => i);
  if (!wanted.length) return jsonResponse(400, { error: 'No questions asked for.' });

  // The request parts for each batch (0 or 1), each with its own focus.
  let partsFor;

  if (mode === 'topic') {
    if (typeof topic !== 'string' || !topic.trim()) {
      return jsonResponse(400, { error: 'A topic is required.' });
    }
    partsFor = (batch) => [{ text: buildTopicPrompt(topic.trim().slice(0, 200), material, batch) }];
  } else if (mode === 'file') {
    if (typeof content !== 'string' || !content) {
      return jsonResponse(400, { error: 'File content is required.' });
    }

    const approxBytes = isBase64 ? Math.ceil((content.length * 3) / 4) : content.length;
    if (approxBytes > MAX_FILE_BYTES) {
      return jsonResponse(400, { error: 'File is too large. Please use a file under 4MB.' });
    }

    if (isBase64) {
      partsFor = (batch) => [
        { text: buildFilePrompt(batch) },
        {
          inlineData: {
            mimeType: mimeType || 'application/pdf',
            data: content,
          },
        },
      ];
    } else {
      partsFor = (batch) => [{ text: `${buildFilePrompt(batch)}\n\nDocument (${filename || 'upload'}):\n\n${content.slice(0, 50000)}` }];
    }
  } else {
    return jsonResponse(400, { error: 'Invalid mode. Expected "topic" or "file".' });
  }

  // Both batches at once. If one fails (Gemini busy, or too slow for the
  // time limit), the other's questions still come back, with `missing`
  // naming the half to ask for again — the page does that straight away.
  const results = await Promise.allSettled(wanted.map((batch) => generateBatch(geminiKey, partsFor(batch))));
  await countUsage('generate-quiz');
  const seen = new Set();
  const questions = [];
  const missing = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.length) {
      missing.push(wanted[i]);
      return;
    }
    r.value.forEach((q) => {
      const key = q.question.trim().toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      questions.push(q);
    });
  });

  if (!questions.length) {
    const failed = results.find((r) => r.status === 'rejected');
    return jsonResponse(502, { error: (failed && failed.reason && failed.reason.message) || 'Gemini returned an empty quiz.' });
  }

  return jsonResponse(200, { questions, missing });
};
