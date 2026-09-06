const { getStore } = require('@netlify/blobs');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function usersStore() {
  return getStore('slovencina-users');
}

function progressStore() {
  return getStore('slovencina-progress');
}

function contentStore() {
  return getStore('slovencina-content');
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
