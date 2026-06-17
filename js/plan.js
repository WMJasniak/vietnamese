// Guided study session: ordered segments with per-segment countdowns.
// Auto-switches tabs and prompts when each segment's time elapses.
const PLAN_KEY = 'vn_plan_v2';  // bumped: v1 was a single Vocab segment

// Default plan — interleaved, evidence-based (see README "Research basis").
// Rationale:
//   - Tones first: hardest part for learners; a short blocked perceptual-training
//     warm-up (HVPT-style) before the ear tires.
//   - Vocabulary SRS: the core, highest-leverage retrieval block.
//   - Cloze + Listening: productive retrieval *in context* and dictation
//     (listening + output) — interleaving modalities aids retention.
// Reading (extensive input) is intentionally NOT in the default: it only pays
// off once you understand ~95-98% of the words (~a couple thousand), so it's
// premature for a true beginner. The Reader tab is still there to add manually
// once you have a base. Totals 30 min; SettingsModule rescales to the goal.
const DEFAULT_PLAN = [
  { tab: 'tones',     minutes: 5,  label: 'Tone training' },
  { tab: 'vocab',     minutes: 12, label: 'Vocabulary (SRS)' },
  { tab: 'cloze',     minutes: 8,  label: 'Sentences (cloze)' },
  { tab: 'listening', minutes: 5,  label: 'Listening / dictation' },
];

const TAB_LABEL = {
  basics: 'Basics', vocab: 'Vocabulary', tones: 'Tone training',
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
    return DEFAULT_PLAN.map(s => ({ ...s }));
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
            <button class="btn-ghost" id="plan-reset">Reset to default</button>
          </div>
          <p class="plan-note">
            An evidence-based beginner mix: tone training, vocabulary SRS, in-context
            cloze, dictation, and a little reading. Edit the minutes per segment as you
            like; your changes are saved locally.
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
  const target = Math.max(1, Math.round(Number(targetMinutes) || 0));
  let plan;
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
    plan = Array.isArray(raw) && raw.length ? raw : DEFAULT_PLAN.map(s => ({ ...s }));
  } catch {
    plan = DEFAULT_PLAN.map(s => ({ ...s }));
  }
  const total = plan.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  if (total <= 0) return;
  const scale = target / total;
  let acc = 0;
  plan.forEach(s => {
    const original = Number(s.minutes) || 0;
    // Preserve zeroed-out segments; round non-zero up to at least 1
    s.minutes = original > 0 ? Math.max(1, Math.round(original * scale)) : 0;
    acc += s.minutes;
  });
  // Absorb rounding drift into the largest segment so the sum is exact
  const delta = target - acc;
  if (delta !== 0) {
    let idx = 0;
    plan.forEach((s, i) => { if (s.minutes > plan[idx].minutes) idx = i; });
    plan[idx].minutes = Math.max(1, plan[idx].minutes + delta);
  }
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch {}
}
