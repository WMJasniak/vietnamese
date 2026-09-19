// Speak tab — production practice: hear a model pronunciation, say it back.
// Complements the Tones drill (tone *perception*) with actual speech output,
// which the app otherwise never asks for (every other mode is typed).
// ASR pronunciation training shows a large effect on segmental accuracy
// (consonants/vowels) but only a small one on suprasegmentals (tone), so this
// targets the gap Tones doesn't cover, rather than duplicating it.
//
// Two paths, chosen per-session by feature/error detection:
//   - SpeechRecognition available & usable: record → transcribe → compare to
//     the target text (diacritic-stripped, small edit-distance tolerance,
//     since ASR transcripts are an unreliable test of diacritic *typing* but
//     a fine test of whether the sounds came out right) → explicit
//     corrective feedback (transcript vs. target shown side by side).
//   - Not available/usable: record with MediaRecorder and play the
//     recording back immediately after the model audio, so the learner can
//     self-judge by ear (a "shadow and echo" fallback) instead of relying on
//     unreliable Vietnamese ASR.
// Session-only stats: ASR transcription for a tonal language is noisy enough
// that we don't want it corrupting the FSRS vocabulary schedule, so results
// here aren't written back to srs.js — this is supplementary output
// practice, not graded review.

class SpeakModule {
  constructor(container) {
    this.container = container;
    this.words = [];
    this.pool = [];
    this.current = null;
    this.mode = null;          // 'asr' | 'record'
    this.recognition = null;
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recording = false;
    this.session = { correct: 0, total: 0 };
    this._ready = false;
  }
  init() {}

  // Unlike the other tabs, this one can hold a live mic stream or an active
  // recognition session — leaving the tab mid-attempt must release it, not
  // just let the panel go invisible while the mic stays hot in the
  // background. Discards whatever was in progress; the learner can just
  // redo it when they come back.
  deactivate() {
    this._stopRecognition();
    if (this.recording) { this._discardRecording = true; try { this.mediaRecorder?.stop(); } catch {} }
    this.el?.mic?.classList.remove('recording');
  }

  activate() {
    if (this._ready) { if (!this.current) this._next(); return; }
    if (typeof loadVocabulary !== 'function') { this._err('Vocabulary unavailable.'); return; }
    Promise.all([
      loadVocabulary(),
      typeof loadSentences === 'function' ? loadSentences() : Promise.resolve(),
    ]).then(([words]) => {
      this.words = words || [];
      const seen = this.words.filter(w => typeof getCardData === 'function' &&
        (getCardData(w.id, 'vi-en') || getCardData(w.id, 'en-vi')));
      const base = (seen.length >= 10 ? seen : this.words.slice(0, 200))
        .filter(w => w.word && w.word.length <= 20);
      if (!base.length) { this._err('No words available.'); return; }

      this.pool = base.map(w => ({ type: 'word', word: w }));
      if (typeof getExamples === 'function') {
        for (const w of base.slice(0, 60)) {
          const ex = getExamples(w.word, 1)[0];
          if (ex) this.pool.push({ type: 'sentence', word: w, ex });
        }
      }
      if (!this.pool.length) { this._err('No practice material available.'); return; }

      this.mode = (window.SpeechRecognition || window.webkitSpeechRecognition) ? 'asr' : 'record';
      this._ready = true;
      this._build();
      this._next();
    }).catch(err => this._err(err.message || String(err)));
  }

  _build() {
    this.container.innerHTML = `
      <div class="stats-bar" id="sp-stats"></div>
      <div class="card" id="sp-card">
        <div class="card-meta"><span class="card-dir">Say it out loud</span></div>
        <div class="sp-meaning" id="sp-meaning"></div>
        <div class="sp-target" id="sp-target"></div>
        <p class="card-hint hidden" id="sp-note"></p>
        <div class="t-play-row">
          <button class="zh-speak t-play" id="sp-play" type="button" aria-label="Play model">🔊</button>
          <button class="zh-speak t-play sp-mic" id="sp-mic" type="button" aria-label="Record">🎙️</button>
        </div>
        <div id="sp-feedback" class="feedback hidden"></div>
        <div id="sp-selfrate" class="sp-selfrate hidden">
          <button class="btn-ghost" id="sp-good" type="button">🙂 Sounded right</button>
          <button class="btn-ghost" id="sp-bad" type="button">😕 Needs work</button>
        </div>
        <button class="btn btn-next hidden" id="sp-next">Next →</button>
      </div>
      <div id="sp-unsupported" class="stats-placeholder hidden"></div>
    `;
    this.el = {
      stats: this.container.querySelector('#sp-stats'),
      card: this.container.querySelector('#sp-card'),
      meaning: this.container.querySelector('#sp-meaning'),
      target: this.container.querySelector('#sp-target'),
      note: this.container.querySelector('#sp-note'),
      play: this.container.querySelector('#sp-play'),
      mic: this.container.querySelector('#sp-mic'),
      feedback: this.container.querySelector('#sp-feedback'),
      selfrate: this.container.querySelector('#sp-selfrate'),
      good: this.container.querySelector('#sp-good'),
      bad: this.container.querySelector('#sp-bad'),
      next: this.container.querySelector('#sp-next'),
      unsupported: this.container.querySelector('#sp-unsupported'),
    };
    this.el.play.addEventListener('click', () => this._playModel());
    this.el.mic.addEventListener('click', () => this._micClick());
    this.el.good.addEventListener('click', () => this._selfRate(true));
    this.el.bad.addEventListener('click', () => this._selfRate(false));
    this.el.next.addEventListener('click', () => this._advance());
    if (this.mode === 'record') this._showNote(
      "Speech recognition for Vietnamese isn't available here — recording your voice instead so you can compare it to the model.");
    this._refreshStats();
  }

  _showNote(msg) {
    this.el.note.textContent = msg;
    this.el.note.classList.remove('hidden');
  }

  _targetText(item) { return item.type === 'sentence' ? item.ex.vi : item.word.word; }

  _next() {
    this._stopRecognition();
    this._recFailStreak = 0;
    if (this.recording) { this._discardRecording = true; try { this.mediaRecorder?.stop(); } catch {} }
    this.current = this.pool[Math.floor(Math.random() * this.pool.length)];
    const item = this.current;
    this.el.target.textContent = this._targetText(item);
    this.el.meaning.textContent = item.type === 'sentence'
      ? (item.ex.en || '')
      : ((item.word.meanings || [])[0] || '');
    this.el.feedback.className = 'feedback hidden';
    this.el.selfrate.classList.add('hidden');
    this.el.next.classList.add('hidden');
    this.el.mic.disabled = false;
    this.el.mic.classList.remove('recording');
    this._answered = false;
  }

  _playModel() { if (this.current && typeof speakVi === 'function') speakVi(this._targetText(this.current)); }

  _micClick() {
    if (this._answered) return;
    if (this.mode === 'asr') this._recognize();
    else this._recordToggle();
  }

  // ── ASR path ─────────────────────────────────────────
  _recognize() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._stopRecognition();
    const rec = new SR();
    this.recognition = rec;
    rec.lang = 'vi-VN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    this.el.mic.classList.add('recording');

    const settle = () => { clearTimeout(this._recTimeout); this._recTimeout = null; };

    rec.onresult = e => {
      settle();
      this._recFailStreak = 0;
      this.el.mic.classList.remove('recording');
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      this._gradeAsr(transcript);
    };
    rec.onerror = e => {
      settle();
      this.el.mic.classList.remove('recording');
      if (e.error === 'language-not-supported' || e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this._fallToRecordMode(e.error === 'not-allowed'
          ? 'Microphone access was denied — recording playback needs it too, so allow it if prompted, then try again.'
          : "Speech recognition for Vietnamese isn't available here — recording your voice instead so you can compare it to the model.");
        return;
      }
      // 'no-speech' / 'audio-capture' / other transient errors — let them
      // retry, but a device/browser that *never* manages a real result isn't
      // usable either, so give up on ASR after a few in a row.
      this._recFailStreak = (this._recFailStreak || 0) + 1;
      if (this._recFailStreak >= 3) {
        this._fallToRecordMode("Speech recognition isn't working reliably here — recording your voice instead so you can compare it to the model.");
      }
    };
    try {
      rec.start();
      // Some browsers accept start() but the recognition backend is
      // unreachable (no network, no API credentials, etc.) and neither
      // onresult nor onerror ever fires — the mic would stay stuck
      // "listening" forever. Treat prolonged silence as unusable, same as
      // an explicit error, rather than leaving the learner stranded.
      this._recTimeout = setTimeout(() => {
        this._stopRecognition();
        this.el.mic.classList.remove('recording');
        this._fallToRecordMode("Speech recognition isn't responding here — recording your voice instead so you can compare it to the model.");
      }, 7000);
    } catch {
      this.el.mic.classList.remove('recording');
    }
  }

  _stopRecognition() {
    if (this._recTimeout) { clearTimeout(this._recTimeout); this._recTimeout = null; }
    if (this.recognition) {
      // Detach handlers first: abort()/stop() themselves fire onerror/onend
      // in some engines, which would otherwise re-enter fallback logic.
      this.recognition.onresult = this.recognition.onerror = null;
      try { this.recognition.abort(); } catch {}
      this.recognition = null;
    }
  }

  _fallToRecordMode(msg) {
    this.mode = 'record';
    this._showNote(msg);
  }

  _gradeAsr(transcript) {
    const target = this._targetText(this.current);
    const verdict = _speechVerdict(transcript, target);
    const correct = verdict !== 'off';
    this._reveal(correct, `<div class="sp-transcript">Heard: <em>${esc(transcript || '(nothing recognized)')}</em></div>`);
  }

  // ── Fallback record-and-echo path ───────────────────────
  async _recordToggle() {
    if (this.recording) { this.mediaRecorder?.stop(); return; }
    if (this._starting) return;   // ignore a second tap while getUserMedia() is pending
    this._starting = true;
    this.el.mic.disabled = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this._starting = false;
      this.el.mic.disabled = false;
      this._showUnsupported('Microphone access is needed for the Speak tab. Check your browser/site permissions and try again.');
      return;
    }
    this._starting = false;
    this.el.mic.disabled = false;
    this.mediaStream = stream;
    this.recordedChunks = [];
    const mr = new MediaRecorder(this.mediaStream);
    this.mediaRecorder = mr;
    mr.ondataavailable = e => { if (e.data.size) this.recordedChunks.push(e.data); };
    mr.onstop = () => {
      this.mediaStream?.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
      this.recording = false;
      this.el.mic.classList.remove('recording');
      // _next() force-stops an in-progress recording when the learner moves
      // on before finishing — discard that clip instead of surfacing
      // feedback for a card that's no longer showing.
      if (this._discardRecording) { this._discardRecording = false; return; }
      const blob = new Blob(this.recordedChunks, { type: mr.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().catch(() => {});
      audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
      this._showSelfRate();
    };
    mr.start();
    this.recording = true;
    this.el.mic.classList.add('recording');
  }

  _showSelfRate() {
    this.el.feedback.className = 'feedback hidden';
    this.el.selfrate.classList.remove('hidden');
  }

  _selfRate(good) { this._reveal(good, null); }

  _showUnsupported(msg) {
    this.el.card.classList.add('hidden');
    this.el.unsupported.textContent = msg;
    this.el.unsupported.classList.remove('hidden');
  }

  // ── Shared ───────────────────────────────────────────
  _reveal(correct, extraHtml) {
    this._answered = true;
    this.session.total++;
    if (correct) this.session.correct++;
    if (correct) window.celebrateCorrect?.();

    this.el.selfrate.classList.add('hidden');
    this.el.mic.disabled = true;
    this.el.feedback.className = `feedback ${correct ? 'correct' : 'incorrect'}`;
    this.el.feedback.innerHTML = `
      <div class="fb-verdict">${correct ? '✓ Nice' : '✗ Try again next time'}</div>
      ${extraHtml || ''}
      <div class="fb-word"><div class="fb-chars">${esc(this._targetText(this.current))}</div></div>
    `;
    this.el.next.classList.remove('hidden');
    this._refreshStats();
  }

  // No text input/Enter handling in this tab (unlike Cloze/Listening), so
  // there's no keyup-double-fires-Next risk to guard against here — a
  // straight click handler is enough.
  _advance() { this._next(); }

  _refreshStats() {
    const acc = this.session.total ? Math.round(this.session.correct / this.session.total * 100) : '—';
    this.el.stats.innerHTML = `
      <div class="stat"><div class="sv">${this.session.correct}/${this.session.total}</div><div class="sl">Sounded right</div></div>
      <div class="stat"><div class="sv">${acc}${this.session.total ? '%' : ''}</div><div class="sl">Rate</div></div>
    `;
  }

  _err(msg) {
    this.container.innerHTML = `<p class="stats-placeholder">${esc(msg)}<br><br>Open the Vocabulary tab once to load words, then come back.</p>`;
  }
}

// ASR transcripts are a poor test of diacritic *spelling* (STT engines often
// romanize tone marks inconsistently even when the pronunciation was right),
// so grading strips diacritics and tolerates a small edit distance rather
// than requiring the exact match the typed-answer checkers do.
function _speechVerdict(transcript, target) {
  const norm = s => stripDiacritics(String(s).toLowerCase())
    .replace(/[\s.,!?;:"'“”‘’()\[\]…—–-]+/g, ' ').trim();
  const a = norm(transcript), b = norm(target);
  if (!a) return 'off';
  if (a === b) return 'good';
  const tol = Math.max(1, Math.round(b.length * 0.25));
  return levenshtein(a, b) <= tol ? 'close' : 'off';
}
