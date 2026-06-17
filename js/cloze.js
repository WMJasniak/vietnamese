// Cloze tab — fill-in-the-blank from real sentences. Research on retrieval
// practice + comprehensible input says recalling a word *in context* sticks far
// better than isolated pairs, and gives free grammar exposure. We only use
// words you've already seen (so it's review-in-context), pull a sentence that
// contains the word from the Tatoeba set, blank it, and you type it back.
// Productive recall is logged to the SRS as an en→vi success/failure.

// Replace the first whole-word occurrence of `target` in `vi` with a blank.
// Returns escaped HTML, or null if the word isn't found as a discrete token.
function _clozeBlank(vi, target) {
  const B = `[\\s.,!?;:"'“”‘’()\\[\\]…—–-]`;
  const re = new RegExp(`(^|${B})(${escapeRegex(target)})(?=$|${B})`, 'iu');
  const m = re.exec(vi);
  if (!m) return null;
  const idx = m.index + m[1].length;
  const before = vi.slice(0, idx);
  const after = vi.slice(idx + m[2].length);
  return `${esc(before)}<span class="cz-blank">______</span>${esc(after)}`;
}

class ClozeModule {
  constructor(container) {
    this.container = container;
    this.words = [];
    this.queue = [];
    this.current = null;
    this.session = { correct: 0, total: 0 };
    this._ready = false;
  }
  init() {}

  activate() {
    if (this._ready) { if (!this.current) this._start(); return; }
    Promise.all([
      typeof loadVocabulary === 'function' ? loadVocabulary() : Promise.resolve([]),
      typeof loadSentences === 'function' ? loadSentences() : Promise.resolve(),
    ]).then(([words]) => {
      this.words = words || [];
      this._ready = true;
      this._build();
      this._start();
    }).catch(err => { this.container.innerHTML = `<p class="stats-placeholder">${esc(err.message || String(err))}</p>`; });
  }

  _build() {
    this.container.innerHTML = `
      <div class="stats-bar" id="cz-stats"></div>
      <div class="card" id="cz-card">
        <div class="card-meta"><span class="card-dir">Fill in the blank</span><span class="card-progress" id="cz-count"></span></div>
        <div class="cz-en" id="cz-en"></div>
        <div class="cz-sentence" id="cz-sentence"></div>
        <div class="card-input-row">
          <input id="cz-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Type the missing word… (Telex: as→á)">
          <button class="btn" id="cz-check">Check</button>
        </div>
        <button class="btn-ghost btn-dontknow" id="cz-dontknow" type="button">I don't know</button>
        <div id="cz-feedback" class="feedback hidden"></div>
        <button class="btn btn-next hidden" id="cz-next">Next →</button>
      </div>
      <div id="cz-empty" class="done hidden">
        <div class="done-emoji">📖</div>
        <h2>Nothing to practice yet</h2>
        <p>Study some words in the <strong>Vocabulary</strong> tab first — cloze reviews words you've already seen, in context.</p>
      </div>
    `;
    this.el = {
      stats: this.container.querySelector('#cz-stats'),
      card: this.container.querySelector('#cz-card'),
      count: this.container.querySelector('#cz-count'),
      en: this.container.querySelector('#cz-en'),
      sentence: this.container.querySelector('#cz-sentence'),
      input: this.container.querySelector('#cz-input'),
      check: this.container.querySelector('#cz-check'),
      dontknow: this.container.querySelector('#cz-dontknow'),
      feedback: this.container.querySelector('#cz-feedback'),
      next: this.container.querySelector('#cz-next'),
      empty: this.container.querySelector('#cz-empty'),
    };
    this.el.check.addEventListener('click', () => this._submit());
    this.el.dontknow.addEventListener('click', () => this._dontKnow());
    this.el.next.addEventListener('click', () => this._advance());
    this.el.input.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.repeat) return;
      if (!this.el.feedback.classList.contains('hidden')) this._advance();
      else this._submit();
    });
    if (typeof attachTelex === 'function') attachTelex(this.el.input);
  }

  _buildQueue() {
    // Words the user has already seen, due ones first.
    const seen = this.words.filter(w => typeof getCardData === 'function' && getCardData(w.id, 'vi-en'));
    const due = (typeof getDueCards === 'function' ? getDueCards(this.words) : [])
      .map(c => c.word).filter(w => getCardData(w.id, 'vi-en'));
    const ordered = [...new Map([...due, ...seen].map(w => [w.id, w])).values()];

    this.queue = [];
    for (const w of ordered) {
      if (this.queue.length >= 15) break;
      const exs = (typeof getExamples === 'function') ? getExamples(w.word, 6) : [];
      for (const ex of exs) {
        const blanked = _clozeBlank(ex.vi, w.word.toLowerCase());
        if (blanked) { this.queue.push({ word: w, ex, blanked }); break; }
      }
    }
  }

  _start() {
    this._buildQueue();
    if (!this.queue.length) {
      this.el.card.classList.add('hidden');
      this.el.stats.classList.add('hidden');
      this.el.empty.classList.remove('hidden');
      return;
    }
    this.el.empty.classList.add('hidden');
    this.el.card.classList.remove('hidden');
    this.el.stats.classList.remove('hidden');
    this._showCard();
  }

  _showCard() {
    this.current = this.queue.shift();
    const { ex, blanked } = this.current;
    this.el.en.textContent = ex.en || '';
    this.el.sentence.innerHTML = blanked;
    this.el.count.textContent = `${this.queue.length} left`;
    this.el.feedback.className = 'feedback hidden';
    this.el.next.classList.add('hidden');
    this.el.dontknow.classList.remove('hidden');
    this.el.check.disabled = false;
    this.el.input.disabled = false;
    this.el.input.value = '';
    this.el.input.focus();
    this._refreshStats();
  }

  _submit() {
    const raw = this.el.input.value.trim();
    if (!raw) return;
    const correct = checkVietnamese(raw, this.current.word.word);
    if (correct) window.celebrateCorrect?.();
    this._reveal(correct, raw);
  }

  // Reveal the answer without typing a guess; counts as a fail.
  _dontKnow() {
    if (!this.el.feedback.classList.contains('hidden')) return;
    this._reveal(false, null);
  }

  _reveal(correct, typed) {
    const { word } = this.current;
    this.session.total++;
    if (correct) this.session.correct++;
    if (typeof recordAnswer === 'function') recordAnswer(word.id, 'en-vi', correct);

    const ex = this.current.ex;
    const full = (typeof highlightTarget === 'function')
      ? highlightTarget(ex.vi, word.word) : esc(ex.vi);
    this.el.feedback.className = `feedback ${correct ? 'correct' : 'incorrect'}`;
    this.el.feedback.innerHTML = `
      <div class="fb-verdict">${correct ? '✓ Correct!' : '✗ Incorrect'}</div>
      ${(!correct && typed) ? `<div class="fb-typed">You typed: <em>${esc(typed)}</em></div>` : ''}
      <div class="fb-word"><div class="fb-chars">${esc(word.word)}</div>
        <div class="fb-meanings">${esc((word.meanings || [])[0] || '')}</div></div>
      <div class="fb-ex">
        <div class="fb-ex-zh">${full} <button class="zh-speak gr-speak" id="cz-speak" type="button" aria-label="Listen" title="Listen">🔊</button></div>
        <div class="fb-ex-en">${esc(ex.en || '')}</div>
      </div>
    `;
    // Hear the whole sentence; auto-play once on reveal (Settings can disable).
    this.el.feedback.querySelector('#cz-speak')?.addEventListener('click', () => speakVi(ex.vi));
    if (typeof speakVi === 'function' && getSettings().autoSpeakExamples !== false) speakVi(ex.vi);

    this.el.check.disabled = true;
    this.el.input.disabled = true;
    this.el.dontknow.classList.add('hidden');
    this.el.next.classList.remove('hidden');
    this._feedbackShownAt = Date.now();
    this.el.next.focus();
    this._refreshStats();
  }

  _advance() {
    // Guard: the Enter that submitted can also activate the just-focused Next
    // button (keyup), which would skip the feedback. Ignore for 300ms.
    if (this._feedbackShownAt && Date.now() - this._feedbackShownAt < 300) return;
    this._feedbackShownAt = 0;
    if (!this.queue.length) { this._start(); return; }
    this._showCard();
  }

  _refreshStats() {
    const acc = this.session.total ? Math.round(this.session.correct / this.session.total * 100) : '—';
    this.el.stats.innerHTML = `
      <div class="stat"><div class="sv">${this.queue.length}</div><div class="sl">Remaining</div></div>
      <div class="stat"><div class="sv">${this.session.correct}/${this.session.total}</div><div class="sl">Correct</div></div>
      <div class="stat"><div class="sv">${acc}${this.session.total ? '%' : ''}</div><div class="sl">Accuracy</div></div>
    `;
  }
}
