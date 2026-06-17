// Grammar SRS — learn beginner Vietnamese grammar through real sentences.
// Each point has a short rule + real example sentences; we drill it as a cloze
// (blank the grammar word in a real sentence) scheduled by the same FSRS engine
// as vocabulary (fsrsUpdate from srs.js), with its own progress store.
//
// Pronunciation/usage notes lean Northern (Hanoi), the textbook standard.
const GRAMMAR_KEY = 'vn_grammar_v1';
const GRAMMAR_DAILY_KEY = 'vn_grammar_daily_v1';
const GRAMMAR_NEW_PER_DAY = 3;

// id, title (the rule), explain, and example sentences. `blank` is the grammar
// word tested (cloze); it must appear in the sentence.
const GRAMMAR = [
  { id: 'la', title: 'là — linking two nouns ("to be")',
    explain: 'Use là to say "X is Y" between two nouns. Don\'t use là before an adjective (see rất / adjectives).',
    examples: [
      { en: 'I am a student.', vi: 'Tôi là sinh viên.', blank: 'là' },
      { en: 'This is my friend.', vi: 'Đây là bạn tôi.', blank: 'là' },
    ] },
  { id: 'khong-neg', title: 'không — negating verbs & adjectives ("not")',
    explain: 'Put không right before a verb or adjective to negate it.',
    examples: [
      { en: "I don't understand.", vi: 'Tôi không hiểu.', blank: 'không' },
      { en: 'This is not expensive.', vi: 'Cái này không đắt.', blank: 'không' },
    ] },
  { id: 'khong-phai-la', title: 'không phải là — negating nouns ("is not")',
    explain: 'To negate a noun (X is not Y), use không phải là, not just không.',
    examples: [
      { en: 'I am not a teacher.', vi: 'Tôi không phải là giáo viên.', blank: 'không phải là' },
    ] },
  { id: 'da', title: 'đã — past / completed action',
    explain: 'đã before the verb marks something that already happened.',
    examples: [
      { en: 'I ate (rice).', vi: 'Tôi đã ăn cơm.', blank: 'đã' },
      { en: 'She went home.', vi: 'Cô ấy đã về nhà.', blank: 'đã' },
    ] },
  { id: 'dang', title: 'đang — happening now (-ing)',
    explain: 'đang before the verb means the action is in progress.',
    examples: [
      { en: 'I am studying Vietnamese.', vi: 'Tôi đang học tiếng Việt.', blank: 'đang' },
    ] },
  { id: 'se', title: 'sẽ — future ("will")',
    explain: 'sẽ before the verb marks the future.',
    examples: [
      { en: 'Tomorrow I will go to Hanoi.', vi: 'Ngày mai tôi sẽ đi Hà Nội.', blank: 'sẽ' },
    ] },
  { id: 'roi', title: 'rồi — "already / now"',
    explain: 'rồi at the end of a sentence signals a change of state — it\'s done now.',
    examples: [
      { en: 'I already ate.', vi: 'Tôi ăn rồi.', blank: 'rồi' },
    ] },
  { id: 'yesno-khong', title: '… không? — yes/no questions',
    explain: 'Add không? to the end to make a yes/no question.',
    examples: [
      { en: 'How are you? (Are you well?)', vi: 'Bạn khỏe không?', blank: 'không' },
    ] },
  { id: 'co-khong', title: 'có … không? — yes/no with a verb',
    explain: 'Wrap the verb/adjective in có … không? to ask a yes/no question.',
    examples: [
      { en: 'Do you understand?', vi: 'Bạn có hiểu không?', blank: 'có' },
    ] },
  { id: 'co-have', title: 'có — "to have / there is"',
    explain: 'có means to have, or "there is/are".',
    examples: [
      { en: 'I have a dog.', vi: 'Tôi có một con chó.', blank: 'có' },
    ] },
  { id: 'gi', title: 'gì — "what"',
    explain: 'gì ("what") usually comes at the end, after the verb or noun.',
    examples: [
      { en: 'What is your name?', vi: 'Bạn tên là gì?', blank: 'gì' },
    ] },
  { id: 'ai', title: 'ai — "who"',
    explain: 'ai means "who".',
    examples: [
      { en: 'Who is that?', vi: 'Đó là ai?', blank: 'ai' },
    ] },
  { id: 'dau', title: 'ở đâu — "where"',
    explain: 'đâu means "where"; with location it follows ở ("at").',
    examples: [
      { en: 'Where are you?', vi: 'Bạn ở đâu?', blank: 'đâu' },
    ] },
  { id: 'bao-nhieu', title: 'bao nhiêu — "how much / how many"',
    explain: 'bao nhiêu asks about quantity or price.',
    examples: [
      { en: 'How much is this?', vi: 'Cái này bao nhiêu tiền?', blank: 'bao nhiêu' },
    ] },
  { id: 'khi-nao', title: 'khi nào — "when" (future)',
    explain: 'khi nào at the START asks about a future time. (At the end it asks about the past.)',
    examples: [
      { en: 'When are you going?', vi: 'Khi nào bạn đi?', blank: 'khi nào' },
    ] },
  { id: 'classifier-con', title: 'con / cái — classifiers',
    explain: 'Counting needs a classifier: con for animals, cái for most objects. one + classifier + noun.',
    examples: [
      { en: 'I have one dog.', vi: 'Tôi có một con chó.', blank: 'con' },
      { en: 'two tables', vi: 'hai cái bàn', blank: 'cái' },
    ] },
  { id: 'plural-cac', title: 'các / những — plurals',
    explain: 'các (all of a known group) and những (some) mark plurals before a noun.',
    examples: [
      { en: 'How are you all?', vi: 'Các bạn khỏe không?', blank: 'các' },
    ] },
  { id: 'cua', title: 'của — possession ("of / ’s")',
    explain: 'của marks possession: thing + của + owner.',
    examples: [
      { en: 'This is my book.', vi: 'Đây là sách của tôi.', blank: 'của' },
    ] },
  { id: 'nay', title: 'này / kia / đó — this / that',
    explain: 'Demonstratives come AFTER the noun: này (this), kia/đó (that).',
    examples: [
      { en: 'This one is pretty.', vi: 'Cái này đẹp.', blank: 'này' },
    ] },
  { id: 'muon', title: 'muốn — "want to"',
    explain: 'muốn + verb = want to do something.',
    examples: [
      { en: 'I want to eat phở.', vi: 'Tôi muốn ăn phở.', blank: 'muốn' },
    ] },
  { id: 'co-the', title: 'có thể — "can / be able to"',
    explain: 'có thể + verb expresses ability or possibility.',
    examples: [
      { en: 'I can speak Vietnamese.', vi: 'Tôi có thể nói tiếng Việt.', blank: 'có thể' },
    ] },
  { id: 'phai', title: 'phải — "must / have to"',
    explain: 'phải + verb expresses obligation.',
    examples: [
      { en: 'I have to go now.', vi: 'Tôi phải đi bây giờ.', blank: 'phải' },
    ] },
  { id: 'hon', title: 'hơn — comparatives ("more than")',
    explain: 'adjective + hơn = "more …". Add the thing compared after it.',
    examples: [
      { en: 'This is more expensive.', vi: 'Cái này đắt hơn.', blank: 'hơn' },
    ] },
  { id: 'nhat', title: 'nhất — superlatives ("most")',
    explain: 'adjective + nhất = "the most …".',
    examples: [
      { en: 'This dish is the most delicious.', vi: 'Món này ngon nhất.', blank: 'nhất' },
    ] },
  { id: 'rat', title: 'rất — "very" (before adjectives)',
    explain: 'rất goes before an adjective to intensify it (no là needed).',
    examples: [
      { en: 'Phở is very delicious.', vi: 'Phở rất ngon.', blank: 'rất' },
    ] },
  { id: 'cung', title: 'cũng — "also / too"',
    explain: 'cũng goes before the verb to mean "also".',
    examples: [
      { en: 'I like it too.', vi: 'Tôi cũng thích.', blank: 'cũng' },
    ] },
  { id: 'di-suggest', title: 'đi — soft command / "let’s"',
    explain: 'đi at the end of a sentence makes a gentle command or suggestion.',
    examples: [
      { en: 'Eat up!', vi: 'Ăn đi!', blank: 'đi' },
    ] },
];

// Blank the first whole-token occurrence of `target` in `vi` (escaped HTML).
function _grBlank(vi, target) {
  const B = `[\\s.,!?;:"'“”‘’()\\[\\]…—–-]`;
  const re = new RegExp(`(^|${B})(${escapeRegex(target)})(?=$|${B})`, 'iu');
  const m = re.exec(vi);
  if (!m) return null;
  const idx = m.index + m[1].length;
  return `${esc(vi.slice(0, idx))}<span class="cz-blank">______</span>${esc(vi.slice(idx + m[2].length))}`;
}

// ── Progress store (uses the shared fsrsUpdate from srs.js) ──
function _grLoad() { try { return JSON.parse(localStorage.getItem(GRAMMAR_KEY) || '{}'); } catch { return {}; } }
function _grSave(s) { try { localStorage.setItem(GRAMMAR_KEY, JSON.stringify(s)); } catch {} }
function _grDaily() {
  const today = new Date().toDateString();
  let d; try { d = JSON.parse(localStorage.getItem(GRAMMAR_DAILY_KEY) || '{}'); } catch { d = {}; }
  return d.date === today ? d : { date: today, count: 0 };
}
function _grNewAllowed() { return Math.max(0, GRAMMAR_NEW_PER_DAY - _grDaily().count); }
function _grBumpNew() {
  const d = _grDaily(); d.count++;
  try { localStorage.setItem(GRAMMAR_DAILY_KEY, JSON.stringify(d)); } catch {}
}

class GrammarModule {
  constructor(container) {
    this.container = container;
    this.queue = [];
    this.current = null;
    this.session = { correct: 0, total: 0 };
    this._built = false;
  }
  init() {}

  activate() {
    if (!this._built) { this._build(); this._built = true; }
    if (!this.current) this._start();
  }

  _build() {
    this.container.innerHTML = `
      <div class="stats-bar" id="gr-stats"></div>
      <div class="card" id="gr-card">
        <div class="card-meta"><span class="card-dir" id="gr-dir">Grammar</span><span class="card-progress" id="gr-count"></span></div>
        <div class="gr-rule hidden" id="gr-rule"></div>
        <div class="cz-en" id="gr-en"></div>
        <div class="cz-sentence" id="gr-sentence"></div>
        <div class="card-input-row">
          <input id="gr-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Type the missing word… (Telex: as→á)">
          <button class="btn" id="gr-check">Check</button>
        </div>
        <button class="btn-ghost btn-dontknow" id="gr-dontknow" type="button">I don't know</button>
        <div id="gr-feedback" class="feedback hidden"></div>
        <button class="btn btn-next hidden" id="gr-next">Next →</button>
      </div>
      <div id="gr-done" class="done hidden">
        <div class="done-emoji">✅</div>
        <h2>Grammar done for now!</h2>
        <p id="gr-done-sub">Come back later — points return on the spaced-repetition schedule.</p>
      </div>
    `;
    const $ = s => this.container.querySelector(s);
    this.el = {
      stats: $('#gr-stats'), card: $('#gr-card'), dir: $('#gr-dir'), count: $('#gr-count'),
      rule: $('#gr-rule'), en: $('#gr-en'), sentence: $('#gr-sentence'),
      input: $('#gr-input'), check: $('#gr-check'), dontknow: $('#gr-dontknow'),
      feedback: $('#gr-feedback'), next: $('#gr-next'), done: $('#gr-done'), doneSub: $('#gr-done-sub'),
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
    const store = _grLoad();
    const now = Date.now();
    const due = GRAMMAR.filter(g => store[g.id] && store[g.id].nextReview <= now);
    const fresh = GRAMMAR.filter(g => !store[g.id]).slice(0, _grNewAllowed());
    this.queue = [...due, ...fresh].map(g => ({ g, isNew: !store[g.id] }));
  }

  _start() {
    this._buildQueue();
    if (!this.queue.length) {
      this.el.card.classList.add('hidden');
      this.el.stats.classList.add('hidden');
      this.el.done.classList.remove('hidden');
      return;
    }
    this.el.done.classList.add('hidden');
    this.el.card.classList.remove('hidden');
    this.el.stats.classList.remove('hidden');
    this._showCard();
  }

  _showCard() {
    this.current = this.queue.shift();
    const { g, isNew } = this.current;
    // pick an example we can actually blank
    const usable = g.examples.filter(ex => _grBlank(ex.vi, ex.blank));
    const ex = usable[Math.floor(Math.random() * usable.length)] || g.examples[0];
    this.current.ex = ex;

    this.el.dir.textContent = isNew ? 'New grammar' : 'Grammar review';
    // Show the rule up-front only for brand-new points (it's teaching, not a test).
    if (isNew) {
      this.el.rule.innerHTML = `<div class="gr-title">${esc(g.title)}</div><div class="gr-explain">${esc(g.explain)}</div>`;
      this.el.rule.classList.remove('hidden');
    } else {
      this.el.rule.classList.add('hidden');
    }
    this.el.en.textContent = ex.en || '';
    this.el.sentence.innerHTML = _grBlank(ex.vi, ex.blank) || esc(ex.vi);
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
    const correct = checkVietnamese(raw, this.current.ex.blank);
    if (correct) window.celebrateCorrect?.();
    this._reveal(correct, raw);
  }

  _dontKnow() {
    if (!this.el.feedback.classList.contains('hidden')) return;
    this._reveal(false, null);
  }

  _reveal(correct, typed) {
    const { g, ex, isNew } = this.current;
    // FSRS update on the grammar point
    const store = _grLoad();
    store[g.id] = fsrsUpdate(store[g.id] || null, correct);
    _grSave(store);
    if (isNew) _grBumpNew();
    if (!correct) this.queue.push({ g, isNew: false }); // see it again this session

    this.session.total++;
    if (correct) this.session.correct++;

    const full = (typeof highlightTarget === 'function') ? highlightTarget(ex.vi, ex.blank) : esc(ex.vi);
    this.el.rule.innerHTML = `<div class="gr-title">${esc(g.title)}</div><div class="gr-explain">${esc(g.explain)}</div>`;
    this.el.rule.classList.remove('hidden');
    this.el.feedback.className = `feedback ${correct ? 'correct' : 'incorrect'}`;
    this.el.feedback.innerHTML = `
      <div class="fb-verdict">${correct ? '✓ Correct!' : '✗ Incorrect'}</div>
      ${(!correct && typed) ? `<div class="fb-typed">You typed: <em>${esc(typed)}</em></div>` : ''}
      <div class="fb-word"><div class="fb-chars">${esc(ex.blank)}</div></div>
      <div class="fb-ex"><div class="fb-ex-zh">${full}</div><div class="fb-ex-en">${esc(ex.en || '')}</div></div>
    `;
    this.el.check.disabled = true;
    this.el.input.disabled = true;
    this.el.dontknow.classList.add('hidden');
    this.el.next.classList.remove('hidden');
    this._feedbackShownAt = Date.now();
    this.el.next.focus();
    this._refreshStats();
  }

  _advance() {
    if (this._feedbackShownAt && Date.now() - this._feedbackShownAt < 300) return;
    this._feedbackShownAt = 0;
    if (!this.queue.length) { this._start(); return; }
    this._showCard();
  }

  _refreshStats() {
    const store = _grLoad();
    const known = GRAMMAR.filter(g => store[g.id] && store[g.id].S >= 7).length;
    const acc = this.session.total ? Math.round(this.session.correct / this.session.total * 100) : '—';
    this.el.stats.innerHTML = `
      <div class="stat"><div class="sv">${this.queue.length}</div><div class="sl">Remaining</div></div>
      <div class="stat"><div class="sv">${known}/${GRAMMAR.length}</div><div class="sl">Learned</div></div>
      <div class="stat"><div class="sv">${acc}${this.session.total ? '%' : ''}</div><div class="sl">Accuracy</div></div>
    `;
  }
}
