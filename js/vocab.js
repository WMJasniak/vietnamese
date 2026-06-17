// Vietnamese vocabulary training module.
//
// Two card directions:
//   vi→en: Vietnamese word shown, type any English meaning. Fuzzy match (same
//          checker logic as the Mandarin app — strips parens/punctuation,
//          accepts "to X" / "X", multi-word containment, etc).
//   en→vi: English meanings shown, type the Vietnamese word. Diacritics
//          required by default (the test IS diacritic/tone recall); a
//          Settings toggle lets users accept the bare-Latin form.
//
// TTS: vi-VN voices rotate (HVPT) on zh-en card show, same pattern as Tones tab
// in the Mandarin app. Auto-speak is toggleable in Settings.

// ── Vietnamese TTS ──────────────────────────────────────
// Strategy:
//   1. Use local vi-VN voices via SpeechSynthesis if any are installed.
//   2. Fall back to Google Translate TTS (unofficial but widely used) — most
//      browsers can play it via an <audio> element since media requests don't
//      trigger CORS preflight.
// To install local voices: Windows Settings → Time & Language → Speech → Add
// voices → Vietnamese. macOS: System Settings → Accessibility → Spoken Content
// → System Voice → Manage Voices.
let _vnVoices = null;
let _vnVoiceIdx = 0;
let _lastUtterance = null;   // keep a ref so the utterance isn't GC'd mid-speech (Chromium bug)

if (typeof window !== 'undefined' && window.speechSynthesis) {
  speechSynthesis.getVoices();  // kick async voice loading on some browsers
  speechSynthesis.addEventListener('voiceschanged', () => { _vnVoices = null; });
}

function _viVoices() {
  // NB: don't cache an empty result — voices load asynchronously, so the first
  // call (before 'voiceschanged') often returns [] and we must retry later.
  if (_vnVoices && _vnVoices.length) return _vnVoices;
  if (!window.speechSynthesis) return [];
  const all = speechSynthesis.getVoices() || [];
  _vnVoices = all.filter(v => v.lang && v.lang.toLowerCase().startsWith('vi'));
  return _vnVoices;
}

function _speakViLocal(text) {
  const voices = _viVoices();
  if (!voices.length) { _speakViNet(text); return; }  // no vi voice yet → network
  try { speechSynthesis.cancel(); } catch {}
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voices[_vnVoiceIdx++ % voices.length];
  u.lang = u.voice.lang;
  u.rate = 0.85;
  u.onerror = () => _speakViNet(text);   // local voice failed silently → network
  _lastUtterance = u;
  // Chromium can drop a speak() issued immediately after cancel(); a 0ms tick
  // plus resume() (some builds start paused) makes it reliable.
  setTimeout(() => {
    try { speechSynthesis.resume(); speechSynthesis.speak(u); }
    catch { _speakViNet(text); }
  }, 0);
}

// Console helper: run `vnTtsDebug()` in DevTools to see what voices the browser
// exposes. Useful when audio is silent — tells us if a vi-VN voice is present.
window.vnTtsDebug = () => ({
  hasSynth: !!window.speechSynthesis,
  total: (window.speechSynthesis?.getVoices() || []).length,
  vietnamese: _viVoices().map(v => `${v.name} (${v.lang})`),
  all: (window.speechSynthesis?.getVoices() || []).map(v => `${v.name} (${v.lang})`),
});

let _ttsAudio = null;

function speakVi(text) {
  if (!text) return;
  // 1) Native Android TTS bridge (the .apk wrapper) — works offline, best on phone.
  if (window.AndroidTTS && typeof window.AndroidTTS.canSpeak === 'function') {
    try {
      if (window.AndroidTTS.canSpeak()) { window.AndroidTTS.speak(String(text)); return; }
    } catch {}
    // Bridge present but no Vietnamese voice installed → try online, then guide install.
    _speakViNet(text);
    return;
  }
  // 2) Browser SpeechSynthesis with a local vi voice (desktop / Chrome Android).
  if (window.speechSynthesis && _viVoices().length) {
    _speakViLocal(text);
  } else {
    // 3) Online Google TTS fallback.
    _speakViNet(text);
  }
}

// Fallback when no local vi-VN voice is installed (common on Linux/Windows
// without the extra voice pack). Plays Google Translate's TTS audio through an
// <audio> element — media playback is exempt from CORS, so this works even
// though fetch()-ing the same URL would be blocked. Capped at ~200 chars
// (the endpoint's limit); vocab words are short so that's never hit.
// If playback fails (e.g. offline, or autoplay blocked before a user gesture),
// fall back to the install-a-voice banner.
function _speakViNet(text) {
  try {
    const q = encodeURIComponent(String(text).slice(0, 200));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${q}`;
    if (_ttsAudio) { try { _ttsAudio.pause(); } catch {} }
    _ttsAudio = new Audio(url);
    _ttsAudio.play().catch(err => {
      // Autoplay policy blocks audio before the first user gesture — that's
      // expected for auto-speak on load, and the 🔊 button will work, so stay
      // silent. Only surface the banner for real failures (offline, blocked).
      if (err && err.name === 'NotAllowedError') return;
      _showNoVoiceNotice();
    });
  } catch {
    _showNoVoiceNotice();
  }
}

function _showNoVoiceNotice() {
  // Disabled: TTS works (native Android engine / online fallback), so the
  // install banner was just noise. Kept as a no-op so callers don't break.
  return;
  /* eslint-disable no-unreachable */
  if (sessionStorage.getItem('vn_voice_notice_dismissed')) return;
  if (document.getElementById('vn-voice-notice')) return;

  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const hasBridge = !!(window.AndroidTTS && typeof window.AndroidTTS.installData === 'function');

  let instructions;
  if (isAndroid) {
    instructions = `
      <ul class="voice-notice-list">
        <li>Open <strong>Settings</strong> → search <strong>"Text-to-speech"</strong> (often under <em>General management</em> or <em>Accessibility</em>).</li>
        <li>Set the engine to <strong>Google Text-to-speech</strong>, tap its ⚙, then <strong>Install voice data → Vietnamese</strong>.</li>
        <li>Reopen the app.</li>
      </ul>
      ${hasBridge ? `<button class="btn" id="vn-voice-install" type="button">Open voice-install screen</button>` : ''}`;
  } else if (isIOS) {
    instructions = `
      <ul class="voice-notice-list">
        <li><strong>Settings → Accessibility → Spoken Content → Voices → Add New Voice → Vietnamese.</strong></li>
        <li>Reopen this page.</li>
      </ul>`;
  } else {
    instructions = `
      <ul class="voice-notice-list">
        <li><strong>Windows:</strong> Settings → Time &amp; Language → Speech → Add voices → search "Vietnamese" → install. Restart the browser.</li>
        <li><strong>macOS:</strong> System Settings → Accessibility → Spoken Content → System Voice → Manage Voices → check Vietnamese.</li>
        <li><strong>Linux:</strong> install <code>espeak-ng</code> and a Vietnamese voice for speech-dispatcher.</li>
      </ul>`;
  }

  const el = document.createElement('div');
  el.id = 'vn-voice-notice';
  el.className = 'voice-notice';
  el.innerHTML = `
    <div class="voice-notice-body">
      <strong>No Vietnamese voice available.</strong>
      To hear pronunciation offline, install a Vietnamese text-to-speech voice:
      ${instructions}
    </div>
    <button class="voice-notice-close" type="button" aria-label="Dismiss">✕</button>
  `;
  document.body.appendChild(el);
  el.querySelector('.voice-notice-close').addEventListener('click', () => {
    sessionStorage.setItem('vn_voice_notice_dismissed', '1');
    el.remove();
  });
  const installBtn = el.querySelector('#vn-voice-install');
  if (installBtn) installBtn.addEventListener('click', () => {
    try { window.AndroidTTS.installData(); } catch {}
  });
}

class VocabModule {
  constructor(container) {
    this.container = container;
    this.words = [];
    this.queue = [];
    this.current = null;
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div id="v-load" class="loading">
        <div class="spinner"></div>
        <p id="v-load-msg">Loading vocabulary…</p>
      </div>
      <div id="v-session" class="hidden v-session">
        <div class="stats-bar" id="v-stats"></div>
        <div class="card" id="v-card">
          <div class="card-meta">
            <span class="card-dir" id="v-dir"></span>
            <span class="card-progress" id="v-qcount"></span>
          </div>
          <div class="card-prompt" id="v-prompt"></div>
          <div class="card-hint" id="v-hint"></div>
          <div class="card-input-row">
            <input id="v-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Your answer…">
            <button class="btn" id="v-check">Check</button>
          </div>
          <button class="btn-ghost btn-dontknow" id="v-dontknow" type="button">I don't know</button>
          <div id="v-feedback" class="feedback hidden"></div>
          <button class="btn btn-next hidden" id="v-next">Next →</button>
        </div>
      </div>
      <div id="v-done" class="done hidden">
        <div class="done-emoji">🎉</div>
        <h2>All done for now!</h2>
        <p id="v-done-sub">Come back later for more reviews.</p>
        <div class="stats-bar" id="v-done-stats"></div>
        <p class="next-review-time" id="v-next-time"></p>
        <button class="btn btn-ghost" id="v-add-more">+ Study 10 more new words</button>
      </div>
    `;
    this.el = {
      load: this.container.querySelector('#v-load'),
      loadMsg: this.container.querySelector('#v-load-msg'),
      session: this.container.querySelector('#v-session'),
      stats: this.container.querySelector('#v-stats'),
      dir: this.container.querySelector('#v-dir'),
      qcount: this.container.querySelector('#v-qcount'),
      prompt: this.container.querySelector('#v-prompt'),
      hint: this.container.querySelector('#v-hint'),
      input: this.container.querySelector('#v-input'),
      check: this.container.querySelector('#v-check'),
      dontknow: this.container.querySelector('#v-dontknow'),
      feedback: this.container.querySelector('#v-feedback'),
      next: this.container.querySelector('#v-next'),
      done: this.container.querySelector('#v-done'),
      doneSub: this.container.querySelector('#v-done-sub'),
      doneStats: this.container.querySelector('#v-done-stats'),
      nextTime: this.container.querySelector('#v-next-time'),
      addMore: this.container.querySelector('#v-add-more'),
    };
    this.el.check.addEventListener('click', () => this._submit());
    this.el.dontknow.addEventListener('click', () => this._dontKnow());
    this.el.next.addEventListener('click',  () => this._advance());
    this.el.addMore.addEventListener('click', () => this._addMore());
    this.el.input.addEventListener('keydown', e => {
      // Skip auto-repeats so holding Enter doesn't submit and immediately advance
      // (which would skip the feedback panel before the user could read it).
      if (e.key !== 'Enter' || e.repeat) return;
      if (!this.el.feedback.classList.contains('hidden')) this._advance();
      else this._submit();
    });
    // Telex auto-conversion, but only on en→vi cards (where you type Vietnamese).
    if (typeof attachTelex === 'function')
      attachTelex(this.el.input, () => this.current?.direction === 'en-vi');
  }

  async init(onReady) {
    try {
      this.words = await loadVocabulary(msg => { this.el.loadMsg.textContent = msg; });
      this._startSession();
      onReady?.(this.words);
    } catch (err) {
      this.el.loadMsg.textContent = `Error: ${err.message}`;
      this.el.loadMsg.style.color = 'var(--incorrect)';
    }
  }

  _startSession() {
    this.el.load.classList.add('hidden');
    this.el.session.classList.remove('hidden');
    this._buildQueue();
    this._refreshStats();
    this.queue.length ? this._showCard() : this._showDone();
  }

  _buildQueue(extra = 0) {
    const due = getDueCards(this.words);
    const newCards = getNewCards(this.words, 30 + extra, extra > 0);
    this.queue = [];
    let di = 0, ni = 0;
    while (di < due.length || ni < newCards.length) {
      for (let i = 0; i < 4 && di < due.length; i++) this.queue.push(due[di++]);
      if (ni < newCards.length) this.queue.push(newCards[ni++]);
    }
  }

  _showCard() {
    this.current = this.queue.shift();
    const { word, direction } = this.current;
    this.current.attempts = 0;

    const speakBtn = `
      <div class="zh-char-row">
        <div class="zh-char vi-word">${esc(word.word)}</div>
        <button class="zh-speak" id="v-speak" type="button" aria-label="Listen" title="Listen">🔊</button>
      </div>
    `;

    if (direction === 'vi-en') {
      this.el.dir.textContent = `Vietnamese → English · ${word.cefr || '—'}`;
      this.el.prompt.innerHTML = speakBtn;
      this.el.hint.textContent = 'Any correct meaning is accepted';
      this.el.input.placeholder = 'English meaning…';
    } else {
      this.el.dir.textContent = `English → Vietnamese · ${word.cefr || '—'}`;
      const meanings = (word.meanings || []).slice(0, 4).join(' · ');
      this.el.prompt.innerHTML = `
        <div class="en-word">${esc(meanings || '(no meaning)')}</div>
        ${(word.pos && word.pos.length) ? `<div class="en-alts">${esc(word.pos.join(' · '))}</div>` : ''}
      `;
      const loose = getSettings().acceptNoDiacritics === true;
      this.el.hint.innerHTML = loose
        ? 'Type the Vietnamese word — diacritics optional'
        : 'Type the Vietnamese word <strong>with diacritics</strong> (Settings to relax)';
      this.el.input.placeholder = 'Vietnamese word…';
    }

    // Wire speak button + auto-speak only on vi→en (en→vi would give away the answer)
    const speakEl = this.el.prompt.querySelector('#v-speak');
    speakEl?.addEventListener('click', () => speakVi(word.word));
    if (direction === 'vi-en' && getSettings().autoSpeakVocab !== false) speakVi(word.word);

    this.el.qcount.textContent = `${this.queue.length} left`;
    this.el.feedback.className = 'feedback hidden';
    this.el.next.classList.add('hidden');
    this.el.dontknow.classList.remove('hidden');
    this.el.check.disabled = false;
    this.el.input.disabled = false;
    this.el.input.value = '';
    this.el.input.focus();
  }

  _submit() {
    const raw = this.el.input.value.trim();
    if (!raw) return;
    const { word, direction } = this.current;
    this.current.attempts++;
    const correct = direction === 'vi-en'
      ? checkEnglish(raw, [...(word.meanings || []), ...(word.altMeanings || [])])
      : checkVietnamese(raw, word.word);
    recordAnswer(word.id, direction, correct);
    if (correct) window.celebrateCorrect?.();
    if (!correct && !(this.current.requeueCount > 0)) {
      this.current.requeueCount = (this.current.requeueCount || 0) + 1;
      this.queue.push(this.current);
    }
    this._refreshStats();
    this._showFeedback(correct, word, direction, raw);
  }

  // "I don't know" — reveal the answer and count it as a fail, without making
  // the user type a throwaway guess (which would corrupt the SRS schedule).
  _dontKnow() {
    if (!this.el.feedback.classList.contains('hidden')) return;
    const { word, direction } = this.current;
    recordAnswer(word.id, direction, false);
    if (!(this.current.requeueCount > 0)) {
      this.current.requeueCount = (this.current.requeueCount || 0) + 1;
      this.queue.push(this.current);
    }
    this._refreshStats();
    this._showFeedback(false, word, direction, null);
  }

  _showFeedback(correct, word, direction, typed) {
    const fb = this.el.feedback;
    fb.className = `feedback ${correct ? 'correct' : 'incorrect'}`;
    // Minimum-display guard — _advance ignores Enter for 250ms after this point
    this._feedbackShownAt = Date.now();
    const meaningRows = (word.meanings || []).slice(0, 3)
      .map((m, i) => `<div class="fb-meaning ${i === 0 ? 'primary' : ''}">${esc(m)}</div>`).join('');
    const examples = (typeof getExamples === 'function') ? getExamples(word.word, 2) : [];
    const examplesHtml = examples.length ? `
      <div class="fb-examples">
        ${examples.map(ex => `
          <div class="fb-ex">
            <div class="fb-ex-zh">${highlightTarget(ex.vi, word.word)}</div>
            <div class="fb-ex-en">${esc(ex.en || '')}</div>
          </div>
        `).join('')}
      </div>` : '';
    fb.innerHTML = `
      <div class="fb-verdict">${correct ? '✓ Correct!' : '✗ Incorrect'}</div>
      ${(!correct && typed) ? `<div class="fb-typed">You typed: <em>${esc(typed)}</em></div>` : ''}
      <div class="fb-word">
        <div class="fb-chars">${esc(word.word)}</div>
        <div class="fb-pinyin">${esc((word.pos || []).join(' · '))} · ${esc(word.cefr || '')}</div>
        <div class="fb-meanings">${meaningRows}</div>
      </div>
      ${examplesHtml}
    `;
    this.el.check.disabled = true;
    this.el.input.disabled = true;
    this.el.dontknow.classList.add('hidden');
    this.el.next.classList.remove('hidden');
    this.el.next.focus();
  }

  _advance() {
    // Guard: don't advance if feedback has been visible for less than 250ms.
    // Protects against held-Enter or fast double-Enter that would otherwise
    // submit and advance in the same beat, hiding the answer panel.
    const MIN_FEEDBACK_MS = 250;
    if (this._feedbackShownAt && Date.now() - this._feedbackShownAt < MIN_FEEDBACK_MS) return;
    this._feedbackShownAt = 0;
    if (this.queue.length === 0) {
      this._buildQueue();
      if (this.queue.length === 0) { this._showDone(); return; }
    }
    this._showCard();
  }

  _addMore() {
    this._buildQueue(10);
    if (!this.queue.length) { this.el.doneSub.textContent = 'No more new words available right now.'; return; }
    this.el.done.classList.add('hidden');
    this.el.session.classList.remove('hidden');
    this._showCard();
  }

  _showDone() {
    this.el.session.classList.add('hidden');
    this.el.done.classList.remove('hidden');
    const s = getStats();
    const next = getNextReviewTime(this.words);
    this.el.doneStats.innerHTML = `
      <div class="stat"><div class="sv">${s.reviewed}</div><div class="sl">Reviewed</div></div>
      <div class="stat"><div class="sv">${s.correct}</div><div class="sl">Correct</div></div>
      <div class="stat"><div class="sv">${s.newToday}/${s.newLimit}</div><div class="sl">New today</div></div>
    `;
    if (next) {
      const min = Math.round((next - Date.now()) / 60000);
      const hr = Math.round(min / 60);
      const txt = min < 60 ? `${min} min` : (hr < 24 ? `${hr} hr` : `${Math.round(hr/24)} days`);
      this.el.nextTime.textContent = `Next review in ~${txt}`;
    } else {
      this.el.nextTime.textContent = '';
    }
  }

  _refreshStats() {
    const s = getStats();
    const due = getDueCards(this.words).length;
    const acc = s.reviewed ? Math.round(s.correct / s.reviewed * 100) : '—';
    this.el.stats.innerHTML = `
      <div class="stat"><div class="sv">${this.queue.length}</div><div class="sl">Remaining</div></div>
      <div class="stat"><div class="sv">${s.newToday}/${s.newLimit}</div><div class="sl">New today</div></div>
      <div class="stat"><div class="sv">${s.reviewed}</div><div class="sl">Reviewed</div></div>
      <div class="stat"><div class="sv">${acc}%</div><div class="sl">Accuracy</div></div>
    `;
  }
}

// ── Answer checking ─────────────────────────────────────

// Stop-words for the English keyword-match path (prevents "be" matching "to be in a hurry")
const ENGLISH_STOP = new Set([
  'to','of','in','on','at','by','as','an','a','the',
  'be','is','am','are','was','were','and','or','but','so',
  'it','its','his','her','my','i'
]);

function checkEnglish(input, meanings) {
  const norm = s => s.toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[.,!?;:\[\]'’\-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const core = s => s.replace(/^to\s+/, '').replace(/^(?:a|an|the)\s+/, '');
  const ni = norm(input);
  if (!ni) return false;
  const niCore = core(ni);
  for (const meaning of meanings) {
    for (const part of meaning.split(/[\/;,]/).map(norm).filter(Boolean)) {
      const partCore = core(part);
      if (ni === part || niCore === partCore) return true;
      if (niCore.length >= 3) {
        const maxDist = partCore.length > 8 ? 2 : 1;
        if (levenshtein(niCore, partCore) <= maxDist) return true;
      }
      for (const word of partCore.split(' ')) {
        if (word.length >= 2 && word === niCore && !ENGLISH_STOP.has(word)) return true;
      }
      const niWords = niCore.split(' ').filter(Boolean);
      const partWords = partCore.split(' ').filter(Boolean);
      if (niWords.length >= 2 && partWords.length > niWords.length) {
        for (let i = 0; i + niWords.length <= partWords.length; i++) {
          let ok = true;
          for (let j = 0; j < niWords.length; j++)
            if (partWords[i + j] !== niWords[j]) { ok = false; break; }
          if (ok) return true;
        }
      }
    }
  }
  return false;
}

function checkVietnamese(input, expected) {
  const normFull = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const a = normFull(input), b = normFull(expected);
  if (a === b) return true;
  // Loose mode: accept the diacritic-stripped version too
  if (getSettings().acceptNoDiacritics === true) {
    return stripDiacritics(a) === stripDiacritics(b);
  }
  return false;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, (_, i) =>
    Array.from({length: n + 1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
