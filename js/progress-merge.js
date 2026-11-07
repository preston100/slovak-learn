// Merges two copies of one account's progress — the browser's and the
// server's — so neither side can wipe out the other. Used by the browser
// (when signing in on a device that already has this account's progress)
// and by the server (on every save), from this one file.
//
// The rule is "keep everything either side has achieved": cleared sections
// and rounds are a union, mastered words and badges a union, counters take
// the larger value. A fresh device sending an empty copy therefore can't
// erase anything, and two devices saving in turn can't undo each other.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlovakProgressMerge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function obj(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  function num(v) {
    return Number(v) || 0;
  }

  function union(a, b) {
    const out = {};
    Object.keys(obj(a)).forEach(function (k) { if (a[k]) out[k] = true; });
    Object.keys(obj(b)).forEach(function (k) { if (b[k]) out[k] = true; });
    return out;
  }

  // Word stats: a word's misses take the larger count (a word still being
  // revised on one device stays in Revise), and its first right answer the
  // earlier day (mastery is counted from it).
  function mergeVocabStats(a, b) {
    const out = {};
    const keys = Object.keys(obj(a)).concat(Object.keys(obj(b)));
    keys.forEach(function (k) {
      if (out[k]) return;
      const x = obj(obj(a)[k]);
      const y = obj(obj(b)[k]);
      const entry = { misses: Math.max(num(x.misses), num(y.misses)) };
      const days = [x.firstRight, y.firstRight].filter(function (d) { return typeof d === 'string'; }).sort();
      if (days.length) entry.firstRight = days[0];
      out[k] = entry;
    });
    return out;
  }

  // Practice rounds: { topic: [true, , true…] } — a round cleared anywhere
  // stays cleared.
  function mergeRounds(a, b) {
    const out = {};
    [obj(a), obj(b)].forEach(function (src) {
      Object.keys(src).forEach(function (topic) {
        const list = Array.isArray(src[topic]) ? src[topic] : [];
        out[topic] = out[topic] || [];
        list.forEach(function (v, i) { if (v) out[topic][i] = true; });
      });
    });
    return out;
  }

  function mergeAchievements(a, b) {
    const out = [];
    (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b : []).forEach(function (id) {
      if (out.indexOf(id) === -1) out.push(id);
    });
    return out;
  }

  // The live streak comes from whichever copy practised most recently.
  function mergeStreak(a, b) {
    const da = a.streakLastDate || '';
    const db = b.streakLastDate || '';
    let pick = da > db ? a : db > da ? b : num(a.streakCount) >= num(b.streakCount) ? a : b;
    return {
      streakCount: num(pick.streakCount),
      streakLastDate: pick.streakLastDate || null,
      longestStreak: Math.max(num(a.longestStreak), num(b.longestStreak), num(a.streakCount), num(b.streakCount)),
    };
  }

  function mergeDaily(a, b) {
    const x = obj(a);
    const y = obj(b);
    if ((x.date || '') === (y.date || '')) return { date: x.date || null, count: Math.max(num(x.count), num(y.count)) };
    return (x.date || '') > (y.date || '') ? { date: x.date, count: num(x.count) } : { date: y.date || null, count: num(y.count) };
  }

  function mergeProgress(a, b) {
    a = obj(a);
    b = obj(b);
    const newer = num(a.updatedAt) >= num(b.updatedAt) ? a : b;
    const streak = mergeStreak(a, b);
    return {
      updatedAt: Math.max(num(a.updatedAt), num(b.updatedAt)),
      streakCount: streak.streakCount,
      longestStreak: streak.longestStreak,
      streakLastDate: streak.streakLastDate,
      vocabStats: mergeVocabStats(a.vocabStats, b.vocabStats),
      masteredWords: union(a.masteredWords, b.masteredWords),
      achievements: mergeAchievements(a.achievements, b.achievements),
      roundProgress: mergeRounds(a.roundProgress, b.roundProgress),
      // Old copies may still hold the retired position-indexed array; it
      // can't be mapped onto section ids, so obj() drops it.
      roadmapProgress: union(a.roadmapProgress, b.roadmapProgress),
      timeSpentMs: Math.max(num(a.timeSpentMs), num(b.timeSpentMs)),
      // A setting, not an achievement: the most recently saved choice wins.
      dailyGoalTarget: num(newer.dailyGoalTarget) || num(a.dailyGoalTarget) || num(b.dailyGoalTarget) || 10,
      dailyPracticeCount: mergeDaily(a.dailyPracticeCount, b.dailyPracticeCount),
    };
  }

  return { mergeProgress: mergeProgress };
});
