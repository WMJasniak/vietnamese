// Tones drill — train your ear on the six Vietnamese tones.
// We play a single-syllable word (audio only, word hidden) and you pick the
// tone. The correct answer is derived directly from the word's diacritics, so
// no special data is needed — it reuses the vocab list + speakVi().
const TONES_KEY = 'vn_tones_v1';

// Combining marks (after NFD) that encode each tone. Roof/hook/horn marks
// (â ă ê ô ơ ư) are NOT tones and are ignored.
const TONE_DEFS = [
  { id: 'ngang', mark: null,     name: 'ngang', en: 'level',   ex: 'ma' },
  { id: 'huyen', mark: '̀', name: 'huyền', en: 'falling', ex: 'mà' },
  { id: 'sac',   mark: '́', name: 'sắc',   en: 'rising',  ex: 'má' },
  { id: 'hoi',   mark: '̉', name: 'hỏi',   en: 'dipping', ex: 'mả' },
  { id: 'nga',   mark: '̃', name: 'ngã',   en: 'broken',  ex: 'mã' },
  { id: 'nang',  mark: '̣', name: 'nặng',  en: 'heavy',   ex: 'mạ' },
];

// Identify a syllable's tone from its diacritics.
function detectVietnameseTone(word) {
  const d = String(word).normalize('NFD');
  for (const t of TONE_DEFS) {
    if (t.mark && d.includes(t.mark)) return t.id;
  }
  return 'ngang';
}

class TonesModule {
  constructor(container) {
    this.container = container;
    this.pool = [];
    this.current = null;
    this.answered = false;
    this.session = { correct: 0, total: 0 };
    this._build();
  }
  init() {}

  activate() {
    if (this.pool.length) { if (!this.current) this._next(); return; }
    if (typeof loadVocabulary !== 'function') { this._renderError('Vocabulary not available.'); return; }
    loadVocabulary().then(words => {
      // Single-syllable words only (no space, plausible length) so there is
      // exactly one tone to identify.
      this.pool = words.filter(w => w.word && !/\s/.test(w.word) && w.word.length <= 7);
      if (!this.pool.length) { this._renderError('No single-syllable words found.'); return; }
      // Group by tone so we can over-sample the tones learners find hardest.
      this.byTone = {};
      for (const w of this.pool) {
        const t = detectVietnameseTone(w.word);
        (this.byTone[t] = this.byTone[t] || []).push(w);
      }
      this._next();
    }).catch(err => this._renderError(err.message || String(err)));
  }

  _build() {
    this.container.innerHTML = `
      <div class="stats-bar" id="t-stats"></div>
      <div class="card t-card">
        <div class="card-meta"><span class="card-dir">Which tone do you hear?</span></div>
        <div class="t-play-row">
          <button class="zh-speak t-play" id="t-play" type="button" aria-label="Play">🔊</button>
          <div class="t-reveal" id="t-reveal"></div>
        </div>
        <div class="t-choices" id="t-choices"></div>
        <div class="feedback hidden" id="t-feedback"></div>
        <button class="btn btn-next hidden" id="t-next">Next →</button>
      </div>
    `;
    this.el = {
      stats: this.container.querySelector('#t-stats'),
      play: this.container.querySelector('#t-play'),
      reveal: this.container.querySelector('#t-reveal'),
      choices: this.container.querySelector('#t-choices'),
      feedback: this.container.querySelector('#t-feedback'),
      next: this.container.querySelector('#t-next'),
    };
    this.el.choices.innerHTML = TONE_DEFS.map(t => `
      <button class="t-choice" type="button" data-tone="${t.id}">
        <span class="t-choice-ex">${esc(t.ex)}</span>
        <span class="t-choice-name">${esc(t.name)}</span>
        <span class="t-choice-en">${esc(t.en)}</span>
      </button>`).join('');
    this.el.play.addEventListener('click', () => { if (this.current) speakVi(this.current.word); });
    this.el.next.addEventListener('click', () => this._next());
    this.el.choices.querySelectorAll('.t-choice').forEach(btn =>
      btn.addEventListener('click', () => this._answer(btn.dataset.tone)));
    this._refreshStats();
  }

  // Weighted pick: hỏi/ngã/nặng are the hardest tones for learners, so they
  // come up more often (research on Vietnamese tone acquisition).
  _pickWord() {
    const W = { ngang: 1, huyen: 1, sac: 1, hoi: 2, nga: 2, nang: 2 };
    const avail = TONE_DEFS.map(t => t.id).filter(id => (this.byTone?.[id] || []).length);
    if (!avail.length) return this.pool[Math.floor(Math.random() * this.pool.length)];
    let total = 0; for (const id of avail) total += W[id] || 1;
    let r = Math.random() * total, chosen = avail[avail.length - 1];
    for (const id of avail) { r -= (W[id] || 1); if (r <= 0) { chosen = id; break; } }
    const arr = this.byTone[chosen];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  _next() {
    this.answered = false;
    this.current = this._pickWord();
    this.el.reveal.textContent = '';
    this.el.feedback.className = 'feedback hidden';
    this.el.next.classList.add('hidden');
    this.el.choices.querySelectorAll('.t-choice').forEach(b => {
      b.classList.remove('t-correct', 't-wrong'); b.disabled = false;
    });
    if (typeof speakVi === 'function') speakVi(this.current.word);
  }

  _answer(picked) {
    if (this.answered || !this.current) return;
    this.answered = true;
    const truth = detectVietnameseTone(this.current.word);
    const correct = picked === truth;

    this.session.total++;
    if (correct) this.session.correct++;
    this._recordTone(truth, correct);
    if (correct) window.celebrateCorrect?.();

    // The button colors (green = right tone, red = your wrong pick) already
    // signal the answer, so we don't spell out "it was huyền".
    this.el.choices.querySelectorAll('.t-choice').forEach(b => {
      b.disabled = true;
      if (b.dataset.tone === truth) b.classList.add('t-correct');
      else if (b.dataset.tone === picked) b.classList.add('t-wrong');
    });

    // Reveal just the word + meaning (the diacritic shows the tone).
    const w = this.current;
    const meaning = (w.meanings || [])[0] || '';
    this.el.reveal.innerHTML = `<span class="t-reveal-word">${esc(w.word)}</span>${
      meaning ? `<span class="t-reveal-meta">${esc(meaning)}</span>` : ''}`;
    this.el.next.classList.remove('hidden');
    this.el.next.focus();
    this._refreshStats();
  }

  _recordTone(tone, correct) {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(TONES_KEY) || '{}'); } catch {}
    if (!data[tone]) data[tone] = { correct: 0, total: 0 };
    data[tone].total++;
    if (correct) data[tone].correct++;
    try { localStorage.setItem(TONES_KEY, JSON.stringify(data)); } catch {}
  }

  _refreshStats() {
    const acc = this.session.total ? Math.round(this.session.correct / this.session.total * 100) : '—';
    this.el.stats.innerHTML = `
      <div class="stat"><div class="sv">${this.session.correct}/${this.session.total}</div><div class="sl">This session</div></div>
      <div class="stat"><div class="sv">${acc}${this.session.total ? '%' : ''}</div><div class="sl">Accuracy</div></div>
    `;
  }

  _renderError(msg) {
    this.container.innerHTML = `<p class="stats-placeholder">${esc(msg)}<br><br>Open the Vocabulary tab once to load words, then come back.</p>`;
  }
}
