// Spaced repetition system — minimal FSRS (Difficulty/Stability/Retrievability).
// Reference: Ye 2022 "A Stochastic Shortest Path Algorithm for Optimizing
// Spaced Repetition Scheduling" (ACM KDD); FSRS-4.5 / FSRS-5 default weights.
// Answer checking is automatic (no Again/Hard/Good/Easy buttons anywhere in
// the UI), so the 4-point rating FSRS expects is inferred rather than typed:
// wrong -> Again; a card just missed and got right again this session ->
// capped at Hard; otherwise Hard/Good/Easy come from how fast the correct
// answer came relative to the learner's own recent typing speed for that
// kind of card (see inferRating below). Response latency reliably tracks
// retrieval fluency/confidence in the cognitive-psychology literature, but
// this is a proxy for self-rated confidence, not literally what FSRS was
// validated against.
const PROGRESS_KEY = 'vn_progress_v1';
const PROGRESS_KEY_OLD = 'vn_progress_legacy';
const DAILY_KEY = 'vn_daily_v1';
const NEW_PER_DAY_DEFAULT = 10;
function _newPerDay() {
  const n = Number(getSettings().newPerDay);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NEW_PER_DAY_DEFAULT;
}
const DAY_MS = 86_400_000;

// FSRS-5 default weights (https://github.com/open-spaced-repetition/fsrs4anki)
// Indices match the published algorithm so the formulas read cleanly.
const W = [
  0.40255, 1.18385, 3.173, 15.69105, // w[0..3]   initial S per rating 1..4
  7.1949, 0.5345,                    // w[4..5]   init difficulty params
  1.4604, 0.0046,                    // w[6..7]   difficulty update + mean reversion
  1.54575, 0.1192, 1.01925,          // w[8..10]  recall-stability growth
  1.9395, 0.11, 0.29605, 2.2698,     // w[11..14] forget-stability (lapse)
  0.2315, 2.9898,                    // w[15..16] Hard penalty / Easy bonus
  0.51655, 0.6621,                   // w[17..18] (short-term/same-day, unused here)
];
const FACTOR = 19 / 81; // FSRS-4.5/5 forgetting-curve factor
const DECAY  = -0.5;    // FSRS-4.5/5 forgetting-curve decay exponent
const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

let _progress = null;
let _daily = null;

function _migrateFromV1(v1) {
  // Translate legacy {streak, interval, nextReview, ...} into DSR fields.
  // We keep nextReview as-is so today's due list doesn't suddenly change;
  // S becomes the previous interval (or 1 day for unseen progress), D starts at 5.
  const out = {};
  const now = Date.now();
  for (const [k, c] of Object.entries(v1 || {})) {
    if (!c) continue;
    const S = Math.max(1, Number(c.interval) || 1);
    const lastReview = (c.nextReview || now) - S * DAY_MS;
    out[k] = {
      D: 5.0,
      S,
      lastReview,
      nextReview: c.nextReview || now,
      reps: (c.correctCount || 0) + (c.incorrectCount || 0),
      lapses: c.incorrectCount || 0,
    };
  }
  return out;
}

function _loadProgress() {
  if (_progress) return;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw !== null) { _progress = JSON.parse(raw); return; }
    // First load on new version — migrate from v1 if present.
    const old = JSON.parse(localStorage.getItem(PROGRESS_KEY_OLD) || 'null');
    _progress = old ? _migrateFromV1(old) : {};
    if (old) _saveProgress();   // persist the migration immediately
  } catch { _progress = {}; }
}

function _loadDaily() {
  if (_daily) return;
  const today = new Date().toDateString();
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
    _daily = raw.date === today ? raw : { date: today, newCount: 0, reviewed: 0, correct: 0 };
  } catch {
    _daily = { date: new Date().toDateString(), newCount: 0, reviewed: 0, correct: 0 };
  }
}

function _saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(_progress)); } catch {}
}

function _saveDaily() {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(_daily)); } catch {}
}

function _key(wordId, dir) { return `${wordId}\x00${dir}`; }

// ── FSRS math ───────────────────────────────────────
function _clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

// Retrievability: predicted recall probability after `t` days, given stability S.
function _retrievability(t, S) {
  if (S <= 0) return 1;
  return Math.pow(1 + FACTOR * t / S, DECAY);
}

// Solve _retrievability(I, S) = target for I, in days.
function _intervalForTarget(S, target) {
  return S * (Math.pow(target, 1 / DECAY) - 1) / FACTOR;
}

function _initDifficulty(rating) {
  const d = W[4] - Math.exp(W[5] * (rating - 1)) + 1;
  return _clamp(d, 1, 10);
}

// Mean-revert difficulty toward init_d(EASY) (the "easy" anchor in FSRS).
// The (10-D)/9 term damps the delta as D approaches its ceiling (a card
// that's already near-maximum difficulty shouldn't jump the same fixed
// amount per fail as an easy one does) — only visible once ratings other
// than Good/Again exist, since delta is 0 for Good regardless.
function _nextDifficulty(D, rating) {
  const dDelta = -W[6] * (rating - GOOD);  // good(3): 0 change; again(1): +2*w6; hard(2): +w6; easy(4): -w6
  const dNew = D + dDelta * (10 - D) / 9;
  const dRev = W[7] * _initDifficulty(EASY) + (1 - W[7]) * dNew;
  return _clamp(dRev, 1, 10);
}

// Stability after a successful review (FSRS-5 recall formula), with the
// Hard-penalty (w15, <1) / Easy-bonus (w16, >1) multipliers that were
// previously unused under binary grading — both are 1 (no-op) for Good.
function _nextRecallS(D, S, R, rating) {
  const hardPenalty = rating === HARD ? W[15] : 1;
  const easyBonus   = rating === EASY ? W[16] : 1;
  const growth = Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) *
                 (Math.exp(W[10] * (1 - R)) - 1) * hardPenalty * easyBonus;
  return S * (1 + growth);
}

// Stability after a lapse (FSRS-5 forget formula). Always less than prior S.
function _nextForgetS(D, S, R) {
  const s = W[11] * Math.pow(D, -W[12]) *
            (Math.pow(S + 1, W[13]) - 1) *
            Math.exp(W[14] * (1 - R));
  return _clamp(s, 0.1, S);
}

function _fuzz(intervalDays) {
  // ±5% jitter. FSRS already produces variable intervals, but a tiny fuzz
  // breaks up cohorts that were introduced and reviewed on the same days.
  // Anki issue #2694: don't let fuzz drop the new interval below the prior one.
  return intervalDays * (0.95 + Math.random() * 0.1);
}

function _retentionTarget() {
  const t = Number(getSettings().retentionTarget);
  return (t >= 0.6 && t <= 0.99) ? t : 0.9;
}

// ── Public API ──────────────────────────────────────
function getCardData(wordId, dir) {
  _loadProgress();
  return _progress[_key(wordId, dir)] ?? null;
}

function isNew(wordId, dir) { return getCardData(wordId, dir) === null; }
function isDue(wordId, dir) {
  const d = getCardData(wordId, dir);
  return d ? Date.now() >= d.nextReview : false;
}

// Compute the next FSRS state for a generic card (vocab, grammar, etc.).
// `prev` is the existing {D, S, lastReview, nextReview, reps, lapses} or null/undefined.
// `rating` is 1-4 (Again/Hard/Good/Easy) — see inferRating() for where it
// comes from, since nothing in the UI asks the learner to pick one directly.
// Returns the updated card state with new D, S, lastReview, nextReview, reps, lapses.
function fsrsUpdate(prev, rating, target) {
  const now = Date.now();
  const isCorrect = rating > AGAIN;
  const retentionTarget = (target >= 0.6 && target <= 0.99) ? target : _retentionTarget();

  let D, S;
  if (!prev || !prev.S) {
    D = _initDifficulty(rating);
    S = W[rating - 1];
  } else {
    const daysSince = Math.max(0, (now - prev.lastReview) / DAY_MS);
    const R = _retrievability(daysSince, prev.S);
    D = _nextDifficulty(prev.D, rating);
    S = isCorrect ? _nextRecallS(D, prev.S, R, rating) : _nextForgetS(D, prev.S, R);
  }

  const intervalDays = Math.max(1 / 24, _fuzz(_intervalForTarget(S, retentionTarget)));
  return {
    D, S,
    lastReview: now,
    nextReview: now + intervalDays * DAY_MS,
    reps: (prev?.reps ?? 0) + 1,
    lapses: (prev?.lapses ?? 0) + (isCorrect ? 0 : 1),
  };
}

// ── Rating inference (Again/Hard/Good/Easy from automatic grading) ──
// Two free signals, no new UI:
//   - retried: this exact card was already missed once this session and is
//     being answered again right now — capped at Hard regardless of speed,
//     since "got it on the second try" isn't confident recall.
//   - latencyMs vs. the learner's own recent typing speed for this kind of
//     card ("bucket" — typing English vs. typing Vietnamese are different
//     tasks with very different typical speeds, so each gets its own
//     baseline; Vocab/Cloze/Listening/Grammar all share the "type
//     Vietnamese" bucket since it's the same task). Faster than usual ->
//     Easy, slower -> Hard, typical -> Good.
// A personal (not fixed) baseline avoids penalizing naturally slower typists
// and rewarding naturally fast ones; LATENCY_WARMUP correct answers build it
// up before it's trusted, during which everything correct grades Good.
const LATENCY_KEY = 'vn_latency_v1';
const LATENCY_WARMUP = 8;
const LATENCY_EASY_RATIO = 0.5;
const LATENCY_HARD_RATIO = 1.6;

function _loadLatency() {
  try { return JSON.parse(localStorage.getItem(LATENCY_KEY) || '{}'); } catch { return {}; }
}
function _saveLatency(l) { try { localStorage.setItem(LATENCY_KEY, JSON.stringify(l)); } catch {} }

// Exponential moving average of correct-answer latency for a bucket.
function _updateLatencyBaseline(bucket, latencyMs) {
  const l = _loadLatency();
  const b = l[bucket] || { n: 0, ema: latencyMs };
  b.n++;
  b.ema = b.n <= 1 ? latencyMs : b.ema * 0.85 + latencyMs * 0.15;
  l[bucket] = b;
  _saveLatency(l);
}

function inferRating(correct, { latencyMs, retried, bucket } = {}) {
  if (!correct) return AGAIN;
  if (retried) return HARD;

  let rating = GOOD;
  const l = _loadLatency();
  const b = bucket && l[bucket];
  if (b && b.n >= LATENCY_WARMUP && typeof latencyMs === 'number' && b.ema > 0) {
    const ratio = latencyMs / b.ema;
    if (ratio <= LATENCY_EASY_RATIO) rating = EASY;
    else if (ratio >= LATENCY_HARD_RATIO) rating = HARD;
  }
  // Only "clean" answers (correct, not a retry) feed the baseline — retries
  // and mistakes would drag "normal speed" around for the wrong reason.
  if (bucket && typeof latencyMs === 'number') _updateLatencyBaseline(bucket, latencyMs);
  return rating;
}

// `opts` is optional: { latencyMs, retried, bucket }. `bucket` defaults to
// `dir` (vi-en/en-vi are already the two typing-task categories) but a
// caller can override it — e.g. Listening passes its own bucket since that
// task always includes audio-playback time before typing starts, which
// would otherwise skew it against Cloze/Vocab's faster baseline. Callers
// that don't pass opts at all still work exactly as before (every correct
// answer grades Good, same as the old binary behavior).
function recordAnswer(wordId, dir, isCorrect, opts) {
  _loadProgress();
  _loadDaily();

  const rating = inferRating(isCorrect, { bucket: dir, ...opts });
  const k = _key(wordId, dir);
  const wasNew = !_progress[k];
  _progress[k] = fsrsUpdate(_progress[k] ?? null, rating, _retentionTarget());

  if (wasNew) _daily.newCount++;
  _daily.reviewed++;
  if (isCorrect) _daily.correct++;

  _saveProgress();
  _saveDaily();
}

// ── User-accepted answers ────────────────────────────
// When the user overrides a wrong verdict ("that should've counted"), we
// remember their answer so it's accepted next time for that word+direction.
const ACCEPTED_KEY = 'vn_accepted_v1';

function getAcceptedAnswers(wordId, dir) {
  try {
    const d = JSON.parse(localStorage.getItem(ACCEPTED_KEY) || '{}');
    return (d[wordId] && d[wordId][dir]) || [];
  } catch { return []; }
}

function addAcceptedAnswer(wordId, dir, answer) {
  answer = String(answer || '').trim();
  if (!answer) return;
  try {
    const d = JSON.parse(localStorage.getItem(ACCEPTED_KEY) || '{}');
    d[wordId] = d[wordId] || {};
    d[wordId][dir] = d[wordId][dir] || [];
    if (!d[wordId][dir].some(a => a.toLowerCase() === answer.toLowerCase())) d[wordId][dir].push(answer);
    localStorage.setItem(ACCEPTED_KEY, JSON.stringify(d));
  } catch {}
}

function getDueCards(words) {
  _loadProgress();
  const due = [];
  for (const w of words) {
    for (const dir of ['vi-en', 'en-vi']) {
      if (isDue(w.id, dir)) due.push({ word: w, direction: dir });
    }
  }
  return due.sort((a, b) =>
    _progress[_key(a.word.id, a.direction)].nextReview -
    _progress[_key(b.word.id, b.direction)].nextReview
  );
}

// ── Priority queue (Reader-driven) ───────────────────
// Words the user has explicitly requested be introduced soon — e.g. unknowns
// from an article they pasted in the Reader tab. Each entry's value is a
// boost score: words requested by more articles bubble to the top.
const PRIORITY_KEY = 'vn_priority_v1';

function _loadPriority() {
  try { return JSON.parse(localStorage.getItem(PRIORITY_KEY) || '{}'); }
  catch { return {}; }
}
function _savePriority(p) {
  try { localStorage.setItem(PRIORITY_KEY, JSON.stringify(p)); } catch {}
}

function addPriorityWords(ids) {
  const p = _loadPriority();
  // Drop stale entries that aren't "new" anymore (already introduced)
  for (const id of Object.keys(p)) {
    if (!isNew(id, 'vi-en')) delete p[id];
  }
  for (const id of ids) p[id] = (p[id] || 0) + 1;
  _savePriority(p);
}

function getNewCards(words, limit, bypassDailyLimit = false) {
  _loadProgress();
  _loadDaily();

  const allowed = bypassDailyLimit ? limit : Math.max(0, _newPerDay() - _daily.newCount);
  const max = Math.min(limit, allowed);
  if (max <= 0) return [];

  const result = [];
  const seen = new Set();
  const add = (w, dir) => {
    const k = _key(w.id, dir);
    if (seen.has(k) || result.length >= max) return;
    seen.add(k); result.push({ word: w, direction: dir });
  };
  const byId = new Map(words.map(w => [w.id, w]));

  // 1) Priority queue first (vi→en) — highest-boost first.
  const priority = _loadPriority();
  const priorityIds = Object.keys(priority).sort((a, b) => priority[b] - priority[a]);
  for (const id of priorityIds) {
    const w = byId.get(id);
    if (w && isNew(id, 'vi-en')) add(w, 'vi-en');
  }

  // 2) Interleave en→vi PROMOTIONS (words you've already passed vi→en) with new
  //    vi→en words, so you practice BOTH recognition and production rather than
  //    only ever receiving. Promotions were previously starved by new words.
  //    Disable with the "practice both directions" setting.
  const bothWays = getSettings().bothDirections !== false;
  const promo = bothWays
    ? words.filter(w => { const d = getCardData(w.id, 'vi-en'); return d && d.S >= 1 && isNew(w.id, 'en-vi'); })
    : [];
  const fresh = words.filter(w => isNew(w.id, 'vi-en'));
  let pi = 0, fi = 0;
  while (result.length < max && (pi < promo.length || fi < fresh.length)) {
    if (pi < promo.length) add(promo[pi++], 'en-vi');
    if (fi < fresh.length) add(fresh[fi++], 'vi-en');
  }
  return result;
}

function getStats() {
  _loadProgress();
  _loadDaily();
  // Count cards that have at least made it past the first-fail initial stability.
  const total = Object.values(_progress).filter(d => d && d.S >= 1).length;
  return {
    reviewed: _daily.reviewed,
    correct: _daily.correct,
    newToday: _daily.newCount,
    newLimit: _newPerDay(),
    totalKnown: Math.round(total / 2),
  };
}

function getNextReviewTime(words) {
  _loadProgress();
  let earliest = Infinity;
  const now = Date.now();
  for (const w of words) {
    for (const dir of ['vi-en', 'en-vi']) {
      const d = getCardData(w.id, dir);
      if (d?.nextReview > now) earliest = Math.min(earliest, d.nextReview);
    }
  }
  return earliest === Infinity ? null : earliest;
}

// ── Time tracking ───────────────────────────────────
const TIME_TOTAL_KEY = 'vn_time_total_v1';
const TIME_TODAY_KEY = 'vn_time_today_v1';
const IDLE_MS = 90_000; // stop counting after 90s of no interaction

let _tBase = Number(localStorage.getItem(TIME_TOTAL_KEY) || '0');
let _tTodayBase = (() => {
  try {
    const d = JSON.parse(localStorage.getItem(TIME_TODAY_KEY) || '{}');
    return d.date === new Date().toDateString() ? (d.secs || 0) : 0;
  } catch { return 0; }
})();
let _tStart       = Date.now();
let _lastActivity = Date.now();
let _tTodayDate   = new Date().toDateString(); // tracks which day _tTodayBase belongs to
let _timerPaused  = false; // true while on non-learning tabs so getTimeStats() doesn't accumulate

// Call on any meaningful user interaction
function touchActivity() { _lastActivity = Date.now(); }

// Caps "now" so idle gaps beyond IDLE_MS don't accumulate
function _activeNow() { return Math.min(Date.now(), _lastActivity + IDLE_MS); }

// Detects midnight crossing (tab left open overnight) and resets today's counter
function _rolloverIfNewDay() {
  const today = new Date().toDateString();
  if (_tTodayDate === today) return;
  _tTodayDate   = today;
  _tTodayBase   = 0;
  _tStart       = Date.now();
  _lastActivity = Date.now();
  _goalFiredToday = false;
  try { localStorage.removeItem(TIME_TODAY_KEY); } catch {}
}

function flushTime() {
  _rolloverIfNewDay();
  const now = _activeNow();
  const elapsed = Math.floor((now - _tStart) / 1000);
  if (elapsed < 1) { _tStart = now; return; }
  _tBase      += elapsed;
  _tTodayBase += elapsed;
  localStorage.setItem(TIME_TOTAL_KEY, String(_tBase));
  localStorage.setItem(TIME_TODAY_KEY, JSON.stringify({
    date: new Date().toDateString(), secs: _tTodayBase,
  }));
  _tStart = now;
  _timerPaused = true;
}

// unpause=false when returning to a non-learning tab (resets _tStart but keeps timer paused)
function resumeTimer(unpause = true) {
  _rolloverIfNewDay();
  _tStart = Date.now();
  if (unpause) { touchActivity(); _timerPaused = false; }
}

function getTimeStats() {
  _rolloverIfNewDay();
  const elapsed = _timerPaused ? 0 : Math.floor((_activeNow() - _tStart) / 1000);
  return { total: _tBase + elapsed, today: _tTodayBase + elapsed };
}

function resetTimeStats() {
  _tBase = 0; _tTodayBase = 0;
  _tStart = Date.now(); _lastActivity = Date.now();
  _tTodayDate = new Date().toDateString();
  _goalFiredToday = false;
  try { localStorage.removeItem(TIME_TOTAL_KEY); localStorage.removeItem(TIME_TODAY_KEY); } catch {}
}

function removeTodayGoal() {
  const key = new Date().toDateString();
  try {
    const h = JSON.parse(localStorage.getItem(GOAL_HISTORY_KEY) || '{}');
    delete h[key];
    localStorage.setItem(GOAL_HISTORY_KEY, JSON.stringify(h));
  } catch {}
  _goalFiredToday = false;
}

// ── Settings ──────────────────────────────────────────
const SETTINGS_KEY = 'vn_settings_v1';

function getSettings() {
  const defaults = { dailyGoalMins: 30, retentionTarget: 0.9, newPerDay: NEW_PER_DAY_DEFAULT, autoSpeakVocab: true, autoSpeakExamples: true, bothDirections: true, toneDifficulty: 'medium', theme: 'light' };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return defaults; }
}

// Applies a theme change live (the initial theme, before this script even
// loads, is set by the inline pre-paint script in index.html — this is only
// for switching after the Settings toggle changes).
function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#12181a' : '#fbfbf6');
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// ── Daily goal ────────────────────────────────────────
const GOAL_HISTORY_KEY = 'vn_goal_history_v1';
let _goalFiredToday = false;

// Returns true once the first time today's study time crosses the goal.
function checkGoal() {
  if (_goalFiredToday) return false;
  if (getTimeStats().today < getSettings().dailyGoalMins * 60) return false;
  _goalFiredToday = true;
  const key = new Date().toDateString();
  try {
    const h = JSON.parse(localStorage.getItem(GOAL_HISTORY_KEY) || '{}');
    if (h[key]) return false; // already saved from an earlier session today — skip toast
    h[key] = true;
    localStorage.setItem(GOAL_HISTORY_KEY, JSON.stringify(h));
  } catch {}
  return true;
}

function getGoalStats() {
  const goalSecs = getSettings().dailyGoalMins * 60;
  const { today, total } = getTimeStats();
  let history = {};
  try { history = JSON.parse(localStorage.getItem(GOAL_HISTORY_KEY) || '{}'); } catch {}

  // Consecutive-day streak ending today
  let streak = 0;
  const d = new Date();
  while (history[d.toDateString()]) { streak++; d.setDate(d.getDate() - 1); }

  // Last 14 days (oldest first)
  const last14 = [];
  const d2 = new Date();
  for (let i = 0; i < 14; i++) {
    last14.unshift({ label: d2.toLocaleDateString('en', { weekday: 'narrow' }), hit: !!history[d2.toDateString()] });
    d2.setDate(d2.getDate() - 1);
  }

  return { goalSecs, today, total, streak, last14, history, totalDaysHit: Object.keys(history).length, reached: today >= goalSecs };
}
