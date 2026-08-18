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
    appEl.classList.remove('hidden');
    initApp();
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

  /* ---------------- App (only runs after unlock) ---------------- */

  let appInitialized = false;
  let grammarData = [];
  let vocabData = [];

  function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    setupTabs();
    loadGrammar();
    loadVocab();
    setupTests();
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
      });
    });
  }

  /* ---- Grammar ---- */

  async function loadGrammar() {
    const container = document.getElementById('grammar-list');
    try {
      const res = await fetch('data/grammar.json');
      grammarData = await res.json();
      renderGrammar(grammarData);
      populateTopicSelect();
    } catch (err) {
      container.innerHTML = '<div class="empty-state">Could not load grammar content.</div>';
    }
  }

  function renderGrammar(topics) {
    const container = document.getElementById('grammar-list');
    if (!topics.length) {
      container.innerHTML = '<div class="empty-state">No grammar topics yet.</div>';
      return;
    }

    container.innerHTML = topics
      .map(function (t, i) {
        const examples = (t.examples || [])
          .map(function (ex) {
            return (
              '<div class="example-row"><span class="sk">' +
              escapeHtml(ex.sk) +
              '</span><span class="en">' +
              escapeHtml(ex.en) +
              '</span></div>'
            );
          })
          .join('');

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

  async function loadVocab() {
    const container = document.getElementById('vocab-list');
    try {
      const res = await fetch('data/vocab.json');
      vocabData = await res.json();
      renderVocab(vocabData);
      populateTopicSelect();
    } catch (err) {
      container.innerHTML = '<div class="empty-state">Could not load vocabulary content.</div>';
    }
  }

  function renderVocab(groups) {
    const container = document.getElementById('vocab-list');
    if (!groups.length) {
      container.innerHTML = '<div class="empty-state">No vocabulary yet.</div>';
      return;
    }

    container.innerHTML = groups
      .map(function (g) {
        const words = (g.words || [])
          .map(function (w) {
            return (
              '<div class="vocab-word"><div class="sk">' +
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

  /* ---- Tests ---- */

  function populateTopicSelect() {
    const select = document.getElementById('topic-select');
    if (!select || (!grammarData.length && !vocabData.length)) return;

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
    showQuizStatus('Generating your quiz…');

    try {
      const res = await fetch('/.netlify/functions/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ password: getStoredPassword() }, payload)),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // Session password no longer valid server-side; force re-entry.
          sessionStorage.removeItem(SESSION_KEY);
          location.reload();
          return;
        }
        showQuizError(data.error || 'Something went wrong generating the quiz.');
        return;
      }

      renderQuiz(data.questions);
    } catch (err) {
      showQuizError('Could not reach the server. Please try again.');
    } finally {
      hideQuizStatus();
    }
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
