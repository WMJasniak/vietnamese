// Listening / dictation tab — hear a Vietnamese word, type what you hear.
// Combines listening comprehension with productive output (Swain's output
// hypothesis; dictation research), and forces tone/diacritic decoding from
// sound. Voices rotate per play (speakVi), giving a bit of the high-variability
// exposure that helps tone perception. Results feed the SRS as en→vi.

class ListeningModule {
  constructor(container) {
    this.container = container;
    this.words = [];
    this.pool = [];
    this.current = null;
    this.answered = false;
    this.session = { correct: 0, total: 0 };
    this._ready = false;
  }
  init() {}

  activate() {
    if (this._ready) { if (!this.current) this._next(); return; }
    if (typeof loadVocabulary !== 'function') { this._err('Vocabulary unavailable.'); return; }
    loadVocabulary().then(words => {
      this.words = words || [];
      // Prefer words you've seen (reinforcement); fall back to the most common
      // words so a brand-new user still has something to train on.
      const seen = this.words.filter(w => typeof getCardData === 'function' && getCardData(w.id, 'vi-en'));
      this.pool = (seen.length >= 10 ? seen : this.words.slice(0, 200))
        .filter(w => w.word && w.word.length <= 12);
      if (!this.pool.length) { this._err('No words available.'); return; }
      this._ready = true;
      this._build();
      this._next();
    }).catch(err => this._err(err.message || String(err)));
  }

  _build() {
    this.container.innerHTML = `
      <div class="stats-bar" id="ls-stats"></div>
      <div class="card">
        <div class="card-meta"><span class="card-dir">Type what you hear</span></div>
        <div class="t-play-row">
          <button class="zh-speak t-play" id="ls-play" type="button" aria-label="Play">🔊</button>
          <div class="ls-reveal" id="ls-reveal"></div>
        </div>
        <div class="card-input-row">
          <input id="ls-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Type the Vietnamese word… (Telex: as→á)">
          <button class="btn" id="ls-check">Check</button>
        </div>
        <button class="btn-ghost btn-dontknow" id="ls-dontknow" type="button">I don't know</button>
        <div id="ls-feedback" class="feedback hidden"></div>
        <button class="btn btn-next hidden" id="ls-next">Next →</button>
      </div>
    `;
    this.el = {
      stats: this.container.querySelector('#ls-stats'),
      play: this.container.querySelector('#ls-play'),
      reveal: this.container.querySelector('#ls-reveal'),
      input: this.container.querySelector('#ls-input'),
      check: this.container.querySelector('#ls-check'),
      dontknow: this.container.querySelector('#ls-dontknow'),
      feedback: this.container.querySelector('#ls-feedback'),
      next: this.container.querySelector('#ls-next'),
    };
    this.el.play.addEventListener('click', () => { if (this.current) speakVi(this.current.word); });
    this.el.check.addEventListener('click', () => this._submit());
    this.el.dontknow.addEventListener('click', () => this._dontKnow());
    this.el.next.addEventListener('click', () => this._advance());
    this.el.input.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.repeat) return;
      if (!this.el.feedback.classList.contains('hidden')) this._advance();
      else this._submit();
    });
    if (typeof attachTelex === 'function') attachTelex(this.el.input);
    this._refreshStats();
  }

  _next() {
    this.answered = false;
    this.current = this.pool[Math.floor(Math.random() * this.pool.length)];
    this.el.reveal.textContent = '';
    this.el.feedback.className = 'feedback hidden';
    this.el.next.classList.add('hidden');
    this.el.dontknow.classList.remove('hidden');
    this.el.check.disabled = false;
    this.el.input.disabled = false;
    this.el.input.value = '';
    this.el.input.focus();
    if (typeof speakVi === 'function') speakVi(this.current.word);
  }

  _submit() {
    if (this.answered) return;
    const raw = this.el.input.value.trim();
    if (!raw) return;
    const correct = checkVietnamese(raw, this.current.word);
    if (correct) window.celebrateCorrect?.();
    this._reveal(correct, raw);
  }

  // Reveal without guessing; counts as a fail.
  _dontKnow() {
    if (this.answered) return;
    this._reveal(false, null);
  }

  _reveal(correct, typed) {
    this.answered = true;
    const word = this.current;
    this.session.total++;
    if (correct) this.session.correct++;
    if (typeof recordAnswer === 'function') recordAnswer(word.id, 'en-vi', correct);

    this.el.reveal.innerHTML = `<span class="ls-reveal-word">${esc(word.word)}</span>`;
    this.el.feedback.className = `feedback ${correct ? 'correct' : 'incorrect'}`;
    this.el.feedback.innerHTML = `
      <div class="fb-verdict">${correct ? '✓ Correct!' : '✗ Incorrect'}</div>
      ${(!correct && typed) ? `<div class="fb-typed">You typed: <em>${esc(typed)}</em></div>` : ''}
      <div class="fb-word"><div class="fb-chars">${esc(word.word)}</div>
        <div class="fb-meanings">${esc((word.meanings || [])[0] || '')}</div></div>
    `;
    this.el.check.disabled = true;
    this.el.input.disabled = true;
    this.el.dontknow.classList.add('hidden');
    this.el.next.classList.remove('hidden');
    this._feedbackShownAt = Date.now();
    this.el.next.focus();
    this._refreshStats();
  }

  // Guard against the Enter that submitted also "clicking" the freshly-focused
  // Next button (its keyup lands on the button) and skipping the feedback.
  _advance() {
    if (this._feedbackShownAt && Date.now() - this._feedbackShownAt < 300) return;
    this._feedbackShownAt = 0;
    this._next();
  }

  _refreshStats() {
    const acc = this.session.total ? Math.round(this.session.correct / this.session.total * 100) : '—';
    this.el.stats.innerHTML = `
      <div class="stat"><div class="sv">${this.session.correct}/${this.session.total}</div><div class="sl">Correct</div></div>
      <div class="stat"><div class="sv">${acc}${this.session.total ? '%' : ''}</div><div class="sl">Accuracy</div></div>
    `;
  }

  _err(msg) {
    this.container.innerHTML = `<p class="stats-placeholder">${esc(msg)}<br><br>Open the Vocabulary tab once to load words, then come back.</p>`;
  }
}
