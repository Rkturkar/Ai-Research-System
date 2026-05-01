/* ================================================================
   ResearchMind — app.js
   ================================================================ */

'use strict';

const API = 'https://ai-backend-u63u.onrender.com';
let currentTopic  = '';
let startTime     = null;
let timerInterval = null;
let dotsInterval  = null;

const STEPS = ['search', 'reader', 'writer', 'critic', 'images'];
const STEP_ICONS = { search: '🔍', reader: '📄', writer: '✍️', critic: '🧐', images: '🖼️' };
const STEP_MSGS  = {
  search: 'Scanning the web for relevant sources',
  reader: 'Reading and extracting key content',
  writer: 'Composing your research report',
  critic: 'Reviewing and scoring the report',
  images: 'Finding relevant images',
};
const LINE_FOR_STEP = { reader: 1, writer: 2, critic: 3, images: 4 };

/* ── DOM helper ── */
const $ = (id) => document.getElementById(id);

/* ── Error ── */
function showError(msg) {
  $('errorMsg').textContent = msg;
  $('errorBox').classList.add('visible');
  setTimeout(() => $('errorBox').classList.remove('visible'), 6000);
}
function hideError() { $('errorBox').classList.remove('visible'); }

/* ── Orbs ── */
function resetOrbs() {
  STEPS.forEach(s => {
    const orb = $('orb-' + s);
    const lbl = $('lbl-' + s);
    if (!orb) return;
    orb.className   = 'orb';
    orb.textContent = STEP_ICONS[s];
    orb.style.fontSize = '';
    lbl.className   = 'orb-label';
  });
  [1, 2, 3, 4].forEach(n => setLine(n, false));
}

function setOrb(step, state) {
  const orb = $('orb-' + step);
  const lbl = $('lbl-' + step);
  if (!orb) return;
  orb.className = 'orb ' + state;
  lbl.className = 'orb-label ' + state;
  if (state === 'done') { orb.textContent = '✓'; orb.style.fontSize = '16px'; }
}

function setLine(n, active) {
  const line = $('line-' + n);
  if (line) line.className = 'orb-line' + (active ? ' active' : '');
}

/* ── Dots & timer ── */
function startDots() {
  if (dotsInterval) clearInterval(dotsInterval);
  let n = 0;
  dotsInterval = setInterval(() => {
    const el = $('dots');
    if (el) el.textContent = '.'.repeat((n++ % 3) + 1);
  }, 400);
}
function stopDots() { if (dotsInterval) { clearInterval(dotsInterval); dotsInterval = null; } }

function setLoadingMsg(step) {
  $('loadingMsg').innerHTML = '<strong>' + STEP_MSGS[step] + '</strong><span id="dots"></span>';
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

/* ── Button state ── */
function setBtnLoading() {
  const btn = $('searchBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span class="btn-label">Researching…</span>';
}
function setBtnReady() {
  const btn = $('searchBtn');
  btn.disabled = false;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="6" cy="6" r="4.5" stroke="white" stroke-width="1.5"/>
    <path d="M9.5 9.5L12.5 12.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
  </svg><span class="btn-label">Search</span>`;
}

/* ── Markdown → HTML ── */
function markdownToHtml(md) {
  if (!md) return '';
  let text = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm,   '<h2>$1</h2>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g,     '<em>$1</em>');
  text = text.replace(/`(.+?)`/g,       '<code>$1</code>');
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
    const href = url.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });
  const lines = text.split('\n');
  const out = [];
  let inUl = false;
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push('<li>' + line.slice(2) + '</li>');
    } else {
      if (inUl) { out.push('</ul>'); inUl = false; }
      const t = line.trim();
      if (!t) {}
      else if (/^<[hul2-3]/.test(t) || /^<\/[hul]/.test(t)) out.push(t);
      else out.push('<p>' + t + '</p>');
    }
  }
  if (inUl) out.push('</ul>');
  return out.join('\n');
}

/* ── Feedback parser ── */
function parseFeedback(text) {
  if (!text) return '';
  const scoreMatch    = text.match(/Score:\s*(\d+)\s*\/\s*10/i);
  const strengthMatch = text.match(/Strengths?:([\s\S]*?)(?=Areas to Improve|One line|$)/i);
  const improveMatch  = text.match(/Areas to Improve:([\s\S]*?)(?=One line|$)/i);
  const verdictMatch  = text.match(/One line verdict:([\s\S]*?)$/i);
  const parseBullets  = r => r ? r.split('\n').map(l=>l.replace(/^[-*•]\s*/,'').trim()).filter(l=>l.length>3) : [];
  let html = '';
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1], 10);
    html += `<div class="score-display">
      <div><span class="score-num">${score}</span><span class="score-denom">/10</span></div>
      <div class="score-bar-wrap">
        <div class="score-bar-label">Quality Score</div>
        <div class="score-bar"><div class="score-bar-fill" id="scoreBarFill" style="width:0%"></div></div>
      </div></div>`;
    setTimeout(() => { const f=$('scoreBarFill'); if(f) f.style.width=(score*10)+'%'; }, 300);
  }
  const strengths = parseBullets(strengthMatch?.[1]);
  if (strengths.length) {
    html += '<div class="feedback-section"><div class="feedback-section-title green">Strengths</div>';
    strengths.forEach(s => { html += '<div class="feedback-item">' + s + '</div>'; });
    html += '</div>';
  }
  const improvements = parseBullets(improveMatch?.[1]);
  if (improvements.length) {
    html += '<div class="feedback-section"><div class="feedback-section-title blue">Areas to improve</div>';
    improvements.forEach(s => { html += '<div class="feedback-item">' + s + '</div>'; });
    html += '</div>';
  }
  const verdict = verdictMatch?.[1]?.trim();
  if (verdict) html += '<div class="verdict">"' + verdict + '"</div>';
  return html || `<div style="white-space:pre-wrap;font-size:13px;color:var(--ink2)">${text}</div>`;
}

/* ── Image grid renderer ── */
function renderImages(images) {
  const section = $('imageSection');
  const grid    = $('imageGrid');

  // ✅ Always clear first
  grid.innerHTML = '';
  section.style.display = 'none';
  section.classList.remove('visible');

  if (!images || images.length === 0) {
    console.warn('renderImages: no images received');
    return;
  }

  console.log('renderImages: rendering', images.length, 'images');

  images.forEach((img, i) => {
    const src  = img.thumbnailUrl || img.imageUrl;
    const href = img.link || img.imageUrl || '#';
    if (!src) { console.warn('Image', i, 'has no src, skipping'); return; }

    const card = document.createElement('div');
    card.className = 'img-card';

    // ✅ Use createElement instead of innerHTML to avoid XSS / escaping issues
    const a = document.createElement('a');
    a.href   = href;
    a.target = '_blank';
    a.rel    = 'noopener';
    a.className = 'img-link';

    const wrap = document.createElement('div');
    wrap.className = 'img-wrap';

    const imgEl = document.createElement('img');
    imgEl.src     = src;
    imgEl.alt     = img.title || '';
    imgEl.loading = 'lazy';
    imgEl.onerror = function() {
      // Try imageUrl as fallback before hiding
      if (this.src !== img.imageUrl && img.imageUrl) {
        this.src = img.imageUrl;
      } else {
        this.closest('.img-card').style.display = 'none';
      }
    };

    const caption = document.createElement('div');
    caption.className = 'img-caption';

    const titleEl = document.createElement('span');
    titleEl.className   = 'img-title';
    titleEl.textContent = img.title || '';

    const sourceEl = document.createElement('span');
    sourceEl.className   = 'img-source';
    sourceEl.textContent = img.source || '';

    caption.appendChild(titleEl);
    caption.appendChild(sourceEl);
    wrap.appendChild(imgEl);
    a.appendChild(wrap);
    a.appendChild(caption);
    card.appendChild(a);
    grid.appendChild(card);
  });

  // ✅ Show section
  section.style.display = 'block';
  requestAnimationFrame(() => section.classList.add('visible'));
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
}

/* ── Tabs ── */
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('panel-' + panel).classList.add('active');
    });
  });
}

function resetTabs() {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  document.querySelectorAll('.tab-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
}

/* ── Display result ── */
function displayResult(report, feedback, images) {
  $('resultTopic').textContent = currentTopic;
  $('reportBody').innerHTML    = markdownToHtml(report);

  const blob  = new Blob([report], { type: 'text/markdown' });
  const dlBtn = $('downloadBtn');
  dlBtn.href     = URL.createObjectURL(blob);
  dlBtn.download = 'research_' + Date.now() + '.md';

  $('feedbackBody').innerHTML = parseFeedback(feedback);

  renderImages(images);
  resetTabs();

  const card = $('resultCard');
  card.classList.add('visible');
  setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

/* ── Main search handler ── */
async function handleSearch() {
  const topic = $('topicInput').value.trim();
  if (!topic) { showError('Please enter a research topic.'); return; }

  currentTopic = topic;
  hideError();
  $('emptyState').style.display  = 'none';
  $('resultCard').classList.remove('visible');

  // Hide image section from previous search
  const imgSection = $('imageSection');
  imgSection.style.display = 'none';
  imgSection.classList.remove('visible');

  setBtnLoading();
  resetOrbs();

  const loading = $('loadingState');
  loading.classList.add('visible');
  $('loadingMsg').innerHTML = 'Initializing pipeline<span id="dots">.</span>';
  startDots();
  startTimer();

  try {
    // POST to create session
    const res = await fetch(API + '/api/research', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topic }),
    });
    if (!res.ok) throw new Error('Failed to start pipeline. Is the server running?');
    const { session_id } = await res.json();

    // Stream — pass topic as query param
    const es = new EventSource(
      `${API}/api/research/${session_id}/stream?topic=${encodeURIComponent(topic)}`
    );

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
        displayResult(msg.report, msg.feedback, msg.images || []);
      }

      if (msg.event === 'error') {
        es.close();
        onPipelineError(msg.message || 'Something went wrong.');
      }
    };

    es.onerror = () => {
      es.close();
      onPipelineError('Connection lost. Make sure the backend is running on port 8000.');
    };

  } catch (err) {
    onPipelineError(err.message || 'Could not connect to backend.');
  }
}

function onPipelineError(msg) {
  stopDots();
  stopTimer();
  $('loadingState').classList.remove('visible');
  setBtnReady();
  showError(msg);
  $('emptyState').style.display = '';
}

function setTopic(topic) {
  $('topicInput').value = topic;
  $('topicInput').focus();
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  $('searchBtn').addEventListener('click', handleSearch);
  $('topicInput').addEventListener('keydown', e => { if (e.key === 'Enter') handleSearch(); });
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => setTopic(c.dataset.topic)));
  document.querySelectorAll('.empty-card').forEach(c => c.addEventListener('click', () => setTopic(c.dataset.topic)));
  initTabs();
});
