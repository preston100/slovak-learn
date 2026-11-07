(function () {
  'use strict';

  /* ---------------- Who runs the service, and the plans ---------------- */

  // The operator and contact shown in the legal pages and the footer. Change
  // them here — e.g. to a registered company name and business address
  // before turning on live Stripe billing — and every page follows.
  const LEGAL_CONFIG = {
    serviceName: 'Slovenčina',
    siteUrl: 'https://slovaklearn.netlify.app/',
    operator: 'Slovenčina Team',
    contactEmail: 'prestonandersen100@gmail.com',
    lastUpdated: 'November 1, 2026',
  };

  // The three plans, as shown on the sign-up screen and under Pricing Plans.
  // Paid checkout isn't live yet: picking a paid plan explains that.
  const PLAN_INFO = [
    {
      id: 'free',
      name: 'Free Preview',
      price: '€0',
      period: 'forever',
      features: [
        'Roadmap sections 1–5, alphabet & sounds',
        'Core flashcards',
        'Up to 15 voice pronunciation checks a day',
      ],
      cta: 'Start Free Preview',
    },
    {
      id: 'monthly',
      name: 'Monthly Pro',
      price: '€11.99',
      period: '/ month',
      features: [
        'All 104+ roadmap sections, 27+ vocabulary groups, 32+ grammar guides, dialogues & tests',
        'AI sentence breakdowns & up to 150 voice checks a day',
        '14-day money-back guarantee, cancel anytime',
      ],
      cta: 'Select Monthly (€11.99/mo)',
    },
    {
      id: 'annual',
      name: 'Annual Pro',
      price: '€79.00',
      period: '/ year',
      note: '€6.58/mo — Save 45%',
      badge: 'Best Value',
      features: [
        'Everything in Monthly Pro',
        'Priority new curriculum chapters & custom review decks',
        '14-day money-back guarantee',
      ],
      cta: 'Select Annual (€79/yr)',
    },
  ];

  const PAID_SOON_MESSAGE =
    'Paid subscriptions launching soon! Start with the Free Preview or enter your Beta/Dev Code below for full access.';

  // What the Free Preview includes: the first five roadmap sections (the
  // start of the alphabet), the Sounds & Spelling guide, and these word
  // topics' flashcards in Tests > Practice.
  const FREE_SECTIONS = 5;
  const FREE_PRACTICE_TOPICS = ['Greetings & Basics', 'Everyday Phrases'];
  const PRO_REQUIRED = 'Pro Plan Required — Upgrade or enter a Beta Code in Account Settings';

  /* ---------------- Session ---------------- */

  const SESSION_TOKEN_KEY = 'slovencina_session_token';
  const SESSION_USER_KEY = 'slovencina_session_user';
  const MIGRATED_KEY = 'slovencina_migrated';
  // Whose progress is in this browser's storage — so signing in as someone
  // else replaces it, while signing back in as the same person merges it.
  const PROGRESS_OWNER_KEY = 'slovencina_progress_owner';
  const PLAN_KEY = 'sk_plan';
  const BETA_KEY = 'sk_beta_unlocked';

  const appEl = document.getElementById('app');
  const onboardingEl = document.getElementById('onboarding-gate');

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

  function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getSessionToken() };
  }

  // Dev/preview accounts: every roadmap section, level and practice round
  // shows unlocked, regardless of prior progress, so these two can freely
  // look around after every update instead of grinding through
  // prerequisites. Client-side only — nothing server-side trusts this, it
  // just changes what's rendered.
  const DEV_ACCOUNT_EMAILS = ['prestonandersen100@gmail.com', 'mravikovamartina@gmail.com'];

  // Normally the email comes from the account details saved at login. The
  // session token carries it too (its first part is the account as base64
  // JSON), so dev mode doesn't silently switch off if those details were
  // never saved or got cleared while the login itself is still valid.
  function sessionEmail() {
    const user = getSessionUser();
    if (user && user.email) return user.email;
    try {
      const part = getSessionToken().split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(part), function (c) { return c.charCodeAt(0); });
      return JSON.parse(new TextDecoder().decode(bytes)).email || '';
    } catch (err) {
      return '';
    }
  }

  function isDevAccount() {
    return DEV_ACCOUNT_EMAILS.indexOf(sessionEmail().toLowerCase()) !== -1;
  }

  // A dev account can switch to "student view" (tap the elephant on the
  // Profile) to see the locks and the course exactly as a student does.
  // Remembered on this device only.
  const STUDENT_VIEW_KEY = 'slovencina_student_view';

  function studentViewOn() {
    try {
      return localStorage.getItem(STUDENT_VIEW_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  // Dev powers — everything unlocked, P to skip — unless in student view.
  function devUnlocked() {
    return isDevAccount() && !studentViewOn();
  }

  /* ---------------- Plans ---------------- */

  // dev / beta / paid have full access; free is the Free Preview. The server
  // decides (and enforces it for the AI and voice features); this copy is
  // what the page shows.
  let currentPlan = 'free';
  try {
    currentPlan = localStorage.getItem(PLAN_KEY) || 'free';
  } catch (err) {
    /* storage unavailable */
  }

  function setPlan(plan) {
    currentPlan = plan || 'free';
    try {
      localStorage.setItem(PLAN_KEY, currentPlan);
      if (currentPlan === 'beta') localStorage.setItem(BETA_KEY, '1');
    } catch (err) {
      /* storage unavailable */
    }
  }

  function hasFullAccess() {
    return isDevAccount() || currentPlan !== 'free';
  }

  function planLabel(plan) {
    return { dev: 'Developer', beta: 'Beta access', paid: 'Pro', free: 'Free Preview' }[plan] || 'Free Preview';
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
      longestStreak: Number(localStorage.getItem(LONGEST_STREAK_KEY) || '0'),
      streakLastDate: localStorage.getItem(STREAK_DATE_KEY) || null,
      vocabStats: loadVocabStats(),
      masteredWords: loadMasteredWords(),
      achievements: getEarnedAchievements(),
      roundProgress: loadRoundProgress(),
      roadmapProgress: loadRoadmapProgress(),
      timeSpentMs: getTotalTimeSpentMs(),
      dailyGoalTarget: getDailyGoalTarget(),
      dailyPracticeCount: dailyPracticeCount,
    };
  }


  // The inverse of collectProgressSnapshot: writes this account's progress
  // from the server into localStorage. If this browser already holds this
  // same account's progress, the two are merged (js/progress-merge.js) so
  // anything not yet saved here isn't lost; if it holds someone else's, or
  // nothing, the server's copy simply replaces it.
  function hydrateFromProgress(serverProgress, email, signedInAtLoad) {
    if (!serverProgress) return;
    const owner = localStorage.getItem(PROGRESS_OWNER_KEY);
    // Before owners were recorded, a browser already signed in when the
    // page loads holds that account's progress.
    const mine = owner ? owner === email : signedInAtLoad;
    const progress = mine ? window.SlovakProgressMerge.mergeProgress(collectProgressSnapshot(), serverProgress) : serverProgress;

    const streakCount = progress.streakCount || 0;
    localStorage.setItem(STREAK_COUNT_KEY, String(streakCount));
    localStorage.setItem(LONGEST_STREAK_KEY, String(Math.max(progress.longestStreak || 0, streakCount)));
    if (progress.streakLastDate) localStorage.setItem(STREAK_DATE_KEY, progress.streakLastDate);
    else localStorage.removeItem(STREAK_DATE_KEY);
    localStorage.setItem(VOCAB_STATS_KEY, JSON.stringify(progress.vocabStats || {}));
    localStorage.setItem(MASTERED_KEY, JSON.stringify(progress.masteredWords || {}));
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(progress.achievements || []));
    localStorage.setItem(ROUND_PROGRESS_KEY, JSON.stringify(progress.roundProgress || {}));
    localStorage.setItem(ROADMAP_PROGRESS_KEY, JSON.stringify(progress.roadmapProgress || {}));
    localStorage.setItem(TIME_SPENT_KEY, String(progress.timeSpentMs || 0));
    localStorage.setItem(DAILY_GOAL_TARGET_KEY, String(progress.dailyGoalTarget || DEFAULT_DAILY_GOAL));
    localStorage.setItem(DAILY_COUNT_KEY, JSON.stringify(progress.dailyPracticeCount || { date: null, count: 0 }));
    localStorage.setItem(PROGRESS_OWNER_KEY, email);
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

  /* ---------------- Onboarding: account → plan → app ---------------- */

  // Two steps: 'account' (sign up / sign in; the plans stay folded away
  // unless the visitor asks to see them) and 'plans' (signed in: pick a plan
  // or enter a code).
  function showOnboarding(step) {
    appEl.classList.add('hidden');
    onboardingEl.classList.remove('hidden');
    const signedIn = step === 'plans';
    onboardingEl.dataset.step = signedIn ? 'plans' : 'account';
    document.getElementById('onboarding-signed-out').classList.toggle('hidden', signedIn);
    document.getElementById('onboarding-signed-in').classList.toggle('hidden', !signedIn);
    document.getElementById('ob-preview-plans').classList.toggle('hidden', signedIn);
    if (signedIn) {
      const user = getSessionUser() || {};
      document.getElementById('ob-signed-name').textContent = user.name || '';
      document.getElementById('ob-signed-email').textContent = user.email ? '(' + user.email + ')' : '';
    }
    renderPlanCards(document.getElementById('onboarding-plan-grid'), 'gate');
    hidePlanMessage();
    setPlansOpen(signedIn, signedIn);
  }

  // Folds the plans + code box open or shut; `scroll` brings them into view.
  function setPlansOpen(open, scroll) {
    const step2 = document.getElementById('onboarding-step2');
    const toggle = document.getElementById('ob-preview-plans');
    const wasOpen = !step2.classList.contains('hidden');
    step2.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide pricing plans ↑' : 'Preview pricing plans →';
    if (open && !wasOpen) {
      step2.classList.remove('step-enter');
      void step2.offsetWidth; // restart the entrance animation
      step2.classList.add('step-enter');
    }
    if (open && scroll) {
      document.getElementById('onboarding-plans').scrollIntoView({ behavior: smoothScroll(), block: 'start' });
    }
  }

  function enterApp() {
    onboardingEl.classList.add('hidden');
    appEl.classList.remove('hidden');
    if (appInitialized) refreshForPlan();
    else initApp();
  }

  // Signed in (just now, or still from last time): load this account's
  // progress, then go to the app — or to the plan step, for a new account
  // that hasn't picked one yet.
  async function finishLogin(token, user, account, signedInAtLoad) {
    setSession(token, user);
    // Only the very first account ever created in a browser may take over
    // progress already stored in it (see the register request).
    localStorage.setItem(MIGRATED_KEY, '1');
    if (account) setPlan(account.plan);
    try {
      const res = await fetch('/.netlify/functions/progress', { headers: { Authorization: 'Bearer ' + token } });
      if (res.status === 401) {
        clearSessionToken();
        showOnboarding('account');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        hydrateFromProgress(data.progress, (user && user.email) || sessionEmail(), signedInAtLoad);
        if (data.account) {
          account = data.account;
          setPlan(account.plan);
        }
        // Push the merged copy back, so the server has it too.
        scheduleProgressSync();
      }
    } catch (err) {
      // Offline or a network hiccup: carry on with what this browser has.
    }
    if (isDevAccount() || !account || account.planChosen) enterApp();
    else showOnboarding('plans');
  }

  async function resolveSession() {
    const token = getSessionToken();
    if (!token) {
      showOnboarding('account');
      return;
    }
    await finishLogin(token, getSessionUser() || { email: sessionEmail() }, null, true);
  }

  function showPlanMessage(text) {
    const el = document.getElementById('onboarding-plan-message');
    el.textContent = text;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hidePlanMessage() {
    document.getElementById('onboarding-plan-message').classList.add('hidden');
  }

  // Plan cards, on the onboarding screen ('gate') and under Pricing Plans
  // ('pricing').
  function renderPlanCards(container, context) {
    if (!container) return;
    const signedInPlan = getSessionToken() && context === 'pricing' ? currentPlan : null;
    container.innerHTML = PLAN_INFO.map(function (plan) {
      const isCurrent = signedInPlan && ((plan.id === 'free' && signedInPlan === 'free') || (plan.id !== 'free' && signedInPlan === 'paid'));
      return (
        '<div class="plan-card' + (plan.badge ? ' featured' : '') + '">' +
        (plan.badge ? '<div class="plan-badge-top">' + escapeHtml(plan.badge) + '</div>' : '') +
        '<h3>' + escapeHtml(plan.name) + '</h3>' +
        '<div class="plan-price"><span class="plan-amount">' + escapeHtml(plan.price) + '</span> <span class="plan-period">' + escapeHtml(plan.period) + '</span></div>' +
        (plan.note ? '<div class="plan-note">' + escapeHtml(plan.note) + '</div>' : '') +
        '<ul class="plan-features">' + plan.features.map(function (f) { return '<li>' + escapeHtml(f) + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="btn ' + (plan.badge ? 'btn-primary' : 'btn-secondary') + ' plan-cta" data-plan="' + plan.id + '"' + (isCurrent ? ' disabled' : '') + '>' +
        escapeHtml(isCurrent ? 'Your plan' : plan.cta) +
        '</button>' +
        '</div>'
      );
    }).join('');
    container.querySelectorAll('.plan-cta').forEach(function (btn) {
      btn.addEventListener('click', function () { choosePlan(btn.dataset.plan, context); });
    });
  }

  async function choosePlan(planId, context) {
    const signedIn = !!getSessionToken();
    if (planId !== 'free') {
      if (context === 'gate') showPlanMessage(PAID_SOON_MESSAGE + (signedIn ? '' : ' (Create your account above first.)'));
      else showNotice('Coming soon', PAID_SOON_MESSAGE, [{ label: 'Enter a beta code', primary: true, onClick: goToCodeEntry }]);
      return;
    }
    if (context === 'pricing') {
      closeModal('legal-modal');
      return;
    }
    if (!signedIn) {
      showPlanMessage('Create your account above first — then press Start Free Preview.');
      document.getElementById('ob-name').focus();
      return;
    }
    try {
      const res = await fetch('/.netlify/functions/account', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'start-free' }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (res.ok && data.ok) setPlan(data.plan);
    } catch (err) {
      // The choice is only remembered for next time; carry on regardless.
    }
    enterApp();
  }

  // The access code: unlocks full access (beta) for the signed-in account.
  async function redeemAccessCode(code, errorEl, button) {
    errorEl.textContent = '';
    if (!getSessionToken()) {
      errorEl.textContent = 'Create an account or sign in first, then enter your code.';
      return false;
    }
    if (!code) {
      errorEl.textContent = 'Please enter your code.';
      return false;
    }
    button.disabled = true;
    try {
      const res = await fetch('/.netlify/functions/verify-password', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ password: code }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) {
        errorEl.textContent = data.error || 'That code is not right.';
        return false;
      }
      setPlan(data.plan);
      return true;
    } catch (err) {
      errorEl.textContent = 'Could not reach the server. Please try again.';
      return false;
    } finally {
      button.disabled = false;
    }
  }

  function setupOnboarding() {
    let mode = 'register';
    const form = document.getElementById('onboarding-form');
    const errorEl = document.getElementById('ob-error');
    const submit = document.getElementById('ob-submit');
    const passwordInput = document.getElementById('ob-password');

    function applyMode() {
      document.querySelectorAll('[data-onboarding-mode]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.onboardingMode === mode);
        b.setAttribute('aria-selected', String(b.dataset.onboardingMode === mode));
      });
      form.querySelectorAll('[data-only="register"]').forEach(function (el) { el.classList.toggle('hidden', mode !== 'register'); });
      submit.textContent = mode === 'register' ? 'Create Account' : 'Sign In';
      passwordInput.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
      passwordInput.placeholder = mode === 'register' ? 'At least 8 characters' : '';
      errorEl.textContent = '';
    }

    document.querySelectorAll('[data-onboarding-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        mode = btn.dataset.onboardingMode;
        applyMode();
      });
    });

    // The optional code field inside the form.
    const inlineToggle = document.getElementById('ob-inline-code-toggle');
    const inlineWrap = document.getElementById('ob-inline-code-wrap');
    const inlineInput = document.getElementById('ob-inline-code');
    function showInlineCode(focus) {
      inlineWrap.classList.remove('hidden');
      inlineToggle.classList.add('hidden');
      inlineToggle.setAttribute('aria-expanded', 'true');
      if (focus) inlineInput.focus();
    }
    inlineToggle.addEventListener('click', function () { showInlineCode(true); });

    document.getElementById('ob-preview-plans').addEventListener('click', function () {
      const open = document.getElementById('onboarding-step2').classList.contains('hidden');
      setPlansOpen(open, open);
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const name = document.getElementById('ob-name').value.trim();
      const email = document.getElementById('ob-email').value.trim();
      const password = passwordInput.value;
      const confirm = document.getElementById('ob-confirm').value;
      const terms = document.getElementById('ob-terms').checked;
      // A code typed in the form, or in the code box below it before signing up.
      const codeBox = document.getElementById('ob-code');
      const code = inlineInput.value.trim() || codeBox.value.trim();

      if (mode === 'register') {
        if (!name || !email || !password || !confirm) return (errorEl.textContent = 'Please fill in all the fields.');
        if (password.length < 8) return (errorEl.textContent = 'Your password needs at least 8 characters.');
        if (password !== confirm) return (errorEl.textContent = "The two passwords don't match.");
        if (!terms) return (errorEl.textContent = 'Please agree to the Terms of Service and Privacy Policy.');
      } else if (!email || !password) {
        return (errorEl.textContent = 'Please enter your email and password.');
      }
      if (code && !/^[0-9]{4}$/.test(code)) {
        showInlineCode(false);
        return (errorEl.textContent = 'Access codes are 4 digits. Check it, or leave the code empty.');
      }

      errorEl.textContent = '';
      submit.disabled = true;
      submit.textContent = mode === 'register' ? 'Creating account…' : 'Signing in…';
      try {
        const payload = mode === 'register'
          ? { action: 'register', name: name, email: email, password: password, confirmPassword: confirm, acceptTerms: true }
          : { action: 'login', email: email, password: password };
        // Only the first account ever created in this browser may take over
        // progress already stored in it.
        if (mode === 'register' && !localStorage.getItem(MIGRATED_KEY)) payload.progressSnapshot = collectProgressSnapshot();

        const res = await fetch('/.netlify/functions/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) {
          errorEl.textContent = data.error || 'Something went wrong. Please try again.';
          return;
        }
        form.reset();
        codeBox.value = '';
        // With a code, unlock before choosing where to go, so a beta tester
        // goes straight into the app in one click.
        let account = data.account;
        let codeProblem = '';
        if (code) {
          setSession(data.token, data.user);
          const codeError = document.getElementById('ob-code-error');
          if (await redeemAccessCode(code, codeError, submit)) {
            account = Object.assign({}, account, { plan: currentPlan, planChosen: true });
          } else {
            codeProblem = codeError.textContent || 'That code is not right.';
          }
        }
        await finishLogin(data.token, data.user, account, false);
        if (codeProblem) {
          if (!onboardingEl.classList.contains('hidden')) {
            codeBox.value = code;
            document.getElementById('ob-code-error').textContent = 'Your account is ready, but the code didn’t work: ' + codeProblem;
          } else {
            showNotice('Code not applied', 'You’re signed in, but the code didn’t work: ' + codeProblem, [
              { label: 'Try another code', primary: true, onClick: goToCodeEntry },
            ]);
          }
        }
      } catch (err) {
        errorEl.textContent = 'Could not reach the server. Please try again.';
      } finally {
        submit.disabled = false;
        submit.textContent = mode === 'register' ? 'Create Account' : 'Sign In';
      }
    });

    document.getElementById('ob-signout').addEventListener('click', function () {
      clearSessionToken();
      showOnboarding('account');
    });

    const codeForm = document.getElementById('ob-code-form');
    codeForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      // Not signed in yet: the code rides along with the account form.
      if (!getSessionToken()) {
        const typed = document.getElementById('ob-code').value.trim();
        if (typed) inlineInput.value = typed;
        showInlineCode(false);
        document.getElementById('ob-code-error').textContent = '';
        errorEl.textContent = typed
          ? 'Create your account or sign in here — your code will be applied automatically.'
          : 'Create your account or sign in here first.';
        document.getElementById('onboarding-account').scrollIntoView({ behavior: smoothScroll(), block: 'start' });
        const first = mode === 'register' ? document.getElementById('ob-name') : document.getElementById('ob-email');
        (first.value ? document.getElementById('ob-email') : first).focus({ preventScroll: true });
        return;
      }
      const ok = await redeemAccessCode(
        document.getElementById('ob-code').value.trim(),
        document.getElementById('ob-code-error'),
        document.getElementById('ob-code-submit')
      );
      if (ok) {
        codeForm.reset();
        enterApp();
      }
    });

    applyMode();
  }

  /* ---------------- Modals: account, legal pages, notices ---------------- */

  // One window at a time, except a short notice, which can sit on top of the
  // window it came from (e.g. "Coming soon" over Pricing Plans).
  function openModal(id) {
    if (id !== 'notice-modal') {
      document.querySelectorAll('.modal:not(.hidden)').forEach(function (m) {
        if (m.id !== id) m.classList.add('hidden');
      });
    }
    document.getElementById(id).classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function setupModals() {
    document.querySelectorAll('.modal').forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal || e.target.closest('[data-close-modal]')) modal.classList.add('hidden');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal:not(.hidden)').forEach(function (m) { m.classList.add('hidden'); });
    });
    // Legal links anywhere on the page (onboarding, footer, account), and
    // "Enter a beta code" buttons.
    document.addEventListener('click', function (e) {
      const link = e.target.closest ? e.target.closest('[data-legal]') : null;
      if (link) openLegal(link.dataset.legal);
      const upsell = e.target.closest ? e.target.closest('[data-upsell="code"]') : null;
      if (upsell) goToCodeEntry();
    });
    document.querySelectorAll('[data-legal-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { openLegal(tab.dataset.legalTab); });
    });
    document.getElementById('footer-line').innerHTML =
      '© 2026 ' + escapeHtml(LEGAL_CONFIG.operator) + ' · <a href="mailto:' + escapeHtml(LEGAL_CONFIG.contactEmail) + '">' + escapeHtml(LEGAL_CONFIG.contactEmail) + '</a>';
  }

  function showNotice(title, message, actions) {
    document.getElementById('notice-title').textContent = title;
    document.getElementById('notice-message').textContent = message;
    const box = document.getElementById('notice-actions');
    box.innerHTML = '';
    (actions || []).forEach(function (a) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (a.primary ? 'btn-primary' : 'btn-secondary');
      btn.textContent = a.label;
      btn.addEventListener('click', function () {
        closeModal('notice-modal');
        a.onClick();
      });
      box.appendChild(btn);
    });
    openModal('notice-modal');
  }

  // Shown wherever the Free Preview stops: a locked section, a Pro topic, an
  // AI feature.
  function showUpsell(what) {
    showNotice(
      'Pro Plan Required',
      (what ? what + ' — part of Pro. ' : '') + 'Upgrade or enter a Beta Code in Account Settings.',
      [
        { label: 'Enter a beta code', primary: true, onClick: goToCodeEntry },
        { label: 'See plans', onClick: function () { openLegal('pricing'); } },
      ]
    );
  }

  // "Enter a beta code": the account window once signed in; on the sign-up
  // screen, the code box there.
  function goToCodeEntry() {
    if (onboardingEl.classList.contains('hidden')) {
      openAccountModal(true);
      return;
    }
    document.querySelectorAll('.modal:not(.hidden)').forEach(function (m) { m.classList.add('hidden'); });
    const input = document.getElementById('ob-code');
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
  }

  function openAccountModal(focusCode) {
    const user = getSessionUser() || {};
    document.getElementById('acct-name').textContent = user.name || '';
    document.getElementById('acct-email').textContent = user.email || sessionEmail();
    const plan = isDevAccount() ? 'dev' : currentPlan;
    const badge = document.getElementById('acct-plan-badge');
    badge.textContent = planLabel(plan);
    badge.className = 'plan-badge plan-' + plan;
    document.getElementById('acct-plan-desc').textContent = {
      dev: 'Everything unlocked, plus Add Content and Analytics.',
      beta: 'Full access to every section and feature, unlocked with an access code.',
      paid: 'Full access to every section and feature.',
      free: 'Sections 1–5, the alphabet guide, core flashcards and 15 voice checks a day. Upgrade, or enter a beta code, for everything.',
    }[plan];
    document.getElementById('acct-upgrade').classList.toggle('hidden', plan !== 'free');
    document.getElementById('acct-code-error').textContent = '';
    openModal('account-modal');
    if (focusCode && plan === 'free') document.getElementById('acct-code').focus();
  }

  function setupAccountModal() {
    document.getElementById('account-btn').addEventListener('click', function () { openAccountModal(false); });
    document.getElementById('acct-see-plans').addEventListener('click', function () { openLegal('pricing'); });
    document.getElementById('acct-logout').addEventListener('click', function () {
      flushProgressSync();
      clearSessionToken();
      location.reload();
    });
    const codeForm = document.getElementById('acct-code-form');
    codeForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const ok = await redeemAccessCode(
        document.getElementById('acct-code').value.trim(),
        document.getElementById('acct-code-error'),
        document.getElementById('acct-code-submit')
      );
      if (!ok) return;
      codeForm.reset();
      closeModal('account-modal');
      refreshForPlan();
      showAchievementToast('Full access unlocked');
    });
  }

  /* ---------------- Legal pages ---------------- */

  function legalDocs() {
    const c = LEGAL_CONFIG;
    const mail = '<a href="mailto:' + c.contactEmail + '">' + c.contactEmail + '</a>';
    const site = '<a href="' + c.siteUrl + '" target="_blank" rel="noopener">' + c.siteUrl + '</a>';
    return {
      terms: {
        title: 'Terms of Service',
        html:
          '<p class="legal-meta"><strong>Service:</strong> ' + c.serviceName + ' (' + site + ')<br><strong>Operated by:</strong> ' + c.operator + ' (' + mail + ')<br><strong>Last updated:</strong> ' + c.lastUpdated + '</p>' +
          '<h3>1. Agreement to Terms</h3><p>By creating an account, entering an access code, or using ' + c.serviceName + ' (the "Service"), operated by the ' + c.operator + ' ("we", "us", or "our"), you agree to be bound by these Terms of Service.</p>' +
          '<h3>2. Description of Service</h3><p>' + c.serviceName + ' is an interactive digital language-learning platform designed to teach the Slovak language through structured curriculum units, vocabulary flashcards, grammar lessons, interactive dialogues, speech pronunciation checks, and AI-assisted study explanations.</p>' +
          '<h3>3. Accounts &amp; Access Codes</h3><p>You must provide accurate registration information and keep your login credentials secure. Developer and beta access codes issued by us grant complimentary access to designated features and may be modified or revoked at any time.</p>' +
          '<h3>4. Subscriptions, Billing &amp; Cancellation</h3><p>Introductory sections (Sections 1–5) are available free of charge ("Free Preview"). Full access requires an active paid subscription (Monthly Pro at €11.99/month or Annual Pro at €79.00/year) or a valid beta/dev access code. Paid subscriptions renew automatically at the end of each billing cycle unless cancelled beforehand. You may cancel anytime in Account Settings or by emailing ' + mail + '; access continues until the end of the current paid period, after which your account reverts to Free Preview with all progress preserved.</p>' +
          '<h3>5. Fair Use &amp; API Quotas</h3><p>To prevent automated abuse, Free Preview accounts include up to 15 voice checks/day and Pro/Beta accounts include up to 150 voice checks/day and 25 custom AI quizzes/day. Automated scraping, bulk downloading, or credential sharing is prohibited.</p>' +
          '<h3>6. Intellectual Property</h3><p>All curriculum content, lesson structures, audio, and code are the exclusive property of the ' + c.operator + ' and its creators, licensed to you solely for personal, non-commercial study.</p>' +
          '<h3>7. Disclaimer &amp; Limitation of Liability</h3><p>The Service is provided "AS IS". AI grammar explanations and automated speech scoring may occasionally contain errors. To the maximum extent permitted by applicable law, our total liability shall not exceed the amount paid by you for the Service in the preceding 12 months.</p>' +
          '<h3>8. Contact</h3><p>For support or questions, email ' + mail + '.</p>',
      },
      privacy: {
        title: 'Privacy Policy',
        html:
          '<p class="legal-meta"><strong>Data controller:</strong> ' + c.operator + ', contact: ' + mail + ', website: ' + site + '<br><strong>Last updated:</strong> ' + c.lastUpdated + '</p>' +
          '<h3>1. Personal Data We Collect</h3><ul>' +
          '<li><em>Account Data:</em> Email address, display name, encrypted password hash, creation date, and plan/access tier.</li>' +
          '<li><em>Learning Progress &amp; Analytics:</em> Completed roadmap sections, daily streaks, XP, flashcard mastery scores, missed vocabulary words, and feature usage counts.</li>' +
          '<li><em>Voice Pronunciation Audio (Transient Processing):</em> When you use the microphone pronunciation check, short audio clips are sent securely to our speech-to-text processor solely to score your pronunciation. We do not permanently store raw voice recordings after transcription completes.</li></ul>' +
          '<h3>2. Legal Basis (GDPR Art. 6)</h3><p>Performance of a contract (Art. 6(1)(b)) to provide the learning platform and sync progress; legitimate interests (Art. 6(1)(f)) for aggregated, de-identified curriculum analytics and API cost monitoring; legal obligation (Art. 6(1)(c)) for tax/billing records when applicable.</p>' +
          '<h3>3. Sub-Processors</h3><p>Netlify, Inc. (hosting, serverless functions, and encrypted Netlify Blobs storage), Google Cloud Platform / AI providers (real-time speech-to-text, text-to-speech, and AI sentence explanations), and Stripe/Paddle (payment processing when billing is active — we never store raw card numbers).</p>' +
          '<h3>4. Data Retention &amp; Your Privacy Rights</h3><p>We retain your account data while your account is active. You have the right to access, rectify, erase ("Right to be Forgotten"), or export your personal data at any time by emailing ' + mail + '. Requests are completed within 30 days.</p>',
      },
      refund: {
        title: 'Refund, Cancellation & 14-Day Money-Back Policy',
        html:
          '<h3>1. Cancel Anytime</h3><p>Cancel your Monthly Pro or Annual Pro subscription anytime in Account Settings or by emailing ' + mail + '. You will never be billed again after cancelling, and your progress remains saved.</p>' +
          '<h3>2. 14-Day Money-Back Guarantee</h3><p>In accordance with and exceeding EU consumer protection standards, ' + c.serviceName + ' offers a full, no-questions-asked 14-day money-back guarantee on your initial Monthly or Annual subscription purchase, even if you have already begun accessing digital lessons. Email ' + mail + ' within 14 calendar days of your initial payment for a 100% refund.</p>' +
          '<h3>3. Renewals</h3><p>Monthly renewals after the first 14 days are non-refundable (cancelling stops future charges). If you forget to cancel an Annual renewal and contact us within 7 days of the renewal charge, we will refund the annual renewal in full.</p>',
      },
      pricing: {
        title: 'Pricing Plans',
        html: '<div class="plan-grid" id="pricing-plan-grid"></div>',
      },
    };
  }

  function openLegal(id) {
    const docs = legalDocs();
    const doc = docs[id] || docs.terms;
    document.getElementById('legal-title').textContent = doc.title;
    document.getElementById('legal-body').innerHTML = doc.html;
    document.querySelectorAll('[data-legal-tab]').forEach(function (t) { t.classList.toggle('active', t.dataset.legalTab === id); });
    if (id === 'pricing') renderPlanCards(document.getElementById('pricing-plan-grid'), 'pricing');
    closeModal('notice-modal');
    openModal('legal-modal');
    document.getElementById('legal-body').scrollTop = 0;
  }

  setupModals();
  setupOnboarding();

  /* ---------------- App (only runs once signed in) ---------------- */

  let appInitialized = false;
  let grammarData = [];
  let vocabData = [];

  function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    setupTabs();
    applyDevTabs();
    trackTopbarHeight();
    setupAccountModal();
    setupAnalytics();
    loadContent();
    setupTests();
    setupTestsModes();
    setupAddContent();
    setupSound();
    renderStreak();
    setupDailyGoal();
    setupStudentViewToggle();
    renderLeaderboard();
    setupLearnModes();
    setupLessonOverlay();
    setupTimeTracking();
    loadAudioManifest();
    setupAudioGeneration();
  }

  // Add Content and Analytics are for the developer accounts only.
  function applyDevTabs() {
    const dev = isDevAccount();
    document.querySelectorAll('[data-tab="add-content"], [data-tab="analytics"]').forEach(function (btn) {
      btn.classList.toggle('hidden', !dev);
    });
    if (!dev) {
      ['panel-add-content', 'panel-analytics'].forEach(function (id) { document.getElementById(id).classList.remove('active'); });
    }
  }

  // After the plan changes (an access code, the Free Preview): redraw
  // everything that depends on it.
  function refreshForPlan() {
    applyDevTabs();
    renderRoadmapMap();
    renderGrammarGuide(document.getElementById('guide-search-input').value);
    filterBrowseContent(document.getElementById('browse-search-input').value);
    populateTopicSelect();
    if (!document.getElementById('round-map').classList.contains('hidden')) renderRoundMap(currentRoundTopic);
    renderProfile();
  }

  /* ---- Analytics (developer accounts only) ---- */

  function setupAnalytics() {
    document.getElementById('analytics-refresh').addEventListener('click', renderAnalytics);
  }

  // What each endpoint is, for the usage table. Free-tier notes are a guide
  // to what to keep an eye on, not billing data.
  const API_ROWS = [
    { key: 'transcribe-audio', name: 'Voice checks', detail: 'transcribe-audio · Groq Whisper, Google Speech as fallback' },
    { key: 'word-sentence', name: 'Example sentences', detail: 'word-sentence · Gemini, only on a cache miss' },
    { key: 'generate-quiz', name: 'AI quizzes', detail: 'generate-quiz · Gemini, 2 requests per quiz' },
    { key: 'speak', name: 'Sentence audio', detail: 'speak · Google Text-to-Speech' },
    { key: 'extract-content', name: 'Add Content: read notes', detail: 'extract-content · Gemini (developers)' },
    { key: 'generate-audio', name: 'Add Content: make audio', detail: 'generate-audio · Google Text-to-Speech (developers)' },
  ];
  // Google Speech is only the fallback; its free tier is 60 minutes a month,
  // and a voice check records at most 6 seconds.
  const STT_FREE_MINUTES = 60;
  const STT_MINUTES_PER_CALL = 0.1;
  const STT_PRICE_PER_MINUTE = 0.024;

  function relativeDay(ms) {
    if (!ms) return '—';
    const days = Math.floor((Date.now() - ms) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 31) return days + ' days ago';
    return new Date(ms).toISOString().slice(0, 10);
  }

  async function renderAnalytics() {
    const body = document.getElementById('analytics-body');
    if (!isDevAccount()) {
      body.innerHTML = '';
      return;
    }
    body.innerHTML = '<div class="empty-state">Loading…</div>';
    let data;
    try {
      const res = await fetch('/.netlify/functions/analytics', { headers: { Authorization: 'Bearer ' + getSessionToken() } });
      data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load analytics.');
    } catch (err) {
      body.innerHTML = '<div class="error-banner">' + escapeHtml(err.message || 'Could not load analytics.') + '</div>';
      return;
    }

    const today = data.usage.today || {};
    const month = data.usage.month || {};
    const callsToday = API_ROWS.reduce(function (n, r) { return n + (today[r.key] || 0); }, 0);
    const callsMonth = API_ROWS.reduce(function (n, r) { return n + (month[r.key] || 0); }, 0);
    const sttMinutes = (month['stt-google'] || 0) * STT_MINUTES_PER_CALL;
    const sttCost = Math.max(0, sttMinutes - STT_FREE_MINUTES) * STT_PRICE_PER_MINUTE;
    const costLine = sttCost === 0 ? '$0.00 — Within Free Tier' : '≈ $' + sttCost.toFixed(2) + ' — Google speech over its free tier';
    const plans = data.accounts.byPlan;

    // Where each section sits, and which section first teaches each word.
    const sectionIndex = {};
    const wordSection = {};
    const wordEn = {};
    roadmapSections.forEach(function (sec, i) {
      sectionIndex[sec.id] = i;
      if (sec.kind === 'checkpoint') return;
      (sec.items || []).forEach(function (w) {
        if (w && w.sk && !(w.sk in wordSection)) {
          wordSection[w.sk] = i;
          wordEn[w.sk] = w.en;
        }
      });
    });
    function sectionName(i) {
      return i === undefined || i < 0 ? '—' : (i + 1) + '. ' + escapeHtml(roadmapSections[i].title);
    }

    const kpis =
      '<div class="kpi-grid">' +
      kpi('Registered accounts', data.accounts.total, 'Dev ' + plans.dev + ' · Beta ' + plans.beta + ' · Free ' + plans.free + ' · Paid ' + plans.paid) +
      kpi('Active learners', data.active.last7 + ' <span class="kpi-unit">in 7 days</span>', data.active.last30 + ' in the last 30 days') +
      kpi('Sections cleared', data.sectionsCleared, 'across all learners') +
      kpi('API calls today', callsToday, callsMonth + ' this month · <span class="kpi-cost' + (sttCost ? ' over' : '') + '">' + escapeHtml(costLine) + '</span>') +
      '</div>';

    const hits = month['sentence-cache-hit'] || 0;
    const misses = month['word-sentence'] || 0;
    const hitRate = hits + misses ? Math.round((hits / (hits + misses)) * 100) + '%' : '—';
    const usageRows = API_ROWS.map(function (r) {
      let note = '';
      if (r.key === 'transcribe-audio') {
        note =
          escapeHtml('Google fallback this month: ' + (month['stt-google'] || 0) + ' calls ≈ ' + sttMinutes.toFixed(1) + ' of ' + STT_FREE_MINUTES + ' free minutes') +
          quotaMeter(sttMinutes / STT_FREE_MINUTES, 'of the free minutes used', false);
      }
      if (r.key === 'word-sentence') {
        note =
          escapeHtml('Served from the cache this month: ' + hits + ' (hit rate ' + hitRate + ')') +
          (hits + misses ? quotaMeter(hits / (hits + misses), 'cache hit rate', true) : '');
      }
      return (
        '<tr><td><strong>' + escapeHtml(r.name) + '</strong><div class="cell-sub">' + escapeHtml(r.detail) + '</div></td>' +
        '<td class="num">' + (today[r.key] || 0) + '</td><td class="num">' + (month[r.key] || 0) + '</td>' +
        '<td class="cell-sub">' + note + '</td></tr>'
      );
    }).join('');
    const usage =
      '<h3 class="browse-subhead">API usage & cost protection</h3>' +
      '<div class="table-scroll"><table class="data-table"><thead><tr><th>Feature</th><th class="num">Today</th><th class="num">This month</th><th>Notes</th></tr></thead><tbody>' +
      usageRows +
      '<tr><td><strong>Access codes</strong><div class="cell-sub">verify-password</div></td><td class="num">' +
      ((today['access-code-redeemed'] || 0) + (today['access-code-wrong'] || 0)) + '</td><td class="num">' +
      ((month['access-code-redeemed'] || 0) + (month['access-code-wrong'] || 0)) + '</td><td class="cell-sub">This month: ' +
      (month['access-code-redeemed'] || 0) + ' unlocked, ' + (month['access-code-wrong'] || 0) + ' wrong tries</td></tr>' +
      '</tbody></table></div>' +
      '<p class="analytics-note">Days and months are UTC. The cost line is an estimate from the Google Speech fallback only (6-second clips at most); Gemini, Groq and Text-to-Speech are assumed to stay inside their free tiers — check each provider\'s dashboard for real billing. Daily limits per account: voice checks 15 (Free) / 150, AI quizzes 25, new example sentences 100, sentence audio 150.</p>';

    const roster = data.roster.slice().sort(function (a, b) { return (b.lastActive || 0) - (a.lastActive || 0); });
    const rosterRows = roster.map(function (u) {
      const highest = u.cleared.reduce(function (m, id) { return id in sectionIndex ? Math.max(m, sectionIndex[id]) : m; }, -1);
      return (
        '<tr><td>' + escapeHtml(u.name || '—') + '</td><td>' + escapeHtml(u.email) + '</td>' +
        '<td><span class="plan-badge plan-' + escapeHtml(u.plan) + '">' + escapeHtml(planLabel(u.plan)) + '</span></td>' +
        '<td class="num">' + u.streak + ' <span class="cell-sub">(best ' + u.bestStreak + ')</span></td>' +
        '<td>' + sectionName(highest) + '</td>' +
        '<td class="num">' + u.cleared.length + '</td><td class="num">' + u.wordsMastered + '</td>' +
        '<td>' + relativeDay(u.lastActive) + '</td></tr>'
      );
    }).join('');
    const rosterHtml =
      '<h3 class="browse-subhead">Learners (' + roster.length + ')</h3>' +
      '<div class="table-scroll"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Plan</th><th class="num">Streak</th><th>Furthest section</th><th class="num">Cleared</th><th class="num">Words mastered</th><th>Last active</th></tr></thead><tbody>' +
      rosterRows + '</tbody></table></div>' +
      '<p class="analytics-note">The site has no XP points, so learners are compared by sections cleared and words mastered.</p>';

    const most = Math.max(1, data.accounts.total);
    let prevCount = null;
    let dropOffs = 0;
    const funnelRows = roadmapSections
      .map(function (sec, i) {
        if (sec.level === MY_ADDITIONS_LEVEL) return '';
        const n = data.funnel[sec.id] || 0;
        // More than 30% fewer learners than the section before: worth a look.
        const drop = prevCount !== null && prevCount > 0 && (prevCount - n) / prevCount > 0.3;
        if (drop) dropOffs++;
        const dropPct = drop ? Math.round(((prevCount - n) / prevCount) * 100) : 0;
        prevCount = n;
        return (
          '<tr' + (drop ? ' class="drop-row"' : '') + '><td class="num">' + (i + 1) + '</td><td>' + escapeHtml(sec.title) + ' <span class="cell-sub">' + escapeHtml(kindLabel(sec)) + '</span>' +
          (drop ? ' <span class="drop-badge" title="' + dropPct + '% fewer learners than the section before">Drop-off point · −' + dropPct + '%</span>' : '') + '</td>' +
          '<td class="funnel-cell"><div class="funnel-bar"><div class="funnel-fill" style="width:' + Math.round((n / most) * 100) + '%"></div></div></td>' +
          '<td class="num">' + n + '</td></tr>'
        );
      })
      .join('');
    const funnel =
      '<h3 class="browse-subhead">Section funnel</h3>' +
      '<p class="analytics-note">How many learners have cleared each section. <strong>Drop-off point</strong> marks a section with more than 30% fewer learners than the one before (' + dropOffs + ' now) — the place to look for easier examples. Expect one after section ' + FREE_SECTIONS + ', where the Free Preview ends.</p>' +
      '<div class="table-scroll funnel-scroll"><table class="data-table"><thead><tr><th class="num">#</th><th>Section</th><th>Learners who cleared it</th><th class="num">Count</th></tr></thead><tbody>' +
      funnelRows + '</tbody></table></div>';

    const missedRows = data.missedWords.slice(0, 25).map(function (w, i) {
      return (
        '<tr><td class="num">' + (i + 1) + '</td><td><strong>' + escapeHtml(w.sk) + '</strong></td><td>' + escapeHtml(wordEn[w.sk] || '—') + '</td>' +
        '<td>' + sectionName(wordSection[w.sk]) + '</td><td class="num">' + w.misses + '</td><td class="num">' + w.learners + '</td></tr>'
      );
    }).join('');
    const missed =
      '<h3 class="browse-subhead">Top 25 most-missed words</h3>' +
      '<p class="analytics-note">Misses still on record across everyone (a right answer takes one back off), so these are the words that need a better hint, note or example.</p>' +
      (missedRows
        ? '<div class="table-scroll"><table class="data-table"><thead><tr><th class="num">#</th><th>Slovak</th><th>English</th><th>Section</th><th class="num">Misses</th><th class="num">Learners</th></tr></thead><tbody>' + missedRows + '</tbody></table></div>'
        : '<div class="empty-state">No missed words yet.</div>');

    body.innerHTML =
      kpis + activityChart(data.days || []) + usage + rosterHtml + funnel + missed +
      '<p class="analytics-note">Updated ' + escapeHtml(new Date(data.generatedAt).toLocaleString()) + '.</p>';

    // A free-tier gauge: green under 60%, amber to 85%, red above — or the
    // other way round when higher is better (the cache hit rate). Always
    // with the percentage and a word, never colour alone.
    function quotaMeter(fraction, what, higherIsBetter) {
      const pct = Math.max(0, Math.round(fraction * 100));
      const load = higherIsBetter ? 100 - pct : pct;
      const level = load > 85 ? 'bad' : load >= 60 ? 'warn' : 'good';
      const word = higherIsBetter
        ? { good: 'Healthy', warn: 'Fair', bad: 'Low' }[level]
        : { good: 'Healthy', warn: 'Watch', bad: 'Near limit' }[level];
      return (
        '<div class="quota-meter quota-' + level + '" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.min(pct, 100) + '" aria-label="' + escapeHtml(what) + '">' +
        '<div class="quota-track"><div class="quota-fill" style="width:' + Math.min(pct, 100) + '%"></div></div>' +
        '<span class="quota-label">' + pct + '% ' + escapeHtml(what) + ' · <strong>' + word + '</strong></span>' +
        '</div>'
      );
    }

    // Learners active on each of the last 7 days, as bars, with the numbers
    // in a table for screen readers.
    function activityChart(days) {
      if (!days.length) return '';
      const peak = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.learners; })));
      const peakIndex = days.map(function (d) { return d.learners; }).lastIndexOf(peak);
      const label = function (d) {
        return new Date(d.day + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
      };
      const bars = days.map(function (d, i) {
        const isToday = i === days.length - 1;
        const tip = d.learners + (d.learners === 1 ? ' learner' : ' learners') + ' · ' + d.day + (isToday ? ' (today)' : '');
        return (
          '<div class="activity-col' + (isToday ? ' today' : '') + '" tabindex="0" data-tip="' + escapeHtml(tip) + '">' +
          '<div class="activity-bar-area">' +
          ((isToday || i === peakIndex) && d.learners ? '<span class="activity-value">' + d.learners + '</span>' : '') +
          '<div class="activity-bar" style="height:' + (d.learners ? Math.max(4, Math.round((d.learners / peak) * 100)) : 0) + '%"></div>' +
          '</div>' +
          '<div class="activity-day">' + escapeHtml(isToday ? 'Today' : label(d)) + '</div>' +
          '</div>'
        );
      }).join('');
      const total = days.reduce(function (n, d) { return n + d.learners; }, 0);
      return (
        '<h3 class="browse-subhead">Learners active, last 7 days</h3>' +
        '<div class="activity-card">' +
        '<div class="activity-chart" aria-hidden="true">' + bars + '</div>' +
        '<table class="visually-hidden"><caption>Learners active per day</caption><tbody>' +
        days.map(function (d) { return '<tr><th>' + escapeHtml(d.day) + '</th><td>' + d.learners + '</td></tr>'; }).join('') +
        '</tbody></table>' +
        '<p class="analytics-note">' + (total
          ? 'Accounts that opened the site each day (UTC). Recorded from this update on.'
          : 'No activity recorded yet — this starts counting from this update.') + '</p>' +
        '</div>'
      );
    }

    function kpi(label, value, sub) {
      return '<div class="kpi-card"><div class="kpi-label">' + escapeHtml(label) + '</div><div class="kpi-value">' + value + '</div><div class="kpi-sub">' + sub + '</div></div>';
    }
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
        if (tab === 'analytics') renderAnalytics();
        // A new tab starts at its top, not wherever the last one was
        // scrolled to — except the roadmap, which goes to your next section.
        if (tab !== 'learn' || !scrollToUpNext(false)) window.scrollTo(0, 0);
      });
    });
  }

  // The topbar is sticky and its height changes (its tabs drop to a second
  // row on phones), so anything pinned below it reads the height from here.
  function trackTopbarHeight() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    function update() {
      document.documentElement.style.setProperty('--topbar-h', topbar.offsetHeight + 'px');
    }
    update();
    if (window.ResizeObserver) new ResizeObserver(update).observe(topbar);
    else window.addEventListener('resize', update);
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
  let dialogueData = [];

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
    const guideContainer = document.getElementById('guide-grammar-list');
    const vocabContainer = document.getElementById('vocab-list');

    try {
      const [shared, sharedVoc, privateContent, alphabet, curriculum, dialogues] = await Promise.all([
        fetchSharedGrammar(),
        fetchSharedVocab(),
        fetchPrivateContent(),
        fetchJson('data/alphabet.json', []),
        fetchJson('data/curriculum.json', []),
        fetchJson('data/dialogues.json', []),
      ]);

      sharedGrammarData = shared;
      sharedVocabData = sharedVoc;
      privateGrammarData = privateContent.grammarTopics || [];
      privateVocabData = privateContent.vocabGroups || [];
      alphabetData = alphabet;
      curriculumData = curriculum;
      dialogueData = dialogues;

      grammarData = sharedGrammarData.concat(privateGrammarData);
      vocabData = sharedVocabData.concat(privateVocabData);
      migrateRenamedWordKeys();

      renderGrammarGuide();
      renderVocab(vocabData);
      populateTopicSelect();
      updateAudioGenSummary();
      buildRoadmapSections();
    } catch (err) {
      guideContainer.innerHTML = '<div class="empty-state">Could not load grammar content.</div>';
      vocabContainer.innerHTML = '<div class="empty-state">Could not load vocabulary content.</div>';
    }
  }

  // Called right after Add Content saves something new — updates the word
  // lists, the Grammar Guide and the topic pickers immediately. The Roadmap tab picks up new
  // sections on next reload, same as it always required for shared content.
  async function refreshPrivateContent() {
    const privateContent = await fetchPrivateContent();
    privateGrammarData = privateContent.grammarTopics || [];
    privateVocabData = privateContent.vocabGroups || [];
    grammarData = sharedGrammarData.concat(privateGrammarData);
    vocabData = sharedVocabData.concat(privateVocabData);

    renderGrammarGuide();
    renderVocab(vocabData);
    populateTopicSelect();
    updateAudioGenSummary();
  }

  /* ---- Grammar text: light markup + tables ---- */

  // Grammar text is authored with a little markup so the key point of a
  // section stands out instead of sitting in a plain paragraph: **bold**,
  // *italic*, "- " bullet lines, and blank lines between paragraphs. Escaped
  // first, so nothing in the content (or anything Add Content saved) can
  // inject HTML.
  function inlineMarkupHtml(str) {
    return escapeHtml(str)
      .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function richTextHtml(str) {
    if (!str) return '';
    return String(str)
      .split(/\n\s*\n/)
      .map(function (block) {
        let html = '';
        let para = [];
        let items = [];
        function flushPara() {
          if (para.length) html += '<p>' + para.map(inlineMarkupHtml).join('<br>') + '</p>';
          para = [];
        }
        function flushList() {
          if (items.length) {
            html += '<ul>' + items.map(function (it) { return '<li>' + inlineMarkupHtml(it) + '</li>'; }).join('') + '</ul>';
          }
          items = [];
        }
        block.split('\n').forEach(function (line) {
          const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
          if (bullet) {
            flushPara();
            items.push(bullet[1]);
          } else if (line.trim()) {
            flushList();
            para.push(line);
          }
        });
        flushPara();
        flushList();
        return html;
      })
      .join('');
  }

  // Conjugations, pronoun sets and the like read far better as a grid than
  // as "ja som — ty si — on je…" run together on one line. Cells take the
  // same inline markup, so e.g. the changing ending can be bolded.
  function grammarTablesHtml(tables) {
    return (tables || [])
      .map(function (tbl) {
        const head = (tbl.head || []).length
          ? '<thead><tr>' + tbl.head.map(function (h) { return '<th>' + inlineMarkupHtml(h) + '</th>'; }).join('') + '</tr></thead>'
          : '';
        const body = (tbl.rows || [])
          .map(function (row) {
            return '<tr>' + row.map(function (cell) { return '<td>' + inlineMarkupHtml(cell) + '</td>'; }).join('') + '</tr>';
          })
          .join('');
        return (
          '<div class="grammar-table-block">' +
          (tbl.title ? '<div class="grammar-table-title">' + inlineMarkupHtml(tbl.title) + '</div>' : '') +
          '<div class="guide-table-wrap"><table class="guide-table grammar-table">' + head + '<tbody>' + body + '</tbody></table></div>' +
          '</div>'
        );
      })
      .join('');
  }

  function grammarTablesText(tables) {
    return (tables || [])
      .map(function (tbl) {
        const cells = [tbl.title || ''].concat(tbl.head || []);
        (tbl.rows || []).forEach(function (row) { cells.push.apply(cells, row); });
        return cells.join(' ');
      })
      .join(' ');
  }

  /* ---- Vocabulary ---- */

  // Word Lists follow the course: grouped by level, each topic where the
  // roadmap first teaches it. Topics from Add Content aren't in the course,
  // so they come last.
  function vocabTopicPlacement(topic) {
    let order = 0;
    for (let i = 0; i < curriculumData.length; i++) {
      const u = curriculumData[i];
      if (u.kind !== 'vocab') continue;
      if (u.ref === topic) return { order: order, level: u.level || 'A1.1' };
      order++;
    }
    return { order: 1e9, level: 'My additions' };
  }

  // A word can carry a short "note" in vocab.json — why a phrase looks the
  // way it does (Platím kartou: karta → kartou). Shown under the word in Word
  // Lists and on the back of its card; the Learn screen gathers a section's
  // notes into one table above the words.
  function wordNoteHtml(word) {
    return word && word.note ? '<div class="word-note">' + escapeHtml(word.note) + '</div>' : '';
  }

  function renderVocab(groups, emptyMessage) {
    const container = document.getElementById('vocab-list');
    const locked = hasFullAccess() ? 0 : groups.filter(function (g) { return FREE_PRACTICE_TOPICS.indexOf(g.topic) === -1; }).length;
    if (locked) groups = groups.filter(function (g) { return FREE_PRACTICE_TOPICS.indexOf(g.topic) !== -1; });
    if (!groups.length) {
      container.innerHTML = '<div class="empty-state">' + (emptyMessage || 'No vocabulary yet.') + '</div>';
      return;
    }

    const placed = groups.map(function (g) { return { group: g, at: vocabTopicPlacement(g.topic) }; });
    placed.sort(function (a, b) { return a.at.order - b.at.order; });
    let lastLevel = null;

    container.innerHTML = placed
      .map(function (p) {
        const g = p.group;
        const levelHead = p.at.level !== lastLevel
          ? '<h3 class="browse-subhead">' + escapeHtml(p.at.level) + '</h3>'
          : '';
        lastLevel = p.at.level;
        const words = (g.words || [])
          .map(function (w) {
            return (
              '<div class="vocab-word"><div class="sk">' +
              speakerButtonHtml(w.sk) +
              escapeHtml(w.sk) +
              '</div><div class="en">' +
              escapeHtml(w.en) +
              '</div>' +
              wordNoteHtml(w) +
              '</div>'
            );
          })
          .join('');

        return (
          levelHead +
          '<div class="vocab-group"><h3>' +
          escapeHtml(g.topic) +
          '</h3><div class="vocab-grid">' +
          words +
          '</div></div>'
        );
      })
      .join('') +
      (locked
        ? '<div class="pro-note"><strong>' + locked + ' more word topics</strong> come with Pro. <button type="button" class="link-btn" data-upsell="code">Enter a beta code</button> · <button type="button" class="link-btn" data-legal="pricing">See plans</button></div>'
        : '');
  }

  // Matches a grammar topic against a Grammar Guide search.
  function matchesGrammarQuery(t, q) {
    // Markup asterisks are stripped so "robím" still finds "rob**ím**".
    return (
      (t.topic || '').toLowerCase().indexOf(q) !== -1 ||
      (t.summary || '').toLowerCase().indexOf(q) !== -1 ||
      (t.explanation || '').replace(/\*/g, '').toLowerCase().indexOf(q) !== -1 ||
      grammarTablesText(t.tables).replace(/\*/g, '').toLowerCase().indexOf(q) !== -1 ||
      (t.examples || []).some(function (ex) {
        return (ex.sk || '').toLowerCase().indexOf(q) !== -1 || (ex.en || '').toLowerCase().indexOf(q) !== -1;
      })
    );
  }

  /* ---- Grammar Guide: same order you learn it in, laid out to scan ---- */

  function guideEntryHtml(title, summary, unitId, bodyHtml) {
    return (
      '<div class="guide-entry">' +
      '<div class="guide-entry-head">' +
      '<h4>' + escapeHtml(title) + '</h4>' +
      (unitId ? '<button type="button" class="guide-practice-btn" data-unit-id="' + escapeHtml(unitId) + '">Practice this</button>' : '') +
      '</div>' +
      (summary ? '<p class="guide-highlight">' + escapeHtml(summary) + '</p>' : '') +
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

    // The topic's own tables go first and stay visible — they're the part
    // you come back to look up — with the prose still behind its toggle.
    return (
      grammarTablesHtml(t.tables) +
      (examples
        ? '<div class="guide-table-wrap"><table class="guide-table"><tbody>' + examples + '</tbody></table></div>'
        : '') +
      (t.explanation
        ? '<details class="guide-explanation-toggle" open><summary>Explanation</summary>' +
          '<div class="guide-explanation rich-text">' + richTextHtml(t.explanation) + '</div></details>'
        : '')
    );
  }

  function unitIdForGrammar(id) {
    const unit = curriculumData.find(function (u) { return u.kind === 'grammar' && u.ref === id; });
    return unit ? unit.id : null;
  }

  // Every Guide entry in page order, each with the heading it sits under:
  // Sounds & Spelling (from the alphabet data), then grammar in the order
  // the roadmap teaches it — split by level to match its headers — and
  // anything added through Add Content last. The page and its topic picker
  // are both built from this.
  function guideEntries() {
    const entries = [];
    // Sounds & Spelling: the single most reference-shaped thing in the app,
    // and absent from Word Lists entirely.
    alphabetData.forEach(function (u) {
      entries.push({
        key: 'alpha:' + u.id,
        group: 'Sounds & Spelling',
        title: u.title,
        matches: function (q) {
          return (
            u.title.toLowerCase().indexOf(q) !== -1 ||
            (u.intro || '').toLowerCase().indexOf(q) !== -1 ||
            u.letters.some(function (l) {
              return l.letter.toLowerCase().indexOf(q) !== -1 || l.sound.toLowerCase().indexOf(q) !== -1 || l.example.sk.toLowerCase().indexOf(q) !== -1;
            })
          );
        },
        html: function () { return guideEntryHtml(u.title, '', 'alpha-' + u.id, letterTableHtml(u.letters)); },
      });
    });

    // Following curriculum.json's order means looking something up is
    // scrolling to roughly where you learned it, not hunting through an
    // unrelated filing scheme.
    const orderedIds = [];
    const levelOf = {};
    curriculumData.forEach(function (u) {
      if (u.kind === 'grammar' && orderedIds.indexOf(u.ref) === -1) {
        orderedIds.push(u.ref);
        levelOf[u.ref] = u.level || 'A1.1';
      }
    });
    function grammarEntry(t, group) {
      return {
        key: 'gram:' + t.id,
        group: group,
        title: t.topic,
        matches: function (q) { return matchesGrammarQuery(t, q); },
        html: function () { return guideEntryHtml(t.topic, t.summary, unitIdForGrammar(t.id), grammarBodyHtml(t)); },
      };
    }
    // "Use it" sections are sentence practice, not rules to look up, so
    // they're left out.
    orderedIds
      .map(function (id) { return grammarData.find(function (t) { return t.id === id; }); })
      .filter(function (t) { return t && !t.use; })
      .forEach(function (t) { entries.push(grammarEntry(t, 'Grammar — ' + levelOf[t.id])); });
    grammarData
      .filter(function (t) { return orderedIds.indexOf(t.id) === -1 && !t.use; })
      .forEach(function (t) { entries.push(grammarEntry(t, 'More')); });
    return entries;
  }

  // The topic picker's choice ('' = everything), as in Tests > Practice:
  // students looking something up may not know words like "pronoun" to
  // search for, but can recognise the topic in a list.
  let guideTopic = '';

  function renderGuideTopicSelect(entries) {
    const select = document.getElementById('guide-topic-select');
    if (!select) return;
    const groups = [];
    entries.forEach(function (e) { if (groups.indexOf(e.group) === -1) groups.push(e.group); });
    select.innerHTML =
      '<option value="">All topics</option>' +
      groups
        .map(function (g) {
          return (
            '<optgroup label="' + escapeHtml(g) + '">' +
            entries
              .filter(function (e) { return e.group === g; })
              .map(function (e) { return '<option value="' + escapeHtml(e.key) + '">' + escapeHtml(e.title) + '</option>'; })
              .join('') +
            '</optgroup>'
          );
        })
        .join('');
    select.value = entries.some(function (e) { return e.key === guideTopic; }) ? guideTopic : '';
    // On the Free Preview only Sounds & Spelling can be picked.
    if (!hasFullAccess()) {
      select.querySelectorAll('optgroup').forEach(function (g) { if (g.label !== 'Sounds & Spelling') g.remove(); });
    }
  }

  function renderGrammarGuide(query) {
    const container = document.getElementById('guide-grammar-list');
    if (!container) return;

    const q = (query || '').trim().toLowerCase();
    const entries = guideEntries();
    renderGuideTopicSelect(entries);

    const shown = entries.filter(function (e) {
      if (!hasFullAccess() && e.group !== 'Sounds & Spelling') return false;
      if (guideTopic) return e.key === guideTopic;
      return !q || e.matches(q);
    });
    const groups = [];
    shown.forEach(function (e) { if (groups.indexOf(e.group) === -1) groups.push(e.group); });

    const lockedNote = hasFullAccess()
      ? ''
      : '<div class="pro-note"><strong>' + entries.filter(function (e) { return e.group !== 'Sounds & Spelling'; }).length +
        ' grammar guides</strong> come with Pro. <button type="button" class="link-btn" data-upsell="code">Enter a beta code</button> · <button type="button" class="link-btn" data-legal="pricing">See plans</button></div>';

    container.innerHTML = shown.length
      ? lockedNote + groups
          .map(function (g) {
            return (
              '<div class="guide-category"><h3 class="browse-subhead">' + escapeHtml(g) + '</h3>' +
              shown.filter(function (e) { return e.group === g; }).map(function (e) { return e.html(); }).join('') +
              '</div>'
            );
          })
          .join('')
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
    // Typing a search goes back to searching every topic.
    guideTopic = '';
    renderGrammarGuide(query);
  }

  // Word Lists search: filters the already-loaded vocab client-side — no
  // server round-trip, since everything's already in memory. (Grammar has
  // its own home and search in the Grammar Guide.)
  function filterBrowseContent(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      renderVocab(vocabData);
      return;
    }

    const matchedVocab = vocabData
      .map(function (g) {
        const words = (g.words || []).filter(function (w) {
          return (w.sk || '').toLowerCase().indexOf(q) !== -1 || (w.en || '').toLowerCase().indexOf(q) !== -1 ||
            (w.note || '').toLowerCase().indexOf(q) !== -1;
        });
        return words.length ? { topic: g.topic, words: words } : null;
      })
      .filter(Boolean);

    renderVocab(matchedVocab, 'No matches for “' + escapeHtml(query.trim()) + '”.');
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

  // Tracked so a click that lands before the manifest has arrived waits for
  // it rather than falling through to the browser's synthetic voice, which
  // sounds nothing like the real audio.
  let manifestPending = null;

  async function loadAudioManifest() {
    manifestPending = (async function () {
      try {
        const res = await fetch('data/audio-manifest.json');
        if (res.ok) audioManifest = await res.json();
      } catch (err) {
        audioManifest = {};
      }
    })();
    await manifestPending;
    updateAudioGenSummary();
  }

  // Entries like "ujo / strýko" list alternatives. Read aloud as written, a
  // voice says the slash itself ("lomka"), so it becomes a pause instead.
  function speakableText(text) {
    return String(text)
      .replace(/\s*\/\/\s*/g, '. ')
      .replace(/\s*\/\s*/g, ', ')
      .replace(/([.!?,])[.,]\s/g, '$1 '); // "stojí? / Koľko" → "stojí? Koľko", not "stojí?, Koľko"
  }

  function speakWithBrowserVoice(text) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(speakableText(text));
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
  // The generated files aren't just quiet, they're inconsistent: measured
  // across the library they range from about -16.7 dB to -23.2 dB mean, which
  // is why some words sound fine and others almost inaudible. A flat boost
  // preserves that spread, so each clip is measured after decoding and
  // levelled to a common target instead.
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
      audioGainNode.gain.value = 1;
      // Straight to the destination: levelling already caps every clip below
      // clipping, so a compressor would only add time-varying gain that
      // depends on what played just before.
      audioGainNode.connect(audioCtx.destination);
      return audioGainNode;
    } catch (err) {
      audioCtx = null;
      audioGainNode = null;
      return null;
    }
  }

  const TARGET_RMS = 0.16;
  const MAX_NORMALISE_GAIN = 8;
  const BUFFER_CACHE_LIMIT = 60;
  const levelCache = {};
  const bufferCache = {};
  const bufferOrder = [];
  let currentSource = null;

  // RMS rather than peak: a single transient shouldn't decide how loud a word
  // sounds. Silence is excluded so short clips with long lead-ins aren't
  // over-boosted, and the result is capped so a near-silent file doesn't get
  // amplified into hiss.
  function computeGain(buffer) {
    const d = buffer.getChannelData(0);
    let sum = 0;
    let n = 0;
    let peak = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i] < 0 ? -d[i] : d[i];
      if (v > peak) peak = v;
      if (v > 0.005) {
        sum += d[i] * d[i];
        n++;
      }
    }
    if (!n || peak <= 0.001) return 1;
    const rms = Math.sqrt(sum / n);
    let gain = Math.min(MAX_NORMALISE_GAIN, TARGET_RMS / rms);
    if (peak * gain > 0.95) gain = 0.95 / peak;
    return gain;
  }

  // Browsers start an AudioContext suspended until the page has been
  // interacted with. Waking it on the first interaction anywhere means it's
  // already running by the time a speaker button is pressed — otherwise the
  // first press could start a source on a suspended context and produce
  // nothing, which is what made it take a couple of clicks to get sound.
  function primeAudio() {
    const chain = getAudioChain();
    if (chain && audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
  }
  document.addEventListener('click', primeAudio, { capture: true });
  document.addEventListener('keydown', primeAudio, { capture: true });

  async function playLevelled(url, token) {
    const chain = getAudioChain();
    if (!chain) return false;
    const ctx = audioCtx;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        /* handled by the state check below */
      }
    }
    // Starting a source on a still-suspended context makes no sound at all
    // and reports no error, so hand off to the element instead.
    if (ctx.state !== 'running') return false;

    // Decoded clips are cached, so replaying a word never touches the network
    // again. Without this, every play depended on a fresh fetch succeeding —
    // and a slow or failed one silently dropped to a different playback path
    // at a different volume, which is exactly the kind of intermittent
    // difference that's impossible to pin down from the outside.
    let buffer = bufferCache[url];
    if (!buffer) {
      let res = await fetch(url);
      if (!res.ok) {
        res = await fetch(url, { cache: 'reload' }); // one retry before giving up
        if (!res.ok) return false;
      }
      const bytes = await res.arrayBuffer();
      if (token !== speakToken) return true; // superseded by a newer click
      buffer = await ctx.decodeAudioData(bytes);
      bufferCache[url] = buffer;
      bufferOrder.push(url);
      if (bufferOrder.length > BUFFER_CACHE_LIMIT) delete bufferCache[bufferOrder.shift()];
    }
    if (token !== speakToken) return true;

    if (levelCache[url] === undefined) levelCache[url] = computeGain(buffer);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const perFile = ctx.createGain();
    perFile.gain.value = levelCache[url];
    src.connect(perFile);
    perFile.connect(chain);
    src.start();
    currentSource = src;
    return true;
  }

  let speakToken = 0;

  async function speak(text) {
    if (!text) return;

    // Identifies this specific request, so a rejection caused by us stopping
    // playback for a newer click isn't mistaken for a real failure — that
    // was firing the robot voice over the top of the audio you just asked for.
    const myToken = ++speakToken;

    if (currentSource) {
      try {
        currentSource.stop();
      } catch (err) {
        /* already finished */
      }
      currentSource = null;
    }
    if (currentAudioEl) {
      currentAudioEl.pause();
      currentAudioEl = null;
    }
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (err) {
      /* not available in this browser */
    }

    // A click can land before the manifest has arrived. Waiting for it means
    // a word we have real audio for never gets spoken by the synthetic voice
    // just because of load timing.
    let filename = audioManifest[text];
    if (!filename && manifestPending) {
      try {
        await manifestPending;
      } catch (err) {
        /* fall through to whatever the manifest ended up as */
      }
      if (myToken !== speakToken) return;
      filename = audioManifest[text];
    }
    if (!filename) {
      speakWithBrowserVoice(text);
      return;
    }

    function fallback() {
      // A failure only matters if this is still the request the user is
      // waiting on — being interrupted by a newer click isn't an error.
      if (myToken !== speakToken) return;
      const audioEl = new Audio(filename);
      currentAudioEl = audioEl;

      // Route through the gain stage when it's usable, so falling back
      // doesn't also mean noticeably quieter than a levelled clip. Roughly
      // the average boost levelling applies, since there's no decoded buffer
      // here to measure.
      const chain = getAudioChain();
      if (chain && audioCtx.state === 'running') {
        try {
          const src = audioCtx.createMediaElementSource(audioEl);
          const g = audioCtx.createGain();
          g.gain.value = 1.6;
          src.connect(g);
          g.connect(chain);
        } catch (err) {
          /* plays through the element's own output instead */
        }
      }

      audioEl.addEventListener('error', function () {
        if (myToken === speakToken) speakWithBrowserVoice(text);
      });
      audioEl.play().catch(function () {
        if (myToken === speakToken) speakWithBrowserVoice(text);
      });
    }

    playLevelled(filename, myToken).then(
      function (ok) {
        if (!ok) fallback();
      },
      fallback
    );
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
  const LONGEST_STREAK_KEY = 'slovencina_longest_streak';

  // The learner's own calendar day. toISOString() is UTC, which in Slovakia
  // made anything done between midnight and 1–2am count as the day before.
  function localDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function todayStr() {
    return localDateStr(new Date());
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
    const d = new Date();
    d.setDate(d.getDate() - 1); // a calendar day back, even across a clock change
    const yesterday = localDateStr(d);
    count = lastDate === yesterday ? count + 1 : 1;

    localStorage.setItem(STREAK_COUNT_KEY, String(count));
    localStorage.setItem(STREAK_DATE_KEY, today);
    const longest = Number(localStorage.getItem(LONGEST_STREAK_KEY) || '0');
    if (count > longest) localStorage.setItem(LONGEST_STREAK_KEY, String(count));
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

  function setupStudentViewToggle() {
    const mascot = document.getElementById('profile-mascot');
    if (!mascot) return;
    mascot.addEventListener('click', function () {
      if (!isDevAccount()) return;
      try {
        localStorage.setItem(STUDENT_VIEW_KEY, studentViewOn() ? '0' : '1');
      } catch (err) {
        return;
      }
      renderRoadmapMap();
      // Redraw the Tests round picker's locks too, unless a round is open
      // there (redrawing would throw it away).
      if (!document.getElementById('round-map').classList.contains('hidden')) renderRoundMap(currentRoundTopic);
      renderProfile();
    });
  }

  // Tapping the "x / y today" line opens a row of goal sizes to pick from
  // (a typed number in a browser prompt box looked out of place, and
  // phones show it as a full-screen dialog).
  const DAILY_GOAL_OPTIONS = [5, 10, 20, 30];

  function setupDailyGoal() {
    const btn = document.getElementById('daily-goal-label');
    const picker = document.getElementById('daily-goal-picker');
    if (!btn || !picker) return;

    picker.innerHTML = DAILY_GOAL_OPTIONS.map(function (n) {
      return '<button type="button" class="daily-goal-option" data-goal="' + n + '">' + n + '</button>';
    }).join('');

    function setOpen(open) {
      picker.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', String(open));
      const target = getDailyGoalTarget();
      picker.querySelectorAll('.daily-goal-option').forEach(function (o) {
        o.classList.toggle('active', Number(o.dataset.goal) === target);
      });
    }

    btn.addEventListener('click', function () {
      setOpen(picker.classList.contains('hidden'));
    });
    picker.addEventListener('click', function (e) {
      const opt = e.target.closest('.daily-goal-option');
      if (!opt) return;
      setDailyGoalTarget(Number(opt.dataset.goal));
      setOpen(false);
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

  /* ---- Hear any word in a sentence ---- */

  // Sentences are generated once per word and then kept, so the same word
  // doesn't cost a round-trip (or a slightly different sentence) every time.
  const SENTENCES_KEY = 'slovencina_word_sentences';
  // Audio for a generated sentence isn't in the pre-built manifest and isn't
  // worth committing to the repo, so it's fetched on demand and held for the
  // rest of the session only.
  const sentenceAudioCache = {};

  function loadSentenceCache() {
    try {
      return JSON.parse(localStorage.getItem(SENTENCES_KEY) || '{}');
    } catch (err) {
      return {};
    }
  }

  function cacheSentence(sk, entry) {
    const all = loadSentenceCache();
    all[sk] = entry;
    try {
      localStorage.setItem(SENTENCES_KEY, JSON.stringify(all));
    } catch (err) {
      /* storage full — the sentence still works for this session */
    }
  }

  function sentenceUiHtml(word) {
    return (
      '<div class="sentence-block">' +
      '<button type="button" class="sentence-btn" data-sk="' + escapeHtml(word.sk) + '" data-en="' + escapeHtml(word.en || '') + '">' +
      'Hear it in a sentence' + (hasFullAccess() ? '' : ' · Pro') +
      '</button>' +
      '<div class="sentence-slot"></div>' +
      '</div>'
    );
  }

  function renderSentenceInto(slot, sk, entry) {
    slot.innerHTML =
      '<div class="sentence-result">' +
      '<div class="sentence-sk">' + speakerButtonHtml(entry.sentence) + escapeHtml(entry.sentence) + '</div>' +
      (entry.translation ? '<div class="sentence-en">' + escapeHtml(entry.translation) + '</div>' : '') +
      '</div>';
    // The speaker button in here points at a generated sentence, which has no
    // pre-generated clip in the manifest — route it to the on-demand voice
    // instead of letting it fall through to the robotic browser one.
    const btn = slot.querySelector('.speak-btn');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        speakSentence(entry.sentence);
      });
    }
  }

  async function speakSentence(text) {
    try {
      if (!sentenceAudioCache[text]) {
        const token = getSessionToken();
        const res = await fetch('/.netlify/functions/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ text: text }),
        });
        if (!res.ok) throw new Error('tts failed');
        const data = await res.json();
        sentenceAudioCache[text] = data.audioBase64;
      }
      const audio = new Audio('data:audio/mp3;base64,' + sentenceAudioCache[text]);
      audio.play().catch(function () {});
    } catch (err) {
      // Real Slovak audio didn't come back — the browser voice is worse, but
      // better than the button doing nothing.
      speakWithBrowserVoice(text);
    }
  }

  async function handleSentenceClick(btn) {
    if (!hasFullAccess()) {
      showUpsell('Example sentences');
      return;
    }
    const sk = btn.dataset.sk;
    const en = btn.dataset.en || '';
    const slot = btn.parentElement.querySelector('.sentence-slot');
    if (!slot) return;

    const cached = loadSentenceCache()[sk];
    if (cached && cached.sentence) {
      renderSentenceInto(slot, sk, cached);
      speakSentence(cached.sentence);
      return;
    }

    btn.disabled = true;
    slot.innerHTML = '<div class="sentence-loading">Writing a sentence…</div>';

    try {
      // Same automatic retries as the quiz: a busy or slow moment at Gemini
      // is tried again quietly before the learner ever sees an error.
      const result = await postJsonWithRetry('/.netlify/functions/word-sentence', { sk: sk, en: en }, {
        initialMessage: '',
        onStatus: function (msg) {
          if (msg) slot.innerHTML = '<div class="sentence-loading">' + escapeHtml(msg) + '</div>';
        },
      });
      const data = result.data || {};
      if (result.status === 403) {
        slot.innerHTML = '';
        showUpsell('Example sentences');
        return;
      }
      // Today's limit reached: say so, rather than "try again in a moment".
      if (result.status === 429) {
        slot.innerHTML = '<div class="sentence-error">' + escapeHtml(result.error) + '</div>';
        return;
      }
      if (!result.ok || !data.sentence) throw new Error(result.error || 'No sentence.');

      const entry = { sentence: data.sentence, translation: data.translation || '' };
      cacheSentence(sk, entry);
      renderSentenceInto(slot, sk, entry);
      speakSentence(entry.sentence);
    } catch (err) {
      slot.innerHTML = '<div class="sentence-error">Couldn’t write a sentence just now. Try again in a moment.</div>';
    } finally {
      btn.disabled = false;
    }
  }

  // Delegated once, so every practice/review card rendered anywhere in the app
  // gets this without each renderer having to wire up its own listener.
  document.addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('.sentence-btn') : null;
    if (btn) handleSentenceClick(btn);
  });

  /* ---- Mastered words ---- */

  // Deliberately separate from vocab stats: a word lands in vocab stats the
  // first time it's practised at all, which is "seen", not "known". Mastery is
  // only awarded for remembering a word later — right on a checkpoint test,
  // or right again on a later day (see recordWordResult) — so that's the
  // number worth showing on the Profile.
  const MASTERED_KEY = 'slovencina_mastered_words';

  function loadMasteredWords() {
    try {
      return JSON.parse(localStorage.getItem(MASTERED_KEY) || '{}');
    } catch (err) {
      return {};
    }
  }

  function markWordMastered(sk) {
    if (!sk) return;
    const mastered = loadMasteredWords();
    if (mastered[sk]) return;
    mastered[sk] = true;
    localStorage.setItem(MASTERED_KEY, JSON.stringify(mastered));
  }

  function masteredWordCount() {
    return Object.keys(loadMasteredWords()).length;
  }

  // Every graded answer for a word goes through here (lesson cards, quizzes,
  // checkpoints, Tests practice, Revise).
  //
  // Mastery means remembering a word later, not just after learning it. It
  // used to come only from checkpoints, which ask 12 of the ~70 words they
  // cover — so most words could never be mastered. Now a right answer also
  // masters a word when it was already answered right on an earlier day.
  function recordWordResult(word, gotIt) {
    if (!word || !word.sk) return;
    const stats = loadVocabStats();
    const entry = stats[word.sk] || { misses: 0 };
    entry.misses = gotIt ? Math.max(0, (entry.misses || 0) - 1) : (entry.misses || 0) + 1;
    if (gotIt) {
      const today = todayStr();
      if (entry.firstRight && entry.firstRight < today) markWordMastered(word.sk);
      if (!entry.firstRight) entry.firstRight = today;
    }
    stats[word.sk] = entry;
    saveVocabStats(stats);
  }

  // Word stats and mastery are keyed by the Slovak text, so correcting a
  // word ("Muž" → "muž", "chodiť (chodím)" → "chodiť") would otherwise
  // quietly wipe that word's progress. Any saved key that no longer matches
  // a word, but matches one once case and bracketed extras are ignored, is
  // moved onto the corrected word.
  function wordMatchKey(sk) {
    return String(sk).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function migrateRenamedWordKeys() {
    const current = {};
    vocabData.forEach(function (g) {
      (g.words || []).forEach(function (w) { if (w.sk) current[w.sk] = true; });
    });
    const byMatchKey = {};
    Object.keys(current).forEach(function (sk) {
      const k = wordMatchKey(sk);
      // Two live words sharing a match key (e.g. "ahoj" and "Ahoj") make it
      // ambiguous where an old key belongs, so those are left alone.
      byMatchKey[k] = k in byMatchKey && byMatchKey[k] !== sk ? null : sk;
    });
    // Checkpoints also record alphabet example words. They're live keys in
    // their own right and must never be folded into a vocab word.
    alphabetData.forEach(function (u) {
      (u.letters || []).forEach(function (l) { if (l.example && l.example.sk) current[l.example.sk] = true; });
    });
    grammarData.forEach(function (t) {
      (t.examples || []).forEach(function (ex) { if (ex.sk) current[ex.sk] = true; });
    });

    function remap(store, merge) {
      let changed = false;
      Object.keys(store).forEach(function (key) {
        if (current[key]) return;
        const target = byMatchKey[wordMatchKey(key)];
        if (!target) return;
        store[target] = target in store ? merge(store[target], store[key]) : store[key];
        delete store[key];
        changed = true;
      });
      return changed;
    }

    const stats = loadVocabStats();
    const statsChanged = remap(stats, function (a, b) {
      const merged = { misses: Math.max((a && a.misses) || 0, (b && b.misses) || 0) };
      // Keep the earlier first-right day, which later mastery is counted from.
      const days = [a && a.firstRight, b && b.firstRight].filter(Boolean).sort();
      if (days.length) merged.firstRight = days[0];
      return merged;
    });
    if (statsChanged) saveVocabStats(stats);

    const mastered = loadMasteredWords();
    const masteredChanged = remap(mastered, function () { return true; });
    if (masteredChanged) localStorage.setItem(MASTERED_KEY, JSON.stringify(mastered));

    if (statsChanged || masteredChanged) scheduleProgressSync();
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
      showRoundTopic(e.target.value);
    });
  }

  // Every topic's word list is split into small rounds of this size — small
  // enough to hold in your head at once, instead of scrolling a wall of words.
  const ROUND_SIZE = 8;
  // A round counts as cleared, unlocking the next one, once you know at
  // least this fraction of its words without needing to think too hard.
  const ROUND_CLEAR_THRESHOLD = 0.8;

  const ROUND_PROGRESS_KEY = 'slovencina_round_progress';


  // Balanced, not greedy: filling full-size rounds and dumping whatever's
  // left into a final round can leave that last round absurdly small — 17
  // words at size 8 used to produce 8, 8, 1, so a whole lesson consisted of
  // exactly one word. Choosing the round count first and then spreading the
  // words evenly across it means every round in a group is within one word
  // of every other.
  function chunkIntoRounds(words, size) {
    if (!words.length) return [];
    const numRounds = Math.max(1, Math.round(words.length / size));
    const base = Math.floor(words.length / numRounds);
    const extra = words.length % numRounds; // first `extra` rounds get one more
    const rounds = [];
    let i = 0;
    for (let r = 0; r < numRounds; r++) {
      const thisSize = base + (r < extra ? 1 : 0);
      rounds.push(words.slice(i, i + thisSize));
      i += thisSize;
    }
    return rounds;
  }

  // A topic can set its own parts with "split" in vocab.json, e.g.
  // [8, 12, 9] — for when the teacher wants a particular grouping (all
  // twelve months in one section) rather than the automatic ~8-word chunks.
  // A split that doesn't add up to the word count is ignored.
  function roundsForGroup(group) {
    const words = (group && group.words) || [];
    const split = group && group.split;
    const valid = Array.isArray(split) && split.length > 0 &&
      split.every(function (n) { return n > 0; }) &&
      split.reduce(function (a, b) { return a + b; }, 0) === words.length;
    if (!valid) return chunkIntoRounds(words, ROUND_SIZE);
    let i = 0;
    return split.map(function (n) {
      const round = words.slice(i, i + n);
      i += n;
      return round;
    });
  }

  function roundsForTopic(topic) {
    return roundsForGroup(vocabData.find(function (g) { return g.topic === topic; }));
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

    if (!hasFullAccess() && FREE_PRACTICE_TOPICS.indexOf(topic) === -1) {
      mapEl.innerHTML =
        '<div class="pro-note pro-note-center"><strong>' + escapeHtml(topic) + '</strong> comes with Pro. On the Free Preview you can practise ' +
        FREE_PRACTICE_TOPICS.map(escapeHtml).join(' and ') + '.<br><button type="button" class="btn btn-primary" data-upsell="code">Enter a beta code</button> <button type="button" class="btn btn-secondary" data-legal="pricing">See plans</button></div>';
      return;
    }

    const rounds = roundsForTopic(topic);
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

    // Only the first round still to do pulses; other playable ones are calm.
    let firstOpen = -1;
    rounds.forEach(function (round, i) {
      if (firstOpen === -1 && !isRoundCleared(topic, i)) firstOpen = i;
    });

    mapEl.innerHTML =
      rounds
        .map(function (round, i) {
          const cleared = isRoundCleared(topic, i);
          const locked = !devUnlocked() && i > 0 && !isRoundCleared(topic, i - 1);
          const isCurrent = !cleared && !locked;
          const stateClass = cleared ? 'cleared' : locked ? 'locked' : i === firstOpen ? 'current up-next' : 'open';

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

    drawRoadmapPath(mapEl);
    revealRowsOnScroll(mapEl);
  }

  let practiceQueue = [];
  let practiceIndex = 0;
  let practiceCorrect = 0;
  let practiceRevealed = false;
  let practiceGraded = false;
  // Bumped whenever a round starts or is left, so a card's delayed "next"
  // from an old round can't draw over whatever is on screen now.
  let practiceRun = 0;
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
    showRoundTopic(currentRoundTopic);
  }

  // Shows a topic's rounds, leaving any round that was open. Picking another
  // topic in the middle of a round used to clear the round but leave the
  // round picker hidden, so the screen went blank.
  function showRoundTopic(topic) {
    practiceRun++;
    practiceQueue = [];
    practiceIndex = 0;
    practiceCorrect = 0;
    currentRoundTopic = topic;
    document.getElementById('round-map').classList.remove('hidden');
    renderRoundMap(topic);
  }

  /* ---- Flashcard direction (shared by every flashcard screen) ---- */

  // Slovak → English checks you recognise a word; English → Slovak checks
  // you can produce it, which is harder and what you need to speak. The
  // choice is remembered on this device.
  const CARD_DIRECTION_KEY = 'slovencina_card_direction';

  function cardDirection() {
    try {
      return localStorage.getItem(CARD_DIRECTION_KEY) === 'en-sk' ? 'en-sk' : 'sk-en';
    } catch (err) {
      return 'sk-en';
    }
  }

  function cardDirectionToggleHtml() {
    const d = cardDirection();
    return (
      '<div class="card-direction" role="group" aria-label="Card direction">' +
      '<button type="button" class="card-direction-btn' + (d === 'sk-en' ? ' active' : '') + '" data-direction="sk-en">Slovak → English</button>' +
      '<button type="button" class="card-direction-btn' + (d === 'en-sk' ? ' active' : '') + '" data-direction="en-sk">English → Slovak</button>' +
      '</div>'
    );
  }

  // Flips the card on screen in place (front, and the answer if it's
  // showing) rather than redrawing it, so switching can't reset a card
  // that's already been graded.
  function wireCardDirection(container, word, answerId) {
    const buttons = container.querySelectorAll('.card-direction-btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        try {
          localStorage.setItem(CARD_DIRECTION_KEY, btn.dataset.direction);
        } catch (err) {
          /* storage unavailable — the choice just won't be remembered */
        }
        buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
        container.querySelector('.practice-word').innerHTML = cardFrontHtml(word);
        const answer = document.getElementById(answerId);
        if (answer && answer.innerHTML) answer.innerHTML = cardBackHtml(word);
      });
    });
  }

  function cardFrontHtml(word) {
    return cardDirection() === 'en-sk' ? escapeHtml(word.en) : speakerButtonHtml(word.sk) + escapeHtml(word.sk);
  }

  function cardBackHtml(word) {
    return (cardDirection() === 'en-sk' ? speakerButtonHtml(word.sk) + escapeHtml(word.sk) : escapeHtml(word.en)) +
      wordNoteHtml(word);
  }

  function startRound(topic, roundIndex) {
    const rounds = roundsForTopic(topic);
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

    practiceRun++;
    currentRoundTopic = topic;
    currentRoundIndex = roundIndex;
    practiceQueue = pool.map(function (w) { return { word: w, mode: 'card' }; }).concat(practiceDrills(words));
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

      const rounds = roundsForTopic(currentRoundTopic);
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
    const entry = practiceQueue[practiceIndex];
    const word = entry.word;

    if (entry.mode !== 'card') {
      stage.innerHTML =
        backToRoundsLinkHtml() +
        '<div class="practice-progress">' + (practiceIndex + 1) + ' of ' + practiceQueue.length + '</div>' +
        '<div class="practice-prompt" id="practice-prompt"></div>';
      document.getElementById('back-to-rounds-btn').addEventListener('click', goBackToRounds);
      const run = practiceRun;
      const handlers = {
        onAnswer: function (isCorrect) {
          recordWordResult(word, isCorrect);
          if (isCorrect) practiceCorrect++;
          playTone(isCorrect ? 'correct' : 'incorrect');
          recordPracticeToday();
          incrementDailyCount();
          checkWordCountAchievements();
        },
        onNext: function () {
          if (run !== practiceRun) return; // the round was left meanwhile
          practiceIndex++;
          renderPracticeCard();
        },
      };
      const container = document.getElementById('practice-prompt');
      if (entry.mode === 'type') {
        renderTypedPrompt(container, word, '', handlers);
        return;
      }
      if (renderLetterPrompt(container, word, '', handlers)) return;
    }

    stage.innerHTML =
      backToRoundsLinkHtml() +
      '<div class="practice-progress">Card ' + (practiceIndex + 1) + ' of ' + practiceQueue.length + '</div>' +
      cardDirectionToggleHtml() +
      '<div class="practice-card" id="practice-card">' +
      '<div class="practice-word">' + cardFrontHtml(word) + '</div>' +
      '<div class="practice-answer" id="practice-answer"></div>' +
      '<button class="btn btn-secondary" id="practice-reveal-btn">Show Answer</button>' +
      '<div class="practice-grade-row hidden" id="practice-grade-row">' +
      '<button class="btn-grade missed" id="practice-missed-btn">Missed it</button>' +
      '<button class="btn-grade got-it" id="practice-gotit-btn">Got it</button>' +
      '</div>' +
      '<div class="hidden" id="practice-sentence-wrap">' + sentenceUiHtml(word) + '</div>' +
      '</div>';

    document.getElementById('back-to-rounds-btn').addEventListener('click', goBackToRounds);
    wireCardDirection(stage, word, 'practice-answer');

    document.getElementById('practice-reveal-btn').addEventListener('click', function () {
      practiceRevealed = true;
      flipReveal(document.getElementById('practice-card'));
      document.getElementById('practice-answer').innerHTML = cardBackHtml(word);
      document.getElementById('practice-reveal-btn').classList.add('hidden');
      document.getElementById('practice-grade-row').classList.remove('hidden');
      document.getElementById('practice-sentence-wrap').classList.remove('hidden');
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

    recordWordResult(word, gotIt);

    if (gotIt) practiceCorrect++;
    playTone(gotIt ? 'correct' : 'incorrect');
    recordPracticeToday();
    incrementDailyCount();
    unlockAchievement('first-practice', 'First Practice Complete');
    checkWordCountAchievements();
    renderProfile();

    const card = document.getElementById('practice-card');
    card.classList.add(gotIt ? 'flash-correct' : 'flash-incorrect');

    const run = practiceRun;
    setTimeout(function () {
      if (run !== practiceRun) return; // the round was left (another topic picked) meanwhile
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

  // Show Answer: the card flips over with a little spring and keeps a warm
  // border while the answer is showing.
  function flipReveal(card) {
    if (!card) return;
    card.classList.add('revealed');
    card.classList.remove('flipping');
    void card.offsetWidth; // restart the animation
    card.classList.add('flipping');
    card.addEventListener('animationend', function done(e) {
      if (e.animationName !== 'card-flip') return;
      card.classList.remove('flipping');
      card.removeEventListener('animationend', done);
    });
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
      cardDirectionToggleHtml() +
      '<div class="practice-card" id="review-card">' +
      '<div class="practice-word">' + cardFrontHtml(word) + '</div>' +
      '<div class="practice-answer" id="review-answer"></div>' +
      '<button class="btn btn-secondary" id="review-reveal-btn">Show Answer</button>' +
      '<div class="practice-grade-row hidden" id="review-grade-row">' +
      '<button class="btn-grade missed" id="review-missed-btn">Missed it</button>' +
      '<button class="btn-grade got-it" id="review-gotit-btn">Got it</button>' +
      '</div>' +
      '<div class="hidden" id="review-sentence-wrap">' + sentenceUiHtml(word) + '</div>' +
      '</div>';

    wireCardDirection(stage, word, 'review-answer');
    document.getElementById('review-reveal-btn').addEventListener('click', function () {
      flipReveal(document.getElementById('review-card'));
      document.getElementById('review-answer').innerHTML = cardBackHtml(word);
      document.getElementById('review-reveal-btn').classList.add('hidden');
      document.getElementById('review-grade-row').classList.remove('hidden');
      document.getElementById('review-sentence-wrap').classList.remove('hidden');
    });
    document.getElementById('review-missed-btn').addEventListener('click', function () { gradeReviewCard(word, false); });
    document.getElementById('review-gotit-btn').addEventListener('click', function () { gradeReviewCard(word, true); });
  }

  function gradeReviewCard(word, gotIt) {
    if (reviewGraded) return;
    reviewGraded = true;

    const gradeRow = document.getElementById('review-grade-row');
    if (gradeRow) gradeRow.style.pointerEvents = 'none';

    recordWordResult(word, gotIt);

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
          level: unit.level || 'A1.1',
          title: a.title,
          subtitle: a.letters.length + ' letters',
          explanation: a.intro || '',
          letters: a.letters,
          items: a.letters.map(function (l) { return l.example; }),
        });
        return;
      }

      // A short scene: read and hear it, then answer questions about it.
      // Its lines double as the items, so the Voice step has you say them.
      if (unit.kind === 'dialogue') {
        const d = dialogueData.find(function (x) { return x.id === unit.ref; });
        if (!d) return;
        sections.push({
          id: unit.id,
          kind: 'dialogue',
          level: unit.level || 'A1.1',
          title: d.title,
          subtitle: d.scene || '',
          explanation: '',
          lines: d.lines || [],
          exercises: d.exercises || [],
          items: (d.lines || []).map(function (l) { return { sk: l.sk, en: l.en }; }),
        });
        return;
      }

      if (unit.kind === 'grammar') {
        const t = grammarData.find(function (x) { return x.id === unit.ref; });
        if (!t) return;
        sections.push({
          id: unit.id,
          kind: 'grammar',
          level: unit.level || 'A1.1',
          title: t.topic,
          subtitle: t.summary || '',
          explanation: t.explanation || '',
          tables: t.tables || [],
          exercises: t.exercises || [],
          items: t.examples || [],
          // "Use it" sections put a block of new words into sentences with
          // grammar already taught; they run like grammar sections.
          useIt: !!t.use,
        });
        return;
      }

      const g = vocabData.find(function (x) { return x.topic === unit.ref; });
      if (!g) return;
      const rounds = roundsForGroup(g);
      const round = rounds[unit.round];
      if (!round || !round.length) return;
      sections.push({
        id: unit.id,
        kind: 'vocab',
        level: unit.level || 'A1.1',
        title: g.topic + (rounds.length > 1 ? ' · Part ' + (unit.round + 1) + ' of ' + rounds.length : ''),
        subtitle: round.length + ' words',
        explanation: '',
        items: round,
      });
    });

    // Anything this account added itself via Add Content isn't part of the
    // authored course, so it goes in its own group after every level —
    // outside the tests, and never locked.
    privateVocabData.forEach(function (g) {
      roundsForGroup(g).forEach(function (round, i) {
        sections.push({
          id: 'private-vocab-' + g.topic + '-' + i,
          kind: 'vocab',
          level: MY_ADDITIONS_LEVEL,
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
        level: MY_ADDITIONS_LEVEL,
        title: t.topic,
        subtitle: t.summary || '',
        explanation: t.explanation || '',
        tables: t.tables || [],
        exercises: t.exercises || [],
        items: t.examples || [],
      });
    });

    roadmapSections = withCheckpoints(sections);
    renderRoadmapMap();
    renderProfile();
  }

  /* ---- Checkpoint tests ---- */

  const CHECKPOINT_EVERY = 10;
  const CHECKPOINT_MAX_QUESTIONS = 12;
  // Gentler than a normal section's 80%. A checkpoint spans ten sections of
  // material, and its real job is measuring what's mastered — gating the rest
  // of the course behind a near-perfect score would make it a wall instead.
  const CHECKPOINT_CLEAR_THRESHOLD = 0.7;
  // Below this there aren't enough distinct words to make a test worth sitting.
  const CHECKPOINT_MIN_WORDS = 4;

  // A level's final test is the gate into the next level, so it covers the
  // whole level — words and grammar — and asks for the same 80% a normal
  // section does, not the checkpoints' 70%.
  const FINAL_TEST_WORD_QUESTIONS = 15;
  const FINAL_TEST_GRAMMAR_QUESTIONS = 10;
  const FINAL_TEST_CLEAR_THRESHOLD = 0.8;

  // Sections from Add Content: outside every level, untested, never locked.
  const MY_ADDITIONS_LEVEL = 'mine';

  // Grammar sections are excluded on purpose: their items are example
  // sentences, and a checkpoint measures words known, not sentences seen.
  // (A final test covers grammar separately, through its exercises.)
  function testableWordsIn(section) {
    if (section.kind === 'vocab' || section.kind === 'alphabet') return section.items || [];
    return [];
  }

  function wordPoolFrom(group) {
    const seen = {};
    const pool = [];
    group.forEach(function (s) {
      testableWordsIn(s).forEach(function (w) {
        if (w && w.sk && w.en && !seen[w.sk]) {
          seen[w.sk] = true;
          pool.push(w);
        }
      });
    });
    return pool;
  }

  // Within each level (A1.1, A1.2…) a checkpoint drops in after every 10
  // sections, covering those 10, and the level ends with a final test drawn
  // from all of it. Both sit in the path like any other section, so they
  // also gate progression — you pass them to carry on.
  function withCheckpoints(sections) {
    const levels = [];
    sections.forEach(function (s) {
      const last = levels[levels.length - 1];
      if (last && last.level === s.level) last.sections.push(s);
      else levels.push({ level: s.level, sections: [s] });
    });

    const out = [];
    levels.forEach(function (group) {
      if (group.level === MY_ADDITIONS_LEVEL) {
        out.push.apply(out, group.sections);
        return;
      }

      let sinceLast = [];
      let checkpointNum = 0;
      group.sections.forEach(function (section, i) {
        out.push(section);
        sinceLast.push(section);
        // No checkpoint straight before the final test — it would only
        // repeat part of it.
        if (sinceLast.length < CHECKPOINT_EVERY || i === group.sections.length - 1) return;
        const pool = wordPoolFrom(sinceLast);
        sinceLast = [];
        if (pool.length < CHECKPOINT_MIN_WORDS) return;
        checkpointNum++;
        out.push({
          // A1.1 keeps the ids its checkpoints had before there were levels,
          // so checkpoints people already passed stay passed.
          id: group.level === 'A1.1' ? 'checkpoint-' + checkpointNum : 'checkpoint-' + group.level + '-' + checkpointNum,
          kind: 'checkpoint',
          level: group.level,
          title: 'Checkpoint Test ' + checkpointNum,
          subtitle: 'Words from the last ' + CHECKPOINT_EVERY + ' sections',
          explanation: '',
          items: pool,
        });
      });

      out.push({
        id: 'final-test-' + group.level,
        kind: 'checkpoint',
        isFinalTest: true,
        level: group.level,
        title: group.level + ' Final Test',
        subtitle: 'Everything from ' + group.level + ' — words and grammar',
        explanation: '',
        items: wordPoolFrom(group.sections),
        grammarPools: group.sections
          .filter(function (s) { return s.kind === 'grammar' && (s.exercises || []).length; })
          .map(function (s) { return s.exercises; }),
      });
    });

    return out;
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
        if (mode === 'roadmap') scrollToUpNext(false);
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

    // Picking a topic shows just that one; the search box is cleared so the
    // two don't fight over what's on screen.
    const guideTopicSelect = document.getElementById('guide-topic-select');
    if (guideTopicSelect) {
      guideTopicSelect.addEventListener('change', function () {
        guideTopic = guideTopicSelect.value;
        if (guideSearchInput) guideSearchInput.value = '';
        renderGrammarGuide('');
        window.scrollTo(0, 0);
      });
    }
  }

  // A section normally opens once the one before it is cleared. It also
  // stays open if you've cleared it, or anything further along — so adding a
  // section to the middle of the course never locks anyone out of ground
  // they'd already covered. My-additions sections are always open, and don't
  // count as "further along" (they come last, so they'd open everything).
  function furthestClearedIndex() {
    let furthest = -1;
    roadmapSections.forEach(function (s, i) {
      if (s.level !== MY_ADDITIONS_LEVEL && isSectionCleared(s.id)) furthest = i;
    });
    return furthest;
  }

  // Past the Free Preview's sections, on the Free Preview.
  function planLocked(i) {
    const s = roadmapSections[i];
    return !hasFullAccess() && i >= FREE_SECTIONS && !!s && s.level !== MY_ADDITIONS_LEVEL;
  }

  function lockedSectionFlags() {
    const furthestCleared = furthestClearedIndex();
    return roadmapSections.map(function (s, i) {
      if (devUnlocked() || i === 0 || s.level === MY_ADDITIONS_LEVEL) return false;
      if (planLocked(i)) return true;
      if (isSectionCleared(s.id) || i < furthestCleared) return false;
      return !isSectionCleared(roadmapSections[i - 1].id);
    });
  }

  // "Up next" is where you left off: the first open section after the
  // furthest one you've cleared. Sections added behind that point later are
  // open on the roadmap, but shouldn't drag you back to them. Only once
  // nothing is left ahead does it fall back to anything skipped. -1 when
  // everything is cleared.
  function upNextIndex() {
    const progress = loadRoadmapProgress();
    const lockedFlags = lockedSectionFlags();
    function firstOpenFrom(start) {
      for (let i = start; i < roadmapSections.length; i++) {
        if (!progress[roadmapSections[i].id] && !lockedFlags[i]) return i;
      }
      return -1;
    }
    const ahead = firstOpenFrom(furthestClearedIndex() + 1);
    return ahead !== -1 ? ahead : firstOpenFrom(0);
  }

  function levelHeaderHtml(level) {
    if (level === MY_ADDITIONS_LEVEL) {
      return (
        '<div class="roadmap-level-header" data-level="' + escapeHtml(level) + '"><div class="roadmap-level-name">My additions</div>' +
        '<div class="roadmap-level-progress">From Add Content · always open</div></div>'
      );
    }
    const inLevel = roadmapSections.filter(function (s) { return s.level === level; });
    const cleared = inLevel.filter(function (s) { return isSectionCleared(s.id); }).length;
    const pct = inLevel.length ? Math.round((cleared / inLevel.length) * 100) : 0;
    const levels = [];
    roadmapSections.forEach(function (s) { if (s.level !== MY_ADDITIONS_LEVEL && levels.indexOf(s.level) === -1) levels.push(s.level); });
    const info = LEVEL_INFO[level] || { title: 'Level ' + level, subtitle: '' };
    return (
      '<div class="roadmap-level-header' + (pct === 100 ? ' complete' : '') + '" data-level="' + escapeHtml(level) + '">' +
      '<div class="roadmap-level-eyebrow"><span class="roadmap-level-badge">Level ' + (levels.indexOf(level) + 1) + '</span> CEFR ' + escapeHtml(level) + '</div>' +
      '<div class="roadmap-level-top">' +
      '<div class="roadmap-level-name">' + escapeHtml(info.title) + '</div>' +
      '<div class="roadmap-level-progress">' + cleared + ' / ' + inLevel.length + ' cleared</div>' +
      '</div>' +
      (info.subtitle ? '<p class="roadmap-level-sub">' + escapeHtml(info.subtitle) + '</p>' : '') +
      '<div class="roadmap-level-bar"><div class="roadmap-level-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="folk-divider folk-divider-small" aria-hidden="true"></div>' +
      '</div>'
    );
  }

  // The name and one line on what each level teaches, for its banner.
  const LEVEL_INFO = {
    'A1.1': { title: 'First Steps', subtitle: 'Sounds and spelling, greetings, numbers, family, food and your first verbs.' },
    'A1.2': { title: 'Everyday Slovak', subtitle: 'Cases, dates and prices, around town, health — and talking about past and future.' },
  };

  // The path the nodes sit on: a dashed curve through every node in order,
  // and a gold one over the stretch already done (cleared nodes, up to Up
  // next). Drawn from where the nodes actually are, so it follows the lanes
  // and level headers at any width. Each step leaves a node sideways and
  // drops into the next one from above, so it never runs through a label
  // (labels hang below their node).
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function drawRoadmapPath(mapEl) {
    // Redraw whenever the map changes size — including when its tab is
    // first opened, since a hidden map has no size to measure.
    if (!mapEl.pathObserver && window.ResizeObserver) {
      mapEl.pathObserver = new ResizeObserver(function () { drawRoadmapPath(mapEl); });
      mapEl.pathObserver.observe(mapEl);
    }

    let svg = mapEl.querySelector('.roadmap-svg');
    const nodes = [].slice.call(mapEl.querySelectorAll('.round-node'));
    const w = mapEl.offsetWidth;
    const h = mapEl.offsetHeight;
    if (!w || nodes.length < 2) {
      if (svg) svg.innerHTML = '';
      return;
    }
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'roadmap-svg');
      svg.setAttribute('aria-hidden', 'true');
      mapEl.appendChild(svg);
    }

    // Layout offsets, not getBoundingClientRect, so the scroll-in slide
    // (a transform) doesn't shift the path.
    const pts = nodes.map(function (n) {
      let x = n.offsetWidth / 2;
      let y = n.offsetHeight / 2;
      let el = n;
      while (el && el !== mapEl) {
        x += el.offsetLeft;
        y += el.offsetTop;
        el = el.offsetParent;
      }
      return { x: x, y: y, done: n.classList.contains('cleared'), next: n.classList.contains('up-next') };
    });

    function step(p, q) {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (Math.abs(dx) < 1) return ' L' + q.x + ' ' + q.y;
      return ' C' + (p.x + dx * 0.6) + ' ' + p.y + ' ' + q.x + ' ' + (p.y + dy * 0.35) + ' ' + q.x + ' ' + q.y;
    }

    let all = 'M' + pts[0].x + ' ' + pts[0].y;
    let done = '';
    for (let i = 1; i < pts.length; i++) {
      all += step(pts[i - 1], pts[i]);
      if (pts[i - 1].done && (pts[i].done || pts[i].next)) {
        done += 'M' + pts[i - 1].x + ' ' + pts[i - 1].y + step(pts[i - 1], pts[i]);
      }
    }

    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.innerHTML =
      '<path class="roadmap-path-base" d="' + all + '"/>' +
      (done ? '<path class="roadmap-path-glow" d="' + done + '"/><path class="roadmap-path-done" d="' + done + '"/>' : '');
  }

  // Rows fade up into place as they scroll into view (only once each).
  function revealRowsOnScroll(mapEl) {
    if (mapEl.revealObserver) mapEl.revealObserver.disconnect();
    if (!window.IntersectionObserver || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    mapEl.classList.add('reveal');
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      });
    }, { threshold: 0.1 });
    mapEl.querySelectorAll('.round-row').forEach(function (row) { io.observe(row); });
    mapEl.revealObserver = io;
  }

  // The roadmap is over a hundred sections long, so a bar of shortcuts stays pinned
  // above it: "Up next" plus the start of each level.
  function renderRoadmapJump(nextIdx) {
    const bar = document.getElementById('roadmap-jump');
    if (!bar) return;
    const levels = [];
    roadmapSections.forEach(function (s) { if (levels.indexOf(s.level) === -1) levels.push(s.level); });
    bar.innerHTML =
      (nextIdx !== -1 ? '<button type="button" class="roadmap-jump-btn current" data-jump="next">Up next</button>' : '') +
      levels
        .map(function (level) {
          const label = level === MY_ADDITIONS_LEVEL ? 'My additions' : level;
          return '<button type="button" class="roadmap-jump-btn" data-jump-level="' + escapeHtml(level) + '">' + escapeHtml(label) + '</button>';
        })
        .join('');
    bar.querySelectorAll('.roadmap-jump-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.jump === 'next') {
          scrollToUpNext(true);
          return;
        }
        const header = [].find.call(document.querySelectorAll('#roadmap-map .roadmap-level-header'), function (h) {
          return h.dataset.level === btn.dataset.jumpLevel;
        });
        if (header) header.scrollIntoView({ behavior: smoothScroll(), block: 'start' });
      });
    });
  }

  function smoothScroll() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  // Brings the "Up next" node to the middle of the screen. Without this the
  // Learn tab always opened at section 1, and anyone past the first few
  // sections had to scroll through everything they'd done to continue.
  function scrollToUpNext(smooth) {
    const node = document.querySelector('#roadmap-map .round-node.up-next');
    if (!node || document.getElementById('roadmap-view').classList.contains('hidden')) return false;
    node.scrollIntoView({ behavior: smooth ? smoothScroll() : 'auto', block: 'center' });
    return true;
  }

  function renderRoadmapMap() {
    const mapEl = document.getElementById('roadmap-map');
    if (!roadmapSections.length) {
      mapEl.innerHTML = '<div class="empty-state">Loading your roadmap…</div>';
      return;
    }

    const lockedFlags = lockedSectionFlags();
    const nextIdx = upNextIndex();
    const LANES = ['align-center', 'align-end', 'align-start'];
    const LOCK_ICON =
      '<svg class="round-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    const STAR_ICON =
      '<svg class="round-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7z"/></svg>';
    const TROPHY_ICON =
      '<svg class="round-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';

    mapEl.innerHTML =
      roadmapSections
        .map(function (section, i) {
          const cleared = isSectionCleared(section.id);
          const locked = lockedFlags[i];
          const isCheckpoint = section.kind === 'checkpoint';
          // Only "Up next" pulses. Any other playable section (a dev account,
          // or ground already covered) is "open": a calm border, no pulse —
          // otherwise a dev account had 100+ nodes pulsing at once.
          const stateClass =
            (cleared ? 'cleared' : locked ? 'locked' : i === nextIdx ? 'current up-next' : 'open') +
            (isCheckpoint ? ' checkpoint' : '') +
            (section.isFinalTest ? ' final-test' : '');
          const startsLevel = i === 0 || section.level !== roadmapSections[i - 1].level;
          const inner = cleared
            ? STAR_ICON
            : locked
            ? LOCK_ICON
            : isCheckpoint
            ? TROPHY_ICON
            : '<span class="round-num-badge">' + (i + 1) + '</span>';

          return (
            (startsLevel ? levelHeaderHtml(section.level) : '') +
            '<div class="round-row ' + LANES[i % LANES.length] + '">' +
            '<div class="round-node-slot">' +
            '<div class="round-node ' + stateClass + (planLocked(i) ? ' plan-locked' : '') + '" data-section-index="' + i + '" data-locked="' + locked + '"' +
            (planLocked(i) ? ' data-plan="true" title="' + escapeHtml(PRO_REQUIRED) + '"' : '') + '>' +
            inner +
            // A cleared star, a lock or a trophy hides the number, so a pill
            // on the rim carries it — every section can be found by its number.
            (cleared || locked || isCheckpoint ? '<span class="round-corner-num" aria-label="Section ' + (i + 1) + '">' + (i + 1) + '</span>' : '') +
            (planLocked(i) ? '<span class="round-pro-tag">Pro</span>' : '') +
            (i === nextIdx ? '<span class="round-up-next-tag">Up next</span>' : '') +
            '<div class="round-label">' +
            (section.kind === 'grammar' || section.kind === 'dialogue' || section.kind === 'alphabet'
              ? '<span class="round-kind kind-' + (section.useIt ? 'use' : section.kind) + '">' + kindLabel(section) + '</span>'
              : '') +
            // The tag already says "Dialogue" / "Use it", so the title doesn't repeat it.
            escapeHtml(section.title.replace(/^(Dialogue|Use It):\s*/, '')) + '</div>' +
            '</div>' +
            '</div>' +
            '</div>'
          );
        })
        .join('') +
      '<div class="round-map-hint">Get ' + Math.round(ROUND_CLEAR_THRESHOLD * 100) + '%+ overall to unlock the next section.</div>';

    mapEl.querySelectorAll('.round-node').forEach(function (node) {
      node.addEventListener('click', function () {
        if (node.dataset.plan === 'true') {
          showUpsell('Section ' + (Number(node.dataset.sectionIndex) + 1));
          return;
        }
        if (node.dataset.locked === 'true') return;
        startLesson(Number(node.dataset.sectionIndex));
      });
    });

    // On the Free Preview, say where it ends and how to go on.
    const banner = document.getElementById('free-preview-banner');
    if (banner) banner.classList.toggle('hidden', hasFullAccess());

    renderRoadmapJump(nextIdx);
    drawRoadmapPath(mapEl);
    revealRowsOnScroll(mapEl);
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
  let checkpointMastered = 0;
  // Words pulled in from the review queue for extra practice inside a normal
  // section, keyed by sk — they're graded, but kept out of the section score.
  let lessonReviewExtras = {};

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
      if (!devUnlocked()) return;
      e.preventDefault();
      skipCurrentLessonItem();
    });
  }

  function skipCurrentLessonItem() {
    const section = roadmapSections[lessonSectionIndex];
    if (!section) return;

    // Something already answered and waiting on Next: skipping just presses
    // Next, without taking it out of the score it already counts towards.
    const waiting = document.querySelector('#exercise-next-btn, #quiz-next-btn, #voice-next-btn, #prompt-next-btn');
    if (waiting) {
      waiting.click();
      return;
    }

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

    const usesExercises = section.kind !== 'vocab' && section.kind !== 'checkpoint';
    const inFinalTestGrammar = section.kind === 'checkpoint' && quizIndex >= quizQueue.length;

    if (lessonPhase === 'practice') {
      // Revision cards from earlier sections never counted towards this
      // section's total, so skipping one takes nothing off it.
      const entry = !usesExercises && lessonQueue[lessonQueueIndex];
      const isExtra = !!(entry && entry.word && lessonReviewExtras[entry.word.sk]);
      if (!isExtra) lessonPracticeTotal = Math.max(0, lessonPracticeTotal - 1);
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
      if (usesExercises || inFinalTestGrammar) {
        exerciseIndex++;
        renderExerciseStep();
      } else {
        quizIndex++;
        renderQuizStep();
      }
    }
  }

  function startLesson(index) {
    if (planLocked(index)) {
      document.getElementById('lesson-overlay').classList.add('hidden');
      showUpsell('Section ' + (index + 1));
      return;
    }
    lessonSectionIndex = index;
    // A checkpoint has nothing to teach — it's purely a test of what should
    // already be known, so it skips straight past Learn/Practice/Voice.
    const section = roadmapSections[index];
    lessonPhase = section && section.kind === 'checkpoint' ? 'quiz' : 'learn';
    checkpointMastered = 0;
    lessonPracticeCorrect = 0;
    lessonPracticeTotal = 0;
    lessonVoiceCorrect = 0;
    lessonVoiceTotal = 0;
    lessonQuizCorrect = 0;
    lessonQuizTotal = 0;
    // The same number the roadmap shows, so a section can be found again.
    document.getElementById('lesson-section-num').textContent = 'Section ' + (index + 1);
    document.getElementById('lesson-overlay').classList.remove('hidden');
    renderLessonPhase();
  }

  function exitLesson() {
    stopVoiceRecognition();
    document.getElementById('lesson-overlay').classList.add('hidden');
    renderRoadmapMap();
    renderProfile();

    // Land back on the section you were in — or on the next one, if this
    // lesson just opened it.
    if (!document.getElementById('panel-learn').classList.contains('active')) return;
    const next = upNextIndex();
    const target = next === lessonSectionIndex + 1 ? next : lessonSectionIndex;
    const node = document.querySelector('#roadmap-map .round-node[data-section-index="' + target + '"]');
    if (node) node.scrollIntoView({ behavior: smoothScroll(), block: 'center' });
  }

  // The four steps of a section, shown as a segmented indicator in the
  // lesson's top bar. A checkpoint or final test is one step of its own.
  const LESSON_STEPS = [
    { phase: 'Learn', name: 'Learn' },
    { phase: 'Practice', name: 'Practice' },
    { phase: 'Voice', name: 'Speak' },
    { phase: 'Quiz', name: 'Quiz' },
  ];
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function lessonStepsHtml(label) {
    const active = label === 'Done' ? LESSON_STEPS.length : LESSON_STEPS.map(function (s) { return s.phase; }).indexOf(label);
    if (active === -1) {
      // Checkpoint / final test: no Learn, Practice or Speak to show.
      return '<span class="lesson-step active single"><span class="lesson-step-dot">' + TROPHY_SMALL_SVG + '</span><span class="lesson-step-name">' + escapeHtml(label) + '</span></span>';
    }
    return LESSON_STEPS.map(function (step, i) {
      const state = i < active ? 'done' : i === active ? 'active' : 'upcoming';
      return (
        '<span class="lesson-step ' + state + '"' + (state === 'active' ? ' aria-current="step"' : '') + '>' +
        '<span class="lesson-step-dot">' + (state === 'done' ? CHECK_SVG : i + 1) + '</span>' +
        '<span class="lesson-step-name">' + step.name + '</span>' +
        '</span>'
      );
    }).join('<span class="lesson-step-sep" aria-hidden="true"></span>');
  }
  const TROPHY_SMALL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/></svg>';

  function updateLessonChrome(label, stepIndex) {
    const steps = document.getElementById('lesson-phase-label');
    if (steps.dataset.label !== label) {
      steps.dataset.label = label;
      steps.innerHTML = lessonStepsHtml(label);
      steps.setAttribute('aria-label', label === 'Done' ? 'Section finished' : 'Step: ' + label);
    }
    document.getElementById('lesson-progress-fill').style.width = (stepIndex / 4) * 100 + '%';

    const topbar = document.querySelector('.lesson-topbar');
    let hint = document.getElementById('dev-skip-hint');
    if (devUnlocked()) {
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

  function kindLabel(section) {
    if (section.isFinalTest) return 'Final Test';
    if (section.kind === 'alphabet') return 'Alphabet';
    if (section.useIt) return 'Use it';
    if (section.kind === 'grammar') return 'Grammar';
    if (section.kind === 'dialogue') return 'Dialogue';
    if (section.kind === 'checkpoint') return 'Checkpoint';
    return 'Vocabulary';
  }

  function renderLearnPhase() {
    updateLessonChrome('Learn', 0);
    const section = roadmapSections[lessonSectionIndex];
    const body = document.getElementById('lesson-body');

    // Alphabet units get letter cards — the letter itself, what it sounds
    // like, and a word to hear it in. A sk/en list would teach vocabulary
    // instead of the alphabet.
    // Dialogues read as a conversation: each speaker keeps to one side, so
    // who's talking is clear at a glance.
    const speakers = [];
    (section.lines || []).forEach(function (l) { if (speakers.indexOf(l.who) === -1) speakers.push(l.who); });
    const dialogueHtml = section.kind === 'dialogue'
      ? '<div class="dialogue">' +
        section.lines
          .map(function (l) {
            return (
              '<div class="dialogue-line ' + (speakers.indexOf(l.who) % 2 ? 'side-b' : 'side-a') + '">' +
              '<div class="dialogue-who">' + escapeHtml(l.who) + '</div>' +
              '<div class="dialogue-bubble">' +
              '<div class="sk">' + speakerButtonHtml(l.sk) + escapeHtml(l.sk) + '</div>' +
              '<div class="en">' + escapeHtml(l.en) + '</div>' +
              '</div>' +
              '</div>'
            );
          })
          .join('') +
        '</div>'
      : '';

    const content = section.kind === 'dialogue'
      ? dialogueHtml
      : section.kind === 'alphabet'
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

    // A word list's notes ("karta → kartou") are gathered into one table
    // above the words, where they're seen before practising, rather than
    // tucked under each word in small print.
    const noted = section.kind === 'vocab' ? section.items.filter(function (it) { return it.note; }) : [];
    const notesTable = noted.length
      ? '<div class="lesson-grammar-tables learn-notes">' +
        grammarTablesHtml([{
          title: 'Good to know',
          head: ['Phrase', 'Why it looks like this'],
          rows: noted.map(function (it) { return ['**' + it.sk + '**', it.note]; }),
        }]) +
        '</div>'
      : '';

    body.innerHTML =
      '<div class="lesson-stage">' +
      '<div class="lesson-eyebrow">' + kindLabel(section) + '</div>' +
      '<h2 class="lesson-heading">' + escapeHtml(section.title) + '</h2>' +
      (section.subtitle ? '<p class="lesson-sub">' + escapeHtml(section.subtitle) + '</p>' : '') +
      (section.explanation ? '<div class="lesson-grammar-explanation rich-text">' + richTextHtml(section.explanation) + '</div>' : '') +
      (section.tables && section.tables.length ? '<div class="lesson-grammar-tables">' + grammarTablesHtml(section.tables) + '</div>' : '') +
      notesTable +
      (section.items.length || section.kind === 'alphabet' ? content : '') +
      '<button class="btn btn-primary" id="lesson-learn-next-btn" style="width:100%; max-width:320px;">I’m Ready — Start Practice</button>' +
      '</div>';
    // Without this, a long letter grid left scrolled down from a previous
    // unit (or this same phase re-rendering) starts the next screen
    // mid-scroll, cutting off the top of the new content.
    body.scrollTop = 0;

    document.getElementById('lesson-learn-next-btn').addEventListener('click', function () {
      lessonPhase = 'practice';
      renderLessonPhase();
    });
  }

  /* ---- Exercises (alphabet + grammar): multiple choice, auto-graded ---- */

  // Letters that sound the same, so "which do you hear?" can't tell them
  // apart: i/y and í/ý are identical in speech, and most speakers say ä
  // like e and ľ like l.
  const SOUNDS_ALIKE = [['i', 'y'], ['í', 'ý'], ['ä', 'e'], ['ľ', 'l']];
  function soundsAlike(a, b) {
    return SOUNDS_ALIKE.some(function (p) { return p.indexOf(a) !== -1 && p.indexOf(b) !== -1; });
  }
  function baseLetter(x) {
    return x.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0);
  }

  // Options for "which letter do you hear?": the right letter, then the
  // ones easiest to mix up with it — the same base letter (c, č) or the same
  // alphabet unit — minus any that sound identical, topped up at random.
  function heardLetterOptions(letter, groupLetters) {
    const all = [];
    alphabetData.forEach(function (u) { (u.letters || []).forEach(function (l) { all.push(l.letter.toLowerCase()); }); });
    const usable = all.filter(function (x) { return x !== letter && !soundsAlike(x, letter); });
    const close = usable.filter(function (x) { return baseLetter(x) === baseLetter(letter) || groupLetters.indexOf(x) !== -1; });
    const picked = shuffleArray(close).slice(0, 3);
    const rest = shuffleArray(usable.filter(function (x) { return picked.indexOf(x) === -1; }));
    return [letter].concat(picked, rest.slice(0, 3 - picked.length));
  }

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
      // which is a linguistics exercise, not an alphabet one. The speaker
      // plays the example word, so the sound can be heard, not just read.
      const hintPool = allLetters.map(function (x) { return x.hint; });
      exercises.push({
        prompt: l.letter,
        question: 'What sound does this letter make?',
        options: [l.hint].concat(distractors(hintPool, l.hint, 3)),
        answer: l.hint,
        explain: explain,
        audio: l.example.sk,
      });

      // Listening first: the example word plays with the letter blanked out,
      // and you pick the letter you heard. The wrong options are the letters
      // easiest to mix up with it (same base letter, same unit), minus any
      // that sound identical.
      const word = l.example.sk;
      const lower = l.letter.toLowerCase();
      if (word.toLowerCase().indexOf(lower) !== -1) {
        exercises.push({
          prompt: word.split(new RegExp(lower, 'gi')).join('_'),
          question: 'Which letter do you hear?',
          options: heardLetterOptions(lower, section.letters.map(function (s) { return s.letter.toLowerCase(); })),
          answer: lower,
          explain: explain,
          audio: word,
          autoplay: true,
        });
      }

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
    if (section.kind === 'grammar' || section.kind === 'dialogue') return (section.exercises || []).slice();
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

    // In a final test these follow its word questions, so they're counted on
    // from there rather than starting again at 1.
    const section = roadmapSections[lessonSectionIndex];
    const inFinalTest = !isPractice && section && section.isFinalTest;
    const stepNum = inFinalTest ? quizQueue.length + exerciseIndex + 1 : exerciseIndex + 1;
    const stepTotal = inFinalTest ? quizQueue.length + exerciseQueue.length : exerciseQueue.length;
    if (inFinalTest) updateLessonChrome(kindLabel(section), 4 * ((stepNum - 1) / Math.max(1, stepTotal)));
    const eyebrow = inFinalTest ? kindLabel(section) : isPractice ? 'Practice' : 'Quiz';

    // A listening question puts a big play button first; otherwise the
    // speaker sits next to the prompt.
    body.innerHTML =
      '<div class="lesson-stage">' +
      '<div class="lesson-eyebrow">' + eyebrow + ' · ' + stepNum + ' / ' + stepTotal + '</div>' +
      (ex.audio && ex.autoplay ? '<div class="exercise-audio">' + speakerButtonHtml(ex.audio) + '</div>' : '') +
      '<h2 class="lesson-heading exercise-prompt">' +
      (ex.audio && !ex.autoplay ? speakerButtonHtml(ex.audio) : '') +
      escapeHtml(ex.prompt) + '</h2>' +
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
    body.scrollTop = 0;
    if (ex.audio && ex.autoplay) speak(ex.audio);

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

        // With an explanation, you move on when you've read it — moving on
        // by itself after a second or two left no time to read it. A bare
        // question still moves on by itself.
        if (ex.explain) {
          const nextBtn = document.createElement('button');
          nextBtn.type = 'button';
          nextBtn.className = 'btn btn-primary exercise-next-btn';
          nextBtn.id = 'exercise-next-btn';
          nextBtn.textContent = 'Next';
          explainEl.insertAdjacentElement('afterend', nextBtn);
          nextBtn.addEventListener('click', nextExercise);
          nextBtn.focus({ preventScroll: true });
        } else {
          setTimeout(nextExercise, right ? 900 : 2200);
        }
      });
    });
  }

  function nextExercise() {
    exerciseIndex++;
    renderExerciseStep();
  }

  let lessonQueue = [];
  let lessonQueueIndex = 0;
  let lessonCardGraded = false;
  let lessonCurrentPracticeItem = null;

  // Up to this many previously-missed words get folded into a normal
  // section's practice, so hard words come back around while you're working
  // through the course instead of only if you visit Revise deliberately.
  const REVIEW_EXTRAS_PER_SECTION = 3;

  function renderPracticePhase() {
    updateLessonChrome('Practice', 1);
    const section = roadmapSections[lessonSectionIndex];
    lessonReviewExtras = {};

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

    // Natural order, not shuffled: this is a first pass through brand-new
    // content, and content that's inherently sequential (numbers, days)
    // should be learned in that sequence, not jumbled — long-term recall
    // once it's known is already the Review tab's job, not this one's.
    lessonQueue = section.items.map(function (w) { return { word: w, mode: 'card' }; }).concat(practiceDrills(section.items));
    lessonQueueIndex = 0;
    lessonPracticeCorrect = 0;
    // Only this section's own words count towards clearing it. The review
    // extras appended below are still graded and still update word stats, but
    // failing an old word shouldn't block progress on a new section.
    lessonPracticeTotal = lessonQueue.length;

    const inSection = {};
    section.items.forEach(function (w) { inSection[w.sk] = true; });
    getDueReviewWords()
      .filter(function (w) { return !inSection[w.sk]; })
      .slice(0, REVIEW_EXTRAS_PER_SECTION)
      .forEach(function (w) {
        lessonReviewExtras[w.sk] = true;
        lessonQueue.push({ word: w, mode: 'card' });
      });

    renderPracticeCardStep();
  }

  // "Revision · you missed this in Rooms": an old word folded into this
  // section's practice, and where it was taught.
  function revisionLabel(word) {
    const from = roadmapSections.find(function (sec) {
      return sec.kind !== 'checkpoint' && (sec.items || []).some(function (w) { return w && w.sk === word.sk; });
    });
    const title = from ? from.title.replace(/\s*·\s*Part \d+ of \d+$/, '') : '';
    return 'Revision · you missed this' + (title ? ' in ' + title : ' before');
  }

  function renderPracticeCardStep() {
    const body = document.getElementById('lesson-body');

    if (lessonQueueIndex >= lessonQueue.length) {
      lessonPhase = 'voice';
      renderLessonPhase();
      return;
    }

    lessonCardGraded = false;
    const entry = lessonQueue[lessonQueueIndex];
    const item = entry.word;
    lessonCurrentPracticeItem = item;
    const isExtra = !!lessonReviewExtras[item.sk];

    if (entry.mode !== 'card') {
      const eyebrow = '<div class="lesson-eyebrow">Practice · ' + (lessonQueueIndex + 1) + ' / ' + lessonQueue.length + '</div>';
      const handlers = {
        onAnswer: function (isCorrect) {
          recordWordResult(item, isCorrect);
          incrementDailyCount();
          if (isCorrect) lessonPracticeCorrect++;
          playTone(isCorrect ? 'correct' : 'incorrect');
        },
        onNext: function () {
          lessonQueueIndex++;
          renderPracticeCardStep();
        },
      };
      if (entry.mode === 'type') {
        renderTypedPrompt(body, item, eyebrow, handlers);
        return;
      }
      if (renderLetterPrompt(body, item, eyebrow, handlers)) return;
    }

    body.innerHTML =
      '<div class="lesson-stage">' +
      '<div class="lesson-eyebrow">Practice · ' + (lessonQueueIndex + 1) + ' / ' + lessonQueue.length + '</div>' +
      cardDirectionToggleHtml() +
      '<div class="practice-card" id="lesson-practice-card" style="max-width:460px;">' +
      (isExtra ? '<div class="review-tag">' + escapeHtml(revisionLabel(item)) + '</div>' : '') +
      '<div class="practice-word">' + cardFrontHtml(item) + '</div>' +
      '<div class="practice-answer" id="lesson-practice-answer"></div>' +
      '<button class="btn btn-secondary" id="lesson-reveal-btn">Show Answer</button>' +
      '<div class="practice-grade-row hidden" id="lesson-grade-row">' +
      '<button class="btn-grade missed" id="lesson-missed-btn">Missed it</button>' +
      '<button class="btn-grade got-it" id="lesson-gotit-btn">Got it</button>' +
      '</div>' +
      '<div class="hidden" id="lesson-sentence-wrap">' + sentenceUiHtml(item) + '</div>' +
      '</div>' +
      '</div>';
    body.scrollTop = 0;

    wireCardDirection(body, item, 'lesson-practice-answer');
    document.getElementById('lesson-reveal-btn').addEventListener('click', function () {
      flipReveal(document.getElementById('lesson-practice-card'));
      document.getElementById('lesson-practice-answer').innerHTML = cardBackHtml(item);
      document.getElementById('lesson-reveal-btn').classList.add('hidden');
      document.getElementById('lesson-grade-row').classList.remove('hidden');
      // Offered after the answer is out, so it can't be used as a hint before
      // you've committed to remembering the word.
      document.getElementById('lesson-sentence-wrap').classList.remove('hidden');
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
      recordWordResult(lessonCurrentPracticeItem, gotIt);
      incrementDailyCount();
    }

    const isExtra = lessonCurrentPracticeItem && lessonReviewExtras[lessonCurrentPracticeItem.sk];
    if (gotIt && !isExtra) lessonPracticeCorrect++;
    playTone(gotIt ? 'correct' : 'incorrect');

    const card = document.getElementById('lesson-practice-card');
    card.classList.add(gotIt ? 'flash-correct' : 'flash-incorrect');

    setTimeout(function () {
      lessonQueueIndex++;
      renderPracticeCardStep();
    }, 400);
  }

  // Speech recognition transcripts frequently drop Slovak diacritics even
  // when the pronunciation itself was correct, so diacritics are stripped on
  // both sides before comparing.
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

  // A different word has to fail even when it's spelled almost the same:
  // "osemdesiat" (80) is not "sedemdesiat" (70), "desať" is not "deväť", and
  // "mám" is not "nemám". The old check allowed a third of the letters to
  // differ and also passed any word contained in the other, so all of those
  // got through. Now words are compared one by one: short words must match
  // exactly, and only longer ones may be a single letter off (the recogniser
  // garbling a long word, not a different word) — and never in the last two
  // letters, because Slovak endings carry the grammar: "pracujeme" (we work)
  // is not "pracujem" (I work).
  //
  // A missed accent is forgiven anywhere except on a final vowel, which must
  // match exactly: -ý / -á / -é carry the gender (pekný, pekná, pekné), and
  // pekné (nice) / pekne (nicely) differ only by that accent.
  function wordsAgree(heardWord, targetWord) {
    if (heardWord === targetWord) return true;
    if (!finalVowelsAgree(heardWord, targetWord)) return false;
    // i and y are one sound, so a recogniser may write either.
    const h = withoutAccents(heardWord).replace(/y/g, 'i');
    const t = withoutAccents(targetWord).replace(/y/g, 'i');
    if (h === t) return true;
    return t.length >= 6 && h.slice(-2) === t.slice(-2) && editDistance(h, t) <= 1;
  }

  const VOWELS = 'aáäeéiíoóôuúyý';

  // Which vowel a letter is, ignoring length: recognisers often drop the
  // long mark ("Som chora." for "Som chorá."), and i/y sound the same.
  const VOWEL_SOUND = { a: 'a', 'á': 'a', 'ä': 'a', e: 'e', 'é': 'e', i: 'i', 'í': 'i', y: 'i', 'ý': 'i', o: 'o', 'ó': 'o', 'ô': 'o', u: 'u', 'ú': 'u' };

  // A final vowel must be the same vowel — pekný, pekná and pekné are three
  // different answers — but its length is forgiven.
  function finalVowelsAgree(a, b) {
    const x = a.slice(-1);
    const y = b.slice(-1);
    if (VOWELS.indexOf(x) === -1 && VOWELS.indexOf(y) === -1) return true;
    return !!VOWEL_SOUND[x] && VOWEL_SOUND[x] === VOWEL_SOUND[y];
  }

  // How many words are missing, extra or wrong, in order.
  function wordErrors(heardWords, targetWords) {
    const m = heardWords.length;
    const n = targetWords.length;
    const d = [];
    for (let i = 0; i <= m; i++) {
      d.push(new Array(n + 1).fill(0));
      d[i][0] = i;
    }
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = wordsAgree(heardWords[i - 1], targetWords[j - 1]) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      }
    }
    return d[m][n];
  }

  function isCloseEnough(heard, target) {
    if (!heard || !target) return false;
    const h = heard.split(/\s+/).filter(Boolean);
    const t = target.split(/\s+/).filter(Boolean);
    // Long sentences may have one stray word per six; short ones none.
    if (wordErrors(h, t) <= Math.floor(t.length / 6)) return true;
    // A compound like "tridsaťpäť" can come back split ("tridsať päť"), or
    // two words joined — so also compare with the spaces taken out. Exactly
    // (bar accents, except on a final vowel): this is only for spacing, and a
    // looser match here would let a wrong ending back in ("pracujeme doma"
    // for "pracujem doma").
    const hj = h.join('');
    const tj = t.join('');
    return finalVowelsAgree(hj, tj) && withoutAccents(hj) === withoutAccents(tj);
  }

  // Everything that counts as saying this item: the whole text, the text
  // without its bracketed extras ("práca (v práci)" → "práca"), and each
  // alternative of a slash entry ("ujo / strýko" → "ujo", "strýko").
  function voiceTargets(sk) {
    const out = [];
    function add(text) {
      const norm = normalizeForVoiceCompare(text);
      if (norm && out.indexOf(norm) === -1) out.push(norm);
    }
    add(sk);
    const noBrackets = String(sk).replace(/\([^)]*\)/g, ' ');
    add(noBrackets);
    if (sk.indexOf('/') !== -1) {
      noBrackets.split(/\/+/).forEach(add);
      String(sk).split(/\/+/).forEach(add);
    }
    return out;
  }

  function voiceMatches(transcript, item) {
    const heard = normalizeForVoiceCompare(transcript || '');
    if (!heard) return false;
    // A number may come back as digits ("70") rather than as a word.
    const digits = heard.replace(/\s+/g, '');
    const enDigits = String(item.en || '').replace(/[\s,]/g, '');
    if (/^[0-9]+$/.test(digits) && /^[0-9]+$/.test(enDigits)) return digits === enDigits;
    return voiceTargets(item.sk).some(function (target) { return isCloseEnough(heard, target); });
  }

  // Lower case, punctuation gone, accents kept (wordsAgree decides where
  // they matter).
  function normalizeForVoiceCompare(text) {
    return text
      .toLowerCase()
      .normalize('NFC')
      .replace(/[^\p{L}0-9\s]/gu, '')
      .replace(/\s+/g, ' ')
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
      body.scrollTop = 0;
      document.getElementById('lesson-voice-skip-btn').addEventListener('click', function () {
        lessonVoiceTotal = 0;
        lessonVoiceCorrect = 0;
        lessonPhase = 'quiz';
        renderLessonPhase();
      });
      return;
    }

    // Capped at 5 items so this phase stays quick even for a big section —
    // picked at random, so across retries every word gets said, not just
    // the first five. A dialogue is a role-play instead.
    const section = roadmapSections[lessonSectionIndex];
    voiceQueue = section.kind === 'dialogue'
      ? dialogueRoleLines(section)
      : shuffleArray(section.items.slice()).slice(0, 5);
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

    const prompt = item.role
      ? '<p class="lesson-sub">You’re <strong>' + escapeHtml(item.role) + '</strong>. ' +
        (item.context ? 'Listen to ' + escapeHtml(item.context.who) + ', then say your line.' : 'You start — say your line.') +
        '</p>' +
        '<div class="dialogue roleplay">' +
        (item.context
          ? '<div class="dialogue-line side-a">' +
            '<div class="dialogue-who">' + escapeHtml(item.context.who) + '</div>' +
            '<div class="dialogue-bubble">' +
            '<div class="sk">' + speakerButtonHtml(item.context.sk) + escapeHtml(item.context.sk) + '</div>' +
            '<div class="en">' + escapeHtml(item.context.en) + '</div>' +
            '</div></div>'
          : '') +
        '<div class="dialogue-line side-b mine">' +
        '<div class="dialogue-who">You · ' + escapeHtml(item.role) + '</div>' +
        '<div class="dialogue-bubble">' +
        '<div class="sk">' + speakerButtonHtml(item.sk) + escapeHtml(item.sk) + '</div>' +
        '<div class="en">' + escapeHtml(item.en) + '</div>' +
        '</div></div>' +
        '</div>'
      : '<h2 class="lesson-heading">' + speakerButtonHtml(item.sk) + escapeHtml(item.sk) + '</h2>' +
        '<p class="lesson-sub">Listen first if you like, then record yourself saying it.</p>';

    body.innerHTML =
      '<div class="lesson-stage">' +
      '<div class="lesson-eyebrow">Voice · ' + (voiceIndex + 1) + ' / ' + voiceQueue.length + '</div>' +
      prompt +
      '<button class="mic-btn" id="lesson-mic-btn" aria-label="Start recording">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 19v3"/></svg>' +
      '</button>' +
      // What the mic is doing right now, in words, with a bar that runs
      // down while it records — so nobody waits not knowing to speak.
      '<div class="mic-state" id="mic-state" aria-live="polite">' + MIC_STATES.idle + '</div>' +
      '<div class="mic-timer" id="mic-timer" aria-hidden="true"><div class="mic-timer-fill"></div></div>' +
      '<div class="voice-heard" id="voice-heard"></div>' +
      '<div id="voice-result"></div>' +
      '<div id="voice-skip-wrap"></div>' +
      '</div>';
    body.scrollTop = 0;

    // The other speaker's line plays by itself, the way it would in a
    // real conversation; you answer it.
    if (item.context) speak(item.context.sk);

    document.getElementById('lesson-mic-btn').addEventListener('click', function () {
      toggleVoiceRecording(item);
    });
  }

  // Dialogues are practised as a role-play: you take one part — the one
  // with less to say, which is also the learner's side in these scenes
  // (the customer, the patient, the tourist) — hear the other speaker, and
  // answer with your line, in the order of the conversation.
  function dialogueRoleLines(section) {
    const lines = section.lines || [];
    const totals = {};
    lines.forEach(function (l) { totals[l.who] = (totals[l.who] || 0) + l.sk.length; });
    const role = Object.keys(totals).sort(function (a, b) { return totals[a] - totals[b]; })[0];
    const out = [];
    lines.forEach(function (l, i) {
      if (l.who !== role || out.length >= 5) return;
      const prev = lines[i - 1];
      out.push({ sk: l.sk, en: l.en, role: role, context: prev && prev.who !== role ? prev : null });
    });
    return out;
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

  // The words under the mic, for each thing it can be doing.
  const MIC_STATES = {
    idle: '<strong>Tap the mic</strong>, then say it',
    starting: 'Starting the microphone…',
    recording: '<span class="rec-dot"></span><strong>Recording — speak now</strong> · tap again when you’re done',
    checking: 'Checking what you said…',
  };
  const RECORD_MS = 6000;

  function setMicState(state) {
    const el = document.getElementById('mic-state');
    if (el) {
      el.innerHTML = state ? MIC_STATES[state] : '';
      el.dataset.state = state || '';
    }
    const timer = document.getElementById('mic-timer');
    if (timer) {
      timer.classList.toggle('running', state === 'recording');
      timer.style.setProperty('--record-ms', RECORD_MS + 'ms');
    }
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
    heardEl.textContent = '';
    setMicState('starting');

    let stream;
    try {
      // googDucking is a real, Chrome-specific getUserMedia constraint
      // (Windows-only): when the mic opens as a "communications device"
      // instead of the plain default device, Windows ducks every other
      // app's audio for the duration — that's the exact mechanism behind
      // playback going quiet right after recording a word. Setting it false
      // asks Chrome to open the plain device instead. It's non-standard, so
      // Firefox/Safari just ignore it — no harm there.
      //
      // echoCancellation is also off: it exists for calls, where the far
      // end's voice would feed back through the mic. There is no far end
      // here and nothing plays while recording, and enabling it is part of
      // what pushes Chrome toward opening the communications device in the
      // first place.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          // These two genuinely help recognition and aren't tied to ducking.
          noiseSuppression: true,
          autoGainControl: true,
          googDucking: false,
        },
      });
    } catch (err) {
      setMicState(null);
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
      setMicState(null);
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
      // Release the mic immediately and drop every reference to it — the
      // shorter the capture session, the sooner the system stops treating
      // this as an active call and restores normal playback volume.
      stream.getTracks().forEach(function (t) { t.stop(); });
      activeMediaStream = null;
      activeMediaRecorder = null;
      micBtn.classList.remove('listening');
      const blob = new Blob(recordedChunks, { type: format.mime });
      transcribeRecording(blob, format.encoding, item);
    };

    recorder.start();
    micBtn.classList.add('listening');
    micBtn.setAttribute('aria-label', 'Stop recording');
    setMicState('recording');
    // A short buzz on phones that support it: the moment to start talking.
    if (navigator.vibrate) {
      try { navigator.vibrate(40); } catch (err) { /* not allowed here */ }
    }

    // Stops by itself after a few seconds (the bar shows how long is left),
    // so a forgotten tap doesn't record indefinitely.
    setTimeout(function () {
      if (recorder.state !== 'inactive') recorder.stop();
    }, RECORD_MS);
  }

  // When a word was right except for its final vowel, says so — with the
  // genders spelled out for adjective endings: "Almost! We heard “pekný”
  // (masculine), but this asks for “pekné” (neuter)." null otherwise.
  const ENDING_GENDER = { 'ý': 'masculine', 'á': 'feminine', 'é': 'neuter' };

  function endingHint(transcript, item) {
    const heard = normalizeForVoiceCompare(transcript || '').split(' ');
    const targets = voiceTargets(item.sk).map(function (t) { return t.split(' '); });
    for (let t = 0; t < targets.length; t++) {
      const want = targets[t];
      if (want.length !== heard.length) continue;
      // Only when that one ending is the whole problem.
      const off = [];
      want.forEach(function (w, i) { if (!wordsAgree(heard[i], w)) off.push(i); });
      if (off.length !== 1) continue;
      const h = heard[off[0]];
      const w = want[off[0]];
      if (h.length !== w.length || withoutAccents(h.slice(0, -1)) !== withoutAccents(w.slice(0, -1))) continue;
      const gh = ENDING_GENDER[h.slice(-1)];
      const gw = ENDING_GENDER[w.slice(-1)];
      // The two words side by side with just the ending marked.
      const diff =
        '<div class="ending-diff" aria-hidden="true">' +
        '<span class="diff-word">' + escapeHtml(h.slice(0, -1)) + '<mark class="diff-wrong">' + escapeHtml(h.slice(-1)) + '</mark></span>' +
        '<span class="diff-arrow">→</span>' +
        '<span class="diff-word">' + escapeHtml(w.slice(0, -1)) + '<mark class="diff-right">' + escapeHtml(w.slice(-1)) + '</mark></span>' +
        '</div>';
      return diff + (gh && gw
        ? 'Almost! We heard “' + escapeHtml(h) + '” (' + gh + '), but this prompt asks for “' + escapeHtml(w) + '” (' + gw + ').'
        : 'Almost! We heard “' + escapeHtml(h) + '” — listen to the ending: “' + escapeHtml(w) + '”.');
    }
    return null;
  }

  function nextVoiceItem() {
    voiceIndex++;
    renderVoiceStep();
  }

  function transcribeRecording(blob, encoding, item) {
    const heardEl = document.getElementById('voice-heard');
    const resultEl = document.getElementById('voice-result');
    const micBtn = document.getElementById('lesson-mic-btn');
    if (micBtn) micBtn.setAttribute('aria-label', 'Start recording');
    setMicState('checking');
    heardEl.textContent = '';

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
        setMicState('idle');
        heardEl.textContent = result.error;
        showVoiceSkipOption();
        return;
      }

      const transcript = result.data.transcript || '';
      const isMatch = voiceMatches(transcript, item);
      setMicState(null);

      // Always exactly what the recogniser wrote down — never the target.
      heardEl.textContent = transcript ? 'You said: “' + transcript + '”' : 'Didn’t catch that.';

      if (isMatch) {
        lessonVoiceCorrect++;
        playTone('correct');
        resultEl.innerHTML = '<div class="voice-feedback correct">Nice!</div>';
        setTimeout(nextVoiceItem, 1200);
        return;
      }

      // A miss waits on Next, so there's time to compare with the answer.
      playTone('incorrect');
      const almost = endingHint(transcript, item);
      resultEl.innerHTML =
        (almost
          ? '<div class="voice-feedback incorrect">' + almost + '</div>'
          : '<div class="voice-feedback incorrect">Not quite — the answer is “' + escapeHtml(item.sk) + '”</div>') +
        '<button type="button" class="btn btn-primary exercise-next-btn" id="voice-next-btn">Next</button>';
      document.getElementById('lesson-mic-btn').disabled = true;
      document.getElementById('voice-next-btn').addEventListener('click', nextVoiceItem);
    };
    reader.onerror = function () {
      setMicState('idle');
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
  // How each question is asked:
  //   'sk-en'  — Slovak shown, pick the English (recognise it)
  //   'en-sk'  — English shown, pick the Slovak (produce it)
  //   'type'   — English shown, write the Slovak
  //   'letter' — hear a word with one letter blanked out, pick the letter
  // Recognising a word is much easier than producing it, so the choice
  // questions go about half each way.
  let quizModes = [];

  function mixedDirections(n) {
    const modes = [];
    for (let i = 0; i < n; i++) modes.push(i < Math.floor(n / 2) ? 'en-sk' : 'sk-en');
    return shuffleArray(modes);
  }

  // A section quiz mixes in the other two kinds: about a quarter of the
  // words to write (the short ones — nobody should type a whole sentence),
  // and a missing-letter question or two for words with a letter worth
  // listening for (č, ô, dž…). The rest are choice questions.
  function assignQuizModes(words) {
    const n = words.length;
    const modes = mixedDirections(n);
    const order = shuffleArray(words.map(function (w, i) { return i; }));
    let letters = Math.min(2, Math.floor(n / 4));
    let typed = Math.round(n / 4);
    order.forEach(function (i) {
      if (letters > 0 && missingLetterQuestion(words[i])) {
        modes[i] = 'letter';
        letters--;
      } else if (typed > 0 && isVocabWord(words[i]) && typedAnswers(words[i]).length) {
        modes[i] = 'type';
        typed--;
      }
    });
    return modes;
  }

  // Only words already taught as vocabulary (in a word section up to this
  // one) are asked for in writing — not the alphabet's example words (vŕba,
  // kôň…) a checkpoint also draws on, nor words whose word section comes
  // later (ruka is an alphabet example long before Body & Health).
  let firstVocabIndex = null;
  let firstVocabIndexFor = null;
  function isVocabWord(word) {
    if (!firstVocabIndex || firstVocabIndexFor !== roadmapSections.length) {
      firstVocabIndexFor = roadmapSections.length;
      firstVocabIndex = {};
      roadmapSections.forEach(function (sec, i) {
        if (sec.kind !== 'vocab') return;
        (sec.items || []).forEach(function (w) {
          if (w && w.sk && !(w.sk in firstVocabIndex)) firstVocabIndex[w.sk] = i;
        });
      });
    }
    return word.sk in firstVocabIndex && firstVocabIndex[word.sk] <= lessonSectionIndex;
  }

  // What counts as writing a word correctly: any of its alternatives
  // ("čau / maj sa"), without bracketed extras ("zoo (zoologická záhrada)"),
  // ignoring capitals and punctuation. Only short answers can be written —
  // an empty list means "don't ask for this one".
  function typedAnswers(word) {
    const answers = String(word.sk)
      .split(/\s*\/\/?\s*/)
      .map(function (a) { return a.replace(/\([^)]*\)/g, '').trim(); })
      .filter(Boolean);
    const short = answers.every(function (a) { return a.length <= 22 && a.split(/\s+/).length <= 3; });
    return short ? answers : [];
  }

  function typedKey(text) {
    return String(text).toLowerCase().replace(/[.,!?¿;:"„“'’…-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function withoutAccents(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // 'right', 'accents' (right apart from the accents — counted as right, with
  // the spelling shown), or 'wrong'.
  function markTyped(input, word) {
    const said = typedKey(input);
    const answers = typedAnswers(word).map(typedKey);
    if (!said) return 'wrong';
    if (answers.indexOf(said) !== -1) return 'right';
    if (answers.some(function (a) { return withoutAccents(a) === withoutAccents(said); })) return 'accents';
    return 'wrong';
  }

  // Splits a word into letters the way the alphabet counts them, so "ch",
  // "dz" and "dž" are one letter each.
  function letterTokens(word) {
    return String(word).match(/ch|dž|dz|[\s\S]/gi) || [];
  }

  const LETTERS_WORTH_HEARING = ['á', 'ä', 'č', 'ď', 'dz', 'dž', 'é', 'ch', 'í', 'ĺ', 'ľ', 'ň', 'ó', 'ô', 'ŕ', 'š', 'ť', 'ú', 'ý', 'ž'];

  // A missing-letter question for a single word: one of its letters worth
  // listening for is blanked out everywhere it appears. null if the word
  // has none (or is a phrase).
  function missingLetterQuestion(word) {
    const sk = String(word.sk);
    if (/[\s\/()]/.test(sk)) return null;
    const tokens = letterTokens(sk);
    const found = [];
    tokens.forEach(function (t) {
      const lower = t.toLowerCase();
      if (LETTERS_WORTH_HEARING.indexOf(lower) !== -1 && found.indexOf(lower) === -1) found.push(lower);
    });
    if (!found.length) return null;
    const letter = found[Math.floor(Math.random() * found.length)];
    const unit = alphabetData.find(function (u) {
      return (u.letters || []).some(function (l) { return l.letter.toLowerCase() === letter; });
    });
    return {
      letter: letter,
      blanked: tokens.map(function (t) { return t.toLowerCase() === letter ? '_' : t; }).join(''),
      options: shuffleArray(heardLetterOptions(letter, unit ? unit.letters.map(function (l) { return l.letter.toLowerCase(); }) : [])),
    };
  }

  // Up to n wrong answers for a word question: never the right answer, never
  // something that also means it (same English), and no option twice.
  function quizDistractors(correct, sectionItems, n) {
    function pickFrom(pool, taken) {
      const out = [];
      shuffleArray(pool.slice()).forEach(function (w) {
        if (out.length >= n || !w || !w.sk || !w.en) return;
        if (w.sk === correct.sk || w.en === correct.en) return;
        if (taken[w.sk] || taken['en:' + w.en]) return;
        taken[w.sk] = true;
        taken['en:' + w.en] = true;
        out.push(w);
      });
      return out;
    }
    const taken = {};
    let picked = pickFrom(sectionItems, taken);
    if (picked.length < n) {
      const all = [];
      vocabData.forEach(function (g) { (g.words || []).forEach(function (w) { all.push(w); }); });
      picked = picked.concat(pickFrom(all, taken).slice(0, n - picked.length));
    }
    return picked;
  }

  function renderQuizPhase() {
    const section = roadmapSections[lessonSectionIndex];

    // Checkpoints test a pool drawn from the previous ten sections, shuffled,
    // and every word answered right here counts as mastered. A final test
    // draws words from the whole level, then asks one grammar question from
    // each grammar section (a random handful, if there are more than fit).
    if (section.kind === 'checkpoint') {
      const isFinal = !!section.isFinalTest;
      // Words not yet mastered come first, so each test (and each retake)
      // works through more of the vocabulary instead of re-asking words
      // already known.
      const mastered = loadMasteredWords();
      const fresh = shuffleArray(section.items.filter(function (w) { return !mastered[w.sk]; }));
      const known = shuffleArray(section.items.filter(function (w) { return mastered[w.sk]; }));
      quizQueue = shuffleArray(fresh.concat(known).slice(0, isFinal ? FINAL_TEST_WORD_QUESTIONS : CHECKPOINT_MAX_QUESTIONS));
      // The same mix as a section quiz: choice questions both ways, about a
      // quarter to write in Slovak, and a missing-letter question or two.
      quizModes = assignQuizModes(quizQueue);
      exerciseQueue = isFinal
        ? shuffleArray(
            (section.grammarPools || []).map(function (pool) { return shuffleArray(pool.slice())[0]; })
          ).slice(0, FINAL_TEST_GRAMMAR_QUESTIONS)
        : [];
      exerciseIndex = 0;
      exerciseScoreTarget = 'quiz';
      quizIndex = 0;
      lessonQuizCorrect = 0;
      lessonQuizTotal = quizQueue.length + exerciseQueue.length;
      checkpointMastered = 0;
      renderQuizStep();
      return;
    }

    updateLessonChrome('Quiz', 3);

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

    // Every word in the section, in random order. Taking just the first five
    // left the rest of a section never tested (July to December, in the
    // months section), and keeping the taught order let sequences like
    // numbers or days be answered by counting.
    quizQueue = shuffleArray(section.items.slice());
    quizModes = assignQuizModes(quizQueue);
    quizIndex = 0;
    lessonQuizCorrect = 0;
    lessonQuizTotal = quizQueue.length;
    renderQuizStep();
  }

  function renderQuizStep() {
    const body = document.getElementById('lesson-body');

    const section = roadmapSections[lessonSectionIndex];
    const isCheckpoint = section.kind === 'checkpoint';

    if (quizIndex >= quizQueue.length) {
      // A final test moves on to its grammar questions once the words are done.
      if (isCheckpoint && exerciseIndex < exerciseQueue.length) {
        renderExerciseStep();
        return;
      }
      lessonPhase = 'finish';
      renderLessonPhase();
      return;
    }

    quizAnswered = false;
    const correct = quizQueue[quizIndex];
    const testLength = quizQueue.length + (isCheckpoint ? exerciseQueue.length : 0);

    // A checkpoint has no Learn/Practice/Voice phases to fill the bar, so it
    // tracks its own progress through the questions instead.
    if (isCheckpoint) updateLessonChrome(kindLabel(section), 4 * (quizIndex / Math.max(1, testLength)));

    const mode = quizModes[quizIndex] || 'sk-en';
    const eyebrow = '<div class="lesson-eyebrow">' + (isCheckpoint ? kindLabel(section) : 'Quiz') + ' · ' + (quizIndex + 1) + ' / ' + testLength + '</div>';
    if (mode === 'type' || mode === 'letter') {
      const handlers = {
        onAnswer: function (isCorrect) { quizAnswered = true; recordQuizAnswer(isCorrect); },
        onNext: nextQuizQuestion,
      };
      if (mode === 'type') {
        renderTypedPrompt(body, correct, eyebrow, handlers);
        return;
      }
      if (renderLetterPrompt(body, correct, eyebrow, handlers)) return;
    }

    const reverse = mode === 'en-sk';
    const options = shuffleArray([correct].concat(quizDistractors(correct, section.items, 3)));

    body.innerHTML =
      '<div class="lesson-stage">' +
      eyebrow +
      (reverse
        ? '<h2 class="lesson-heading">' + escapeHtml(correct.en) + '</h2>' +
          '<p class="lesson-sub">How do you say this in Slovak?</p>'
        : '<h2 class="lesson-heading">' + speakerButtonHtml(correct.sk) + escapeHtml(correct.sk) + '</h2>' +
          '<p class="lesson-sub">What does this mean?</p>') +
      '<div class="quiz-choice-list">' +
      options
        .map(function (opt) {
          return (
            '<button type="button" class="quiz-choice-btn" data-correct="' +
            (opt.sk === correct.sk) +
            '">' +
            escapeHtml(reverse ? opt.sk : opt.en) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</div>';
    body.scrollTop = 0;

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

    recordQuizAnswer(isCorrect);
    if (isCorrect) {
      setTimeout(nextQuizQuestion, 700);
      return;
    }
    // A wrong pick waits on Next, with the right answer highlighted, so
    // there's time to take it in.
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn-primary exercise-next-btn';
    next.id = 'quiz-next-btn';
    next.textContent = 'Next';
    body.querySelector('.quiz-choice-list').insertAdjacentElement('afterend', next);
    next.addEventListener('click', nextQuizQuestion);
    next.focus({ preventScroll: true });
  }

  function nextQuizQuestion() {
    quizIndex++;
    renderQuizStep();
  }

  // Every quiz answer counts towards the word's record: a miss sends it to
  // Revise, a right answer can master it (see recordWordResult). A right
  // answer on a checkpoint or final test masters the word straight away —
  // those come sections after the word was taught.
  function recordQuizAnswer(isCorrect) {
    if (isCorrect) lessonQuizCorrect++;
    playTone(isCorrect ? 'correct' : 'incorrect');

    const section = roadmapSections[lessonSectionIndex];
    const word = quizQueue[quizIndex];
    if (section && word && word.sk) {
      const wasMastered = !!loadMasteredWords()[word.sk];
      recordWordResult(word, isCorrect);
      if (section.kind === 'checkpoint' && isCorrect) markWordMastered(word.sk);
      if (section.kind === 'checkpoint' && isCorrect && !wasMastered) checkpointMastered++;
    }
  }

  // Slovak letters a phone keyboard may not have to hand.
  const ACCENT_KEYS = ['á', 'ä', 'č', 'ď', 'é', 'í', 'ĺ', 'ľ', 'ň', 'ó', 'ô', 'ŕ', 'š', 'ť', 'ú', 'ý', 'ž'];

  // "Write it": the English is shown and the Slovak is typed. Right apart
  // from the accents still counts, with the correct spelling shown. A wrong
  // or nearly-right answer waits on Next, so the spelling can be read.
  // Used by quizzes and practice alike: handlers.onAnswer(isCorrect) records
  // the answer, handlers.onNext() moves on.
  function renderTypedPrompt(container, word, eyebrowHtml, handlers) {
    let answered = false;
    container.innerHTML =
      '<div class="lesson-stage">' +
      eyebrowHtml +
      '<h2 class="lesson-heading">' + escapeHtml(word.en) + '</h2>' +
      '<p class="lesson-sub">Write it in Slovak.</p>' +
      '<form class="type-answer" id="type-answer-form" autocomplete="off">' +
      '<input type="text" id="type-answer-input" class="type-answer-input" lang="sk" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Your answer in Slovak" />' +
      '<div class="accent-keys" aria-label="Slovak letters">' +
      ACCENT_KEYS.map(function (k) { return '<button type="button" class="accent-key" data-key="' + k + '">' + k + '</button>'; }).join('') +
      '</div>' +
      '<button type="submit" class="btn btn-primary" id="type-answer-check">Check</button>' +
      '</form>' +
      '<div class="type-feedback" id="type-feedback"></div>' +
      '</div>';
    container.scrollTop = 0;

    const form = container.querySelector('#type-answer-form');
    const input = container.querySelector('#type-answer-input');
    input.focus({ preventScroll: true });

    // Accent buttons type into the box where the cursor is, and keep the
    // box focused (so a phone's keyboard stays up).
    form.querySelectorAll('.accent-key').forEach(function (key) {
      key.addEventListener('mousedown', function (e) { e.preventDefault(); });
      key.addEventListener('click', function () {
        const start = input.selectionStart == null ? input.value.length : input.selectionStart;
        const end = input.selectionEnd == null ? start : input.selectionEnd;
        input.value = input.value.slice(0, start) + key.dataset.key + input.value.slice(end);
        input.setSelectionRange(start + 1, start + 1);
        input.focus({ preventScroll: true });
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (answered || !input.value.trim()) return;
      answered = true;

      const result = markTyped(input.value, word);
      const isCorrect = result !== 'wrong';
      input.disabled = true;
      form.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      form.querySelector('#type-answer-check').classList.add('hidden');
      form.classList.add(isCorrect ? 'correct' : 'incorrect');
      handlers.onAnswer(isCorrect);

      const feedback = container.querySelector('#type-feedback');
      const spelling = speakerButtonHtml(word.sk) + '<strong>' + escapeHtml(word.sk) + '</strong>';
      if (result === 'right') {
        feedback.innerHTML = '<div class="type-result correct">Correct!</div>';
        setTimeout(handlers.onNext, 900);
        return;
      }
      feedback.innerHTML =
        (result === 'accents'
          ? '<div class="type-result correct">Almost — watch the accents:</div>'
          : '<div class="type-result incorrect">The answer is:</div>') +
        '<div class="type-spelling">' + spelling + '</div>';
      addPromptNext(feedback, handlers.onNext);
    });
  }

  // "Which letter is missing?": the word plays with one of its trickier
  // letters blanked out. Returns false if the word has no such letter.
  function renderLetterPrompt(container, word, eyebrowHtml, handlers) {
    const q = missingLetterQuestion(word);
    if (!q) return false;
    let answered = false;
    container.innerHTML =
      '<div class="lesson-stage">' +
      eyebrowHtml +
      '<div class="exercise-audio">' + speakerButtonHtml(word.sk) + '</div>' +
      '<h2 class="lesson-heading">' + escapeHtml(q.blanked) + '</h2>' +
      '<p class="lesson-sub">Which letter is missing? Listen to the word.</p>' +
      '<div class="quiz-choice-list">' +
      q.options
        .map(function (opt) {
          return '<button type="button" class="quiz-choice-btn" data-correct="' + (opt === q.letter) + '">' + escapeHtml(opt) + '</button>';
        })
        .join('') +
      '</div>' +
      '</div>';
    container.scrollTop = 0;
    speak(word.sk);
    container.querySelectorAll('.quiz-choice-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (answered) return;
        answered = true;
        const isCorrect = btn.dataset.correct === 'true';
        container.querySelectorAll('.quiz-choice-btn').forEach(function (b) {
          b.disabled = true;
          if (b.dataset.correct === 'true') b.classList.add('correct');
          else if (b === btn) b.classList.add('incorrect');
        });
        handlers.onAnswer(isCorrect);
        if (isCorrect) setTimeout(handlers.onNext, 700);
        else addPromptNext(container.querySelector('.quiz-choice-list'), handlers.onNext);
      });
    });
    return true;
  }

  // The Next button a prompt waits on after a wrong answer.
  function addPromptNext(afterEl, onNext) {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn-primary exercise-next-btn';
    next.id = 'prompt-next-btn';
    next.textContent = 'Next';
    afterEl.insertAdjacentElement('afterend', next);
    next.addEventListener('click', onNext);
    next.focus({ preventScroll: true });
  }

  // After a first pass with flashcards, a few active drills on the same
  // words — write one or two, pick a missing letter — so practice isn't only
  // marking yourself on cards.
  function practiceDrills(words) {
    const pool = shuffleArray(words.slice());
    const out = [];
    const letterWord = pool.find(function (w) { return missingLetterQuestion(w); });
    if (letterWord) out.push({ word: letterWord, mode: 'letter' });
    pool
      .filter(function (w) { return w !== letterWord && typedAnswers(w).length; })
      .slice(0, 2)
      .forEach(function (w) { out.push({ word: w, mode: 'type' }); });
    return shuffleArray(out);
  }


  function renderFinishPhase() {
    updateLessonChrome('Done', 4);

    const totalRight = lessonPracticeCorrect + lessonVoiceCorrect + lessonQuizCorrect;
    const totalPossible = lessonPracticeTotal + lessonVoiceTotal + lessonQuizTotal;
    const pct = totalPossible > 0 ? totalRight / totalPossible : 0;
    const finishedSection = roadmapSections[lessonSectionIndex];
    const threshold = finishedSection.isFinalTest
      ? FINAL_TEST_CLEAR_THRESHOLD
      : finishedSection.kind === 'checkpoint'
      ? CHECKPOINT_CLEAR_THRESHOLD
      : ROUND_CLEAR_THRESHOLD;
    const cleared = pct >= threshold;
    const isPerfect = totalPossible > 0 && totalRight === totalPossible;

    if (cleared) setSectionCleared(roadmapSections[lessonSectionIndex].id);
    recordPracticeToday();
    unlockAchievement('first-practice', 'First Practice Complete');
    checkWordCountAchievements();

    const hasNext = lessonSectionIndex + 1 < roadmapSections.length;
    const isCheckpoint = roadmapSections[lessonSectionIndex].kind === 'checkpoint';
    const summaryClass = isPerfect ? 'perfect' : cleared ? 'cleared' : 'not-cleared';
    const message = finishedSection.isFinalTest
      ? (cleared
          ? finishedSection.level + ' passed!'
          : 'Not quite — you need ' + Math.round(FINAL_TEST_CLEAR_THRESHOLD * 100) + '% to pass ' + finishedSection.level + '. The words you missed are waiting in Revise.')
      : isCheckpoint
      ? (cleared ? 'Checkpoint passed!' : 'Not quite — the words you missed are waiting in Revise.')
      : isPerfect ? 'Perfect!' : cleared ? 'Section cleared!' : 'Not quite — try this section again.';
    const masteredLine = isCheckpoint
      ? '<p class="finish-mastered">' +
        (checkpointMastered
          ? checkpointMastered + (checkpointMastered === 1 ? ' new word mastered' : ' new words mastered')
          : 'No new words mastered this time') +
        ' · ' + masteredWordCount() + ' total</p>'
      : '';

    const body = document.getElementById('lesson-body');
    body.innerHTML =
      '<div class="lesson-finish-card ' + summaryClass + '" id="lesson-finish-card">' +
      '<div class="score-big">' + Math.round(pct * 100) + '%</div>' +
      '<p>' + message + '</p>' +
      masteredLine +
      '<div class="round-summary-actions">' +
      (cleared && hasNext ? '<button class="btn btn-primary" id="lesson-next-section-btn">Next Section</button>' : '') +
      '<button class="btn ' + (cleared && hasNext ? 'btn-secondary' : 'btn-primary') + '" id="lesson-retry-btn">Retry This Section</button>' +
      '<button class="btn btn-secondary" id="lesson-done-btn">Back to Roadmap</button>' +
      '</div>' +
      '</div>';
    body.scrollTop = 0;

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

  // Revising was previously only reachable by knowing to look under Tests.
  // This surfaces it on the Profile whenever there's actually something to
  // revise, and hides itself when there isn't.
  function renderReviseCard() {
    const card = document.getElementById('profile-revise-card');
    if (!card) return;

    const due = getDueReviewWords().length;
    card.classList.toggle('hidden', due === 0);
    if (!due) return;

    card.innerHTML =
      '<div class="next-info">' +
      '<div class="next-label">Revise</div>' +
      '<div class="next-title">' + due + (due === 1 ? ' hard word' : ' hard words') + ' to go over</div>' +
      '<div class="next-sub">Words you’ve missed — hear each one in a sentence too</div>' +
      '</div>' +
      '<span class="next-cta">Revise →</span>';

    card.onclick = function () {
      document.querySelector('[data-tab="tests"]').click();
      document.querySelector('[data-tests-mode="review"]').click();
    };
  }

  // Playful time-of-day greeting using the name on the account, refreshed
  // every time the Profile panel renders (on load, and again if you're still
  // on it when the hour rolls over).
  function renderGreeting() {
    const el = document.getElementById('profile-greeting');
    if (!el) return;

    // Just for the two of you.
    const mascot = document.getElementById('profile-mascot');
    if (mascot) {
      const show = isDevAccount();
      mascot.classList.toggle('hidden', !show);
      mascot.classList.toggle('student-view', studentViewOn());
      mascot.setAttribute('aria-pressed', String(studentViewOn()));
      const img = document.getElementById('profile-mascot-img');
      if (show && img && !img.getAttribute('src')) img.src = 'img/elephant.png';
    }

    const user = getSessionUser();
    const name = user && user.name ? user.name.split(' ')[0] : '';
    const hour = new Date().getHours();
    let line;
    if (hour >= 5 && hour < 12) line = 'Good morning';
    else if (hour >= 12 && hour < 17) line = 'Good afternoon';
    else if (hour >= 17 && hour < 22) line = 'Good evening';
    else line = 'Hey, night owl';
    el.textContent = name ? line + ', ' + name : line;
  }

  function renderProfile() {
    renderGreeting();
    const totalSections = roadmapSections.length;
    const progress = loadRoadmapProgress();
    const clearedCount = roadmapSections.filter(function (s) { return progress[s.id]; }).length;
    const pct = totalSections > 0 ? Math.round((clearedCount / totalSections) * 100) : 0;

    document.getElementById('profile-pct').textContent = pct + '%';
    document.getElementById('profile-ring-fill').style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - pct / 100));
    document.getElementById('stat-sections').textContent = clearedCount + ' / ' + totalSections;

    document.getElementById('stat-words').textContent = String(masteredWordCount());

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
    renderReviseCard();

    const nextIdx = upNextIndex();
    const nextCard = document.getElementById('profile-next-card');
    if (totalSections === 0) {
      nextCard.innerHTML = '<div class="next-info"><div class="next-label">Loading…</div></div>';
      nextCard.onclick = null;
    } else if (nextIdx === -1 && !hasFullAccess()) {
      nextCard.innerHTML =
        '<div class="next-info"><div class="next-label">Free Preview complete</div>' +
        '<div class="next-title">Keep going with Pro</div>' +
        '<div class="next-sub">Sections 6+ need Pro or a beta code</div></div>';
      nextCard.onclick = function () { showUpsell(''); };
    } else if (nextIdx === -1) {
      nextCard.innerHTML = '<div class="next-info"><div class="next-label">All done</div><div class="next-title">You’ve cleared every section!</div></div>';
      nextCard.onclick = null;
    } else {
      const section = roadmapSections[nextIdx];
      nextCard.innerHTML =
        '<div class="next-info">' +
        '<div class="next-label">Up next</div>' +
        '<div class="next-title">' + escapeHtml(section.title) + '</div>' +
        '<div class="next-sub">' + kindLabel(section) + ' · Section ' + (nextIdx + 1) + ' of ' + totalSections + '</div>' +
        '</div>';
      nextCard.onclick = function () {
        document.querySelector('[data-tab="learn"]').click();
        startLesson(nextIdx);
      };
    }

    renderBadges();
    scheduleProgressSync();
  }

  // Renders the {name, bestStreak} leaderboard fetched from the server —
  // ranked on each account's best-ever streak, not today's live one, and
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

      // Gold, silver and bronze for the top three; your own row stands out.
      const PODIUM = ['gold', 'silver', 'bronze'];
      listEl.innerHTML = entries
        .map(function (e, i) {
          return (
            '<div class="leaderboard-row' + (e.isMe ? ' is-me' : '') + '">' +
            '<span class="leaderboard-rank' + (i < 3 ? ' podium podium-' + PODIUM[i] : '') + '" aria-label="Rank ' + (i + 1) + '">' + (i + 1) + '</span>' +
            '<span class="leaderboard-name">' + escapeHtml(e.name) + (e.isMe ? ' <span class="you-pill">You</span>' : '') + '</span>' +
            '<span class="leaderboard-streak">' + e.bestStreak + (e.bestStreak === 1 ? ' day' : ' days in a row') + '</span>' +
            '</div>'
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
      const previous = learnSelect.value;
      learnSelect.innerHTML = vocabTopics
        .map(function (t) {
          const pro = !hasFullAccess() && FREE_PRACTICE_TOPICS.indexOf(t) === -1;
          return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + (pro ? ' (Pro)' : '') + '</option>';
        })
        .join('');
      // Rebuilding the list (when your own additions load) keeps the topic
      // you'd picked instead of quietly jumping back to the first one.
      if (previous && vocabTopics.indexOf(previous) !== -1) learnSelect.value = previous;
      else if (vocabTopics.length) showRoundTopic(vocabTopics[0]);
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
      if (!hasFullAccess()) return showUpsell('AI quizzes');
      const select = document.getElementById('topic-select');
      const topic = select.value;
      if (!topic) {
        showQuizError('Please choose a topic first.');
        return;
      }
      requestQuiz({ mode: 'topic', topic: topic, material: quizMaterial(topic) });
    });

    document.getElementById('generate-file-btn').addEventListener('click', function () {
      if (!hasFullAccess()) return showUpsell('AI quizzes');
      if (!selectedFile) {
        showQuizError('Please choose a file first.');
        return;
      }
      generateFromFile(selectedFile);
    });
  }

  // What an AI quiz on a topic is built from. For a word topic: its words,
  // the ones not mastered yet first (most missed first among them), so each
  // quiz works on new ground the way checkpoints do. For a grammar topic:
  // its summary and examples, so the questions match what was taught.
  const QUIZ_WORDS = 10;

  function quizMaterial(topic) {
    const group = vocabData.find(function (g) { return g.topic === topic; });
    if (group) {
      const mastered = loadMasteredWords();
      const stats = loadVocabStats();
      const misses = function (w) { return (stats[w.sk] && stats[w.sk].misses) || 0; };
      const words = shuffleArray((group.words || []).slice()).sort(function (a, b) {
        const byMastered = (mastered[a.sk] ? 1 : 0) - (mastered[b.sk] ? 1 : 0);
        return byMastered || misses(b) - misses(a);
      });
      return { words: words.slice(0, QUIZ_WORDS).map(function (w) { return { sk: w.sk, en: w.en }; }) };
    }
    const t = grammarData.find(function (x) { return x.topic === topic; });
    if (t) {
      return {
        summary: t.summary || '',
        examples: (t.examples || []).slice(0, 12).map(function (ex) { return { sk: ex.sk, en: ex.en }; }),
      };
    }
    return null;
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

    if (!result.ok) {
      hideQuizStatus();
      if (result.status === 401) {
        clearSessionToken();
        location.reload();
        return;
      }
      if (result.status === 403) return showUpsell('AI quizzes');
      showQuizError(result.error);
      return;
    }

    // A quiz is made in two halves at once; when one doesn't come back in
    // time, ask for just that half again rather than show a 5-question quiz.
    let questions = result.data.questions || [];
    const missing = result.data.missing || [];
    if (missing.length) {
      const more = await postJsonWithRetry('/.netlify/functions/generate-quiz', Object.assign({}, payload, { batches: missing }), {
        initialMessage: 'Adding the last few questions…',
        onStatus: showQuizStatus,
      });
      if (more.ok && more.data.questions) {
        const seen = {};
        questions.forEach(function (q) { seen[String(q.question).trim().toLowerCase()] = true; });
        more.data.questions.forEach(function (q) {
          const key = String(q.question).trim().toLowerCase();
          if (!seen[key]) {
            seen[key] = true;
            questions.push(q);
          }
        });
      }
    }
    hideQuizStatus();
    renderQuiz(questions);
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
      if (q.word) card.dataset.word = q.word;

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
    let wordsAnswered = 0;
    let newlyMastered = 0;
    const cards = area.querySelectorAll('.quiz-question');
    const knownWords = {};
    vocabData.forEach(function (g) { (g.words || []).forEach(function (w) { knownWords[w.sk] = w; }); });

    cards.forEach(function (card) {
      const correctIndex = Number(card.dataset.correct);
      const selected = card.querySelector('input[type="radio"]:checked');
      const selectedIndex = selected ? Number(selected.value) : -1;

      if (selectedIndex === correctIndex) correctCount++;

      // A question about one of the course's words counts for that word: a
      // miss sends it to Revise, and a right answer masters it, as on a
      // checkpoint. Questions left blank don't count either way.
      const word = knownWords[card.dataset.word];
      if (word && selectedIndex !== -1) {
        const right = selectedIndex === correctIndex;
        recordWordResult(word, right);
        if (right && !loadMasteredWords()[word.sk]) {
          markWordMastered(word.sk);
          newlyMastered++;
        }
        incrementDailyCount();
        wordsAnswered++;
      }

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

    if (wordsAnswered) {
      recordPracticeToday();
      checkWordCountAchievements();
      updateReviewCountBadge();
      scheduleProgressSync();
    }

    const scoreCard = area.querySelector('.quiz-score');
    scoreCard.classList.remove('hidden');
    area.querySelector('#score-num').textContent = correctCount + '/' + total;
    if (wordsAnswered) {
      const line = document.createElement('div');
      line.className = 'score-mastered';
      line.textContent =
        (newlyMastered ? newlyMastered + (newlyMastered === 1 ? ' new word mastered' : ' new words mastered') : 'No new words mastered this time') +
        ' · ' + masteredWordCount() + ' total';
      scoreCard.appendChild(line);
    }
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
        'Saved! This content is private to your account — it now shows in Word Lists, the Grammar Guide and Tests. ' +
        'Reload the page to see it under "My additions" at the end of your Learn roadmap.';
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
    dialogueData.forEach(function (d) {
      (d.lines || []).forEach(function (l) {
        if (l.sk) set.add(l.sk);
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

  // Everything above is defined now: restore the session (or show the
  // onboarding screen).
  resolveSession();
})();
