// Sounds tab — HVPT-style listening drill for Vietnamese CONSONANT/VOWEL
// contrasts (segmentals), the sibling to Tones' pitch (suprasegmental) drill.
//
// This deliberately does NOT drill s/x, tr/ch, or d/gi/r. Those are the
// commonly-assumed "hard pairs," but in Hanoi/Northern Vietnamese — the
// standard this app's TTS and pronunciation notes already follow — they are
// fully merged and pronounced identically (s=x=/s/, tr=ch=/tɕ/, d=gi=r=/z/).
// A listening drill on them would have no audio difference to perceive; the
// pattern that survives is a *spelling* one, which is a different skill.
//
// Instead this drills contrasts that are genuinely phonemic in Hanoi
// Vietnamese and have no equivalent in English at all:
//   - t / th / đ    — plain vs. aspirated vs. implosive stops (English has
//                     no phonemic aspiration contrast)
//   - ư / u         — unrounded vs. rounded high-back vowel (English has no
//                     unrounded back vowel)
//   - ng- / nh- / n- (word-initial) — velar/palatal nasals occur word-
//                     initially in Vietnamese; English /ŋ/ only ever occurs
//                     word-finally ("sing"), never at the start
//   - kh- / h- / c- — voiceless velar fricative /x/ (like German "Bach"),
//                     absent from English
//
// Each set's words share the same rime and tone, so the only audible
// difference is the target sound — a clean AX/2AFC-style minimal pair, same
// design principle as TONE_MATCH_SETS. Words were cross-checked against
// data/vocab.json (an independently-sourced frequency list) where present.
const SEGMENTS_KEY = 'vn_segments_v1';

const SEGMENT_SETS = [
  { id: 't-th-d-1', contrast: 't / th / đ', forms: [
      { key: 't',  word: 'tôi',  en: 'I, me' },
      { key: 'th', word: 'thôi', en: 'to stop; only' },
      { key: 'đ',  word: 'đôi',  en: 'a pair' },
    ] },
  { id: 't-th-d-2', contrast: 't / th / đ', forms: [
      { key: 't',  word: 'tan',  en: 'to melt, dissolve' },
      { key: 'th', word: 'than', en: 'coal; to complain' },
      { key: 'đ',  word: 'đan',  en: 'to knit, weave' },
    ] },
  { id: 't-th-d-3', contrast: 't / th / đ', forms: [
      { key: 't',  word: 'tu',   en: 'to become a monk/nun' },
      { key: 'th', word: 'thu',  en: 'autumn' },
      { key: 'đ',  word: 'đu',   en: 'a swing' },
    ] },
  { id: 'u-uh-1', contrast: 'ư / u', forms: [
      { key: 'ư', word: 'thư', en: 'letter' },
      { key: 'u', word: 'thu', en: 'autumn' },
    ] },
  { id: 'u-uh-2', contrast: 'ư / u', forms: [
      { key: 'ư', word: 'cứ', en: 'to keep on; just' },
      { key: 'u', word: 'cú', en: 'owl; a blow/strike' },
    ] },
  { id: 'u-uh-3', contrast: 'ư / u', forms: [
      { key: 'ư', word: 'mứt', en: 'jam, candied fruit' },
      { key: 'u', word: 'mút', en: 'to suck' },
    ] },
  { id: 'ng-nh-n-1', contrast: 'ng- / n-', forms: [
      { key: 'ng', word: 'ngày', en: 'day' },
      { key: 'n',  word: 'này',  en: 'this' },
    ] },
  { id: 'ng-nh-n-2', contrast: 'ng- / n-', forms: [
      { key: 'ng', word: 'ngon', en: 'delicious' },
      { key: 'n',  word: 'non',  en: 'young, immature' },
    ] },
  { id: 'ng-nh-n-3', contrast: 'nh- / n-', forms: [
      { key: 'nh', word: 'nho', en: 'grape' },
      { key: 'n',  word: 'no',  en: 'full, satiated' },
    ] },
  { id: 'ng-nh-n-4', contrast: 'nh- / n-', forms: [
      { key: 'nh', word: 'nhắn', en: 'to send a message' },
      { key: 'n',  word: 'nắn',  en: 'to mold, shape' },
    ] },
  { id: 'kh-h-c-1', contrast: 'kh- / h- / c-', forms: [
      { key: 'kh', word: 'không', en: 'no, not' },
      { key: 'h',  word: 'hông',  en: 'hip' },
      { key: 'c',  word: 'công',  en: 'peacock; work' },
    ] },
  { id: 'kh-h-c-2', contrast: 'kh- / h- / c-', forms: [
      { key: 'kh', word: 'khô', en: 'dry' },
      { key: 'h',  word: 'hô',  en: 'to shout' },
      { key: 'c',  word: 'cô',  en: 'aunt; Miss' },
    ] },
];

class SegmentsModule {
  constructor(container) {
    this.container = container;
    this.current = null;   // { set, target }
    this.answered = false;
  }
  init() {}

  activate() {
    if (!this.el) this._build();
    if (!this.current) this._next();
  }

  _build() {
    this.container.innerHTML = `
      <div class="card t-card">
        <div class="card-meta"><span class="card-dir" id="sg-dir">Which sound do you hear?</span></div>
        <div class="t-play-row">
          <button class="zh-speak t-play" id="sg-play" type="button" aria-label="Play">🔊</button>
          <div class="t-reveal" id="sg-reveal"></div>
        </div>
        <div class="t-choices" id="sg-choices"></div>
        <button class="btn btn-next hidden" id="sg-next">Next →</button>
      </div>
    `;
    this.el = {
      dir: this.container.querySelector('#sg-dir'),
      play: this.container.querySelector('#sg-play'),
      reveal: this.container.querySelector('#sg-reveal'),
      choices: this.container.querySelector('#sg-choices'),
      next: this.container.querySelector('#sg-next'),
    };
    this.el.play.addEventListener('click', () => { if (this.current) speakVi(this.current.target.word); });
    this.el.next.addEventListener('click', () => this._next());
    // Delegated handler so rebuilding the choices each question keeps it working.
    this.el.choices.addEventListener('click', e => {
      const btn = e.target.closest('.t-choice');
      if (btn && !this.answered) this._answer(btn.dataset.key);
    });
  }

  _next() {
    this.answered = false;
    const set = SEGMENT_SETS[Math.floor(Math.random() * SEGMENT_SETS.length)];
    const target = set.forms[Math.floor(Math.random() * set.forms.length)];
    this.current = { set, target };

    this.el.dir.textContent = `Which sound do you hear? (${set.contrast})`;
    this.el.choices.innerHTML = set.forms.map(f => `
      <button class="t-choice" type="button" data-key="${esc(f.key)}">
        <span class="t-choice-name">${esc(f.key)}</span>
      </button>`).join('');
    this.el.reveal.textContent = '';
    this.el.next.classList.add('hidden');
    if (typeof speakVi === 'function') speakVi(target.word);
  }

  _answer(picked) {
    if (this.answered || !this.current) return;
    this.answered = true;
    const { set, target } = this.current;
    const correct = picked === target.key;
    this._recordSet(set.id, correct);
    if (correct) window.celebrateCorrect?.();

    this.el.choices.querySelectorAll('.t-choice').forEach(b => {
      b.disabled = true;
      if (b.dataset.key === target.key) b.classList.add('t-correct');
      else if (b.dataset.key === picked) b.classList.add('t-wrong');
    });
    this.el.reveal.innerHTML = `<span class="t-reveal-word">${esc(target.word)}</span><span class="t-reveal-meta">${esc(target.en)}</span>`;
    this.el.next.classList.remove('hidden');
    this.el.next.focus();
  }

  _recordSet(setId, correct) {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(SEGMENTS_KEY) || '{}'); } catch {}
    if (!data[setId]) data[setId] = { correct: 0, total: 0 };
    data[setId].total++;
    if (correct) data[setId].correct++;
    try { localStorage.setItem(SEGMENTS_KEY, JSON.stringify(data)); } catch {}
  }
}
