// Home screen / guided session engine. This *is* the app's default screen —
// the user never picks which of the 10 learning tabs to use; this module
// decides, auto-advances through them on a timer, and is the only thing
// most sessions ever need. (Still internally called "Plan"/"plan.js" for
// continuity with existing code/CSS — the user-facing label is "Home".)
//
// Design is grounded in second-language-acquisition + instructional-design
// research (see README "Research basis" and the design notes below), not a
// single source's exact numbers — no paper prescribes an exact 6-way minute
// split for this exact set of drills, so the STRUCTURE (grouping, ordering,
// stage-based input/output balance) is what's literature-grounded; the
// precise percentages are a calibrated synthesis of it.
//
//   - Single guided path, no tab-picking: menu-driven "trees" of optional
//     paths increase decision fatigue; Duolingo's own move from a free-roam
//     skill tree to one linear path was specifically to reduce that burden
//     for beginners (at the cost of power-user flexibility, which is why
//     every module is still reachable from More, just not primary).
//   - Interleaving 2 skills alternated per session is well-evidenced for
//     retention (contextual interference effect); studies showing benefits
//     used 2 alternating tasks, not many. Over-fragmenting a session into
//     many tiny slices measurably hurts novices in particular. So rather
//     than giving all 8 drills their own sliver every single day, related
//     drills share one CATEGORY slot and the specific module is chosen by
//     day-rotation (so both still get regular practice across a 2-day
//     window) or by whichever currently has content ready.
//   - Hardest-first while attention is freshest: ear-training (perception)
//     goes first, same rationale this app already used for Tones alone.
//   - Input-heavy early, shifting toward output as the learner progresses,
//     but never zero output even at the very start — Speaking gets a
//     modest, non-dominant slice from day one that grows by stage, sized
//     in the same range shadowing-dosage studies use (short and daily, not
//     one big chunk).
//   - Never schedule an empty exercise: each category is resolved to an
//     actual module right before it's shown (not all precomputed at
//     session start), checking real content availability at that moment —
//     e.g. Cloze needs previously-seen vocabulary, which may not exist yet
//     at the start of a brand-new user's first session but can exist by
//     the time the session reaches Cloze, since Vocabulary runs first and
//     seeds newly-seen words within that same session. Anything that turns
//     out to have nothing to do (including a daily new-card cap already
//     being used up) is swapped for something that always does, live.
//   - Reader (needs text you paste yourself) and Basics (a static
//     reference page, not a drill) are deliberately never auto-scheduled —
//     there's no default content for either, so putting them in a timed
//     rotation would be exactly the "nothing to do" failure this is meant
//     to avoid. Both stay reachable from More as manual/secondary tools.
// DAY_MS is already declared by srs.js (loaded earlier) — reused here.
const MIN_SEGMENT_MIN = 2;   // below this a slice is too thin to be worth a switch

// Category → planned share of the daily goal, by stage (known-word count).
// Same three stages/thresholds this app already used for Tones/Vocab/etc.
function _stageCategoryWeights() {
  const known = (typeof getStats === 'function') ? (getStats().totalKnown || 0) : 0;
  if (known < 30) return {              // Foundation — no cloze yet (nothing seen to review in context)
    ear: 25, vocab: 35, structures: 15, cloze: 0, listening: 12, speak: 13,
  };
  if (known < 300) return {             // Building
    ear: 18, vocab: 28, structures: 14, cloze: 15, listening: 12, speak: 13,
  };
  return {                              // Consolidating
    ear: 12, vocab: 24, structures: 12, cloze: 20, listening: 14, speak: 18,
  };
}

const CATEGORY_ORDER = ['ear', 'vocab', 'structures', 'cloze', 'listening', 'speak'];
// Not used for the live preview (which resolves each category to its actual
// live-data label via _resolveOrFallback so it never promises something the
// session then substitutes) — kept as the canonical "every category has a
// human label" reference, and asserted against in tests/run_tests.py.
const CATEGORY_PREVIEW_LABEL = {
  ear: 'Ear training (tones & sounds)',
  vocab: 'Vocabulary (SRS)',
  structures: 'Grammar & chunks',
  cloze: 'Sentences (cloze)',
  listening: 'Listening / dictation',
  speak: 'Speaking practice',
};

// Rotates which module fills a shared category slot by calendar day, so
// e.g. Tones and Sounds both get regular practice across a 2-day window
// without both being crammed into every single session.
function _dayParity() {
  return Math.floor(Date.now() / DAY_MS) % 2;
}

function _vocabAvailable(words) {
  if (!words?.length) return false;
  if (typeof getDueCards === 'function' && getDueCards(words).length) return true;
  if (typeof getNewCards === 'function' && getNewCards(words, 1).length) return true;
  return false;
}

function _grammarAvailable() {
  if (typeof GRAMMAR === 'undefined' || typeof _grLoad !== 'function') return false;
  const store = _grLoad();
  const now = Date.now();
  if (GRAMMAR.some(g => store[g.id] && store[g.id].nextReview <= now)) return true;
  const newAllowed = typeof _grNewAllowed === 'function' ? _grNewAllowed() > 0 : true;
  return newAllowed && GRAMMAR.some(g => !store[g.id]);
}

function _chunksAvailable() {
  if (typeof CHUNKS === 'undefined' || typeof _chLoad !== 'function') return false;
  const store = _chLoad();
  const now = Date.now();
  if (CHUNKS.some(c => store[c.id] && store[c.id].nextReview <= now)) return true;
  const newAllowed = typeof _chNewAllowed === 'function' ? _chNewAllowed() > 0 : true;
  return newAllowed && CHUNKS.some(c => !store[c.id]);
}

// A word counts as cloze-able if it's been seen AND at least one of its
// example sentences can actually be blanked (some words never appear as a
// discrete token in the sentence corpus).
function _clozeAvailable(words) {
  if (!words?.length || typeof getCardData !== 'function' || typeof getExamples !== 'function') return false;
  const seen = words.filter(w => getCardData(w.id, 'vi-en'));
  if (!seen.length) return false;
  const blank = typeof _clozeBlank === 'function' ? _clozeBlank : null;
  return seen.some(w => {
    const exs = getExamples(w.word, 3) || [];
    return exs.some(ex => blank ? blank(ex.vi, w.word.toLowerCase()) : true);
  });
}

// Resolves one category to an actual {tab,label} using LIVE state — called
// right before a segment starts, not all upfront, so availability that
// changes mid-session (Cloze unlocking after Vocab seeds seen words; a
// daily new-card cap running out) is always reflected correctly.
// Returns null when the category genuinely has nothing to offer right now.
function _resolveCategory(cat, words) {
  const parity = _dayParity();
  if (cat === 'ear') {
    return parity === 0
      ? { tab: 'tones', label: 'Tone training' }
      : { tab: 'segments', label: 'Sound contrasts' };
  }
  if (cat === 'vocab') {
    return _vocabAvailable(words) ? { tab: 'vocab', label: 'Vocabulary (SRS)' } : null;
  }
  if (cat === 'structures') {
    const gr = _grammarAvailable(), ch = _chunksAvailable();
    if (gr && ch) return parity === 0
      ? { tab: 'grammar', label: 'Grammar (SRS)' }
      : { tab: 'chunks', label: 'Chunks (SRS)' };
    if (gr) return { tab: 'grammar', label: 'Grammar (SRS)' };
    if (ch) return { tab: 'chunks', label: 'Chunks (SRS)' };
    return null;
  }
  if (cat === 'cloze') {
    return _clozeAvailable(words) ? { tab: 'cloze', label: 'Sentences (cloze)' } : null;
  }
  if (cat === 'listening') return { tab: 'listening', label: 'Listening / dictation' };
  if (cat === 'speak') return { tab: 'speak', label: 'Speaking practice' };
  return null;
}

// Listening never depends on the daily new-card cap or on anything having
// been "seen" yet (it draws from a frequency fallback pool exactly like
// Vocab's own fallback) — the one universally-safe substitute for whatever
// a category can't currently deliver.
const FALLBACK_SEGMENT = { tab: 'listening', label: 'Listening / dictation' };
function _resolveOrFallback(cat, words) {
  return _resolveCategory(cat, words) || FALLBACK_SEGMENT;
}

// Scale category weights to the daily goal, then prune any slice that ends
// up too thin to be worth a switch (folding its weight into the rest and
// re-scaling) rather than showing a string of 1-minute slivers on a short
// goal.
function _buildCategoryQueue(goalMinutes) {
  const weights = _stageCategoryWeights();
  let cats = CATEGORY_ORDER.filter(c => weights[c] > 0);
  for (let guard = 0; guard < cats.length; guard++) {
    const total = cats.reduce((a, c) => a + weights[c], 0);
    const minutesFor = c => Math.max(1, Math.round(weights[c] / total * goalMinutes));
    const thin = cats.find(c => minutesFor(c) < MIN_SEGMENT_MIN && cats.length > 1);
    if (!thin) break;
    cats = cats.filter(c => c !== thin);
  }
  const total = cats.reduce((a, c) => a + weights[c], 0) || 1;
  const list = cats.map(c => ({
    category: c,
    minutes: Math.max(1, Math.round(weights[c] / total * goalMinutes)),
  }));
  // Rounding drift goes to the largest slice so the total is exact.
  const drift = goalMinutes - list.reduce((a, s) => a + s.minutes, 0);
  if (drift !== 0 && list.length) {
    let idx = 0;
    list.forEach((s, i) => { if (s.minutes > list[idx].minutes) idx = i; });
    list[idx].minutes = Math.max(1, list[idx].minutes + drift);
  }
  return list;
}

class PlanModule {
  constructor(container) {
    this.container = container;
    this._session = null;    // { queue, current, elapsedSec, totalSec, paused, lastTick, doneCount, totalCount }
    this._words = [];
    this._ready = false;
    this._lastActivity = Date.now();
    this._tickHandle = null;
    this._build();

    ['click', 'keydown', 'pointerdown'].forEach(ev =>
      document.addEventListener(ev, () => { this._lastActivity = Date.now(); }, { passive: true }));
  }

  init() {}

  activate() {
    if (this._ready) { this._render(); return; }
    const loadWords = typeof loadVocabulary === 'function' ? loadVocabulary() : Promise.resolve([]);
    const loadSents = typeof loadSentences === 'function' ? loadSentences() : Promise.resolve();
    Promise.all([loadWords, loadSents]).then(([words]) => {
      this._words = words || [];
      this._ready = true;
      this._render();
    }).catch(() => { this._ready = true; this._render(); });
  }

  _build() {
    this.container.innerHTML = `<div id="plan-root"></div>`;
    this.root = this.container.querySelector('#plan-root');
    this._buildSessionBar();
  }

  // A session keeps running while the user is off on whatever tab it just
  // switched them to (that's the whole point) — which means the Home panel
  // itself, and the pause/skip/stop controls that used to live only inside
  // it, go invisible the moment the session switches tabs. Without this,
  // there'd be no way to pause or stop a running session except navigating
  // back to Home first. This bar lives outside any tab-panel (appended
  // directly to <body>) so it stays visible across every tab switch.
  _buildSessionBar() {
    if (document.getElementById('session-bar')) {
      this.bar = document.getElementById('session-bar');
      return;
    }
    const bar = document.createElement('div');
    bar.id = 'session-bar';
    bar.className = 'session-bar hidden';
    bar.innerHTML = `
      <span class="session-bar-label" id="sb-label"></span>
      <span class="session-bar-time" id="sb-time"></span>
      <button class="session-bar-btn" id="sb-pause" type="button" aria-label="Pause">⏸</button>
      <button class="session-bar-btn" id="sb-skip" type="button" aria-label="Skip ahead">⏭</button>
      <button class="session-bar-btn" id="sb-stop" type="button" aria-label="Stop session">✕</button>
    `;
    document.body.appendChild(bar);
    bar.querySelector('#sb-pause').addEventListener('click', () => this._togglePause());
    bar.querySelector('#sb-skip').addEventListener('click', () => this._advance());
    bar.querySelector('#sb-stop').addEventListener('click', () => this._stop());
    this.bar = bar;
  }

  _updateSessionBar() {
    if (!this.bar) return;
    const s = this._session;
    document.body.classList.toggle('session-active', !!s);
    this.bar.classList.toggle('hidden', !s);
    if (!s) return;
    this.bar.querySelector('#sb-label').textContent = s.current.label;
    this.bar.querySelector('#sb-time').textContent = _fmtMS(Math.max(0, s.totalSec - s.elapsedSec));
    this.bar.querySelector('#sb-pause').textContent = s.paused ? '▶' : '⏸';
    this.bar.querySelector('#sb-pause').setAttribute('aria-label', s.paused ? 'Resume' : 'Pause');
  }

  _goalMinutes() {
    return (typeof getSettings === 'function' ? getSettings().dailyGoalMins : null) || 30;
  }

  _render() {
    if (!this._ready) {
      this.root.innerHTML = `<p class="stats-placeholder">Loading…</p>`;
      return;
    }
    const s = this._session;
    if (s) {
      const remaining = Math.max(0, s.totalSec - s.elapsedSec);
      this.root.innerHTML = `
        <section class="plan-session">
          <div class="plan-session-h">
            <span class="plan-session-now">Now: <strong>${esc(s.current.label)}</strong></span>
            <span class="plan-session-time" id="plan-time">${_fmtMS(remaining)}</span>
          </div>
          <div class="plan-progress"><div class="plan-progress-bar" style="width:${
            s.totalSec ? (100 * s.elapsedSec / s.totalSec).toFixed(1) : 0
          }%"></div></div>
          <div class="plan-session-sub">Segment ${s.doneCount + 1} of ${s.totalCount}</div>
          <div class="plan-session-actions">
            <button class="btn-ghost" id="plan-pause">${s.paused ? '▶ Resume' : '⏸ Pause'}</button>
            <button class="btn-ghost" id="plan-skip">Skip ahead</button>
            <button class="btn-ghost" id="plan-stop">Stop session</button>
          </div>
        </section>
      `;
      this.root.querySelector('#plan-pause').addEventListener('click', () => this._togglePause());
      this.root.querySelector('#plan-skip').addEventListener('click', () => this._advance());
      this.root.querySelector('#plan-stop').addEventListener('click', () => this._stop());
    } else {
      const goal = this._goalMinutes();
      // Resolved with the exact same function (and current data) the
      // session itself uses, not just the raw category weights — so this
      // preview never promises e.g. "Cloze" and then quietly hands the
      // learner Listening instead once the session actually starts.
      const preview = _buildCategoryQueue(goal).map(seg => ({
        label: _resolveOrFallback(seg.category, this._words).label,
        minutes: seg.minutes,
      }));
      this.root.innerHTML = `
        <section class="plan-setup">
          <div class="plan-h">
            <div class="plan-title">Ready to learn?</div>
            <div class="plan-total">${goal} min today</div>
          </div>
          <ol class="plan-list">
            ${preview.map(seg => `
              <li class="plan-li">
                <span class="plan-li-name">${esc(seg.label)}</span>
                <span class="plan-li-time">~${seg.minutes} min</span>
              </li>
            `).join('')}
          </ol>
          <div class="plan-setup-actions">
            <button class="btn" id="plan-start">▶ Start learning</button>
          </div>
          <p class="plan-note">
            Auto-tuned to your level and interleaved for retention — heavier on
            listening/perception and vocabulary early, shifting toward sentences
            and speaking as you learn more. Nothing here is ever scheduled with
            nothing to practice; nothing to configure either — just start.
            Want a longer or shorter session? Change it in Settings.
          </p>
        </section>
      `;
      this.root.querySelector('#plan-start').addEventListener('click', () => this._start());
    }
  }

  _start() {
    const goal = this._goalMinutes();
    const queue = _buildCategoryQueue(goal);
    if (!queue.length) { showToast('Nothing to schedule yet — try Vocab directly.'); return; }
    const first = queue.shift();
    this._session = {
      queue,
      current: { ..._resolveOrFallback(first.category, this._words), minutes: first.minutes },
      elapsedSec: 0,
      totalSec: first.minutes * 60,
      paused: false,
      lastTick: Date.now(),
      doneCount: 0,
      totalCount: queue.length + 1,
    };
    this._lastActivity = Date.now();
    this._switchToCurrentTab();
    this._startTicker();
    this._render();
    this._updateSessionBar();
  }

  _stop() {
    if (this._session && !confirm('End this session?')) return;
    this._session = null;
    this._stopTicker();
    // Deliberately doesn't force a tab switch like session-complete does —
    // the user chose to stop from whatever tab they were on and may well
    // want to keep freely practicing right there without the timer.
    showToast('Session stopped');
    this._render();
    this._updateSessionBar();
  }

  _togglePause() {
    if (!this._session) return;
    this._session.paused = !this._session.paused;
    this._session.lastTick = Date.now();
    this._render();
    this._updateSessionBar();
  }

  _advance() {
    if (!this._session) return;
    const s = this._session;
    if (!s.queue.length) {
      this._session = null;
      this._stopTicker();
      showToast('Session complete! 🎉');
      // Otherwise the user is left stranded on whatever drill tab the last
      // segment happened to be, with no visible way back to "session done,
      // here's your recap" — the whole point of the persistent bar was to
      // keep them off Home during the session, but they should land back
      // on it once there's no session left to show a bar for.
      if (typeof window.switchTab === 'function') window.switchTab('plan');
      this._render();
      this._updateSessionBar();
      return;
    }
    const next = s.queue.shift();
    s.current = { ..._resolveOrFallback(next.category, this._words), minutes: next.minutes };
    s.elapsedSec = 0;
    s.totalSec = next.minutes * 60;
    s.paused = false;
    s.lastTick = Date.now();
    s.doneCount++;
    this._lastActivity = Date.now();
    this._switchToCurrentTab();
    showToast(`Next: ${s.current.label}`);
    this._render();
    this._updateSessionBar();
  }

  _switchToCurrentTab() {
    if (!this._session) return;
    if (typeof window.switchTab === 'function') window.switchTab(this._session.current.tab);
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

    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    const onCorrectTab = activeTab === s.current.tab;
    const visible = !document.hidden;
    const active = (now - this._lastActivity) < IDLE_LIMIT_MS;

    if (!s.paused && visible && onCorrectTab && active) {
      s.elapsedSec = Math.min(s.totalSec, s.elapsedSec + dt);
    }

    if (s.elapsedSec >= s.totalSec) { this._advance(); return; }

    const t = this.root.querySelector('#plan-time');
    if (t) t.textContent = _fmtMS(Math.max(0, s.totalSec - s.elapsedSec));
    const bar = this.root.querySelector('.plan-progress-bar');
    if (bar) bar.style.width = `${(100 * s.elapsedSec / s.totalSec).toFixed(1)}%`;
    this._updateSessionBar();
  }
}

const IDLE_LIMIT_MS = 90_000;

function _fmtMS(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
