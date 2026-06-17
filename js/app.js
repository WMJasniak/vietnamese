// Vietnamese app — tab routing + module init. Mirrors the Mandarin app's
// shape but with a leaner feature set (Plan / Vocab / Reader / Stats / Settings).
const LEARNING_TABS = new Set(['vocab', 'reader', 'tones', 'basics', 'cloze', 'listening']);

// Tab metadata for the mobile bottom navigation. `core` items sit in the bar;
// the rest live behind the "More" button.
const TAB_NAV = [
  { id: 'plan',      icon: '🗓️', label: 'Plan',   core: true },
  { id: 'vocab',     icon: '🃏', label: 'Vocab',  core: true },
  { id: 'tones',     icon: '🎵', label: 'Tones',  core: true },
  { id: 'cloze',     icon: '✏️', label: 'Cloze',  core: true },
  { id: 'listening', icon: '🎧', label: 'Listen', core: true },
  { id: 'basics',    icon: '🔤', label: 'Basics', core: false },
  { id: 'reader',    icon: '📚', label: 'Reader', core: false },
  { id: 'stats',     icon: '📊', label: 'Stats',  core: false },
  { id: 'settings',  icon: '⚙️', label: 'Settings', core: false },
];

document.addEventListener('DOMContentLoaded', () => {
  const tabBtns   = document.querySelectorAll('.tab-btn');
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
  let clozeModule = null;
  let listeningModule = null;

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const leaving  = document.querySelector('.tab-btn.active')?.dataset.tab;
      const entering = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.toggle('active', b === btn));
      tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${entering}`));

      if (LEARNING_TABS.has(leaving) && !LEARNING_TABS.has(entering)) flushTime();
      else if (!LEARNING_TABS.has(leaving) && LEARNING_TABS.has(entering)) resumeTimer();

      if (entering === 'stats'    && statsModule)    statsModule.refresh();
      if (entering === 'reader'   && readerModule)   readerModule.activate();
      if (entering === 'plan'     && planModule)     planModule.activate();
      if (entering === 'basics'   && basicsModule)   basicsModule.activate();
      if (entering === 'tones'    && tonesModule)    tonesModule.activate();
      if (entering === 'cloze'    && clozeModule)    clozeModule.activate();
      if (entering === 'listening'&& listeningModule)listeningModule.activate();

      updateBottomNavActive(entering);
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

  const clozePanel = document.getElementById('tab-cloze');
  if (clozePanel) clozeModule = new ClozeModule(clozePanel);

  const listeningPanel = document.getElementById('tab-listening');
  if (listeningPanel) listeningModule = new ListeningModule(listeningPanel);

  const settingsPanel = document.getElementById('tab-settings');
  if (settingsPanel) new SettingsModule(settingsPanel);

  buildBottomNav();
  updateBottomNavActive('plan');

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

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--show'));
  setTimeout(() => { el.classList.remove('toast--show'); setTimeout(() => el.remove(), 400); }, 3500);
}
