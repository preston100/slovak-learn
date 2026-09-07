(function () {
  'use strict';

  const SESSION_KEY = 'slovencina_pw';

  /* ---------------- Password gate ---------------- */

  const gateEl = document.getElementById('password-gate');
  const appEl = document.getElementById('app');
  const gateForm = document.getElementById('gate-form');
  const gateInput = document.getElementById('gate-code');
  const gateError = document.getElementById('gate-error');
  const gateSubmit = document.getElementById('gate-submit');

  function getStoredPassword() {
    return sessionStorage.getItem(SESSION_KEY) || '';
  }

  function showApp() {
    gateEl.classList.add('hidden');
    resolveSession();
  }

  async function checkPassword(pw) {
    const res = await fetch('/.netlify/functions/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    return res.ok;
  }

  gateForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const pw = gateInput.value.trim();
    if (!pw) return;

    gateError.textContent = '';
    gateSubmit.disabled = true;
    gateSubmit.textContent = 'Checking…';

    try {
      const ok = await checkPassword(pw);
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, pw);
        showApp();
      } else {
        gateError.textContent = 'Incorrect code. Try again.';
        gateInput.value = '';
        gateInput.focus();
      }
    } catch (err) {
      gateError.textContent = 'Could not reach the server. Please try again.';
    } finally {
      gateSubmit.disabled = false;
      gateSubmit.textContent = 'Unlock';
    }
  });

  // If a password was already verified this session, skip straight to the app.
  (function tryAutoUnlock() {
    const stored = getStoredPassword();
    if (!stored) return;
    checkPassword(stored).then(function (ok) {
      if (ok) showApp();
      else sessionStorage.removeItem(SESSION_KEY);
    });
  })();

  /* ---------------- Accounts (sits between the site password and the app) ---------------- */

  const SESSION_TOKEN_KEY = 'slovencina_session_token';
  const SESSION_USER_KEY = 'slovencina_session_user';
  const MIGRATED_KEY = 'slovencina_migrated';

  const authGateEl = document.getElementById('auth-gate');
  const authForm = document.getElementById('auth-form');
  const authNameField = document.getElementById('auth-name-field');
  const authNameInput = document.getElementById('auth-name');
  const authEmailInput = document.getElementById('auth-email');
  const authPasswordInput = document.getElementById('auth-password');
  const authError = document.getElementById('auth-error');
  const authSubmit = document.getElementById('auth-submit');
  const authTitle = document.getElementById('auth-gate-title');
  const authSub = document.getElementById('auth-gate-sub');
  const authModeButtons = document.querySelectorAll('.auth-mode-btn');

  function getSessionToken() {
    return localStorage.getItem(SESSION_TOKEN_KEY) || '';
  }

  function setSession(token, user) {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    if (user) localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  }

  function clearSessionToken() {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
  }

  function getSessionUser() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_USER_KEY) || 'null');
    } catch (err) {
      return null;
    }
  }

  // Dev/preview accounts: every roadmap and practice round shows unlocked,
  // regardless of prior progress, so these two can freely look around after
  // every update instead of grinding through prerequisites. Client-side only
  // — nothing server-side trusts this, it just changes what's rendered.
  const DEV_ACCOUNT_EMAILS = ['prestonandersen100@gmail.com', 'mravikovamartina@gmail.com'];

  function isDevAccount() {
    const user = getSessionUser();
    return !!(user && DEV_ACCOUNT_EMAILS.indexOf((user.email || '').toLowerCase()) !== -1);
  }

  function showAuthGate() {
    authGateEl.classList.remove('hidden');
  }

  function showAuthenticatedApp() {
    authGateEl.classList.add('hidden');
    appEl.classList.remove('hidden');
    initApp();
  }

  // Pulls the 9 progress-related localStorage keys into one snapshot object,
  // reusing the same load functions the rest of the app already has —
  // defined further down the file, but safe to call here since this is only
  // ever invoked from event handlers that fire well after the whole script
  // has finished its initial synchronous run.
  function collectProgressSnapshot() {
    let dailyPracticeCount;
    try {
      dailyPracticeCount = JSON.parse(localStorage.getItem(DAILY_COUNT_KEY) || '{}');
    } catch (err) {
      dailyPracticeCount = { date: null, count: 0 };
    }

    return {
      streakCount: Number(localStorage.getItem(STREAK_COUNT_KEY) || '0'),
      streakLastDate: localStorage.getItem(STREAK_DATE_KEY) || null,
      vocabStats: loadVocabStats(),
      achievements: getEarnedAchievements(),
      roundProgress: loadRoundProgress(),
      roadmapProgress: loadRoadmapProgress(),
      timeSpentMs: getTotalTimeSpentMs(),
      dailyGoalTarget: getDailyGoalTarget(),
      dailyPracticeCount: dailyPracticeCount,
    };
  }

  // The inverse of collectProgressSnapshot: writes a progress object fetched
  // from the server back into the same localStorage keys, overwriting
  // whatever was there — correct both for a fresh browser (nothing to lose)
  // and for switching accounts on a browser that already has a different
  // account's leftover data.
  function hydrateFromProgress(progress) {
    if (!progress) return;
    localStorage.setItem(STREAK_COUNT_KEY, String(progress.streakCount || 0));
    if (progress.streakLastDate) localStorage.setItem(STREAK_DATE_KEY, progress.streakLastDate);
    else localStorage.removeItem(STREAK_DATE_KEY);
    localStorage.setItem(VOCAB_STATS_KEY, JSON.stringify(progress.vocabStats || {}));
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(progress.achievements || []));
    localStorage.setItem(ROUND_PROGRESS_KEY, JSON.stringify(progress.roundProgress || {}));
    localStorage.setItem(ROADMAP_PROGRESS_KEY, JSON.stringify(progress.roadmapProgress || []));
    localStorage.setItem(TIME_SPENT_KEY, String(progress.timeSpentMs || 0));
    localStorage.setItem(DAILY_GOAL_TARGET_KEY, String(progress.dailyGoalTarget || DEFAULT_DAILY_GOAL));
    localStorage.setItem(DAILY_COUNT_KEY, JSON.stringify(progress.dailyPracticeCount || { date: null, count: 0 }));
  }

  let progressSyncTimer = null;

  function scheduleProgressSync() {
    if (!getSessionToken()) return;
    clearTimeout(progressSyncTimer);
    progressSyncTimer = setTimeout(function () { flushProgressSync(); }, 1500);
  }

  function flushProgressSync() {
    const token = getSessionToken();
    if (!token) return;
    // keepalive lets this survive a tab close (also used on beforeunload
    // below) — best-effort either way, since localStorage already has the
    // authoritative copy of whatever just changed.
    fetch('/.netlify/functions/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(collectProgressSnapshot()),
      keepalive: true,
    }).catch(function () {});
  }

  window.addEventListener('beforeunload', flushProgressSync);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushProgressSync();
  });

  // Fetches this account's saved progress and writes it into localStorage,
  // then shows the app. Shared by the token-already-in-localStorage path
  // (page load) and right after a fresh login/signup.
  async function finishLogin(token, user) {
    setSession(token, user);
    // Marks this browser as "already has an account on it" — the signup
    // handler uses this so only the very first account ever created here
    // can inherit pre-existing localStorage progress. Without it, a second
    // signup in the same browser would re-send whatever the first account
    // just hydrated and silently clone that account's progress onto the
    // new one.
    localStorage.setItem(MIGRATED_KEY, '1');
    try {
      const res = await fetch('/.netlify/functions/progress', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        const data = await res.json();
        hydrateFromProgress(data.progress);
      }
    } catch (err) {
      // Network hiccup: fall through with whatever's already in localStorage
      // rather than blocking the user from getting into the app at all.
    }
    showAuthenticatedApp();
  }

  async function resolveSession() {
    const token = getSessionToken();
    if (!token) {
      showAuthGate();
      return;
    }
    try {
      const res = await fetch('/.netlify/functions/progress', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) {
        clearSessionToken();
        showAuthGate();
        return;
      }
      const data = await res.json();
      hydrateFromProgress(data.progress);
      showAuthenticatedApp();
    } catch (err) {
      showAuthGate();
    }
  }

  function setupAuthGate() {
    let mode = 'login';

    function applyMode() {
      authModeButtons.forEach(function (b) { b.classList.toggle('active', b.dataset.authMode === mode); });
      authNameField.classList.toggle('hidden', mode !== 'signup');
      authTitle.textContent = mode === 'signup' ? 'Create Account' : 'Log In';
      authSub.textContent =
        mode === 'signup'
          ? 'Set up your account to start tracking your own progress.'
          : 'Welcome back — log in to see your progress.';
      authSubmit.textContent = mode === 'signup' ? 'Sign Up' : 'Log In';
      authPasswordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
      authError.textContent = '';
    }

    authModeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        mode = btn.dataset.authMode;
        applyMode();
      });
    });

    authForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = authEmailInput.value.trim();
      const password = authPasswordInput.value;
      const name = authNameInput.value.trim();

      if (!email || !password || (mode === 'signup' && !name)) {
        authError.textContent = 'Please fill in all fields.';
        return;
      }

      authError.textContent = '';
      authSubmit.disabled = true;
      authSubmit.textContent = mode === 'signup' ? 'Creating account…' : 'Logging in…';

      try {
        const endpoint = mode === 'signup' ? 'signup' : 'login';
        const payload = { sitePassword: getStoredPassword(), email: email, password: password };
        if (mode === 'signup') {
          payload.name = name;
          // Only the first account ever created on this browser can inherit
          // pre-existing localStorage progress — every account after that
          // starts at zero, even signed up from the same browser.
          if (!localStorage.getItem(MIGRATED_KEY)) {
            payload.progressSnapshot = collectProgressSnapshot();
          }
        }

        const res = await fetch('/.netlify/functions/' + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(function () { return {}; });

        if (!res.ok || !data.ok) {
          authError.textContent = data.error || 'Something went wrong. Please try again.';
          return;
        }

        authForm.reset();
        await finishLogin(data.token, data.user);
      } catch (err) {
        authError.textContent = 'Could not reach the server. Please try again.';
      } finally {
        authSubmit.disabled = false;
        authSubmit.textContent = mode === 'signup' ? 'Sign Up' : 'Log In';
      }
    });

    applyMode();
  }

  setupAuthGate();

  function setupLogout() {
    const btn = document.getElementById('logout-btn');
    if (!btn) return;
    const user = getSessionUser();
    if (user && user.name) btn.title = 'Log out (' + user.name + ')';
    btn.addEventListener('click', function () {
      flushProgressSync();
      clearSessionToken();
      location.reload();
    });
  }

  /* ---------------- App (only runs after unlock) ---------------- */

  let appInitialized = false;
  let grammarData = [];
  let vocabData = [];

  function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    setupTabs();
    setupLogout();
    loadContent();
    setupTests();
    setupTestsModes();
    setupAddContent();
    setupSound();
    renderStreak();
    setupDailyGoal();
    renderLeaderboard();
    setupLearnModes();
    setupLessonOverlay();
    setupTimeTracking();
    loadAudioManifest();
    setupAudioGeneration();
  }

  /* ---- Tabs ---- */

  function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tab = btn.dataset.tab;

        tabButtons.forEach(function (b) {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });

        document.querySelectorAll('.panel').forEach(function (panel) {
          panel.classList.toggle('active', panel.id === 'panel-' + tab);
        });

        if (tab === 'profile') {
          renderProfile();
          renderLeaderboard();
        }
      });
    });
  }

  /* ---- Content loading: shared baseline + this account's private additions ---- */

  // Everyone reads the same shared files; on top of that, each account has
  // its own private grammar/vocab (from Add Content) that only they see.
  let sharedGrammarData = [];
  let sharedVocabData = [];
  let privateGrammarData = [];
  let privateVocabData = [];
  let alphabetData = [];
  let curriculumData = [];

  async function fetchJson(path, fallback) {
    try {
      const res = await fetch(path);
      if (!res.ok) return fallback;
      return await res.json();
    } catch (err) {
      return fallback;
    }
  }

  async function fetchSharedGrammar() {
    try {
      const res = await fetch('data/grammar.json');
      return await res.json();
    } catch (err) {
      return [];
    }
  }

  async function fetchSharedVocab() {
    try {
      const res = await fetch('data/vocab.json');
      return await res.json();
    } catch (err) {
      return [];
    }
  }

  async function fetchPrivateContent() {
    const token = getSessionToken();
    if (!token) return { grammarTopics: [], vocabGroups: [] };
    try {
      const res = await fetch('/.netlify/functions/private-content', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) return { grammarTopics: [], vocabGroups: [] };
      return await res.json();
    } catch (err) {
      return { grammarTopics: [], vocabGroups: [] };
    }
  }

  // Shared content always comes first and private content is always
  // appended after — never merged/interleaved by name — because
  // ROADMAP_PROGRESS_KEY is an array of booleans indexed by position in the
  // roadmap. Any ordering that could shift an already-built section earlier
  // would silently invalidate that account's cleared-section progress.
  async function loadContent() {
    const grammarContainer = document.getElementById('grammar-list');
    const vocabContainer = document.getElementById('vocab-list');

    try {
      const [shared, sharedVoc, privateContent, alphabet, curriculum] = await Promise.all([
        fetchSharedGrammar(),
        fetchSharedVocab(),
        fetchPrivateContent(),
        fetchJson('data/alphabet.json', []),
        fetchJson('data/curriculum.json', []),
      ]);

      sharedGrammarData = shared;
      sharedVocabData = sharedVoc;
      privateGrammarData = privateContent.grammarTopics || [];
      privateVocabData = privateContent.vocabGroups || [];
      alphabetData = alphabet;
      curriculumData = curriculum;

      grammarData = sharedGrammarData.concat(privateGrammarData);
      vocabData = sharedVocabData.concat(privateVocabData);

      renderGrammar(grammarData);
      renderGrammarGuide();
      renderVocab(vocabData);
      populateTopicSelect();
      updateAudioGenSummary();
      buildRoadmapSections();
    } catch (err) {
      grammarContainer.innerHTML = '<div class="empty-state">Could not load grammar content.</div>';
      vocabContainer.innerHTML = '<div class="empty-state">Could not load vocabulary content.</div>';
    }
  }

  // Called right after Add Content saves something new — updates Browse
  // All and the topic pickers immediately. The Roadmap tab picks up new
  // sections on next reload, same as it always required for shared content.
  async function refreshPrivateContent() {
    const privateContent = await fetchPrivateContent();
    privateGrammarData = privateContent.grammarTopics || [];
    privateVocabData = privateContent.vocabGroups || [];
    grammarData = sharedGrammarData.concat(privateGrammarData);
    vocabData = sharedVocabData.concat(privateVocabData);

    renderGrammar(grammarData);
    renderGrammarGuide();
    renderVocab(vocabData);
    populateTopicSelect();
    updateAudioGenSummary();
  }

  function examplesHtml(examples) {
    return (examples || [])
      .map(function (ex) {
        return (
          '<div class="example-row"><span class="sk">' +
          speakerButtonHtml(ex.sk) +
          escapeHtml(ex.sk) +
          '</span><span class="en">' +
          escapeHtml(ex.en) +
          '</span></div>'
        );
      })
      .join('');
  }

  function renderGrammar(topics, emptyMessage, containerId) {
    const container = document.getElementById(containerId || 'grammar-list');
    if (!topics.length) {
      container.innerHTML = '<div class="empty-state">' + (emptyMessage || 'No grammar topics yet.') + '</div>';
      return;
    }

    container.innerHTML = topics
      .map(function (t, i) {
        const examples = examplesHtml(t.examples);

        return (
          '<details class="grammar-card"' +
          (i === 0 ? ' open' : '') +
          '>' +
          '<summary>' +
          '<div class="grammar-card-title"><h3>' +
          escapeHtml(t.topic) +
          '</h3><p>' +
          escapeHtml(t.summary || '') +
          '</p></div>' +
          '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>' +
          '</summary>' +
          '<div class="grammar-card-body">' +
          '<div class="explanation">' +
          escapeHtml(t.explanation || '') +
          '</div>' +
          (examples ? '<div class="example-list">' + examples + '</div>' : '') +
          '</div>' +
          '</details>'
        );
      })
      .join('');
  }

  /* ---- Vocabulary ---- */

  function renderVocab(groups, emptyMessage) {
    const container = document.getElementById('vocab-list');
    if (!groups.length) {
      container.innerHTML = '<div class="empty-state">' + (emptyMessage || 'No vocabulary yet.') + '</div>';
      return;
    }

    container.innerHTML = groups
      .map(function (g) {
        const words = (g.words || [])
          .map(function (w) {
            return (
              '<div class="vocab-word"><div class="sk">' +
              speakerButtonHtml(w.sk) +
              escapeHtml(w.sk) +
              '</div><div class="en">' +
              escapeHtml(w.en) +
              '</div></div>'
            );
          })
          .join('');

        return (
          '<div class="vocab-group"><h3>' +
          escapeHtml(g.topic) +
          '</h3><div class="vocab-grid">' +
          words +
          '</div></div>'
        );
      })
      .join('');
  }

  // Filters the already-loaded grammar/vocab arrays client-side and re-renders
  // both lists — no server round-trip, since everything's already in memory.
  function matchesGrammarQuery(t, q) {
    return (
      (t.topic || '').toLowerCase().indexOf(q) !== -1 ||
      (t.summary || '').toLowerCase().indexOf(q) !== -1 ||
      (t.explanation || '').toLowerCase().indexOf(q) !== -1 ||
      (t.examples || []).some(function (ex) {
        return (ex.sk || '').toLowerCase().indexOf(q) !== -1 || (ex.en || '').toLowerCase().indexOf(q) !== -1;
      })
    );
  }

  /* ---- Grammar Guide: a reference, not a second copy of the roadmap ---- */

  // Categories give the guide a shape you can navigate; the roadmap's order
  // is about what to learn next, which is a different question from "where
  // do I look this up".
  const GUIDE_CATEGORIES = [
    { title: 'Nouns', ids: ['nouns-gender', 'cases-overview', 'demonstratives'] },
    { title: 'Pronouns & Questions', ids: ['pronouns-possessives', 'question-words'] },
    {
      title: 'Verbs',
      ids: [
        'present-tense',
        'conjugation-byt-mat-ist-prist',
        'conjugation-robit-spat-hrat-citat',
        'conjugation-hovorit-jest-chciet-pracovat',
      ],
    },
    { title: 'Time', ids: ['time-daily-routine'] },
  ];

  function guideEntryHtml(title, summary, unitId, bodyHtml) {
    return (
      '<div class="guide-entry">' +
      '<div class="guide-entry-head">' +
      '<h4>' + escapeHtml(title) + '</h4>' +
      (unitId ? '<button type="button" class="guide-practice-btn" data-unit-id="' + escapeHtml(unitId) + '">Practice this</button>' : '') +
      '</div>' +
      (summary ? '<p class="guide-summary">' + escapeHtml(summary) + '</p>' : '') +
      bodyHtml +
      '</div>'
    );
  }

  function letterTableHtml(letters) {
    return (
      '<div class="guide-table-wrap"><table class="guide-table">' +
      '<thead><tr><th>Letter</th><th>Sounds like</th><th>Example</th></tr></thead><tbody>' +
      letters
        .map(function (l) {
          return (
            '<tr><td class="guide-letter">' + escapeHtml(l.letter) + '</td>' +
            '<td><strong>' + escapeHtml(l.hint) + '</strong><br><span class="guide-en">' + escapeHtml(l.sound) + '</span></td>' +
            '<td>' + speakerButtonHtml(l.example.sk) + escapeHtml(l.example.sk) +
            ' <span class="guide-en">' + escapeHtml(l.example.en) + '</span></td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function grammarBodyHtml(t) {
    const examples = (t.examples || [])
      .map(function (ex) {
        return (
          '<tr><td>' + speakerButtonHtml(ex.sk) + escapeHtml(ex.sk) + '</td>' +
          '<td class="guide-en">' + escapeHtml(ex.en) + '</td></tr>'
        );
      })
      .join('');

    return (
      (t.explanation ? '<div class="guide-explanation">' + escapeHtml(t.explanation) + '</div>' : '') +
      (examples
        ? '<div class="guide-table-wrap"><table class="guide-table"><tbody>' + examples + '</tbody></table></div>'
        : '')
    );
  }

  function unitIdForGrammar(id) {
    const unit = curriculumData.find(function (u) { return u.kind === 'grammar' && u.ref === id; });
    return unit ? unit.id : null;
  }

  function renderGrammarGuide(query) {
    const container = document.getElementById('guide-grammar-list');
    if (!container) return;

    const q = (query || '').trim().toLowerCase();
    const blocks = [];

    // Sounds & Spelling comes from the alphabet data — the single most
    // reference-shaped thing in the app, and absent from Browse All entirely.
    const alphabetMatches = alphabetData.filter(function (u) {
      if (!q) return true;
      return (
        u.title.toLowerCase().indexOf(q) !== -1 ||
        (u.intro || '').toLowerCase().indexOf(q) !== -1 ||
        u.letters.some(function (l) {
          return l.letter.toLowerCase().indexOf(q) !== -1 || l.sound.toLowerCase().indexOf(q) !== -1 || l.example.sk.toLowerCase().indexOf(q) !== -1;
        })
      );
    });

    if (alphabetMatches.length) {
      blocks.push(
        '<div class="guide-category"><h3 class="browse-subhead">Sounds & Spelling</h3>' +
        alphabetMatches
          .map(function (u) {
            return guideEntryHtml(u.title, '', 'alpha-' + u.id, letterTableHtml(u.letters));
          })
          .join('') +
        '</div>'
      );
    }

    const categorised = [];
    GUIDE_CATEGORIES.forEach(function (cat) {
      const topics = cat.ids
        .map(function (id) { return grammarData.find(function (t) { return t.id === id; }); })
        .filter(Boolean)
        .filter(function (t) { return !q || matchesGrammarQuery(t, q); });
      topics.forEach(function (t) { categorised.push(t.id); });
      if (!topics.length) return;
      blocks.push(
        '<div class="guide-category"><h3 class="browse-subhead">' + escapeHtml(cat.title) + '</h3>' +
        topics
          .map(function (t) { return guideEntryHtml(t.topic, t.summary, unitIdForGrammar(t.id), grammarBodyHtml(t)); })
          .join('') +
        '</div>'
      );
    });

    // Anything not in a category above (e.g. topics added via Add Content).
    const rest = grammarData
      .filter(function (t) { return categorised.indexOf(t.id) === -1; })
      .filter(function (t) { return !q || matchesGrammarQuery(t, q); });
    if (rest.length) {
      blocks.push(
        '<div class="guide-category"><h3 class="browse-subhead">More</h3>' +
        rest.map(function (t) { return guideEntryHtml(t.topic, t.summary, unitIdForGrammar(t.id), grammarBodyHtml(t)); }).join('') +
        '</div>'
      );
    }

    container.innerHTML = blocks.length
      ? blocks.join('')
      : '<div class="empty-state">No matches for “' + escapeHtml((query || '').trim()) + '”.</div>';

    container.querySelectorAll('.guide-practice-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = roadmapSections.findIndex(function (s) { return s.id === btn.dataset.unitId; });
        if (idx === -1) return;
        document.querySelector('[data-tab="learn"]').click();
        startLesson(idx);
      });
    });
  }

  function filterGuideContent(query) {
    renderGrammarGuide(query);
  }

  function filterBrowseContent(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      renderGrammar(grammarData);
      renderVocab(vocabData);
      return;
    }

    const matchedGrammar = grammarData.filter(function (t) { return matchesGrammarQuery(t, q); });

    const matchedVocab = vocabData
      .map(function (g) {
        const words = (g.words || []).filter(function (w) {
          return (w.sk || '').toLowerCase().indexOf(q) !== -1 || (w.en || '').toLowerCase().indexOf(q) !== -1;
        });
        return words.length ? { topic: g.topic, words: words } : null;
      })
      .filter(Boolean);

    const noMatch = 'No matches for “' + escapeHtml(query.trim()) + '”.';
    renderGrammar(matchedGrammar, noMatch);
    renderVocab(matchedVocab, noMatch);
  }

  /* ---- Speech & sound ---- */

  function speakerButtonHtml(text) {
    if (!text) return '';
    return (
      '<button type="button" class="speak-btn" data-speak="' +
      escapeHtml(text) +
      '" aria-label="Hear this said aloud" title="Hear it">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>' +
      '</button>'
    );
  }

  let audioManifest = {};
  let currentAudioEl = null;

  async function loadAudioManifest() {
    try {
      const res = await fetch('data/audio-manifest.json');
      if (res.ok) audioManifest = await res.json();
    } catch (err) {
      audioManifest = {};
    }
    updateAudioGenSummary();
  }

  function speakWithBrowserVoice(text) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'sk-SK';
      utter.rate = 0.92;
      window.speechSynthesis.speak(utter);
    } catch (err) {
      /* speech synthesis not available in this browser — silently skip */
    }
  }

  // Prefers real, pre-generated Slovak speech (see the "Pronunciation audio"
  // tool in Add Content) and only falls back to the browser's built-in voice
  // — which often mispronounces Slovak badly — for anything not yet generated.
  // Google's TTS output measures around -19 dB mean, which is noticeably
  // quiet for short words on laptop speakers. A plain <audio> can't go above
  // volume 1, so playback is routed through a gain stage instead, with a
  // compressor to keep the boosted peaks from clipping.
  let audioCtx = null;
  let audioGainNode = null;

  function getAudioChain() {
    // Keyed on the gain node, not the context: the sound-effect player shares
    // this same context and may well have created it first, in which case the
    // chain still needs building.
    if (audioGainNode) return audioGainNode;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      audioCtx = audioCtx || new AC();
      audioGainNode = audioCtx.createGain();
      audioGainNode.gain.value = 2.4;
      const comp = audioCtx.createDynamicsCompressor();
      comp.threshold.value = -8;
      comp.knee.value = 6;
      comp.ratio.value = 12;
      audioGainNode.connect(comp);
      comp.connect(audioCtx.destination);
      return audioGainNode;
    } catch (err) {
      audioCtx = null;
      audioGainNode = null;
      return null;
    }
  }

  let speakToken = 0;

  function speak(text) {
    if (!text) return;

    // Identifies this specific request, so a rejection caused by us stopping
    // playback for a newer click isn't mistaken for a real failure — that
    // was firing the robot voice over the top of the audio you just asked for.
    const myToken = ++speakToken;

    if (currentAudioEl) {
      currentAudioEl.pause();
      currentAudioEl = null;
    }
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (err) {
      /* not available in this browser */
    }

    const filename = audioManifest[text];
    if (!filename) {
      speakWithBrowserVoice(text);
      return;
    }

    const audioEl = new Audio(filename);
    currentAudioEl = audioEl;

    const gain = getAudioChain();
    if (gain) {
      try {
        audioCtx.createMediaElementSource(audioEl).connect(gain);
        if (audioCtx.state === 'suspended') audioCtx.resume();
      } catch (err) {
        /* routing failed — the element still plays through its own output */
      }
    }

    function fallback() {
      if (myToken === speakToken) speakWithBrowserVoice(text);
    }

    audioEl.addEventListener('error', fallback);
    audioEl.play().catch(fallback);
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.speak-btn');
    if (btn) speak(btn.dataset.speak);
  });

  const MUTE_KEY = 'slovencina_muted';

  function isMuted() {
    return localStorage.getItem(MUTE_KEY) === '1';
  }

  function setupSound() {
    const toggle = document.getElementById('mute-toggle');
    const onIcon = document.getElementById('sound-on-icon');
    const offIcon = document.getElementById('sound-off-icon');

    function render() {
      const muted = isMuted();
      onIcon.classList.toggle('hidden', muted);
      offIcon.classList.toggle('hidden', !muted);
      toggle.classList.toggle('muted', muted);
    }

    toggle.addEventListener('click', function () {
      localStorage.setItem(MUTE_KEY, isMuted() ? '0' : '1');
      render();
    });

    render();
  }

  // Small synthesized tones (no audio files needed) for practice feedback.
  function playTone(kind) {
    if (isMuted()) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (kind === 'correct') {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(783.99, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        osc.frequency.setValueAtTime(220, now);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      }
    } catch (err) {
      /* Web Audio not available — skip sound, no functional impact */
    }
  }

  /* ---- Streak ---- */

  const STREAK_COUNT_KEY = 'slovencina_streak_count';
  const STREAK_DATE_KEY = 'slovencina_streak_last_date';

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function renderStreak() {
    const badge = document.getElementById('streak-badge');
    const countEl = document.getElementById('streak-count');
    const count = Number(localStorage.getItem(STREAK_COUNT_KEY) || '0');
    countEl.textContent = String(count);
    badge.classList.toggle('zero', count === 0);
  }

  // Called once per completed practice card; only advances the streak the
  // first time it's called on a given calendar day.
  function recordPracticeToday() {
    const today = todayStr();
    const lastDate = localStorage.getItem(STREAK_DATE_KEY);
    if (lastDate === today) return;

    let count = Number(localStorage.getItem(STREAK_COUNT_KEY) || '0');
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    count = lastDate === yesterday ? count + 1 : 1;

    localStorage.setItem(STREAK_COUNT_KEY, String(count));
    localStorage.setItem(STREAK_DATE_KEY, today);
    renderStreak();

    if (count === 3) unlockAchievement('streak-3', '3-Day Streak!');
    if (count === 7) unlockAchievement('streak-7', '7-Day Streak!');
    if (count === 30) unlockAchievement('streak-30', '30-Day Streak — incredible.');
  }

  /* ---- Daily word goal ---- */

  const DAILY_GOAL_TARGET_KEY = 'slovencina_daily_goal_target';
  const DAILY_COUNT_KEY = 'slovencina_daily_practice_count';
  const DEFAULT_DAILY_GOAL = 10;

  function getDailyGoalTarget() {
    return Number(localStorage.getItem(DAILY_GOAL_TARGET_KEY)) || DEFAULT_DAILY_GOAL;
  }

  function setDailyGoalTarget(n) {
    localStorage.setItem(DAILY_GOAL_TARGET_KEY, String(n));
    renderProfile();
  }

  function loadDailyCount() {
    try {
      const data = JSON.parse(localStorage.getItem(DAILY_COUNT_KEY) || '{}');
      return data.date === todayStr() ? data.count || 0 : 0;
    } catch (err) {
      return 0;
    }
  }

  // Counts every graded card today (right or wrong) toward the goal — same
  // philosophy as the "words practiced" stat, which counts exposure, not
  // just correct answers.
  function incrementDailyCount() {
    const today = todayStr();
    let data;
    try {
      data = JSON.parse(localStorage.getItem(DAILY_COUNT_KEY) || '{}');
    } catch (err) {
      data = {};
    }
    const count = data.date === today ? (data.count || 0) + 1 : 1;
    localStorage.setItem(DAILY_COUNT_KEY, JSON.stringify({ date: today, count: count }));
    if (count === getDailyGoalTarget()) unlockAchievement('daily-goal', 'Daily Goal Reached!');
  }

  function setupDailyGoal() {
    const btn = document.getElementById('daily-goal-label');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const input = window.prompt('Set your daily word goal:', String(getDailyGoalTarget()));
      if (input === null) return;
      const n = parseInt(input, 10);
      if (Number.isFinite(n) && n > 0) setDailyGoalTarget(n);
    });
  }

  /* ---- Achievements ---- */

  const ACHIEVEMENTS_KEY = 'slovencina_achievements';

  function getEarnedAchievements() {
    try {
      return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || '[]');
    } catch (err) {
      return [];
    }
  }

  function unlockAchievement(id, label) {
    const earned = getEarnedAchievements();
    if (earned.indexOf(id) !== -1) return;
    earned.push(id);
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(earned));
    showAchievementToast(label);
  }

  let toastTimer = null;

  function showAchievementToast(label) {
    const toast = document.getElementById('achievement-toast');
    toast.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.5L21 9l-5 4.5L17.5 20 12 16.5 6.5 20 8 13.5 3 9l6.6-.5z"/></svg>' +
      '<span>' + escapeHtml(label) + '</span>';
    toast.classList.remove('hidden');
    // A brief timeout (rather than requestAnimationFrame) so the class swap
    // still triggers the fade-in transition even in a backgrounded tab,
    // where rAF callbacks can be paused indefinitely.
    setTimeout(function () {
      toast.classList.add('show');
    }, 10);

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.classList.add('hidden'); }, 300);
    }, 3000);
  }

  const CONFETTI_COLORS = ['#b23a3a', '#c98a2e', '#3f8f5c', '#d4783f', '#7a4a3a'];

  function launchConfetti(container) {
    if (!container) return;
    for (let i = 0; i < 16; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.round(Math.random() * 100) + '%';
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's';
      container.appendChild(piece);
    }
    setTimeout(function () {
      container.querySelectorAll('.confetti-piece').forEach(function (p) { p.remove(); });
    }, 1800);
  }

  function checkWordCountAchievements() {
    const stats = loadVocabStats();
    const wordsSeen = Object.keys(stats).length;
    if (wordsSeen >= 25) unlockAchievement('words-25', '25 Words Practiced');
    if (wordsSeen >= 50) unlockAchievement('words-50', '50 Words Practiced');
    if (wordsSeen >= 100) unlockAchievement('words-100', '100 Words Practiced');
  }

  /* ---- Vocabulary practice mode ---- */

  const VOCAB_STATS_KEY = 'slovencina_vocab_stats';

  function loadVocabStats() {
    try {
      return JSON.parse(localStorage.getItem(VOCAB_STATS_KEY) || '{}');
    } catch (err) {
      return {};
    }
  }

  function saveVocabStats(stats) {
    localStorage.setItem(VOCAB_STATS_KEY, JSON.stringify(stats));
  }

  // Toggles the Tests tab between the AI-generated quiz and the free-practice
  // round picker (this used to be Vocabulary's own tab; it lives here now).
  function setupTestsModes() {
    const buttons = document.querySelectorAll('#panel-tests .content-mode-btn');
    const quizEl = document.getElementById('tests-quiz-mode');
    const practiceEl = document.getElementById('tests-practice-mode');
    const reviewEl = document.getElementById('tests-review-mode');

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
        const mode = btn.dataset.testsMode;
        quizEl.classList.toggle('hidden', mode !== 'quiz');
        practiceEl.classList.toggle('hidden', mode !== 'practice');
        reviewEl.classList.toggle('hidden', mode !== 'review');
        if (mode === 'review') renderReviewQueue();
      });
    });

    document.getElementById('learn-topic-select').addEventListener('change', function (e) {
      renderRoundMap(e.target.value);
    });
  }

  // Every topic's word list is split into small rounds of this size — small
  // enough to hold in your head at once, instead of scrolling a wall of words.
  const ROUND_SIZE = 8;
  // A round counts as cleared, unlocking the next one, once you know at
  // least this fraction of its words without needing to think too hard.
  const ROUND_CLEAR_THRESHOLD = 0.8;

  const ROUND_PROGRESS_KEY = 'slovencina_round_progress';

  function getWordsForTopic(topic) {
    const group = vocabData.find(function (g) { return g.topic === topic; });
    return (group && group.words) || [];
  }

  function chunkIntoRounds(words, size) {
    const rounds = [];
    for (let i = 0; i < words.length; i += size) {
      rounds.push(words.slice(i, i + size));
    }
    return rounds;
  }

  function loadRoundProgress() {
    try {
      return JSON.parse(localStorage.getItem(ROUND_PROGRESS_KEY) || '{}');
    } catch (err) {
      return {};
    }
  }

  function isRoundCleared(topic, roundIndex) {
    const progress = loadRoundProgress();
    return !!(progress[topic] && progress[topic][roundIndex]);
  }

  function setRoundCleared(topic, roundIndex) {
    const progress = loadRoundProgress();
    progress[topic] = progress[topic] || [];
    progress[topic][roundIndex] = true;
    localStorage.setItem(ROUND_PROGRESS_KEY, JSON.stringify(progress));
  }

  function renderRoundMap(topic) {
    document.getElementById('practice-stage').innerHTML = '';
    const mapEl = document.getElementById('round-map');
    if (!topic) {
      mapEl.innerHTML = '';
      return;
    }

    const rounds = chunkIntoRounds(getWordsForTopic(topic), ROUND_SIZE);
    if (!rounds.length) {
      mapEl.innerHTML = '<div class="empty-state">No words in this topic yet.</div>';
      return;
    }

    // Three lanes the path snakes across, like a mobile game's level-select
    // screen, instead of a plain row of cards.
    const LANES = ['align-center', 'align-end', 'align-start'];

    // The lock icon (locked), a star (cleared, like a game level-complete
    // badge), or the round's own number (the one node you can actually play
    // next — there's only ever exactly one, since unlocking is sequential).
    const LOCK_ICON =
      '<svg class="round-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    const STAR_ICON =
      '<svg class="round-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7z"/></svg>';

    mapEl.innerHTML =
      rounds
        .map(function (round, i) {
          const cleared = isRoundCleared(topic, i);
          const locked = !isDevAccount() && i > 0 && !isRoundCleared(topic, i - 1);
          const isCurrent = !cleared && !locked;
          const stateClass = cleared ? 'cleared' : locked ? 'locked' : 'current';

          const inner = cleared ? STAR_ICON : locked ? LOCK_ICON : '<span class="round-num-badge">' + (i + 1) + '</span>';

          return (
            '<div class="round-row ' + LANES[i % LANES.length] + '">' +
            '<div class="round-node-slot">' +
            '<div class="round-node ' + stateClass + '" data-round-index="' + i + '" data-locked="' + locked + '">' +
            inner +
            '<div class="round-label">Round ' + (i + 1) + (isCurrent ? ' · ' + round.length + ' words' : '') + '</div>' +
            '</div>' +
            '</div>' +
            '</div>'
          );
        })
        .join('') +
      '<div class="round-map-hint">Get ' +
      Math.round(ROUND_CLEAR_THRESHOLD * 100) +
      '%+ in a round to unlock the next one.</div>';

    mapEl.querySelectorAll('.round-node').forEach(function (node) {
      node.addEventListener('click', function () {
        if (node.dataset.locked === 'true') return;
        startRound(topic, Number(node.dataset.roundIndex));
      });
    });
  }

  let practiceQueue = [];
  let practiceIndex = 0;
  let practiceCorrect = 0;
  let practiceRevealed = false;
  let practiceGraded = false;
  let currentRoundTopic = null;
  let currentRoundIndex = -1;

  function backToRoundsLinkHtml() {
    return (
      '<button type="button" class="back-to-rounds" id="back-to-rounds-btn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>' +
      'Back to rounds</button>'
    );
  }

  function goBackToRounds() {
    practiceQueue = [];
    document.getElementById('round-map').classList.remove('hidden');
    renderRoundMap(currentRoundTopic);
  }

  function startRound(topic, roundIndex) {
    const rounds = chunkIntoRounds(getWordsForTopic(topic), ROUND_SIZE);
    const words = rounds[roundIndex] || [];
    if (!words.length) return;

    // Shuffle (Fisher-Yates) so the same round doesn't feel identical on a retry.
    const pool = words.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    currentRoundTopic = topic;
    currentRoundIndex = roundIndex;
    practiceQueue = pool;
    practiceIndex = 0;
    practiceCorrect = 0;

    document.getElementById('round-map').classList.add('hidden');
    renderPracticeCard();
  }

  function renderPracticeCard() {
    const stage = document.getElementById('practice-stage');

    if (practiceIndex >= practiceQueue.length) {
      const total = practiceQueue.length;
      const scorePct = total > 0 ? practiceCorrect / total : 0;
      const isPerfect = total > 0 && practiceCorrect === total;
      const isCleared = scorePct >= ROUND_CLEAR_THRESHOLD;

      if (isCleared) setRoundCleared(currentRoundTopic, currentRoundIndex);

      const rounds = chunkIntoRounds(getWordsForTopic(currentRoundTopic), ROUND_SIZE);
      const hasNext = currentRoundIndex + 1 < rounds.length;

      const summaryClass = isPerfect ? 'perfect' : isCleared ? 'cleared' : 'not-cleared';
      const message = isPerfect ? 'Perfect round!' : isCleared ? 'Round cleared!' : 'Not quite — try this round again.';

      stage.innerHTML =
        backToRoundsLinkHtml() +
        '<div class="practice-summary ' + summaryClass + '" id="practice-summary-card">' +
        '<div class="score-big">' + practiceCorrect + ' / ' + total + '</div>' +
        '<p>' + message + '</p>' +
        '<div class="round-summary-actions">' +
        (isCleared && hasNext ? '<button class="btn btn-primary" id="next-round-btn">Next Round</button>' : '') +
        '<button class="btn ' + (isCleared && hasNext ? 'btn-secondary' : 'btn-primary') + '" id="retry-round-btn">Retry This Round</button>' +
        '</div>' +
        '</div>';

      document.getElementById('back-to-rounds-btn').addEventListener('click', goBackToRounds);
      const nextBtn = document.getElementById('next-round-btn');
      if (nextBtn) nextBtn.addEventListener('click', function () { startRound(currentRoundTopic, currentRoundIndex + 1); });
      document.getElementById('retry-round-btn').addEventListener('click', function () { startRound(currentRoundTopic, currentRoundIndex); });

      if (isPerfect) {
        launchConfetti(document.getElementById('practice-summary-card'));
        unlockAchievement('perfect-round', 'Perfect Round!');
      }
      return;
    }

    practiceRevealed = false;
    practiceGraded = false;
    const word = practiceQueue[practiceIndex];

    stage.innerHTML =
      backToRoundsLinkHtml() +
      '<div class="practice-progress">Card ' + (practiceIndex + 1) + ' of ' + practiceQueue.length + '</div>' +
      '<div class="practice-card" id="practice-card">' +
      '<div class="practice-word">' + speakerButtonHtml(word.sk) + escapeHtml(word.sk) + '</div>' +
      '<div class="practice-answer" id="practice-answer"></div>' +
      '<button class="btn btn-secondary" id="practice-reveal-btn">Show Answer</button>' +
      '<div class="practice-grade-row hidden" id="practice-grade-row">' +
      '<button class="btn-grade missed" id="practice-missed-btn">Missed it</button>' +
      '<button class="btn-grade got-it" id="practice-gotit-btn">Got it</button>' +
      '</div>' +
      '</div>';

    document.getElementById('back-to-rounds-btn').addEventListener('click', goBackToRounds);

    document.getElementById('practice-reveal-btn').addEventListener('click', function () {
      practiceRevealed = true;
      document.getElementById('practice-answer').textContent = word.en;
      document.getElementById('practice-reveal-btn').classList.add('hidden');
      document.getElementById('practice-grade-row').classList.remove('hidden');
    });

    document.getElementById('practice-missed-btn').addEventListener('click', function () {
      gradeCard(word, false);
    });
    document.getElementById('practice-gotit-btn').addEventListener('click', function () {
      gradeCard(word, true);
    });
  }

  function gradeCard(word, gotIt) {
    if (practiceGraded) return; // guards against a double-click grading the same card twice
    practiceGraded = true;

    const gradeRow = document.getElementById('practice-grade-row');
    if (gradeRow) gradeRow.style.pointerEvents = 'none';

    const stats = loadVocabStats();
    const entry = stats[word.sk] || { misses: 0 };
    entry.misses = gotIt ? Math.max(0, entry.misses - 1) : entry.misses + 1;
    stats[word.sk] = entry;
    saveVocabStats(stats);

    if (gotIt) practiceCorrect++;
    playTone(gotIt ? 'correct' : 'incorrect');
    recordPracticeToday();
    incrementDailyCount();
    unlockAchievement('first-practice', 'First Practice Complete');
    checkWordCountAchievements();
    renderProfile();

    const card = document.getElementById('practice-card');
    card.classList.add(gotIt ? 'flash-correct' : 'flash-incorrect');

    setTimeout(function () {
      practiceIndex++;
      renderPracticeCard();
    }, 450);
  }

  /* ---- Review (spaced-repetition-lite) ---- */

  // No SM-2 scheduling — just resurfaces whatever currently has misses > 0,
  // worst-missed first. Simpler to reason about, and "misses" is the only
  // signal already being tracked per word.
  const REVIEW_QUEUE_CAP = 25;

  let reviewQueue = [];
  let reviewIndex = 0;
  let reviewGraded = false;

  function getDueReviewWords() {
    const stats = loadVocabStats();
    const allWords = [];
    vocabData.forEach(function (g) {
      (g.words || []).forEach(function (w) { allWords.push(w); });
    });
    const due = allWords.filter(function (w) { return stats[w.sk] && stats[w.sk].misses > 0; });
    due.sort(function (a, b) { return (stats[b.sk].misses || 0) - (stats[a.sk].misses || 0); });
    return due;
  }

  function updateReviewCountBadge() {
    const badge = document.getElementById('review-count-badge');
    if (!badge) return;
    const count = getDueReviewWords().length;
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count === 0);
  }

  function renderReviewQueue() {
    reviewQueue = getDueReviewWords().slice(0, REVIEW_QUEUE_CAP);
    reviewIndex = 0;
    renderReviewCard();
  }

  function renderReviewCard() {
    const stage = document.getElementById('review-stage');
    if (reviewIndex >= reviewQueue.length) {
      stage.innerHTML = reviewQueue.length
        ? '<div class="empty-state">Review complete — nice work!</div>'
        : '<div class="empty-state">Nothing to review right now. Words you miss in Practice or Learn will show up here.</div>';
      return;
    }

    reviewGraded = false;
    const word = reviewQueue[reviewIndex];
    stage.innerHTML =
      '<div class="practice-progress">Reviewing ' + (reviewIndex + 1) + ' of ' + reviewQueue.length + '</div>' +
      '<div class="practice-card" id="review-card">' +
      '<div class="practice-word">' + speakerButtonHtml(word.sk) + escapeHtml(word.sk) + '</div>' +
      '<div class="practice-answer" id="review-answer"></div>' +
      '<button class="btn btn-secondary" id="review-reveal-btn">Show Answer</button>' +
      '<div class="practice-grade-row hidden" id="review-grade-row">' +
      '<button class="btn-grade missed" id="review-missed-btn">Missed it</button>' +
      '<button class="btn-grade got-it" id="review-gotit-btn">Got it</button>' +
      '</div>' +
      '</div>';

    document.getElementById('review-reveal-btn').addEventListener('click', function () {
      document.getElementById('review-answer').textContent = word.en;
      document.getElementById('review-reveal-btn').classList.add('hidden');
      document.getElementById('review-grade-row').classList.remove('hidden');
    });
    document.getElementById('review-missed-btn').addEventListener('click', function () { gradeReviewCard(word, false); });
    document.getElementById('review-gotit-btn').addEventListener('click', function () { gradeReviewCard(word, true); });
  }

  function gradeReviewCard(word, gotIt) {
    if (reviewGraded) return;
    reviewGraded = true;

    const gradeRow = document.getElementById('review-grade-row');
    if (gradeRow) gradeRow.style.pointerEvents = 'none';

    const stats = loadVocabStats();
    const entry = stats[word.sk] || { misses: 0 };
    entry.misses = gotIt ? Math.max(0, entry.misses - 1) : entry.misses + 1;
    stats[word.sk] = entry;
    saveVocabStats(stats);

    playTone(gotIt ? 'correct' : 'incorrect');
    recordPracticeToday();
    incrementDailyCount();
    unlockAchievement('first-practice', 'First Practice Complete');
    checkWordCountAchievements();
    renderProfile();

    const card = document.getElementById('review-card');
    card.classList.add(gotIt ? 'flash-correct' : 'flash-incorrect');

    setTimeout(function () {
      reviewIndex++;
      renderReviewCard();
    }, 450);
  }

  /* ---- Utility: shuffle ---- */

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /* ---- Unified Roadmap (Learn tab) ---- */

  let roadmapSections = [];
  const ROADMAP_PROGRESS_KEY = 'slovencina_roadmap_progress';

  // Resolves the authored sequence in data/curriculum.json into playable
  // sections. Each unit declares its own kind (alphabet / grammar / vocab),
  // and the lesson engine runs activities that fit that kind rather than
  // flashcarding everything.
  function buildRoadmapSections() {
    if (!curriculumData.length || !grammarData.length || !vocabData.length) return;
    if (roadmapSections.length) return; // already built once

    const sections = [];

    curriculumData.forEach(function (unit) {
      if (unit.kind === 'alphabet') {
        const a = alphabetData.find(function (x) { return x.id === unit.ref; });
        if (!a) return; // unresolvable ref: skip rather than show an empty lesson
        sections.push({
          id: unit.id,
          kind: 'alphabet',
          title: a.title,
          subtitle: a.letters.length + ' letters',
          explanation: a.intro || '',
          letters: a.letters,
          items: a.letters.map(function (l) { return l.example; }),
        });
        return;
      }

      if (unit.kind === 'grammar') {
        const t = grammarData.find(function (x) { return x.id === unit.ref; });
        if (!t) return;
        sections.push({
          id: unit.id,
          kind: 'grammar',
          title: t.topic,
          subtitle: t.summary || '',
          explanation: t.explanation || '',
          exercises: t.exercises || [],
          items: t.examples || [],
        });
        return;
      }

      const g = vocabData.find(function (x) { return x.topic === unit.ref; });
      if (!g) return;
      const rounds = chunkIntoRounds(g.words || [], ROUND_SIZE);
      const round = rounds[unit.round];
      if (!round || !round.length) return;
      sections.push({
        id: unit.id,
        kind: 'vocab',
        title: g.topic + (rounds.length > 1 ? ' · Part ' + (unit.round + 1) + ' of ' + rounds.length : ''),
        subtitle: round.length + ' words',
        explanation: '',
        items: round,
      });
    });

    // Anything this account added itself via Add Content isn't in the
    // authored curriculum, so it's appended at the end — same shared-first
    // rule the content merge uses.
    privateVocabData.forEach(function (g) {
      chunkIntoRounds(g.words || [], ROUND_SIZE).forEach(function (round, i) {
        sections.push({
          id: 'private-vocab-' + g.topic + '-' + i,
          kind: 'vocab',
          title: g.topic + ' · Part ' + (i + 1),
          subtitle: round.length + ' words',
          explanation: '',
          items: round,
        });
      });
    });
    privateGrammarData.forEach(function (t) {
      sections.push({
        id: 'private-gram-' + t.id,
        kind: 'grammar',
        title: t.topic,
        subtitle: t.summary || '',
        explanation: t.explanation || '',
        exercises: t.exercises || [],
        items: t.examples || [],
      });
    });

    roadmapSections = sections;
    renderRoadmapMap();
    renderProfile();
  }

  // Progress is keyed by unit id, not array position — reordering the
  // curriculum used to silently repoint existing checkmarks at whatever
  // happened to land at that index.
  function loadRoadmapProgress() {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem(ROADMAP_PROGRESS_KEY) || '{}');
    } catch (err) {
      return {};
    }
    // Legacy index-keyed arrays can't be mapped onto the new unit ids, so
    // they're dropped once. Streak, word stats and badges are unaffected.
    if (Array.isArray(raw)) return {};
    return raw && typeof raw === 'object' ? raw : {};
  }

  function isSectionCleared(id) {
    return !!loadRoadmapProgress()[id];
  }

  function setSectionCleared(id) {
    const p = loadRoadmapProgress();
    p[id] = true;
    localStorage.setItem(ROADMAP_PROGRESS_KEY, JSON.stringify(p));
  }

  function setupLearnModes() {
    const buttons = document.querySelectorAll('#panel-learn .content-mode-btn');
    const roadmapEl = document.getElementById('roadmap-view');
    const browseEl = document.getElementById('learn-browse');

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
        const mode = btn.dataset.learnMode;
        roadmapEl.classList.toggle('hidden', mode !== 'roadmap');
        browseEl.classList.toggle('hidden', mode !== 'browse');
      });
    });

    const searchInput = document.getElementById('browse-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        filterBrowseContent(e.target.value);
      });
    }

    const guideSearchInput = document.getElementById('guide-search-input');
    if (guideSearchInput) {
      guideSearchInput.addEventListener('input', function (e) {
        filterGuideContent(e.target.value);
      });
    }
  }

  function renderRoadmapMap() {
    const mapEl = document.getElementById('roadmap-map');
    if (!roadmapSections.length) {
      mapEl.innerHTML = '<div class="empty-state">Loading your roadmap…</div>';
      return;
    }

    const LANES = ['align-center', 'align-end', 'align-start'];
    const LOCK_ICON =
      '<svg class="round-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    const STAR_ICON =
      '<svg class="round-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7z"/></svg>';

    mapEl.innerHTML =
      roadmapSections
        .map(function (section, i) {
          const cleared = isSectionCleared(section.id);
          const locked = !isDevAccount() && i > 0 && !isSectionCleared(roadmapSections[i - 1].id);
          const isCurrent = !cleared && !locked;
          const stateClass = cleared ? 'cleared' : locked ? 'locked' : 'current';
          const inner = cleared ? STAR_ICON : locked ? LOCK_ICON : '<span class="round-num-badge">' + (i + 1) + '</span>';

          return (
            '<div class="round-row ' + LANES[i % LANES.length] + '">' +
            '<div class="round-node-slot">' +
            '<div class="round-node ' + stateClass + '" data-section-index="' + i + '" data-locked="' + locked + '">' +
            inner +
            '<div class="round-label">' + escapeHtml(section.title) + '</div>' +
            '</div>' +
            '</div>' +
            '</div>'
          );
        })
        .join('') +
      '<div class="round-map-hint">Get ' + Math.round(ROUND_CLEAR_THRESHOLD * 100) + '%+ overall to unlock the next section.</div>';

    mapEl.querySelectorAll('.round-node').forEach(function (node) {
      node.addEventListener('click', function () {
        if (node.dataset.locked === 'true') return;
        startLesson(Number(node.dataset.sectionIndex));
      });
    });
  }

  /* ---- Full-screen lesson flow: Learn -> Practice -> Voice -> Quiz ---- */

  let lessonSectionIndex = -1;
  let lessonPhase = 'learn';
  let lessonPracticeCorrect = 0;
  let lessonPracticeTotal = 0;
  let lessonVoiceCorrect = 0;
  let lessonVoiceTotal = 0;
  let lessonQuizCorrect = 0;
  let lessonQuizTotal = 0;

  function setupLessonOverlay() {
    document.getElementById('lesson-exit-btn').addEventListener('click', exitLesson);

    // Dev/preview accounts can press P to skip the item on screen, so the
    // whole flow can be walked through quickly after an update without
    // answering everything. Skipped items are removed from the phase total
    // rather than counted wrong, so the score stays honest.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'p' && e.key !== 'P') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      if (document.getElementById('lesson-overlay').classList.contains('hidden')) return;
      if (!isDevAccount()) return;
      e.preventDefault();
      skipCurrentLessonItem();
    });
  }

  function skipCurrentLessonItem() {
    const section = roadmapSections[lessonSectionIndex];
    if (!section) return;

    if (lessonPhase === 'learn') {
      lessonPhase = 'practice';
      renderLessonPhase();
      return;
    }

    if (lessonPhase === 'voice') {
      stopVoiceRecognition();
      lessonVoiceTotal = Math.max(0, lessonVoiceTotal - 1);
      voiceIndex++;
      renderVoiceStep();
      return;
    }

    const usesExercises = section.kind !== 'vocab';

    if (lessonPhase === 'practice') {
      lessonPracticeTotal = Math.max(0, lessonPracticeTotal - 1);
      if (usesExercises) {
        exerciseIndex++;
        renderExerciseStep();
      } else {
        lessonQueueIndex++;
        renderPracticeCardStep();
      }
      return;
    }

    if (lessonPhase === 'quiz') {
      lessonQuizTotal = Math.max(0, lessonQuizTotal - 1);
      if (usesExercises) {
        exerciseIndex++;
        renderExerciseStep();
      } else {
        quizIndex++;
        renderQuizStep();
      }
    }
  }

  function startLesson(index) {
    lessonSectionIndex = index;
    lessonPhase = 'learn';
    lessonPracticeCorrect = 0;
    lessonPracticeTotal = 0;
    lessonVoiceCorrect = 0;
    lessonVoiceTotal = 0;
    lessonQuizCorrect = 0;
    lessonQuizTotal = 0;
    document.getElementById('lesson-overlay').classList.remove('hidden');
    renderLessonPhase();
  }

  function exitLesson() {
    stopVoiceRecognition();
    document.getElementById('lesson-overlay').classList.add('hidden');
    renderRoadmapMap();
    renderProfile();
  }

  function updateLessonChrome(label, stepIndex) {
    document.getElementById('lesson-phase-label').textContent = label;
    document.getElementById('lesson-progress-fill').style.width = (stepIndex / 4) * 100 + '%';

    const topbar = document.querySelector('.lesson-topbar');
    let hint = document.getElementById('dev-skip-hint');
    if (isDevAccount()) {
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'dev-skip-hint';
        hint.className = 'dev-skip-hint';
        hint.textContent = 'dev: press P to skip';
        topbar.appendChild(hint);
      }
    } else if (hint) {
      hint.remove();
    }
  }

  function renderLessonPhase() {
    if (lessonPhase === 'learn') renderLearnPhase();
    else if (lessonPhase === 'practice') renderPracticePhase();
    else if (lessonPhase === 'voice') renderVoicePhase();
    else if (lessonPhase === 'quiz') renderQuizPhase();
    else renderFinishPhase();
  }

  function kindLabel(kind) {
    if (kind === 'alphabet') return 'Alphabet';
    if (kind === 'grammar') return 'Grammar';
    return 'Vocabulary';
  }

  function renderLearnPhase() {
    updateLessonChrome('Learn', 0);
    const section = roadmapSections[lessonSectionIndex];
    const body = document.getElementById('lesson-body');

    // Alphabet units get letter cards — the letter itself, what it sounds
    // like, and a word to hear it in. A sk/en list would teach vocabulary
    // instead of the alphabet.
    const content =
      section.kind === 'alphabet'
        ? '<div class="letter-grid">' +
          section.letters
            .map(function (l) {
              return (
                '<div class="letter-card">' +
                '<div class="letter-glyph">' + escapeHtml(l.letter) + '</div>' +
                // The short hint is what the drills test, so it has to be the
                // line that stands out; the fuller description sits under it.
                '<div class="letter-hint">' + escapeHtml(l.hint) + '</div>' +
                '<div class="letter-sound">' + escapeHtml(l.sound) + '</div>' +
                '<div class="letter-example">' +
                speakerButtonHtml(l.example.sk) +
                escapeHtml(l.example.sk) +
                ' <span class="en">' + escapeHtml(l.example.en) + '</span>' +
                '</div>' +
                '</div>'
              );
            })
            .join('') +
          '</div>'
        : '<div class="lesson-learn-list">' +
          section.items
            .map(function (it) {
              return (
                '<div class="lesson-learn-row"><span class="sk">' +
                speakerButtonHtml(it.sk) +
                escapeHtml(it.sk) +
                '</span><span class="en">' +
                escapeHtml(it.en) +
                '</span></div>'
              );
            })
            .join('') +
          '</div>';

    body.innerHTML =
      '<div class="lesson-stage">' +
      '<div class="lesson-eyebrow">' + kindLabel(section.kind) + '</div>' +
      '<h2 class="lesson-heading">' + escapeHtml(section.title) + '</h2>' +
      (section.subtitle ? '<p class="lesson-sub">' + escapeHtml(section.subtitle) + '</p>' : '') +
      (section.explanation ? '<div class="lesson-grammar-explanation">' + escapeHtml(section.explanation) + '</div>' : '') +
      (section.items.length || section.kind === 'alphabet' ? content : '') +
      '<button class="btn btn-primary" id="lesson-learn-next-btn" style="width:100%; max-width:320px;">I’m Ready — Start Practice</button>' +
      '</div>';

    document.getElementById('lesson-learn-next-btn').addEventListener('click', function () {
      lessonPhase = 'practice';
      renderLessonPhase();
    });
  }

  /* ---- Exercises (alphabet + grammar): multiple choice, auto-graded ---- */

  // Alphabet drills are generated from the letter data rather than authored,
  // so they stay correct automatically if letters change. Two directions:
  // sound -> letter, and letter -> sound.
  function buildAlphabetExercises(section) {
    const allLetters = [];
    alphabetData.forEach(function (u) { (u.letters || []).forEach(function (l) { allLetters.push(l); }); });

    function distractors(pool, correct, n) {
      const others = shuffleArray(pool.filter(function (v) { return v !== correct; }));
      return others.slice(0, n);
    }

    const exercises = [];
    section.letters.forEach(function (l) {
      const explain = l.letter + ' — ' + l.hint + ', as in ' + l.example.sk + ' (' + l.example.en + ').';

      // Both drills start from the letter itself, which is the concrete thing
      // a beginner is looking at. The old sound -> letter direction asked
      // people to reverse-engineer a phonetics description ("a glide, 'uo' —
      // starts at u and slides into o") into a letter they'd never seen,
      // which is a linguistics exercise, not an alphabet one.
      const hintPool = allLetters.map(function (x) { return x.hint; });
      exercises.push({
        prompt: l.letter,
        question: 'What sound does this letter make?',
        options: [l.hint].concat(distractors(hintPool, l.hint, 3)),
        answer: l.hint,
        explain: explain,
      });

      // Spotting the letter inside a real word — the other half of actually
      // knowing an alphabet. Distractors must genuinely not contain it.
      const cleanWords = allLetters
        .map(function (x) { return x.example.sk; })
        .filter(function (w) { return w.toLowerCase().indexOf(l.letter.toLowerCase()) === -1; });
      if (cleanWords.length >= 3) {
        exercises.push({
          prompt: l.letter,
          question: 'Which word has this letter in it?',
          options: [l.example.sk].concat(distractors(cleanWords, l.example.sk, 3)),
          answer: l.example.sk,
          explain: explain,
        });
      }
    });
    return exercises;
  }

  function exercisesFor(section) {
    if (section.kind === 'alphabet') return buildAlphabetExercises(section);
    if (section.kind === 'grammar') return (section.exercises || []).slice();
    return [];
  }

  let exerciseQueue = [];
  let exerciseIndex = 0;
  let exerciseAnswered = false;
  let exerciseScoreTarget = 'practice'; // which counter this run feeds

  function renderExerciseStep() {
    const body = document.getElementById('lesson-body');
    const isPractice = exerciseScoreTarget === 'practice';

    if (exerciseIndex >= exerciseQueue.length) {
      lessonPhase = isPractice ? 'voice' : 'finish';
      renderLessonPhase();
      return;
    }

    exerciseAnswered = false;
    const ex = exerciseQueue[exerciseIndex];
    const options = shuffleArray(ex.options.slice());

    body.innerHTML =
      '<div class="lesson-stage">' +
      '<div class="lesson-eyebrow">' + (isPractice ? 'Practice' : 'Quiz') + ' · ' + (exerciseIndex + 1) + ' / ' + exerciseQueue.length + '</div>' +
      '<h2 class="lesson-heading exercise-prompt">' + escapeHtml(ex.prompt) + '</h2>' +
      '<p class="lesson-sub">' + escapeHtml(ex.question) + '</p>' +
      '<div class="quiz-choice-list">' +
      options
        .map(function (opt) {
          return '<button type="button" class="quiz-choice-btn" data-value="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
        })
        .join('') +
      '</div>' +
      '<div class="exercise-explain" id="exercise-explain"></div>' +
      '</div>';

    body.querySelectorAll('.quiz-choice-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (exerciseAnswered) return;
        exerciseAnswered = true;

        const chosen = btn.dataset.value;
        const right = chosen === ex.answer;

        body.querySelectorAll('.quiz-choice-btn').forEach(function (b) {
          b.disabled = true;
          if (b.dataset.value === ex.answer) b.classList.add('correct');
          else if (b === btn) b.classList.add('incorrect');
        });

        if (right) {
          if (isPractice) lessonPracticeCorrect++;
          else lessonQuizCorrect++;
        }
        playTone(right ? 'correct' : 'incorrect');
        incrementDailyCount();

        const explainEl = document.getElementById('exercise-explain');
        if (ex.explain) explainEl.textContent = ex.explain;
        explainEl.classList.add('visible');

        setTimeout(function () {
          exerciseIndex++;
          renderExerciseStep();
        }, right ? 900 : 2200);
      });
    });
  }

  let lessonQueue = [];
  let lessonQueueIndex = 0;
  let lessonCardGraded = false;
  let lessonCurrentPracticeItem = null;

  function renderPracticePhase() {
    updateLessonChrome('Practice', 1);
    const section = roadmapSections[lessonSectionIndex];

    // Alphabet and grammar practise by applying the rule, not by translating.
    if (section.kind !== 'vocab') {
      exerciseQueue = shuffleArray(exercisesFor(section)).slice(0, 10);
      exerciseIndex = 0;
      exerciseScoreTarget = 'practice';
      lessonPracticeCorrect = 0;
      lessonPracticeTotal = exerciseQueue.length;
      renderExerciseStep();
      return;
    }

    lessonQueue = shuffleArray(section.items.slice());
    lessonQueueIndex = 0;
    lessonPracticeCorrect = 0;
    lessonPracticeTotal = lessonQueue.length;
    renderPracticeCardStep();
  }

  function renderPracticeCardStep() {
    const body = document.getElementById('lesson-body');

    if (lessonQueueIndex >= lessonQueue.length) {
      lessonPhase = 'voice';
      renderLessonPhase();
      return;
    }

    lessonCardGraded = false;
    const item = lessonQueue[lessonQueueIndex];
    lessonCurrentPracticeItem = item;

    body.innerHTML =
      '<div class="lesson-stage">' +
      '<div class="lesson-eyebrow">Practice · ' + (lessonQueueIndex + 1) + ' / ' + lessonQueue.length + '</div>' +
      '<div class="practice-card" id="lesson-practice-card" style="max-width:460px;">' +
      '<div class="practice-word">' + speakerButtonHtml(item.sk) + escapeHtml(item.sk) + '</div>' +
      '<div class="practice-answer" id="lesson-practice-answer"></div>' +
      '<button class="btn btn-secondary" id="lesson-reveal-btn">Show Answer</button>' +
      '<div class="practice-grade-row hidden" id="lesson-grade-row">' +
      '<button class="btn-grade missed" id="lesson-missed-btn">Missed it</button>' +
      '<button class="btn-grade got-it" id="lesson-gotit-btn">Got it</button>' +
      '</div>' +
      '</div>' +
      '</div>';

    document.getElementById('lesson-reveal-btn').addEventListener('click', function () {
      document.getElementById('lesson-practice-answer').textContent = item.en;
      document.getElementById('lesson-reveal-btn').classList.add('hidden');
      document.getElementById('lesson-grade-row').classList.remove('hidden');
    });
    document.getElementById('lesson-missed-btn').addEventListener('click', function () { gradeLessonPracticeCard(false); });
    document.getElementById('lesson-gotit-btn').addEventListener('click', function () { gradeLessonPracticeCard(true); });
  }

  function gradeLessonPracticeCard(gotIt) {
    if (lessonCardGraded) return;
    lessonCardGraded = true;

    // Feeds the same shared word-stats store Tests > Practice uses, so
    // "words practiced" on the Profile tab and the word-count achievements
    // count roadmap practice too, not just the standalone practice picker.
    if (lessonCurrentPracticeItem) {
      const stats = loadVocabStats();
      const entry = stats[lessonCurrentPracticeItem.sk] || { misses: 0 };
      entry.misses = gotIt ? Math.max(0, entry.misses - 1) : entry.misses + 1;
      stats[lessonCurrentPracticeItem.sk] = entry;
      saveVocabStats(stats);
      incrementDailyCount();
    }

    if (gotIt) lessonPracticeCorrect++;
    playTone(gotIt ? 'correct' : 'incorrect');

    const card = document.getElementById('lesson-practice-card');
    card.classList.add(gotIt ? 'flash-correct' : 'flash-incorrect');

    setTimeout(function () {
      lessonQueueIndex++;
      renderPracticeCardStep();
    }, 400);
  }

  // Speech recognition transcripts frequently drop Slovak diacritics even
  // when the pronunciation itself was correct, so comparison is deliberately
  // lenient — it strips diacritics on both sides rather than requiring an
  // exact match, which would punish correct speech for a transcription quirk.
  // Google's Slovak recognition is noticeably weaker than for major
  // languages and regularly returns a near-miss ("zen" for "žena"). Marking
  // a genuinely correct attempt wrong is worse here than being slightly
  // generous, so small edit distances count as a match.
  // Counts an adjacent swap as one edit rather than two, because a
  // transposed pair ("sokla" for "skola") is the recogniser garbling the
  // word, not the learner mispronouncing it.
  function editDistance(a, b) {
    const m = a.length;
    const n = b.length;
    const d = [];
    for (let i = 0; i <= m; i++) {
      d.push(new Array(n + 1).fill(0));
      d[i][0] = i;
    }
    for (let j = 0; j <= n; j++) d[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[m][n];
  }

  function isCloseEnough(heard, target) {
    if (!heard || !target) return false;
    const allowed = Math.max(1, Math.floor(target.length * 0.34));
    return editDistance(heard, target) <= allowed;
  }

  function normalizeForVoiceCompare(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  let voiceQueue = [];
  let voiceIndex = 0;
  let activeMediaRecorder = null;
  let activeMediaStream = null;
  let recordedChunks = [];

  // Records locally via the standard MediaRecorder API (not gated by any
  // browser's speech-recognition backend — Brave's Shields, for instance,
  // block Google's built-in SpeechRecognition service specifically, but
  // plain microphone recording is untouched) and sends the clip to our own
  // server for transcription instead of relying on the browser's free,
  // Google-backend-dependent speech feature.
  function getSupportedRecordingFormat() {
    if (!window.MediaRecorder) return null;
    const candidates = [
      { mime: 'audio/webm;codecs=opus', encoding: 'WEBM_OPUS' },
      { mime: 'audio/webm', encoding: 'WEBM_OPUS' },
      { mime: 'audio/ogg;codecs=opus', encoding: 'OGG_OPUS' },
    ];
    for (let i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i].mime)) return candidates[i];
    }
    return null;
  }

  function renderVoicePhase() {
    updateLessonChrome('Voice', 2);

    if (!getSupportedRecordingFormat() || !navigator.mediaDevices) {
      const body = document.getElementById('lesson-body');
      body.innerHTML =
        '<div class="lesson-stage">' +
        '<div class="lesson-eyebrow">Voice</div>' +
        '<h2 class="lesson-heading">Voice practice isn’t available in this browser</h2>' +
        '<p class="lesson-sub">Microphone recording isn’t supported here — this phase is skipped and won’t count against you.</p>' +
        '<button class="btn btn-primary" id="lesson-voice-skip-btn">Continue to Quiz</button>' +
        '</div>';
      document.getElementById('lesson-voice-skip-btn').addEventListener('click', function () {
        lessonVoiceTotal = 0;
        lessonVoiceCorrect = 0;
        lessonPhase = 'quiz';
        renderLessonPhase();
      });
      return;
    }

    // Capped at 5 items so this phase stays quick even for a big section.
    voiceQueue = shuffleArray(roadmapSections[lessonSectionIndex].items.slice()).slice(0, 5);
    voiceIndex = 0;
    lessonVoiceCorrect = 0;
    lessonVoiceTotal = voiceQueue.length;
    renderVoiceStep();
  }

  function renderVoiceStep() {
    const body = document.getElementById('lesson-body');

    if (voiceIndex >= voiceQueue.length) {
      lessonPhase = 'quiz';
      renderLessonPhase();
      return;
    }

    const item = voiceQueue[voiceIndex];

    body.innerHTML =
      '<div class="lesson-stage">' +
      '<div class="lesson-eyebrow">Voice · ' + (voiceIndex + 1) + ' / ' + voiceQueue.length + '</div>' +
      '<h2 class="lesson-heading">' + speakerButtonHtml(item.sk) + escapeHtml(item.sk) + '</h2>' +
      '<p class="lesson-sub">Listen, tap the mic, say it, then tap again to check.</p>' +
      '<button class="mic-btn" id="lesson-mic-btn" aria-label="Start recording">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 19v3"/></svg>' +
      '</button>' +
      '<div class="voice-heard" id="voice-heard"></div>' +
      '<div id="voice-result"></div>' +
      '<div id="voice-skip-wrap"></div>' +
      '</div>';

    document.getElementById('lesson-mic-btn').addEventListener('click', function () {
      toggleVoiceRecording(item);
    });
  }

  // Ends the voice phase early, counting only the items actually attempted
  // (not the ones skipped) — used when recording or transcription genuinely
  // can't work (e.g. mic permission denied), so the user isn't stuck
  // retrying something that won't succeed.
  function skipRestOfVoicePhase() {
    lessonVoiceTotal = voiceIndex;
    lessonPhase = 'quiz';
    renderLessonPhase();
  }

  function showVoiceSkipOption() {
    const skipWrap = document.getElementById('voice-skip-wrap');
    if (!skipWrap) return;
    skipWrap.innerHTML = '<button class="btn btn-secondary" id="voice-skip-btn" style="margin-top:12px;">Skip Voice Practice</button>';
    document.getElementById('voice-skip-btn').addEventListener('click', skipRestOfVoicePhase);
  }

  async function toggleVoiceRecording(item) {
    const micBtn = document.getElementById('lesson-mic-btn');
    const heardEl = document.getElementById('voice-heard');
    const resultEl = document.getElementById('voice-result');

    if (micBtn.classList.contains('listening')) {
      if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') activeMediaRecorder.stop();
      return;
    }

    const format = getSupportedRecordingFormat();
    resultEl.innerHTML = '';

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      heardEl.textContent = 'Microphone access was denied or is unavailable.';
      showVoiceSkipOption();
      return;
    }

    activeMediaStream = stream;

    recordedChunks = [];
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: format.mime });
    } catch (err) {
      heardEl.textContent = 'Could not start recording in this browser.';
      stream.getTracks().forEach(function (t) { t.stop(); });
      showVoiceSkipOption();
      return;
    }
    activeMediaRecorder = recorder;

    recorder.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      micBtn.classList.remove('listening');
      const blob = new Blob(recordedChunks, { type: format.mime });
      transcribeRecording(blob, format.encoding, item);
    };

    recorder.start();
    micBtn.classList.add('listening');
    heardEl.textContent = 'Listening… tap the mic again to stop.';

    // Safety-net auto-stop so a forgotten tap doesn't record indefinitely.
    setTimeout(function () {
      if (recorder.state !== 'inactive') recorder.stop();
    }, 6000);
  }

  function transcribeRecording(blob, encoding, item) {
    const heardEl = document.getElementById('voice-heard');
    const resultEl = document.getElementById('voice-result');
    heardEl.textContent = 'Checking what you said…';

    const reader = new FileReader();
    reader.onload = async function () {
      const base64 = String(reader.result).split(',')[1] || '';

      const result = await postJsonWithRetry(
        '/.netlify/functions/transcribe-audio',
        { audioBase64: base64, encoding: encoding, expected: item && item.sk },
        { initialMessage: '', onStatus: function () {} }
      );

      if (!result.ok) {
        if (result.status === 401) {
          clearSessionToken();
          location.reload();
          return;
        }
        heardEl.textContent = result.error;
        showVoiceSkipOption();
        return;
      }

      const transcript = result.data.transcript || '';
      const target = normalizeForVoiceCompare(item.sk);
      const norm = normalizeForVoiceCompare(transcript);
      const isMatch = norm.length > 0 && (norm === target || norm.indexOf(target) !== -1 || target.indexOf(norm) !== -1 || isCloseEnough(norm, target));

      heardEl.textContent = transcript ? 'Heard: “' + transcript + '”' : 'Didn’t catch that — try again next time.';
      resultEl.innerHTML = isMatch
        ? '<div class="voice-feedback correct">Nice!</div>'
        : '<div class="voice-feedback incorrect">Not quite — expected “' + escapeHtml(item.sk) + '”</div>';

      if (isMatch) {
        lessonVoiceCorrect++;
        playTone('correct');
      } else {
        playTone('incorrect');
      }

      setTimeout(function () {
        voiceIndex++;
        renderVoiceStep();
      }, 1200);
    };
    reader.onerror = function () {
      heardEl.textContent = 'Could not process the recording.';
      showVoiceSkipOption();
    };
    reader.readAsDataURL(blob);
  }

  function stopVoiceRecognition() {
    if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
      try {
        activeMediaRecorder.stop();
      } catch (err) {
        /* already stopped */
      }
    }
    if (activeMediaStream) {
      activeMediaStream.getTracks().forEach(function (t) { t.stop(); });
      activeMediaStream = null;
    }
    activeMediaRecorder = null;
  }

  let quizQueue = [];
  let quizIndex = 0;
  let quizAnswered = false;

  function renderQuizPhase() {
    updateLessonChrome('Quiz', 3);
    const section = roadmapSections[lessonSectionIndex];

    // Same split as practice: rule-application units get tested on the rule,
    // not on what the example words mean.
    if (section.kind !== 'vocab') {
      exerciseQueue = shuffleArray(exercisesFor(section)).slice(0, 5);
      exerciseIndex = 0;
      exerciseScoreTarget = 'quiz';
      lessonQuizCorrect = 0;
      lessonQuizTotal = exerciseQueue.length;
      renderExerciseStep();
      return;
    }

    const count = Math.min(5, section.items.length);
    quizQueue = shuffleArray(section.items.slice()).slice(0, count);
    quizIndex = 0;
    lessonQuizCorrect = 0;
    lessonQuizTotal = quizQueue.length;
    renderQuizStep();
  }

  function renderQuizStep() {
    const body = document.getElementById('lesson-body');

    if (quizIndex >= quizQueue.length) {
      lessonPhase = 'finish';
      renderLessonPhase();
      return;
    }

    quizAnswered = false;
    const correct = quizQueue[quizIndex];
    const section = roadmapSections[lessonSectionIndex];

    let distractorPool = section.items.filter(function (it) { return it.en !== correct.en; });
    if (distractorPool.length < 3) {
      const allPairs = [];
      vocabData.forEach(function (g) { (g.words || []).forEach(function (w) { allPairs.push(w); }); });
      distractorPool = allPairs.filter(function (w) { return w.en !== correct.en; });
    }
    const distractors = shuffleArray(distractorPool.slice()).slice(0, 3);
    const options = shuffleArray([correct].concat(distractors));

    body.innerHTML =
      '<div class="lesson-stage">' +
      '<div class="lesson-eyebrow">Quiz · ' + (quizIndex + 1) + ' / ' + quizQueue.length + '</div>' +
      '<h2 class="lesson-heading">' + speakerButtonHtml(correct.sk) + escapeHtml(correct.sk) + '</h2>' +
      '<p class="lesson-sub">What does this mean?</p>' +
      '<div class="quiz-choice-list">' +
      options
        .map(function (opt) {
          return (
            '<button type="button" class="quiz-choice-btn" data-correct="' +
            (opt.en === correct.en) +
            '">' +
            escapeHtml(opt.en) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</div>';

    body.querySelectorAll('.quiz-choice-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { gradeQuizChoice(btn); });
    });
  }

  function gradeQuizChoice(btn) {
    if (quizAnswered) return;
    quizAnswered = true;

    const isCorrect = btn.dataset.correct === 'true';
    const body = document.getElementById('lesson-body');

    body.querySelectorAll('.quiz-choice-btn').forEach(function (b) {
      b.disabled = true;
      if (b.dataset.correct === 'true') b.classList.add('correct');
      else if (b === btn) b.classList.add('incorrect');
    });

    if (isCorrect) lessonQuizCorrect++;
    playTone(isCorrect ? 'correct' : 'incorrect');

    setTimeout(function () {
      quizIndex++;
      renderQuizStep();
    }, 700);
  }

  function renderFinishPhase() {
    updateLessonChrome('Done', 4);

    const totalRight = lessonPracticeCorrect + lessonVoiceCorrect + lessonQuizCorrect;
    const totalPossible = lessonPracticeTotal + lessonVoiceTotal + lessonQuizTotal;
    const pct = totalPossible > 0 ? totalRight / totalPossible : 0;
    const cleared = pct >= ROUND_CLEAR_THRESHOLD;
    const isPerfect = totalPossible > 0 && totalRight === totalPossible;

    if (cleared) setSectionCleared(roadmapSections[lessonSectionIndex].id);
    recordPracticeToday();
    unlockAchievement('first-practice', 'First Practice Complete');
    checkWordCountAchievements();

    const hasNext = lessonSectionIndex + 1 < roadmapSections.length;
    const summaryClass = isPerfect ? 'perfect' : cleared ? 'cleared' : 'not-cleared';
    const message = isPerfect ? 'Perfect!' : cleared ? 'Section cleared!' : 'Not quite — try this section again.';

    const body = document.getElementById('lesson-body');
    body.innerHTML =
      '<div class="lesson-finish-card ' + summaryClass + '" id="lesson-finish-card">' +
      '<div class="score-big">' + Math.round(pct * 100) + '%</div>' +
      '<p>' + message + '</p>' +
      '<div class="round-summary-actions">' +
      (cleared && hasNext ? '<button class="btn btn-primary" id="lesson-next-section-btn">Next Section</button>' : '') +
      '<button class="btn ' + (cleared && hasNext ? 'btn-secondary' : 'btn-primary') + '" id="lesson-retry-btn">Retry This Section</button>' +
      '<button class="btn btn-secondary" id="lesson-done-btn">Back to Roadmap</button>' +
      '</div>' +
      '</div>';

    if (isPerfect) {
      launchConfetti(document.getElementById('lesson-finish-card'));
      unlockAchievement('perfect-round', 'Perfect Round!');
    }

    const nextBtn = document.getElementById('lesson-next-section-btn');
    if (nextBtn) nextBtn.addEventListener('click', function () { startLesson(lessonSectionIndex + 1); });
    document.getElementById('lesson-retry-btn').addEventListener('click', function () { startLesson(lessonSectionIndex); });
    document.getElementById('lesson-done-btn').addEventListener('click', exitLesson);
  }

  /* ---- Profile ---- */

  const TIME_SPENT_KEY = 'slovencina_time_spent_ms';
  let sessionStartTime = Date.now();

  function getTotalTimeSpentMs() {
    const stored = Number(localStorage.getItem(TIME_SPENT_KEY) || '0');
    return stored + (Date.now() - sessionStartTime);
  }

  function flushTimeSpent() {
    localStorage.setItem(TIME_SPENT_KEY, String(getTotalTimeSpentMs()));
    sessionStartTime = Date.now();
  }

  function setupTimeTracking() {
    setInterval(flushTimeSpent, 30000);
    window.addEventListener('beforeunload', flushTimeSpent);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) flushTimeSpent();
    });
    document.querySelector('[data-tab="profile"]').addEventListener('click', renderProfile);
  }

  const ALL_BADGES = [
    { id: 'first-practice', label: 'First Practice' },
    { id: 'perfect-round', label: 'Perfect Round' },
    { id: 'streak-3', label: '3-Day Streak' },
    { id: 'streak-7', label: '7-Day Streak' },
    { id: 'streak-30', label: '30-Day Streak' },
    { id: 'words-25', label: '25 Words' },
    { id: 'words-50', label: '50 Words' },
    { id: 'words-100', label: '100 Words' },
    { id: 'daily-goal', label: 'Daily Goal Hit' },
  ];

  function renderBadges() {
    const earned = getEarnedAchievements();
    const starIcon = '<svg class="badge-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7z"/></svg>';

    document.getElementById('profile-badges').innerHTML = ALL_BADGES.map(function (b) {
      const has = earned.indexOf(b.id) !== -1;
      return '<div class="badge-card' + (has ? '' : ' locked') + '">' + starIcon + '<div class="badge-name">' + b.label + '</div></div>';
    }).join('');
  }

  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

  function renderProfile() {
    const totalSections = roadmapSections.length;
    const progress = loadRoadmapProgress();
    const clearedCount = roadmapSections.filter(function (s) { return progress[s.id]; }).length;
    const pct = totalSections > 0 ? Math.round((clearedCount / totalSections) * 100) : 0;

    document.getElementById('profile-pct').textContent = pct + '%';
    document.getElementById('profile-ring-fill').style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - pct / 100));
    document.getElementById('stat-sections').textContent = clearedCount + ' / ' + totalSections;

    const stats = loadVocabStats();
    document.getElementById('stat-words').textContent = String(Object.keys(stats).length);

    const minutes = Math.round(getTotalTimeSpentMs() / 60000);
    document.getElementById('stat-time').textContent =
      minutes < 60 ? minutes + 'm' : Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';

    document.getElementById('stat-streak').textContent = String(Number(localStorage.getItem(STREAK_COUNT_KEY) || '0'));

    const dailyCount = loadDailyCount();
    const dailyTarget = getDailyGoalTarget();
    const dailyFill = document.getElementById('daily-goal-fill');
    if (dailyFill) dailyFill.style.width = Math.min(100, Math.round((dailyCount / dailyTarget) * 100)) + '%';
    const dailyLabel = document.getElementById('daily-goal-label');
    if (dailyLabel) dailyLabel.textContent = dailyCount + ' / ' + dailyTarget + ' today';

    updateReviewCountBadge();

    let nextIdx = -1;
    for (let i = 0; i < totalSections; i++) {
      if (!progress[roadmapSections[i].id]) {
        nextIdx = i;
        break;
      }
    }

    const nextCard = document.getElementById('profile-next-card');
    if (totalSections === 0) {
      nextCard.innerHTML = '<div class="next-info"><div class="next-label">Loading…</div></div>';
      nextCard.onclick = null;
    } else if (nextIdx === -1) {
      nextCard.innerHTML = '<div class="next-info"><div class="next-label">All done</div><div class="next-title">You’ve cleared every section!</div></div>';
      nextCard.onclick = null;
    } else {
      const section = roadmapSections[nextIdx];
      nextCard.innerHTML =
        '<div class="next-info">' +
        '<div class="next-label">Up next</div>' +
        '<div class="next-title">' + escapeHtml(section.title) + '</div>' +
        '<div class="next-sub">' + kindLabel(section.kind) + ' · Section ' + (nextIdx + 1) + ' of ' + totalSections + '</div>' +
        '</div>';
      nextCard.onclick = function () {
        document.querySelector('[data-tab="learn"]').click();
        startLesson(nextIdx);
      };
    }

    renderBadges();
    scheduleProgressSync();
  }

  // Renders the {name, streakCount} leaderboard fetched from the server —
  // never anything more sensitive (see leaderboard.js).
  async function renderLeaderboard() {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    const token = getSessionToken();
    if (!token) return;

    try {
      const res = await fetch('/.netlify/functions/leaderboard', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) {
        listEl.innerHTML = '<div class="empty-state">Could not load the leaderboard.</div>';
        return;
      }
      const data = await res.json();
      const entries = data.entries || [];

      if (!entries.length) {
        listEl.innerHTML = '<div class="empty-state">No one on the leaderboard yet.</div>';
        return;
      }

      listEl.innerHTML = entries
        .map(function (e, i) {
          return (
            '<div class="leaderboard-row"><span class="leaderboard-rank">' +
            (i + 1) +
            '</span><span class="leaderboard-name">' +
            escapeHtml(e.name) +
            '</span><span class="leaderboard-streak">' +
            e.streakCount +
            (e.streakCount === 1 ? ' day' : ' days') +
            '</span></div>'
          );
        })
        .join('');
    } catch (err) {
      listEl.innerHTML = '<div class="empty-state">Could not load the leaderboard.</div>';
    }
  }

  /* ---- Tests ---- */

  function populateTopicSelect() {
    const select = document.getElementById('topic-select');
    if (select && (grammarData.length || vocabData.length)) {
      const topics = new Set();
      grammarData.forEach(function (t) {
        if (t.topic) topics.add(t.topic);
      });
      vocabData.forEach(function (g) {
        if (g.topic) topics.add(g.topic);
      });

      select.innerHTML = Array.from(topics)
        .map(function (t) {
          return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
        })
        .join('');
    }

    const learnSelect = document.getElementById('learn-topic-select');
    if (learnSelect && vocabData.length) {
      const vocabTopics = vocabData.map(function (g) { return g.topic; }).filter(Boolean);
      const wasEmpty = !learnSelect.value;
      learnSelect.innerHTML = vocabTopics
        .map(function (t) {
          return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
        })
        .join('');
      if (wasEmpty && vocabTopics.length) renderRoundMap(vocabTopics[0]);
    }
  }

  let selectedFile = null;

  function setupTests() {
    const fileDrop = document.getElementById('file-drop');
    const fileInput = document.getElementById('file-input');

    fileDrop.addEventListener('click', function () {
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      const file = fileInput.files[0];
      if (!file) {
        selectedFile = null;
        fileDrop.textContent = 'Click to choose a .txt or .pdf file (max 4MB)';
        fileDrop.classList.remove('has-file');
        return;
      }

      if (file.size > 4 * 1024 * 1024) {
        showQuizError('That file is larger than 4MB. Please choose a smaller file.');
        fileInput.value = '';
        selectedFile = null;
        return;
      }

      selectedFile = file;
      fileDrop.textContent = file.name;
      fileDrop.classList.add('has-file');
    });

    document.getElementById('generate-topic-btn').addEventListener('click', function () {
      const select = document.getElementById('topic-select');
      const topic = select.value;
      if (!topic) {
        showQuizError('Please choose a topic first.');
        return;
      }
      requestQuiz({ mode: 'topic', topic: topic });
    });

    document.getElementById('generate-file-btn').addEventListener('click', function () {
      if (!selectedFile) {
        showQuizError('Please choose a file first.');
        return;
      }
      generateFromFile(selectedFile);
    });
  }

  function generateFromFile(file) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const reader = new FileReader();

    reader.onload = function () {
      if (isPdf) {
        const base64 = String(reader.result).split(',')[1] || '';
        requestQuiz({
          mode: 'file',
          filename: file.name,
          mimeType: 'application/pdf',
          content: base64,
          isBase64: true,
        });
      } else {
        requestQuiz({
          mode: 'file',
          filename: file.name,
          mimeType: 'text/plain',
          content: String(reader.result),
          isBase64: false,
        });
      }
    };

    reader.onerror = function () {
      showQuizError('Could not read that file.');
    };

    if (isPdf) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  }

  function showQuizStatus(msg) {
    const statusEl = document.getElementById('quiz-status');
    statusEl.innerHTML = '<span class="spinner"></span><span>' + escapeHtml(msg) + '</span>';
    statusEl.classList.remove('hidden');
  }

  function hideQuizStatus() {
    document.getElementById('quiz-status').classList.add('hidden');
  }

  function showQuizError(msg) {
    const errorEl = document.getElementById('quiz-error');
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function hideQuizError() {
    document.getElementById('quiz-error').classList.add('hidden');
  }

  async function requestQuiz(payload) {
    hideQuizError();
    document.getElementById('quiz-area').innerHTML = '';

    const result = await postJsonWithRetry('/.netlify/functions/generate-quiz', payload, {
      initialMessage: 'Generating your quiz…',
      onStatus: showQuizStatus,
    });

    hideQuizStatus();

    if (!result.ok) {
      if (result.status === 401) {
        clearSessionToken();
        location.reload();
        return;
      }
      showQuizError(result.error);
      return;
    }

    renderQuiz(result.data.questions);
  }

  function renderQuiz(questions) {
    const area = document.getElementById('quiz-area');
    area.innerHTML = '';

    const scoreCard = document.createElement('div');
    scoreCard.className = 'quiz-score hidden';
    scoreCard.innerHTML = '<div class="score-num" id="score-num">0/0</div><div class="score-label">correct</div>';
    area.appendChild(scoreCard);

    questions.forEach(function (q, qi) {
      const card = document.createElement('div');
      card.className = 'quiz-question';
      card.dataset.correct = q.correctIndex;

      const optionsHtml = (q.options || [])
        .map(function (opt, oi) {
          return (
            '<label class="q-option" data-option-index="' +
            oi +
            '"><input type="radio" name="q' +
            qi +
            '" value="' +
            oi +
            '" />' +
            '<span>' +
            escapeHtml(opt) +
            '</span></label>'
          );
        })
        .join('');

      card.innerHTML =
        '<div class="q-index">Question ' +
        (qi + 1) +
        ' of ' +
        questions.length +
        '</div>' +
        '<div class="q-text">' +
        escapeHtml(q.question) +
        '</div>' +
        '<div class="q-options">' +
        optionsHtml +
        '</div>' +
        '<div class="q-explanation">' +
        escapeHtml(q.explanation || '') +
        '</div>';

      area.appendChild(card);
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Check Answers';
    submitBtn.style.width = '100%';
    area.appendChild(submitBtn);

    submitBtn.addEventListener('click', function () {
      gradeQuiz(area, questions.length);
      submitBtn.remove();
    });
  }

  function gradeQuiz(area, total) {
    let correctCount = 0;
    const cards = area.querySelectorAll('.quiz-question');

    cards.forEach(function (card) {
      const correctIndex = Number(card.dataset.correct);
      const selected = card.querySelector('input[type="radio"]:checked');
      const selectedIndex = selected ? Number(selected.value) : -1;

      if (selectedIndex === correctIndex) correctCount++;

      card.querySelectorAll('.q-option').forEach(function (opt) {
        const idx = Number(opt.dataset.optionIndex);
        opt.querySelector('input').disabled = true;
        if (idx === correctIndex) {
          opt.classList.add('correct');
        } else if (idx === selectedIndex) {
          opt.classList.add('incorrect');
        }
      });

      card.querySelector('.q-explanation').classList.add('show');
    });

    const scoreCard = area.querySelector('.quiz-score');
    scoreCard.classList.remove('hidden');
    area.querySelector('#score-num').textContent = correctCount + '/' + total;
    scoreCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---- Add Content ---- */

  const MAX_CONTENT_FILES = 6;
  let pendingFiles = []; // { file, name }
  let lastExtraction = null; // { grammarTopics, vocabGroups }

  function setupAddContent() {
    const dropZone = document.getElementById('content-file-drop');
    const fileInput = document.getElementById('content-file-input');

    dropZone.addEventListener('click', function () {
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      Array.from(fileInput.files).forEach(function (file) {
        if (pendingFiles.length >= MAX_CONTENT_FILES) return;
        pendingFiles.push(file);
      });
      fileInput.value = '';
      renderFileChips();
    });

    document.getElementById('extract-btn').addEventListener('click', function () {
      if (!pendingFiles.length) {
        showExtractError('Please choose at least one photo or PDF first.');
        return;
      }
      runExtraction();
    });
  }

  function renderFileChips() {
    const list = document.getElementById('content-file-list');
    list.innerHTML = pendingFiles
      .map(function (file, i) {
        return (
          '<span class="file-chip">' +
          escapeHtml(file.name) +
          '<button type="button" data-remove-index="' +
          i +
          '" aria-label="Remove">×</button></span>'
        );
      })
      .join('');

    list.querySelectorAll('button[data-remove-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pendingFiles.splice(Number(btn.dataset.removeIndex), 1);
        renderFileChips();
      });
    });
  }

  // Downscales an image client-side before upload so a handful of phone
  // photos stay comfortably under Netlify's ~6MB function payload limit.
  function compressImage(file, maxDimension, quality) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = function () {
        img.onload = function () {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            const scale = maxDimension / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ mimeType: 'image/jpeg', data: dataUrl.split(',')[1] || '' });
        };
        img.onerror = function () {
          reject(new Error('Could not read image: ' + file.name));
        };
        img.src = String(reader.result);
      };
      reader.onerror = function () {
        reject(new Error('Could not read file: ' + file.name));
      };
      reader.readAsDataURL(file);
    });
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const dataUrl = String(reader.result);
        resolve({ mimeType: file.type || 'application/pdf', data: dataUrl.split(',')[1] || '' });
      };
      reader.onerror = function () {
        reject(new Error('Could not read file: ' + file.name));
      };
      reader.readAsDataURL(file);
    });
  }

  async function runExtraction() {
    hideExtractError();
    document.getElementById('review-area').innerHTML = '';
    showExtractStatus('Reading and compressing files…');

    let parts;
    try {
      parts = await Promise.all(
        pendingFiles.map(function (file) {
          if (file.type && file.type.startsWith('image/')) {
            return compressImage(file, 1400, 0.75);
          }
          return readFileAsBase64(file);
        })
      );
    } catch (err) {
      hideExtractStatus();
      showExtractError(err.message || 'Could not read one of the files.');
      return;
    }

    const result = await postJsonWithRetry(
      '/.netlify/functions/extract-content',
      { files: parts },
      { initialMessage: 'Asking Gemini to extract content… this can take a moment.', onStatus: showExtractStatus }
    );

    hideExtractStatus();

    if (!result.ok) {
      if (result.status === 401) {
        clearSessionToken();
        location.reload();
        return;
      }
      showExtractError(result.error);
      return;
    }

    if (!result.data.grammarTopics.length && !result.data.vocabGroups.length) {
      showExtractError('No usable grammar or vocabulary content was found in those files.');
      return;
    }

    lastExtraction = result.data;
    renderReview(result.data);
  }

  function showExtractStatus(msg) {
    const el = document.getElementById('extract-status');
    el.innerHTML = '<span class="spinner"></span><span>' + escapeHtml(msg) + '</span>';
    el.classList.remove('hidden');
  }

  function hideExtractStatus() {
    document.getElementById('extract-status').classList.add('hidden');
  }

  function showExtractError(msg) {
    const el = document.getElementById('extract-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function hideExtractError() {
    document.getElementById('extract-error').classList.add('hidden');
  }

  function renderReview(data) {
    const area = document.getElementById('review-area');
    area.innerHTML = '';

    if (data.grammarTopics.length) {
      const section = document.createElement('div');
      section.className = 'review-section';
      section.innerHTML = '<h3>New Grammar Topics (' + data.grammarTopics.length + ')</h3>';

      data.grammarTopics.forEach(function (topic, i) {
        const card = document.createElement('label');
        card.className = 'review-card';
        card.innerHTML =
          '<input type="checkbox" checked data-type="grammar" data-index="' +
          i +
          '" />' +
          '<div class="review-card-body"><h4>' +
          escapeHtml(topic.topic) +
          '</h4><p>' +
          escapeHtml(topic.summary) +
          '</p></div>';
        section.appendChild(card);
      });

      area.appendChild(section);
    }

    if (data.vocabGroups.length) {
      const section = document.createElement('div');
      section.className = 'review-section';
      section.innerHTML = '<h3>New Vocabulary Groups (' + data.vocabGroups.length + ')</h3>';

      data.vocabGroups.forEach(function (group, i) {
        const preview = (group.words || [])
          .slice(0, 6)
          .map(function (w) {
            return w.sk;
          })
          .join(', ');

        const card = document.createElement('label');
        card.className = 'review-card';
        card.innerHTML =
          '<input type="checkbox" checked data-type="vocab" data-index="' +
          i +
          '" />' +
          '<div class="review-card-body"><h4>' +
          escapeHtml(group.topic) +
          ' (' +
          (group.words || []).length +
          ' words)</h4>' +
          '<p class="word-preview">' +
          escapeHtml(preview) +
          (group.words && group.words.length > 6 ? '…' : '') +
          '</p></div>';
        section.appendChild(card);
      });

      area.appendChild(section);
    }

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.width = '100%';
    saveBtn.style.marginTop = '16px';
    saveBtn.textContent = 'Save Selected to Site';
    area.appendChild(saveBtn);

    saveBtn.addEventListener('click', function () {
      saveReviewedContent(area, saveBtn);
    });
  }

  async function saveReviewedContent(area, saveBtn) {
    if (!lastExtraction) return;

    const grammarTopics = Array.from(area.querySelectorAll('input[data-type="grammar"]:checked')).map(function (
      cb
    ) {
      return lastExtraction.grammarTopics[Number(cb.dataset.index)];
    });
    const vocabGroups = Array.from(area.querySelectorAll('input[data-type="vocab"]:checked')).map(function (cb) {
      return lastExtraction.vocabGroups[Number(cb.dataset.index)];
    });

    if (!grammarTopics.length && !vocabGroups.length) {
      showExtractError('Select at least one item to save.');
      return;
    }

    hideExtractError();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      const result = await postJsonWithRetry(
        '/.netlify/functions/private-content',
        { grammarTopics: grammarTopics, vocabGroups: vocabGroups },
        { initialMessage: '', onStatus: function () {} }
      );

      if (!result.ok) {
        if (result.status === 401) {
          clearSessionToken();
          location.reload();
          return;
        }
        showExtractError(result.error || 'Something went wrong saving content.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Selected to Site';
        return;
      }

      const successEl = document.createElement('div');
      successEl.className = 'success-banner';
      successEl.textContent =
        'Saved! This content is private to your account — it now shows in Browse All and Tests. ' +
        'Reload the page to see it worked into your Learn roadmap.';
      area.appendChild(successEl);
      saveBtn.remove();

      await refreshPrivateContent();

      pendingFiles = [];
      renderFileChips();
      lastExtraction = null;
    } catch (err) {
      showExtractError('Could not reach the server. Please try again.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Selected to Site';
    }
  }

  /* ---- Resilient network calls ---- */

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // The server already retries Gemini once, but it's boxed in by Netlify's
  // 10-second function limit. The browser has no such limit, so worthwhile
  // failures (busy model, rate limit, timeout) get a few more tries here —
  // each a brand-new function call with its own fresh 10-second budget —
  // before the user ever sees an error.
  function isTransientError(message) {
    return /heavy load|rate limit|took too long/i.test(message || '');
  }

  async function postJsonWithRetry(url, body, opts) {
    const maxAttempts = 3;
    const onStatus = opts.onStatus || function () {};
    let lastError = 'Something went wrong. Please try again.';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onStatus(attempt === 1 ? opts.initialMessage : `Still busy — retrying (attempt ${attempt} of ${maxAttempts})…`);

      let res;
      let data;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getSessionToken() },
          body: JSON.stringify(body),
        });
        data = await res.json();
      } catch (err) {
        lastError = 'Could not reach the server. Please try again.';
        if (attempt < maxAttempts) {
          await sleep(3000);
          continue;
        }
        return { ok: false, status: 0, error: lastError };
      }

      if (res.ok) {
        return { ok: true, status: res.status, data: data };
      }

      if (res.status === 401) {
        return { ok: false, status: 401, error: data.error };
      }

      lastError = data.error || 'Something went wrong. Please try again.';

      if (attempt < maxAttempts && isTransientError(lastError)) {
        await sleep(3000);
        continue;
      }

      return { ok: false, status: res.status, error: lastError };
    }

    return { ok: false, status: 0, error: lastError };
  }

  /* ---- Pronunciation audio generation ---- */

  function collectAllPhrases() {
    const set = new Set();
    vocabData.forEach(function (g) {
      (g.words || []).forEach(function (w) {
        if (w.sk) set.add(w.sk);
      });
    });
    grammarData.forEach(function (t) {
      (t.examples || []).forEach(function (ex) {
        if (ex.sk) set.add(ex.sk);
      });
    });
    // Alphabet example words are spoken in the letter cards and voice phase
    // too — without these they fall back to the browser's robotic voice.
    alphabetData.forEach(function (u) {
      (u.letters || []).forEach(function (l) {
        if (l.example && l.example.sk) set.add(l.example.sk);
      });
    });
    return Array.from(set);
  }

  function setupAudioGeneration() {
    document.getElementById('generate-audio-btn').addEventListener('click', runAudioGeneration);
  }

  async function updateAudioGenSummary() {
    const all = collectAllPhrases();
    const summaryEl = document.getElementById('audio-gen-summary');
    if (!all.length) {
      summaryEl.textContent = '';
      return;
    }
    const missing = all.filter(function (p) { return !audioManifest[p]; });
    summaryEl.textContent =
      missing.length === 0
        ? 'All ' + all.length + ' phrases already have audio.'
        : (all.length - missing.length) + ' of ' + all.length + ' phrases already have audio.';
  }

  // Each phrase costs roughly 3s (one TTS call plus a GitHub commit), and
  // Netlify kills a function at 10s. Three per batch measured at ~7.6s — a
  // slow run tips over the edge and the whole batch is lost, which is why a
  // full generation pass could silently produce nothing. Two keeps headroom.
  const AUDIO_GEN_BATCH_SIZE = 2;

  async function runAudioGeneration() {
    const btn = document.getElementById('generate-audio-btn');
    const errorEl = document.getElementById('audio-gen-error');
    const progressEl = document.getElementById('audio-gen-progress');
    const barFill = document.getElementById('audio-gen-bar-fill');
    const progressText = document.getElementById('audio-gen-progress-text');

    errorEl.classList.add('hidden');
    await loadAudioManifest();

    const all = collectAllPhrases();
    const missing = all.filter(function (p) { return !audioManifest[p]; });

    if (!missing.length) {
      updateAudioGenSummary();
      return;
    }

    btn.disabled = true;
    progressEl.classList.remove('hidden');
    barFill.style.width = '0%';
    progressText.textContent = 'Starting… this can take a while for a lot of phrases. Feel free to leave this tab open.';

    let failures = [];
    let done = 0;
    let consecutiveFullBatchFailures = 0;
    let stoppedEarly = false;

    for (let i = 0; i < missing.length; i += AUDIO_GEN_BATCH_SIZE) {
      const batch = missing.slice(i, i + AUDIO_GEN_BATCH_SIZE);

      const result = await postJsonWithRetry(
        '/.netlify/functions/generate-audio',
        { phrases: batch },
        { initialMessage: '', onStatus: function () {} }
      );

      if (!result.ok) {
        if (result.status === 401) {
          clearSessionToken();
          location.reload();
          return;
        }
        failures = failures.concat(batch);
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
        consecutiveFullBatchFailures++;
      } else {
        Object.assign(audioManifest, result.data.generated);
        const batchErrors = result.data.errors || [];
        if (batchErrors.length) {
          failures = failures.concat(batch);
          // Show the actual reason, not just a count — this is what was
          // missing before and made a real failure (e.g. billing not
          // enabled) look like an unexplained "213 failed."
          errorEl.textContent = batchErrors[0];
          errorEl.classList.remove('hidden');
        }
        consecutiveFullBatchFailures = batchErrors.length >= batch.length ? consecutiveFullBatchFailures + 1 : 0;
      }

      done += batch.length;
      barFill.style.width = Math.round((done / missing.length) * 100) + '%';
      progressText.textContent = 'Generating audio… ' + done + ' / ' + missing.length;

      // If entire batches keep failing outright, it's a config problem (bad
      // key, billing, API not enabled) that retrying 200 more times won't
      // fix — stop early instead of grinding through all of them uselessly.
      if (consecutiveFullBatchFailures >= 2) {
        stoppedEarly = true;
        break;
      }
    }

    if (stoppedEarly) {
      progressText.textContent =
        'Stopped early after repeated failures (' + (missing.length - failures.length) + ' generated so far). See the error above — fix that, then click the button again to pick up where it left off.';
      btn.disabled = false;
      updateAudioGenSummary();
      return;
    }

    progressText.textContent = failures.length
      ? 'Done — generated ' + (missing.length - failures.length) + ' of ' + missing.length + ' (' + failures.length + ' failed; click the button again to retry those).'
      : 'Done! Generated audio for ' + missing.length + ' phrases.';

    btn.disabled = false;
    updateAudioGenSummary();
  }

  /* ---- Utils ---- */

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
