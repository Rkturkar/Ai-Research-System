/* ================================================================
   ResearchMind — app.js
   Handles: search, SSE streaming, markdown rendering,
            feedback parsing, tab switching, animations
   ================================================================ */

'use strict';

/* ── Config ── */
const API = 'http://localhost:8000';

/* ── State ── */
let currentTopic  = '';
let startTime     = null;
let timerInterval = null;
let dotsInterval  = null;

/* ── Step definitions ── */
const STEPS = ['search', 'reader', 'writer', 'critic'];
const STEP_ICONS  = { search: '🔍', reader: '📄', writer: '✍️', critic: '🧐' };
const STEP_MSGS   = {
  search: 'Scanning the web for relevant sources',
  reader: 'Reading and extracting key content',
  writer: 'Composing your research report',
  critic: 'Reviewing and scoring the report',
};
const LINE_FOR_STEP = { reader: 1, writer: 2, critic: 3 };

/* ================================================================
   DOM HELPERS
   ================================================================ */
const $ = (id) => document.getElementById(id);

function showError(msg) {
  $('errorMsg').textContent = msg;
  $('errorBox').classList.add('visible');
  setTimeout(() => $('errorBox').classList.remove('visible'), 6000);
}

function hideError() {
  $('errorBox').classList.remove('visible');
}

/* ================================================================
   PIPELINE ORB HELPERS
   ================================================================ */
function resetOrbs() {
  STEPS.forEach((s) => {
    const orb = $('orb-' + s);
    const lbl = $('lbl-' + s);
    orb.className    = 'orb';
    orb.textContent  = STEP_ICONS[s];
    orb.style.fontSize = '';
    lbl.className    = 'orb-label';
  });
  [1, 2, 3].forEach((n) => setLine(n, false));
}

function setOrb(step, state) {
  const orb = $('orb-' + step);
  const lbl = $('lbl-' + step);
  orb.className = 'orb ' + state;
  lbl.className = 'orb-label ' + state;
  if (state === 'done') {
    orb.textContent  = '✓';
    orb.style.fontSize = '16px';
  }
}

function setLine(n, active) {
  const line = $('line-' + n);
  if (line) line.className = 'orb-line' + (active ? ' active' : '');
}

/* ================================================================
   LOADING MESSAGE & TIMER
   ================================================================ */
function startDots() {
  if (dotsInterval) clearInterval(dotsInterval);
  let n = 0;
  dotsInterval = setInterval(() => {
    const el = $('dots');
    if (el) el.textContent = '.'.repeat((n++ % 3) + 1);
  }, 400);
}

function stopDots() {
  if (dotsInterval) { clearInterval(dotsInterval); dotsInterval = null; }
}

function setLoadingMsg(step) {
  $('loadingMsg').innerHTML =
    '<strong>' + STEP_MSGS[step] + '</strong><span id="dots"></span>';
  startDots();
}

function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const el = $('timeTag');
    if (el) el.textContent = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
  }, 100);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  return ((Date.now() - startTime) / 1000).toFixed(1) + 's';
}

/* ================================================================
   SEARCH BUTTON STATE
   ================================================================ */
function setBtnLoading() {
  const btn = $('searchBtn');
  btn.disabled = true;
  btn.innerHTML =
    '<span class="spinner"></span><span class="btn-label">Researching…</span>';
}

function setBtnReady() {
  const btn = $('searchBtn');
  btn.disabled = false;
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="white" stroke-width="1.5"/>
      <path d="M9.5 9.5L12.5 12.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span class="btn-label">Search</span>`;
}

/* ================================================================
   MARKDOWN → HTML (lightweight)
   ================================================================ */
function markdownToHtml(md) {
  if (!md) return '';

  // escape HTML entities first
  let text = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // headings
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm,   '<h2>$1</h2>');

  // inline formatting
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g,     '<em>$1</em>');
  text = text.replace(/`(.+?)`/g,       '<code>$1</code>');

  // links — unescape the href portion
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
    const href = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return '<a href="' + href + '" target="_blank" rel="noopener">' + label + '</a>';
  });

  // lists → wrap in <ul>
  const lines  = text.split('\n');
  const output = [];
  let inUl = false;

  for (const line of lines) {
    if (/^- /.test(line)) {
      if (!inUl) { output.push('<ul>'); inUl = true; }
      output.push('<li>' + line.slice(2) + '</li>');
    } else {
      if (inUl) { output.push('</ul>'); inUl = false; }
      const trimmed = line.trim();
      if (!trimmed) {
        // blank line — skip
      } else if (/^<[hul2-3]/.test(trimmed) || /^<\/[hul]/.test(trimmed)) {
        output.push(trimmed);           // already HTML
      } else {
        output.push('<p>' + trimmed + '</p>');
      }
    }
  }

  if (inUl) output.push('</ul>');
  return output.join('\n');
}

/* ================================================================
   FEEDBACK PARSER
   ================================================================ */
function parseFeedback(text) {
  if (!text) return '';

  const scoreMatch    = text.match(/Score:\s*(\d+)\s*\/\s*10/i);
  const strengthMatch = text.match(/Strengths?:([\s\S]*?)(?=Areas to Improve|One line|$)/i);
  const improveMatch  = text.match(/Areas to Improve:([\s\S]*?)(?=One line|$)/i);
  const verdictMatch  = text.match(/One line verdict:([\s\S]*?)$/i);

  const parseBullets = (raw) =>
    raw
      ? raw.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(l => l.length > 3)
      : [];

  let html = '';

  /* Score card */
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1], 10);
    const pct   = (score / 10) * 100;
    html += `
      <div class="score-display">
        <div>
          <span class="score-num">${score}</span>
          <span class="score-denom">/10</span>
        </div>
        <div class="score-bar-wrap">
          <div class="score-bar-label">Quality Score</div>
          <div class="score-bar">
            <div class="score-bar-fill" id="scoreBarFill" style="width:0%"></div>
          </div>
        </div>
      </div>`;
    /* Animate bar after render */
    setTimeout(() => {
      const fill = $('scoreBarFill');
      if (fill) fill.style.width = pct + '%';
    }, 300);
  }

  /* Strengths */
  const strengths = parseBullets(strengthMatch?.[1]);
  if (strengths.length) {
    html += '<div class="feedback-section"><div class="feedback-section-title green">Strengths</div>';
    strengths.forEach(s => { html += '<div class="feedback-item">' + s + '</div>'; });
    html += '</div>';
  }

  /* Areas to improve */
  const improvements = parseBullets(improveMatch?.[1]);
  if (improvements.length) {
    html += '<div class="feedback-section"><div class="feedback-section-title blue">Areas to improve</div>';
    improvements.forEach(s => { html += '<div class="feedback-item">' + s + '</div>'; });
    html += '</div>';
  }

  /* Verdict */
  const verdict = verdictMatch?.[1]?.trim();
  if (verdict) {
    html += '<div class="verdict">"' + verdict + '"</div>';
  }

  return html || '<div style="white-space:pre-wrap;font-size:13px;color:var(--ink2)">' + text + '</div>';
}

/* ================================================================
   TAB SWITCHING
   ================================================================ */
function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('panel-' + panel).classList.add('active');
    });
  });
}

/* ================================================================
   RESET RESULT TABS to "Report" tab
   ================================================================ */
function resetTabs() {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  document.querySelectorAll('.tab-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
}

/* ================================================================
   DISPLAY RESULT
   ================================================================ */
function displayResult(report, feedback) {
  /* Topic & elapsed time */
  $('resultTopic').textContent = currentTopic;

  /* Report HTML */
  $('reportBody').innerHTML = markdownToHtml(report);

  /* Download link */
  const blob = new Blob([report], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const dlBtn = $('downloadBtn');
  dlBtn.href     = url;
  dlBtn.download = 'research_' + Date.now() + '.md';

  /* Feedback */
  $('feedbackBody').innerHTML = parseFeedback(feedback);

  /* Reset to Report tab */
  resetTabs();

  /* Show card */
  const card = $('resultCard');
  card.classList.add('visible');

  /* Smooth scroll to card */
  setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

/* ================================================================
   HANDLE SEARCH
   ================================================================ */
async function handleSearch() {
  const topic = $('topicInput').value.trim();
  if (!topic) { showError('Please enter a research topic.'); return; }

  currentTopic = topic;

  /* Reset UI */
  hideError();
  $('emptyState').style.display  = 'none';
  $('resultCard').classList.remove('visible');
  setBtnLoading();
  resetOrbs();

  /* Show loading */
  const loading = $('loadingState');
  loading.classList.add('visible');
  $('loadingMsg').innerHTML = 'Initializing pipeline<span id="dots">.</span>';
  startDots();
  startTimer();

  try {
    /* 1. Start session on backend */
    const res = await fetch(API + '/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to start pipeline. Is the server running?');
    }

    const { session_id } = await res.json();

    /* 2. Stream pipeline events */
    const es = new EventSource(API + '/api/research/' + session_id + '/stream');

    es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.event === 'step_start') {
        setOrb(msg.step, 'active');
        setLoadingMsg(msg.step);
        const lineIdx = LINE_FOR_STEP[msg.step];
        if (lineIdx) setLine(lineIdx, true);
      }

      if (msg.event === 'step_done') {
        setOrb(msg.step, 'done');
      }

      if (msg.event === 'complete') {
        es.close();
        const elapsed = stopTimer();
        stopDots();
        loading.classList.remove('visible');
        setBtnReady();
        $('timeTag').textContent = elapsed;
        displayResult(msg.report, msg.feedback);
      }

      if (msg.event === 'error') {
        es.close();
        onPipelineError(msg.message || 'Something went wrong in the pipeline.');
      }
    };

    es.onerror = () => {
      es.close();
      onPipelineError(
        'Connection to server lost. Make sure the FastAPI backend is running on port 8000.'
      );
    };

  } catch (err) {
    onPipelineError(err.message || 'Could not connect to backend.');
  }
}

/* ── Pipeline error cleanup ── */
function onPipelineError(msg) {
  stopDots();
  stopTimer();
  $('loadingState').classList.remove('visible');
  setBtnReady();
  showError(msg);
  $('emptyState').style.display = '';
}

/* ================================================================
   SET TOPIC (from chip / card click)
   ================================================================ */
function setTopic(topic) {
  $('topicInput').value = topic;
  $('topicInput').focus();
}

/* ================================================================
   EVENT LISTENERS — set up once DOM is ready
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  /* Search button */
  $('searchBtn').addEventListener('click', handleSearch);

  /* Enter key in input */
  $('topicInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  /* Example chips */
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => setTopic(chip.dataset.topic));
  });

  /* Empty-state cards */
  document.querySelectorAll('.empty-card').forEach((card) => {
    card.addEventListener('click', () => setTopic(card.dataset.topic));
  });

  /* Tabs */
  initTabs();
});