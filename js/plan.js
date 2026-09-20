// Home screen / guided session engine. This *is* the app's default screen —
// the user never picks which of the 10 learning tabs to use, never sees a
// "ready to start?" gate, and never watches a countdown: opening Home drops
// straight into the current exercise, and finishing one drops straight into
// the next. (Still internally called "Plan"/"plan.js" for continuity with
// existing code/CSS — the user-facing label is "Home".)
//
// Design is grounded in second-language-acquisition + instructional-design
// research (see README "Research basis" and the design notes below), not a
// single source's exact numbers — no paper prescribes an exact 6-way minute
// split for this exact set of drills, so the STRUCTURE (grouping, ordering,
// stage-based input/output balance) is what's literature-grounded; the
// precise percentages are a calibrated synthesis of it.
//
//   - Single guided path, no tab-picking, no start button: menu-driven
//     "trees" of optional paths and pre-start gates both add decision
//     fatigue/friction before the learner even begins — Duolingo's own move
//     from a free-roam skill tree to one linear path was specifically to cut
//     that burden for beginners (at the cost of power-user flexibility,
//     which is why every module is still reachable from More, just not
//     primary).
//   - Never interrupt mid-question: earlier versions force-switched category
//     the instant a time budget elapsed, which could yank the screen away
//     mid-answer. Now a segment only ends at a boundary the learner
//     themselves creates (clicking "Next →" once they've finished the
//     current item) — see _installAdvanceGate. The time budget only decides
//     when the *next* such click should be redirected into a new category
//     instead of the same module's own next question.
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
//   - The daily goal shapes proportions and drives the progress bar, but
//     doesn't stop the session — once the built queue is exhausted the
//     goal is (re-)checked (a one-time celebratory toast the first time
//     it's crossed each day) and a fresh queue is built, so there's always
//     a next exercise rather than a dead end.
//   - Reader (needs text you paste yourself) and Basics (a static
//     reference page, not a drill) are deliberately never auto-scheduled —
//     there's no default content for either, so putting them in a timed
//     rotation would be exactly the "nothing to do" failure this is meant
//     to avoid. Both stay reachable from More as manual/secondary tools.
//   - The only persistent UI is a daily-goal progress bar — no exercise
//     label (it'd keep naming a drill you're not looking at once you
//     switch to Stats/Settings/another drill) and no pause/skip/stop.
//     Nothing here needs manual pausing (time only counts toward the
//     current category while you're actually on it — see _tick) or manual
//     skipping (More reaches every drill directly) or stopping (the queue
//     never dead-ends, so there's nothing to end).
// DAY_MS is already declared by srs.js (loaded earlier) — reused here.
const MIN_SEGMENT_MIN = 2;   // below this a slice is too thin to be worth a switch
// A segment becomes eligible to hand off to the next category slightly
// before its nominal budget is up. Since the actual handoff now waits for
// the learner's own next "Next →" click rather than firing immediately,
// that wait itself eats into the segment's real length — starting the
// clock a bit early keeps the *average* segment length close to what was
// actually planned instead of consistently running over.
const EARLY_ADVANCE_BUFFER_SEC = 12;

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
// Kept as the canonical "every category has a human label" reference, and
// asserted against in tests/run_tests.py.
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
    this._session = null;    // { queue, current, elapsedSec, totalSec, paused, lastTick, pendingAdvance }
    this._words = [];
    this._ready = false;
    this._lastActivity = Date.now();
    this._tickHandle = null;
    this._build();
    this._installAdvanceGate();

    ['click', 'keydown', 'pointerdown'].forEach(ev =>
      document.addEventListener(ev, () => { this._lastActivity = Date.now(); }, { passive: true }));
  }

  init() {}

  activate() {
    if (this._ready) { this._enterOrResume(); return; }
    const loadWords = typeof loadVocabulary === 'function' ? loadVocabulary() : Promise.resolve([]);
    const loadSents = typeof loadSentences === 'function' ? loadSentences() : Promise.resolve();
    Promise.all([loadWords, loadSents]).then(([words]) => {
      this._words = words || [];
      this._ready = true;
      this._enterOrResume();
    }).catch(() => { this._ready = true; this._enterOrResume(); });
  }

  // Home has no screen of its own to look at: landing here either resumes
  // whatever exercise is already running or starts the next one — either
  // way the learner ends up looking at a drill, never a menu.
  _enterOrResume() {
    if (this._session) { this._switchToCurrentTab(); this._render(); return; }
    this._start();
  }

  _build() {
    this.container.innerHTML = `<div id="plan-root"></div>`;
    this.root = this.container.querySelector('#plan-root');
    this._buildSessionBar();
  }

  // A daily-goal progress bar, nothing else — no exercise label (it'd keep
  // naming whatever drill is running even while looking at Stats/Settings,
  // implying you were still mid-exercise there) and no pause/skip/stop
  // (the queue already never interrupts mid-question and never dead-ends,
  // so there's nothing those controls would meaningfully do; leaving one
  // drill for another is just using More). Lives outside any tab-panel
  // (appended directly to <body>) so it stays visible across every tab.
  _buildSessionBar() {
    if (document.getElementById('session-bar')) {
      this.bar = document.getElementById('session-bar');
      return;
    }
    const bar = document.createElement('div');
    bar.id = 'session-bar';
    bar.className = 'session-bar hidden';
    bar.title = "Today's progress toward your daily goal";
    bar.innerHTML = `<div class="sb-goal-fill" id="sb-goal-fill"></div>`;
    document.body.appendChild(bar);
    this.bar = bar;
  }

  _updateSessionBar() {
    if (!this.bar) return;
    const s = this._session;
    document.body.classList.toggle('session-active', !!s);
    this.bar.classList.toggle('hidden', !s);
    if (!s) return;
    const g = (typeof getGoalStats === 'function') ? getGoalStats() : null;
    if (g) {
      const pct = g.goalSecs ? Math.min(100, 100 * g.today / g.goalSecs) : 0;
      this.bar.querySelector('#sb-goal-fill').style.width = `${pct.toFixed(1)}%`;
    }
  }

  _goalMinutes() {
    return (typeof getSettings === 'function' ? getSettings().dailyGoalMins : null) || 30;
  }

  // Home's own panel is only ever visible for an instant (if at all) — it
  // always hands off straight to the drill tab currently in session. This
  // is just what's briefly underneath that handoff, or shown while the
  // very first load is still in flight.
  _render() {
    this.root.innerHTML = `<p class="stats-placeholder">${this._ready ? 'Loading your next exercise…' : 'Loading…'}</p>`;
  }

  _start() {
    const goal = this._goalMinutes();
    const queue = _buildCategoryQueue(goal);
    if (!queue.length) { showToast('Nothing to practice yet — try Vocab directly.'); return; }
    const first = queue.shift();
    this._session = {
      queue,
      current: { ..._resolveOrFallback(first.category, this._words), minutes: first.minutes },
      elapsedSec: 0,
      totalSec: first.minutes * 60,
      lastTick: Date.now(),
      pendingAdvance: false,
    };
    this._lastActivity = Date.now();
    this._switchToCurrentTab();
    this._startTicker();
    this._render();
    this._updateSessionBar();
  }

  // Moves to the next category, once the learner has finished the current
  // item and clicked its own "Next →" (see _installAdvanceGate — this is
  // never called on a raw timer). The queue never truly runs out — once
  // empty it's rebuilt from the daily goal, so there's always a next
  // exercise; the goal itself is only (re-)checked here for the one-time
  // celebratory toast, not as a stopping point.
  _advance() {
    if (!this._session) return;
    const s = this._session;
    if (!s.queue.length) {
      if (typeof checkGoal === 'function' && checkGoal()) {
        showToast('Daily goal complete! 🎉 Keep going whenever you like.');
      }
      s.queue = _buildCategoryQueue(this._goalMinutes());
      if (!s.queue.length) s.queue = [{ category: 'listening', minutes: this._goalMinutes() || 10 }];
    }
    const next = s.queue.shift();
    s.current = { ..._resolveOrFallback(next.category, this._words), minutes: next.minutes };
    s.elapsedSec = 0;
    s.totalSec = next.minutes * 60;
    s.pendingAdvance = false;
    s.lastTick = Date.now();
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

  // Intercepts the learner's own "Next →" click (or its swipe/keyboard
  // equivalents, which all dispatch through the same button) once the
  // current segment's time is up, redirecting straight into the next
  // category instead of letting the module load another question in the
  // same one. Registered on the capture phase so it runs before the
  // module's own click handler, and stops the event there — the module
  // never sees the click, so it's left showing the last item's feedback
  // for the instant before the tab switch replaces it. This is the only
  // place a segment ever ends automatically: never on a raw timer, always
  // on a boundary the learner just created themselves.
  _installAdvanceGate() {
    document.addEventListener('click', (e) => {
      const s = this._session;
      if (!s || !s.pendingAdvance) return;
      const btn = e.target.closest?.('.btn-next:not(.hidden)');
      if (!btn) return;
      const panel = btn.closest('.tab-panel');
      if (!panel || panel.id !== `tab-${s.current.tab}` || !panel.classList.contains('active')) return;
      e.preventDefault();
      e.stopPropagation();
      this._advance();
    }, true);
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
    // Clamped so a clock that appears to move backward (DST fallback, a
    // manual/NTP time correction) can't drive elapsedSec negative — worst
    // case that tick just contributes nothing, never a wrong direction.
    const dt = Math.max(0, (now - s.lastTick) / 1000);
    s.lastTick = now;

    // Only counts toward the current category's budget while the learner is
    // actually looking at it — switching to Stats/Settings/another drill
    // (onCorrectTab false), backgrounding the app (visible false), or
    // sitting idle (active false) all pause accrual with no separate pause
    // control needed for it.
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    const onCorrectTab = activeTab === s.current.tab;
    const visible = !document.hidden;
    const active = (now - this._lastActivity) < IDLE_LIMIT_MS;

    if (visible && onCorrectTab && active) {
      s.elapsedSec = Math.min(s.totalSec, s.elapsedSec + dt);
    }

    if (!s.pendingAdvance && s.elapsedSec >= Math.max(0, s.totalSec - EARLY_ADVANCE_BUFFER_SEC)) {
      s.pendingAdvance = true;
    }

    this._updateSessionBar();
  }
}

const IDLE_LIMIT_MS = 90_000;
