const { getStore } = require('@netlify/blobs');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// getStore(name) relies on Netlify auto-injecting site credentials into the
// function's environment, which isn't happening for this site (confirmed via
// a live MissingBlobsEnvironmentError) — so credentials are passed explicitly
// instead. Falls back to the bare name if they're ever not set, so this
// starts working automatically again if Netlify's auto-injection is fixed.
function store(name) {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token ? getStore({ name, siteID, token }) : getStore(name);
}

function usersStore() {
  return store('slovencina-users');
}

function progressStore() {
  return store('slovencina-progress');
}

function contentStore() {
  return store('slovencina-content');
}

const DEFAULT_PROGRESS = {
  streakCount: 0,
  streakLastDate: null,
  vocabStats: {},
  achievements: [],
  roundProgress: {},
  roadmapProgress: [],
  timeSpentMs: 0,
  dailyGoalTarget: 10,
  dailyPracticeCount: { date: null, count: 0 },
};

const DEFAULT_CONTENT = { grammarTopics: [], vocabGroups: [] };

module.exports = { normalizeEmail, usersStore, progressStore, contentStore, DEFAULT_PROGRESS, DEFAULT_CONTENT };
