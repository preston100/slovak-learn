const { normalizeEmail, usersStore } = require('./blobs');

// Plans:
//   dev  — the two developer accounts: everything, plus Add Content and Analytics
//   beta — unlocked with the access code (SITE_PASSWORD): full access, no payment
//   paid — a paid subscription (once billing is live)
//   free — Free Preview: roadmap sections 1–5 and the core flashcards
const DEV_ACCOUNT_EMAILS = ['prestonandersen100@gmail.com', 'mravikovamartina@gmail.com'];
const PLANS = ['dev', 'beta', 'paid', 'free'];

function isDevEmail(email) {
  return DEV_ACCOUNT_EMAILS.indexOf(normalizeEmail(email)) !== -1;
}

// Every account made before plans existed had to enter the site code to sign
// up, so an account with no plan stored is beta, not free — otherwise the
// people already using the site would be locked out of everything past 5.
function planOf(email, user) {
  if (isDevEmail(email)) return 'dev';
  if (!user) return 'free';
  return PLANS.indexOf(user.plan) !== -1 && user.plan !== 'dev' ? user.plan : 'beta';
}

function hasFullAccess(plan) {
  return plan !== 'free';
}

async function accountFor(email) {
  const user = await usersStore().get(normalizeEmail(email), { type: 'json' });
  const plan = planOf(email, user);
  return {
    user,
    plan,
    // Whether to skip the "choose your plan" step at sign-in.
    planChosen: plan !== 'free' || !!(user && user.planChosen),
  };
}

// Daily limits per account. They exist so a runaway loop or a bot can never
// push the AI and speech APIs past their free tiers.
const DAILY_LIMITS = {
  transcribe: { free: 15, full: 150 },
  quiz: { free: 0, full: 25 },
  sentence: { free: 0, full: 100 }, // only cache misses count
  speak: { free: 0, full: 150 },
  code: { free: 10, full: 10 }, // access-code attempts, against guessing a 4-digit code
};

function dailyLimit(kind, plan) {
  const limits = DAILY_LIMITS[kind];
  return hasFullAccess(plan) ? limits.full : limits.free;
}

// For endpoints only the developer accounts may call (content creation,
// analytics). Returns { session } or { error: response }.
function requireDev(auth) {
  if (auth.error) return auth;
  if (!isDevEmail(auth.session.email)) {
    const { jsonResponse } = require('./shared');
    return { error: jsonResponse(403, { error: 'Only the developer accounts can use this.' }) };
  }
  return auth;
}

module.exports = { requireDev, DEV_ACCOUNT_EMAILS, isDevEmail, planOf, hasFullAccess, accountFor, DAILY_LIMITS, dailyLimit };
