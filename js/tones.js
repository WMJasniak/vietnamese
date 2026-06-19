// Tones drill — train the six Vietnamese tones, with 3 difficulty modes
// (Settings → Tone drill difficulty):
//   easy   — match each of a syllable's six tone forms to its tone name (you
//            see the marks and can hear each; learn the tone↔mark mapping).
//   medium — see the bare syllable (no tone mark) + hear it, then pick the tone.
//   hard   — audio only, pick the tone (pure ear training).
// Tone is derived from the word's diacritics, so no special data is needed.
const TONES_KEY = 'vn_tones_v1';

const TONE_DEFS = [
  { id: 'ngang', mark: null,     name: 'ngang', en: 'level',   ex: 'ma' },
  { id: 'huyen', mark: '̀', name: 'huyền', en: 'falling', ex: 'mà' },
  { id: 'sac',   mark: '́', name: 'sắc',   en: 'rising',  ex: 'má' },
  { id: 'hoi',   mark: '̉', name: 'hỏi',   en: 'dipping', ex: 'mả' },
  { id: 'nga',   mark: '̃', name: 'ngã',   en: 'broken',  ex: 'mã' },
  { id: 'nang',  mark: '̣', name: 'nặng',  en: 'heavy',   ex: 'mạ' },
];

// Base syllables that exist in all six tones — used by the easy matching mode.
const TONE_MATCH_SETS = [
  { ngang: 'ma', huyen: 'mà', sac: 'má', hoi: 'mả', nga: 'mã', nang: 'mạ' },
  { ngang: 'la', huyen: 'là', sac: 'lá', hoi: 'lả', nga: 'lã', nang: 'lạ' },
  { ngang: 'ba', huyen: 'bà', sac: 'bá', hoi: 'bả', nga: 'bã', nang: 'bạ' },
  { ngang: 'na', huyen: 'nà', sac: 'ná', hoi: 'nả', nga: 'nã', nang: 'nạ' },
  { ngang: 'va', huyen: 'và', sac: 'vá', hoi: 'vả', nga: 'vã', nang: 'vạ' },
];

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
    this.byTone = {};
    this.current = null;
    this.answered = false;
    this.session = { correct: 0, total: 0 };
    this.mode = null;
  }
  init() {}

  activate() {
    if (!this.pool.length) {
      if (typeof loadVocabulary !== 'function') { this._renderError('Vocabulary not available.'); return; }
      loadVocabulary().then(words => {
        this.pool = words.filter(w => w.word && !/\s/.test(w.word) && w.word.length <= 7);
        if (!this.pool.length) { this._renderError('No single-syllable words found.'); return; }
        this.byTone = {};
        for (const w of this.pool) {
          const t = detectVietnameseTone(w.word);
          (this.byTone[t] = this.byTone[t] || []).push(w);
        }
        this._render();
      }).catch(err => this._renderError(err.message || String(err)));
      return;
    }
    const m = this._mode();
    if (m !== this.mode || !this.current) this._render();
  }

  _mode() {
    const m = getSettings().toneDifficulty;
    return (m === 'easy' || m === 'medium' || m === 'hard') ? m : 'medium';
  }

  _render() {
    this.mode = this._mode();
    if (this.mode === 'easy') this._buildMatch();
    else this._buildChoose();
  }

  _refreshStats() {
    const acc = this.session.total ? Math.round(this.session.correct / this.session.total * 100) : '—';
    if (!this.el || !this.el.stats) return;
    this.el.stats.innerHTML = `
      <div class="stat"><div class="sv">${this.session.correct}/${this.session.total}</div><div class="sl">This session</div></div>
      <div class="stat"><div class="sv">${acc}${this.session.total ? '%' : ''}</div><div class="sl">Accuracy</div></div>
    `;
  }

  _recordTone(tone, correct) {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(TONES_KEY) || '{}'); } catch {}
    if (!data[tone]) data[tone] = { correct: 0, total: 0 };
    data[tone].total++;
    if (correct) data[tone].correct++;
    try { localStorage.setItem(TONES_KEY, JSON.stringify(data)); } catch {}
  }

  // ── Choose-the-tone modes (medium / hard) ──────────────
  _buildChoose() {
    const isMedium = this.mode === 'medium';
    this.container.innerHTML = `
      <div class="stats-bar" id="t-stats"></div>
      <div class="card t-card">
        <div class="card-meta"><span class="card-dir">${isMedium ? 'See the syllable, pick the tone you hear' : 'Which tone do you hear?'}</span></div>
        <div class="t-play-row">
          <button class="zh-speak t-play" id="t-play" type="button" aria-label="Play">🔊</button>
          <div class="t-prompt" id="t-prompt"></div>
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
      prompt: this.container.querySelector('#t-prompt'),
      reveal: this.container.querySelector('#t-reveal'),
      choices: this.container.querySelector('#t-choices'),
      feedback: this.container.querySelector('#t-feedback'),
      next: this.container.querySelector('#t-next'),
    };
    this.el.play.addEventListener('click', () => { if (this.current) speakVi(this.current.word); });
    this.el.next.addEventListener('click', () => this._nextChoose());
    // Delegated handler so rebuilding the choices each question keeps it working.
    this.el.choices.addEventListener('click', e => {
      const btn = e.target.closest('.t-choice');
      if (btn && !this.answered) this._answerChoose(btn.dataset.tone);
    });
    this._refreshStats();
    this._nextChoose();
  }

  // Weighted pick: hỏi/ngã/nặng are hardest, so they come up more often.
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

  _nextChoose() {
    this.answered = false;
    this.current = this._pickWord();
    // Rebuild the choices fresh each question — clean, enabled, nothing stuck.
    this.el.choices.innerHTML = TONE_DEFS.map(t => `
      <button class="t-choice" type="button" data-tone="${t.id}">
        <span class="t-choice-ex">${esc(t.ex)}</span>
        <span class="t-choice-name">${esc(t.name)}</span>
        <span class="t-choice-en">${esc(t.en)}</span>
      </button>`).join('');
    this.el.reveal.textContent = '';
    // Medium shows the bare syllable (tone stripped); hard shows nothing.
    this.el.prompt.textContent = (this.mode === 'medium' && typeof stripDiacritics === 'function')
      ? stripDiacritics(this.current.word) : '';
    this.el.feedback.className = 'feedback hidden';
    this.el.next.classList.add('hidden');
    if (typeof speakVi === 'function') speakVi(this.current.word);
  }

  _answerChoose(picked) {
    if (this.answered || !this.current) return;
    this.answered = true;
    const truth = detectVietnameseTone(this.current.word);
    const correct = picked === truth;
    this.session.total++;
    if (correct) this.session.correct++;
    this._recordTone(truth, correct);
    if (correct) window.celebrateCorrect?.();

    this.el.choices.querySelectorAll('.t-choice').forEach(b => {
      b.disabled = true;
      if (b.dataset.tone === truth) b.classList.add('t-correct');
      else if (b.dataset.tone === picked) b.classList.add('t-wrong');
    });
    const w = this.current;
    const meaning = (w.meanings || [])[0] || '';
    this.el.reveal.innerHTML = `<span class="t-reveal-word">${esc(w.word)}</span>${
      meaning ? `<span class="t-reveal-meta">${esc(meaning)}</span>` : ''}`;
    this.el.next.classList.remove('hidden');
    this.el.next.focus();
    this._refreshStats();
  }

  // ── Easy matching mode ─────────────────────────────────
  _buildMatch() {
    this.container.innerHTML = `
      <div class="stats-bar" id="t-stats"></div>
      <div class="card t-card">
        <div class="card-meta"><span class="card-dir">Listen to each, then match it to its tone</span></div>
        <div class="t-match-chips" id="t-chips"></div>
        <div class="t-slots" id="t-slots"></div>
        <button class="btn btn-next hidden" id="t-next">Next set →</button>
      </div>
    `;
    this.el = {
      stats: this.container.querySelector('#t-stats'),
      chips: this.container.querySelector('#t-chips'),
      slots: this.container.querySelector('#t-slots'),
      next: this.container.querySelector('#t-next'),
    };
    this.el.next.addEventListener('click', () => this._nextMatch());
    this._refreshStats();
    this._nextMatch();
  }

  _nextMatch() {
    this.current = TONE_MATCH_SETS[Math.floor(Math.random() * TONE_MATCH_SETS.length)];
    this._sel = null;
    this._matched = 0;
    const forms = TONE_DEFS.map(t => ({ tone: t.id, form: this.current[t.id] }));
    for (let i = forms.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [forms[i], forms[j]] = [forms[j], forms[i]]; }

    this.el.next.classList.add('hidden');
    // Show the bare syllable (no tone mark) so you must match by EAR, not by
    // reading the diacritic. The marked form is revealed in the slot on a match.
    const bare = typeof stripDiacritics === 'function' ? stripDiacritics(forms[0].form) : forms[0].form;
    this.el.chips.innerHTML = forms.map((f, i) =>
      `<button class="t-chip" type="button" data-tone="${f.tone}" data-form="${esc(f.form)}">${esc(bare)} <span class="t-chip-n">${i + 1}</span> 🔊</button>`).join('');
    this.el.slots.innerHTML = TONE_DEFS.map(t =>
      `<button class="t-slot" type="button" data-tone="${t.id}">
         <span class="t-slot-name">${esc(t.name)}</span><span class="t-slot-en">${esc(t.en)}</span>
       </button>`).join('');

    this.el.chips.querySelectorAll('.t-chip').forEach(c =>
      c.addEventListener('click', () => this._selectChip(c)));
    this.el.slots.querySelectorAll('.t-slot').forEach(s =>
      s.addEventListener('click', () => this._placeInSlot(s)));
  }

  _selectChip(chip) {
    if (chip.classList.contains('t-chip--done')) return;
    if (typeof speakVi === 'function') speakVi(chip.dataset.form);
    this.el.chips.querySelectorAll('.t-chip').forEach(c => c.classList.toggle('t-chip--sel', c === chip));
    this._sel = chip;
  }

  _placeInSlot(slot) {
    if (!this._sel || slot.classList.contains('t-slot--filled')) return;
    const chip = this._sel;
    const correct = chip.dataset.tone === slot.dataset.tone;
    this.session.total++;
    if (correct) this.session.correct++;
    this._recordTone(chip.dataset.tone, correct);

    if (correct) {
      slot.classList.add('t-slot--filled');
      slot.innerHTML = `<span class="t-slot-form">${esc(chip.dataset.form)}</span>
        <span class="t-slot-name">${esc((TONE_DEFS.find(t => t.id === slot.dataset.tone) || {}).name || '')}</span>`;
      chip.classList.remove('t-chip--sel');
      chip.classList.add('t-chip--done');
      chip.disabled = true;
      this._sel = null;
      this._matched++;
      this._refreshStats();
      if (this._matched >= 6) {
        window.celebrateCorrect?.();
        this.el.next.classList.remove('hidden');
        this.el.next.focus();
      }
    } else {
      slot.classList.add('t-wrong'); chip.classList.add('t-wrong');
      const c = chip;
      setTimeout(() => { slot.classList.remove('t-wrong'); c.classList.remove('t-wrong', 't-chip--sel'); }, 450);
      this._sel = null;
      this._refreshStats();
    }
  }

  _renderError(msg) {
    this.container.innerHTML = `<p class="stats-placeholder">${esc(msg)}<br><br>Open the Vocabulary tab once to load words, then come back.</p>`;
  }
}
