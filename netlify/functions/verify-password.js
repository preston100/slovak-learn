const { safeEqual } = require('./lib/shared');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'SITE_PASSWORD is not configured on the server.' }),
    };
  }

  let password;
  try {
    const body = JSON.parse(event.body || '{}');
    password = body.password;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid request.' }) };
  }

  if (typeof password !== 'string' || !safeEqual(password, expected)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Incorrect code.' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
