// Guided study session: ordered segments with per-segment countdowns.
// Auto-switches tabs and prompts when each segment's time elapses.
const PLAN_KEY = 'vn_plan_v3';  // v1: single Vocab; v2: interleaved; v3: + Grammar

// Default plan — interleaved, evidence-based, and STAGE-AWARE. The mix shifts
// with how many words you know, because some drills have nothing to do early on:
//   - Foundation (<30 words known): heavy tones + vocabulary; no cloze yet
//     (cloze reviews words you've already learned — empty at the start) and no
//     reading (extensive input only pays off near ~95-98% coverage).
//   - Building (<300): introduce cloze; balanced interleaving of modalities.
//   - Consolidating (300+): more cloze/listening and a little reading.
// Rationale per block: tones first (hardest, HVPT warm-up); vocab SRS is the
// highest-leverage retrieval; cloze + listening are productive in-context
// retrieval and dictation. Base templates total 30 min and are scaled to the
// user's daily goal.
function _stagePlan() {
  const known = (typeof getStats === 'function') ? (getStats().totalKnown || 0) : 0;
  if (known < 30) return [            // Foundation
    { tab: 'tones',     minutes: 7,  label: 'Tone training' },
    { tab: 'vocab',     minutes: 16, label: 'Vocabulary (SRS)' },
    { tab: 'grammar',   minutes: 4,  label: 'Grammar (SRS)' },
    { tab: 'listening', minutes: 3,  label: 'Listening / dictation' },
  ];
  if (known < 300) return [           // Building
    { tab: 'tones',     minutes: 5,  label: 'Tone training' },
    { tab: 'vocab',     minutes: 11, label: 'Vocabulary (SRS)' },
    { tab: 'grammar',   minutes: 4,  label: 'Grammar (SRS)' },
    { tab: 'cloze',     minutes: 6,  label: 'Sentences (cloze)' },
    { tab: 'listening', minutes: 4,  label: 'Listening / dictation' },
  ];
  return [                            // Consolidating
    { tab: 'tones',     minutes: 3,  label: 'Tone training' },
    { tab: 'vocab',     minutes: 9,  label: 'Vocabulary (SRS)' },
    { tab: 'grammar',   minutes: 4,  label: 'Grammar (SRS)' },
    { tab: 'cloze',     minutes: 7,  label: 'Sentences (cloze)' },
    { tab: 'listening', minutes: 4,  label: 'Listening / dictation' },
    { tab: 'reader',    minutes: 3,  label: 'Reading' },
  ];
}

// Scale a plan's minutes proportionally so they sum to `target` (preserving any
// zeroed-out segments; non-zero segments stay >= 1; rounding drift goes to the
// largest segment so the total is exact).
function _scalePlan(plan, target) {
  target = Math.max(1, Math.round(Number(target) || 0));
  const list = plan.map(s => ({ ...s }));
  const total = list.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  if (total <= 0) return list;
  const scale = target / total;
  let acc = 0;
  list.forEach(s => {
    const o = Number(s.minutes) || 0;
    s.minutes = o > 0 ? Math.max(1, Math.round(o * scale)) : 0;
    acc += s.minutes;
  });
  const delta = target - acc;
  if (delta !== 0) {
    let idx = 0;
    list.forEach((s, i) => { if (s.minutes > list[idx].minutes) idx = i; });
    list[idx].minutes = Math.max(1, list[idx].minutes + delta);
  }
  return list;
}

// The default plan: the stage-appropriate template scaled to the daily goal.
function optimalPlan() {
  const goal = (typeof getSettings === 'function') ? (getSettings().dailyGoalMins || 30) : 30;
  return _scalePlan(_stagePlan(), goal);
}

const TAB_LABEL = {
  basics: 'Basics', vocab: 'Vocabulary', tones: 'Tone training', grammar: 'Grammar (SRS)',
  cloze: 'Sentences (cloze)', listening: 'Listening / dictation', reader: 'Reader',
};

const IDLE_LIMIT_MS = 90_000;

class PlanModule {
  constructor(container) {
    this.container = container;
    this._session = null;          // { index, elapsedSec, totalSec, paused, lastTick }
    this._lastActivity = Date.now();
    this._tickHandle = null;
    this._build();

    // Treat any user input as activity for the segment timer
    ['click', 'keydown', 'pointerdown'].forEach(ev =>
      document.addEventListener(ev, () => { this._lastActivity = Date.now(); }, { passive: true }));
  }

  init() { /* PlanModule needs no vocab data */ }

  activate() { this._render(); }

  _loadPlan() {
    try {
      const raw = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
      if (Array.isArray(raw) && raw.length) return raw;
    } catch {}
    return optimalPlan();
  }

  _savePlan(plan) {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch {}
  }

  _resetPlan() {
    try { localStorage.removeItem(PLAN_KEY); } catch {}
  }

  _build() {
    this.container.innerHTML = `<div id="plan-root"></div>`;
    this.root = this.container.querySelector('#plan-root');
  }

  _render() {
    const plan = this._loadPlan();
    const total = plan.reduce((a, s) => a + s.minutes, 0);
    const s = this._session;

    if (s) {
      // Active session view
      const cur = plan[s.index];
      const remaining = Math.max(0, s.totalSec - s.elapsedSec);
      this.root.innerHTML = `
        <section class="plan-session">
          <div class="plan-session-h">
            <span class="plan-session-now">Now: <strong>${cur ? cur.label : '—'}</strong></span>
            <span class="plan-session-time" id="plan-time">${_fmtMS(remaining)}</span>
          </div>
          <div class="plan-progress"><div class="plan-progress-bar" style="width:${
            s.totalSec ? (100 * s.elapsedSec / s.totalSec).toFixed(1) : 0
          }%"></div></div>
          <div class="plan-session-actions">
            <button class="btn-ghost" id="plan-pause">${s.paused ? '▶ Resume' : '⏸ Pause'}</button>
            <button class="btn-ghost" id="plan-extend">+2 min</button>
            <button class="btn-ghost" id="plan-skip">Skip ahead</button>
            <button class="btn-ghost" id="plan-stop">Stop session</button>
          </div>
          <ol class="plan-list plan-list--running">
            ${plan.map((seg, i) => `
              <li class="${i === s.index ? 'plan-li plan-li--cur' : i < s.index ? 'plan-li plan-li--done' : 'plan-li'}">
                <span class="plan-li-name">${seg.label}</span>
                <span class="plan-li-time">${seg.minutes} min</span>
              </li>
            `).join('')}
          </ol>
        </section>
      `;
      this.root.querySelector('#plan-pause').addEventListener('click', () => this._togglePause());
      this.root.querySelector('#plan-extend').addEventListener('click', () => this._extend(2));
      this.root.querySelector('#plan-skip').addEventListener('click', () => this._advance());
      this.root.querySelector('#plan-stop').addEventListener('click', () => this._stop());
    } else {
      // Idle / setup view
      this.root.innerHTML = `
        <section class="plan-setup">
          <div class="plan-h">
            <div class="plan-title">Today's plan</div>
            <div class="plan-total">${total} min total</div>
          </div>
          <ol class="plan-list plan-list--edit" id="plan-list"></ol>
          <div class="plan-setup-actions">
            <button class="btn" id="plan-start">▶ Start session</button>
            <button class="btn-ghost" id="plan-reset">Reset to optimal</button>
          </div>
          <p class="plan-note">
            Auto-tuned to your level: more tones &amp; vocabulary now, with cloze,
            listening and reading growing as you learn. Edit the minutes per segment
            anytime (saved locally), or tap “Reset to optimal” to retune for your
            current level.
          </p>
        </section>
      `;
      const list = this.root.querySelector('#plan-list');
      list.innerHTML = plan.map((seg, i) => `
        <li class="plan-li plan-li--edit">
          <span class="plan-li-name">${seg.label}</span>
          <span class="plan-li-edit">
            <input type="number" class="plan-mins" data-i="${i}"
              min="0" max="120" step="1" value="${seg.minutes}"> min
          </span>
        </li>
      `).join('');
      list.querySelectorAll('.plan-mins').forEach(inp => {
        inp.addEventListener('change', e => this._updateMins(Number(e.target.dataset.i), e.target.value));
      });
      this.root.querySelector('#plan-start').addEventListener('click', () => this._start());
      this.root.querySelector('#plan-reset').addEventListener('click', () => {
        this._resetPlan();
        this._render();
      });
    }
  }

  _updateMins(i, raw) {
    const plan = this._loadPlan();
    if (!plan[i]) return;
    const n = Math.max(0, Math.min(120, Number(raw) || 0));
    plan[i].minutes = n;
    this._savePlan(plan);
    this._render();
  }

  _start() {
    const plan = this._loadPlan().filter(s => s.minutes > 0);
    if (!plan.length) { alert('Add some minutes to at least one segment first.'); return; }
    // Persist filtered plan so session indices stay in sync if user re-renders
    this._savePlan(plan);
    this._session = {
      index: 0,
      elapsedSec: 0,
      totalSec: plan[0].minutes * 60,
      paused: false,
      lastTick: Date.now(),
    };
    this._lastActivity = Date.now();
    this._switchToCurrentTab();
    this._startTicker();
    this._render();
  }

  _stop() {
    if (this._session && !confirm('End this session?')) return;
    this._session = null;
    this._stopTicker();
    this._render();
  }

  _togglePause() {
    if (!this._session) return;
    this._session.paused = !this._session.paused;
    this._session.lastTick = Date.now();
    this._render();
  }

  _extend(minutes) {
    if (!this._session) return;
    this._session.totalSec += minutes * 60;
    this._render();
  }

  _advance() {
    if (!this._session) return;
    const plan = this._loadPlan();
    const nextIdx = this._session.index + 1;
    if (nextIdx >= plan.length) {
      this._session = null;
      this._stopTicker();
      showToast('Session complete! 🎉');
      this._render();
      return;
    }
    this._session.index = nextIdx;
    this._session.elapsedSec = 0;
    this._session.totalSec = plan[nextIdx].minutes * 60;
    this._session.paused = false;
    this._session.lastTick = Date.now();
    this._lastActivity = Date.now();
    this._switchToCurrentTab();
    showToast(`Next: ${plan[nextIdx].label}`);
    this._render();
  }

  _switchToCurrentTab() {
    if (!this._session) return;
    const plan = this._loadPlan();
    const cur = plan[this._session.index];
    if (cur && typeof window.switchTab === 'function') window.switchTab(cur.tab);
  }

  _startTicker() {
    this._stopTicker();
    this._tickHandle = setInterval(() => this._tick(), 1000);
  }

  _stopTicker() {
    if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null; }
  }

  _tick() {
    const s = this._session;
    if (!s) return;
    const now = Date.now();
    const dt = (now - s.lastTick) / 1000;
    s.lastTick = now;

    // Only accumulate time when:
    //   - session not paused
    //   - document visible
    //   - user is on the segment's tab (encourages staying with the drill)
    //   - user was active recently
    const plan = this._loadPlan();
    const cur = plan[s.index];
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    const onCorrectTab = cur && activeTab === cur.tab;
    const visible = !document.hidden;
    const active  = (now - this._lastActivity) < IDLE_LIMIT_MS;

    if (!s.paused && visible && onCorrectTab && active) {
      s.elapsedSec = Math.min(s.totalSec, s.elapsedSec + dt);
    }

    if (s.elapsedSec >= s.totalSec) {
      // Segment done — auto-advance
      this._advance();
      return;
    }

    // Cheap render: update the time + bar in place instead of full re-render
    const t = this.root.querySelector('#plan-time');
    if (t) t.textContent = _fmtMS(Math.max(0, s.totalSec - s.elapsedSec));
    const bar = this.root.querySelector('.plan-progress-bar');
    if (bar) bar.style.width = `${(100 * s.elapsedSec / s.totalSec).toFixed(1)}%`;
  }
}

function _fmtMS(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Scales every saved Plan segment's minutes proportionally so the total equals
// `targetMinutes`. Called from SettingsModule when the daily goal changes, so
// the Plan stays in sync with the user's intended study time.
function rescalePlanToMinutes(targetMinutes) {
  let base = null;
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
    if (Array.isArray(raw) && raw.length) base = raw;
  } catch {}
  if (!base) base = _stagePlan();
  const scaled = _scalePlan(base, targetMinutes);
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(scaled)); } catch {}
}
