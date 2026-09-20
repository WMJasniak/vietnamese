// Vietnamese app — tab routing + module init.
//
// Home (id "plan", still internally named that way — see plan.js) is the
// only primary destination for actual learning: it auto-decides and
// auto-advances through the individual drill tabs itself, so the user never
// has to pick one. Stats and Settings are the other two primary
// destinations. Every individual drill tab, plus Reader and Basics, is
// still fully reachable — just tucked behind "More" as a secondary/manual
// option (free practice on one specific skill, or Reader's paste-your-own-
// text workflow) rather than presented as an equal top-level choice.
const LEARNING_TABS = new Set(['vocab', 'reader', 'tones', 'segments', 'basics', 'cloze', 'grammar', 'chunks', 'listening', 'speak']);

// Tab metadata driving BOTH the desktop header nav and the mobile bottom
// nav (see buildHeaderNav/buildBottomNav below) — one source of truth.
// `core` items are always visible; the rest live behind "More".
const TAB_NAV = [
  { id: 'plan',      icon: '🏠', label: 'Home',    core: true },
  { id: 'stats',     icon: '📊', label: 'Stats',   core: true },
  { id: 'settings',  icon: '⚙️', label: 'Settings', core: true },
  { id: 'vocab',     icon: '🃏', label: 'Vocab',   core: false },
  { id: 'tones',     icon: '🎵', label: 'Tones',   core: false },
  { id: 'segments',  icon: '👂', label: 'Sounds',  core: false },
  { id: 'cloze',     icon: '✏️', label: 'Cloze',   core: false },
  { id: 'grammar',   icon: '📐', label: 'Grammar', core: false },
  { id: 'chunks',    icon: '🧩', label: 'Chunks',  core: false },
  { id: 'listening', icon: '🎧', label: 'Listen',  core: false },
  { id: 'speak',     icon: '🗣️', label: 'Speak',   core: false },
  { id: 'reader',    icon: '📚', label: 'Reader',  core: false },
  { id: 'basics',    icon: '🔤', label: 'Basics',  core: false },
];

document.addEventListener('DOMContentLoaded', () => {
  buildHeaderNav();   // populate #header-tabs before querying .tab-btn below
  // [data-tab] excludes the "More" toggle button, which reuses .tab-btn's
  // look but isn't a real tab and must not run the tab-switch logic below.
  const tabBtns   = document.querySelectorAll('.tab-btn[data-tab]');
  const tabPanels = document.querySelectorAll('.tab-panel');

  window.switchTab = (name) => {
    const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
    if (btn) btn.click();
  };

  let statsModule = null;
  let readerModule = null;
  let planModule = null;
  let basicsModule = null;
  let tonesModule = null;
  let segmentsModule = null;
  let clozeModule = null;
  let grammarModule = null;
  let chunksModule = null;
  let listeningModule = null;
  let speakModule = null;

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const leaving  = document.querySelector('.tab-btn.active')?.dataset.tab;
      const entering = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.toggle('active', b === btn));
      tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${entering}`));

      if (LEARNING_TABS.has(leaving) && !LEARNING_TABS.has(entering)) flushTime();
      else if (!LEARNING_TABS.has(leaving) && LEARNING_TABS.has(entering)) resumeTimer();

      // Speak holds a live mic stream/recognition session while active —
      // unlike the other tabs, leaving it mid-attempt must actively release
      // the microphone rather than just letting the panel go invisible.
      if (leaving === 'speak' && speakModule) speakModule.deactivate();

      if (entering === 'stats'    && statsModule)    statsModule.refresh();
      if (entering === 'reader'   && readerModule)   readerModule.activate();
      if (entering === 'plan'     && planModule)     planModule.activate();
      if (entering === 'basics'   && basicsModule)   basicsModule.activate();
      if (entering === 'tones'    && tonesModule)    tonesModule.activate();
      if (entering === 'segments' && segmentsModule) segmentsModule.activate();
      if (entering === 'cloze'    && clozeModule)    clozeModule.activate();
      if (entering === 'grammar'  && grammarModule)  grammarModule.activate();
      if (entering === 'chunks'   && chunksModule)   chunksModule.activate();
      if (entering === 'listening'&& listeningModule)listeningModule.activate();
      if (entering === 'speak'    && speakModule)    speakModule.activate();

      updateBottomNavActive(entering);
      document.getElementById('header-tabs')?.classList.remove('tabs-more-open');
    });
  });

  // Vocab — passes words to Stats + Reader once loaded
  const vocabPanel = document.getElementById('tab-vocab');
  if (vocabPanel) {
    const vocab = new VocabModule(vocabPanel);
    vocab.init(words => {
      if (statsModule)  statsModule.init(words);
      if (readerModule) readerModule.init(words);
    });
  }

  if (typeof loadSentences === 'function') loadSentences();

  const statsPanel = document.getElementById('tab-stats');
  if (statsPanel) statsModule = new StatsModule(statsPanel);

  const readerPanel = document.getElementById('tab-reader');
  if (readerPanel) readerModule = new ReaderModule(readerPanel);

  const planPanel = document.getElementById('tab-plan');
  if (planPanel) { planModule = new PlanModule(planPanel); planModule.activate(); }

  const basicsPanel = document.getElementById('tab-basics');
  if (basicsPanel) basicsModule = new BasicsModule(basicsPanel);

  const tonesPanel = document.getElementById('tab-tones');
  if (tonesPanel) tonesModule = new TonesModule(tonesPanel);

  const segmentsPanel = document.getElementById('tab-segments');
  if (segmentsPanel) segmentsModule = new SegmentsModule(segmentsPanel);

  const clozePanel = document.getElementById('tab-cloze');
  if (clozePanel) clozeModule = new ClozeModule(clozePanel);

  const grammarPanel = document.getElementById('tab-grammar');
  if (grammarPanel) grammarModule = new GrammarModule(grammarPanel);

  const chunksPanel = document.getElementById('tab-chunks');
  if (chunksPanel) chunksModule = new ChunksModule(chunksPanel);

  const listeningPanel = document.getElementById('tab-listening');
  if (listeningPanel) listeningModule = new ListeningModule(listeningPanel);

  const speakPanel = document.getElementById('tab-speak');
  if (speakPanel) speakModule = new SpeakModule(speakPanel);

  const settingsPanel = document.getElementById('tab-settings');
  if (settingsPanel) new SettingsModule(settingsPanel);

  buildBottomNav();
  updateBottomNavActive('plan');

  // One small version-marker fetch, not the whole APK — cheap enough to run
  // on every launch. No-op outside the Android app (window.AndroidUpdater
  // only exists there); Settings' manual "Check for updates" reuses this
  // same function.
  checkForAndroidUpdate();

  // Keep the focused answer field visible above the on-screen keyboard.
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }, 300);
    }
  });

  // Swipe left to advance to the next card (when a Next button is showing).
  let _sx = 0, _sy = 0, _st = 0;
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    _sx = e.touches[0].clientX; _sy = e.touches[0].clientY; _st = Date.now();
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    const dx = t.clientX - _sx, dy = t.clientY - _sy;
    if (Date.now() - _st > 600) return;
    if (dx > -60 || Math.abs(dy) > 45) return; // require a clean leftward swipe
    const next = document.querySelector('.tab-panel.active .btn-next:not(.hidden)');
    if (next) next.click();
  }, { passive: true });

  ['click', 'keydown', 'pointerdown'].forEach(ev =>
    document.addEventListener(ev, () => {
      const active = document.querySelector('.tab-btn.active')?.dataset.tab;
      if (LEARNING_TABS.has(active)) touchActivity();
    }, { passive: true })
  );

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushTime();
    else {
      const active = document.querySelector('.tab-btn.active')?.dataset.tab;
      resumeTimer(LEARNING_TABS.has(active));
    }
  });
  window.addEventListener('beforeunload', () => flushTime());

  setInterval(() => {
    if (checkGoal()) showToast('Daily goal reached!');
  }, 15000);
});

// ── Desktop header navigation ───────────────────────────
// Same reduced set as the mobile bottom nav (built from the same TAB_NAV
// array): core items inline, everything else behind a "More" dropdown —
// same reasoning as the bottom nav's More sheet, just laid out for a wide
// header instead of a thumb-reachable bottom bar.
function buildHeaderNav() {
  const nav = document.getElementById('header-tabs');
  if (!nav) return;
  const btn = t => `<button class="tab-btn${t.id === 'plan' ? ' active' : ''}" data-tab="${t.id}" type="button">${esc(t.label)}</button>`;
  const core = TAB_NAV.filter(t => t.core);
  const secondary = TAB_NAV.filter(t => !t.core);
  nav.innerHTML = core.map(btn).join('') + (secondary.length ? `
    <button class="tab-btn tabs-more-btn" type="button">More ▾</button>
    <div class="tabs-more-sheet">${secondary.map(btn).join('')}</div>
  ` : '');
  nav.querySelector('.tabs-more-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    nav.classList.toggle('tabs-more-open');
  });
  document.addEventListener('click', e => { if (!nav.contains(e.target)) nav.classList.remove('tabs-more-open'); });
}

// ── Mobile bottom navigation ───────────────────────────
// Thumb-reachable bar (shown only on narrow screens via CSS). Core tabs are
// always visible; the rest open from a "More" sheet. Buttons drive the existing
// switchTab(), so all tab logic stays in one place.
function buildBottomNav() {
  if (document.querySelector('.bottom-nav')) return;
  const btn = t => `<button class="bn-btn" data-tab="${t.id}" type="button">
      <span class="bn-ic">${t.icon}</span><span class="bn-lbl">${t.label}</span></button>`;
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.innerHTML =
    TAB_NAV.filter(t => t.core).map(btn).join('') +
    `<button class="bn-btn bn-more-btn" type="button"><span class="bn-ic">☰</span><span class="bn-lbl">More</span></button>` +
    `<div class="bn-sheet">${TAB_NAV.filter(t => !t.core).map(btn).join('')}</div>`;
  document.body.appendChild(nav);

  nav.querySelectorAll('.bn-btn[data-tab]').forEach(b =>
    b.addEventListener('click', () => { switchTab(b.dataset.tab); nav.classList.remove('more-open'); }));
  nav.querySelector('.bn-more-btn').addEventListener('click', e => {
    e.stopPropagation(); nav.classList.toggle('more-open');
  });
  document.addEventListener('click', e => { if (!nav.contains(e.target)) nav.classList.remove('more-open'); });
}

function updateBottomNavActive(tab) {
  document.querySelectorAll('.bottom-nav .bn-btn[data-tab]')
    .forEach(b => b.classList.toggle('bn-active', b.dataset.tab === tab));
}

// ── Correct-answer celebration ─────────────────────────
// A little dopamine: a haptic buzz (on supporting devices) + a confetti burst.
window.celebrateCorrect = function () {
  try { if (navigator.vibrate) navigator.vibrate([18, 22, 45]); } catch {}
  _confettiBurst();
};

function _confettiBurst() {
  const COLORS = ['#3fb950', '#ffde00', '#e03040', '#58a6ff', '#ffffff'];
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    const ang = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 130;
    p.style.setProperty('--x', `${Math.cos(ang) * dist}px`);
    p.style.setProperty('--y', `${Math.sin(ang) * dist}px`);
    p.style.setProperty('--r', `${(Math.random() * 2 - 1) * 540}deg`);
    p.style.background = COLORS[i % COLORS.length];
    p.style.animationDelay = `${Math.random() * 60}ms`;
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1000);
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--show'));
  setTimeout(() => { el.classList.remove('toast--show'); setTimeout(() => el.remove(), 400); }, 3500);
}

// ── Android in-app updates ──────────────────────────────
// window.AndroidUpdater only exists inside the native Android wrapper (see
// MainActivity.UpdateBridge) — every function here is a no-op elsewhere
// (desktop/PWA), so the rest of the app never needs to feature-detect this
// itself. Settings' "Check for updates" button calls the same two functions
// this file's auto-check-on-launch uses, so there's one code path total.
const updateState = { checked: false, available: false, latest: null, current: null, error: null };

function checkForAndroidUpdate() {
  if (window.AndroidUpdater?.checkForUpdate) window.AndroidUpdater.checkForUpdate();
}

function downloadAndroidUpdate() {
  if (window.AndroidUpdater?.downloadAndInstall) window.AndroidUpdater.downloadAndInstall();
}

// Called from MainActivity.UpdateBridge.checkForUpdate()'s background thread.
window.__onUpdateCheck = (latest, current) => {
  Object.assign(updateState, { checked: true, latest, current, available: latest > current, error: null });
  document.dispatchEvent(new CustomEvent('vn-update-status'));
  if (updateState.available) _showUpdateBanner();
};

window.__onUpdateError = (msg) => {
  Object.assign(updateState, { checked: true, error: msg });
  document.dispatchEvent(new CustomEvent('vn-update-status'));
};

window.__onUpdateDownloadStarted = () => {
  showToast('Downloading update…');
};

function _showUpdateBanner() {
  if (document.querySelector('.update-banner')) return;
  const el = document.createElement('div');
  el.className = 'update-banner';
  el.innerHTML = `
    <span>Update available (v${esc(String(updateState.latest))})</span>
    <button class="btn" id="ub-update" type="button">Update</button>
    <button class="update-banner-x" id="ub-dismiss" type="button" aria-label="Dismiss">✕</button>
  `;
  document.body.appendChild(el);
  el.querySelector('#ub-update').addEventListener('click', () => { downloadAndroidUpdate(); el.remove(); });
  el.querySelector('#ub-dismiss').addEventListener('click', () => el.remove());
}
