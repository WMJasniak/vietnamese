// Chunks SRS — formulaic multi-word expressions ("không sao đâu", "ăn cơm
// chưa"), drilled and scheduled the same way as js/grammar.js (own FSRS
// progress store, cloze-blank-the-whole-phrase testing). Distinct from
// Vocab (single words) and from Basics' 12 static survival phrases (a
// one-time reference, not spaced-repeated): formulaic sequences are stored
// and retrieved as a unit rather than composed word-by-word (Wray 2002;
// Nation), so they get their own ongoing SRS-scheduled deck instead of
// living only inside single-word vocab cards.
//
// Content is hand-authored (like GRAMMAR), not mined from sentences.json —
// naive n-gram frequency mining surfaces mostly grammatical filler ("là
// một", "của tôi") rather than genuine fixed expressions. Every chunk here
// was cross-checked against data/vocab.json and, where not covered there,
// against dictionary sources.
const CHUNKS_KEY = 'vn_chunks_v1';
const CHUNKS_DAILY_KEY = 'vn_chunks_daily_v1';
const CHUNKS_NEW_PER_DAY = 3;

const CHUNKS = [
  { id: 'khong-sao-dau', chunk: 'không sao đâu', en: "it's okay; no worries",
    examples: [{ vi: 'Đừng lo, không sao đâu.', en: "Don't worry, it's okay." }] },
  { id: 'khong-co-chi', chunk: 'không có chi', en: "you're welcome",
    examples: [{ vi: 'Không có chi, đừng ngại.', en: "You're welcome, don't worry about it." }] },
  { id: 'chuc-mung-sinh-nhat', chunk: 'chúc mừng sinh nhật', en: 'happy birthday',
    examples: [{ vi: 'Chúc mừng sinh nhật bạn!', en: 'Happy birthday to you!' }] },
  { id: 'chuc-ngu-ngon', chunk: 'chúc ngủ ngon', en: 'good night',
    examples: [{ vi: 'Thôi, chúc ngủ ngon nhé.', en: 'Alright, good night.' }] },
  { id: 'an-ngon-mieng', chunk: 'ăn ngon miệng', en: 'enjoy your meal',
    examples: [{ vi: 'Mời bạn ăn ngon miệng.', en: 'Please, enjoy your meal.' }] },
  { id: 'hen-gap-lai', chunk: 'hẹn gặp lại', en: 'see you later',
    examples: [{ vi: 'Hẹn gặp lại bạn nhé.', en: 'See you again.' }] },
  { id: 'lam-on', chunk: 'làm ơn', en: 'please (polite request)',
    examples: [{ vi: 'Làm ơn giúp tôi.', en: 'Please help me.' }] },
  { id: 'toi-cung-vay', chunk: 'tôi cũng vậy', en: 'me too; same here',
    examples: [{ vi: 'Tôi cũng vậy.', en: 'Me too.' }] },
  { id: 'may-gio-roi', chunk: 'mấy giờ rồi', en: 'what time is it now',
    examples: [{ vi: 'Bây giờ mấy giờ rồi?', en: 'What time is it now?' }] },
  { id: 'di-dau-day', chunk: 'đi đâu đấy', en: 'where are you going',
    examples: [{ vi: 'Bạn đi đâu đấy?', en: 'Where are you going?' }] },
  { id: 'an-com-chua', chunk: 'ăn cơm chưa', en: 'have you eaten yet? (a common everyday greeting)',
    examples: [{ vi: 'Bạn ăn cơm chưa?', en: 'Have you eaten yet?' }] },
  { id: 'doi-bung', chunk: 'đói bụng', en: 'hungry',
    examples: [{ vi: 'Tôi đói bụng quá.', en: "I'm so hungry." }] },
  { id: 'no-bung', chunk: 'no bụng', en: 'full (from eating)',
    examples: [{ vi: 'Tôi no bụng rồi.', en: "I'm full now." }] },
  { id: 'met-qua', chunk: 'mệt quá', en: 'so tired',
    examples: [{ vi: 'Hôm nay tôi mệt quá.', en: "I'm so tired today." }] },
  { id: 'vui-qua', chunk: 'vui quá', en: 'so much fun; so happy',
    examples: [{ vi: 'Hôm nay vui quá!', en: 'Today was so much fun!' }] },
  { id: 'dau-dau', chunk: 'đau đầu', en: 'headache (also figuratively: a persistent problem)',
    examples: [{ vi: 'Tôi bị đau đầu.', en: 'I have a headache.' }] },
  { id: 'dau-bung', chunk: 'đau bụng', en: 'stomachache',
    examples: [{ vi: 'Tôi bị đau bụng.', en: 'I have a stomachache.' }] },
  { id: 'can-than-nhe', chunk: 'cẩn thận nhé', en: 'be careful',
    examples: [{ vi: 'Đường trơn, cẩn thận nhé.', en: 'The road is slippery, be careful.' }] },
  { id: 'tu-tu-thoi', chunk: 'từ từ thôi', en: 'take it easy; slow down',
    examples: [{ vi: 'Từ từ thôi, đừng vội.', en: "Take it easy, don't rush." }] },
  { id: 'co-len', chunk: 'cố lên', en: "go for it; keep going (the standard Vietnamese cheer of encouragement)",
    examples: [{ vi: 'Cố lên, sắp xong rồi!', en: "Keep going, you're almost done!" }] },
  { id: 'chuc-may-man', chunk: 'chúc may mắn', en: 'good luck',
    examples: [{ vi: 'Chúc may mắn nhé!', en: 'Good luck!' }] },
  { id: 'the-a', chunk: 'thế à', en: 'really?; is that so? (mild surprise)',
    examples: [{ vi: 'Thế à? Tôi không biết.', en: "Really? I didn't know." }] },
  { id: 'dung-roi', chunk: 'đúng rồi', en: "that's right",
    examples: [{ vi: 'Đúng rồi, bạn nói đúng.', en: "That's right, you're correct." }] },
  { id: 'sai-roi', chunk: 'sai rồi', en: "that's wrong",
    examples: [{ vi: 'Sai rồi, thử lại đi.', en: "That's wrong, try again." }] },
  { id: 'chac-chan', chunk: 'chắc chắn', en: 'for sure; certainly',
    examples: [{ vi: 'Tôi chắc chắn về điều đó.', en: "I'm certain about that." }] },
  { id: 'co-le', chunk: 'có lẽ', en: 'maybe; perhaps',
    examples: [{ vi: 'Có lẽ trời sẽ mưa.', en: 'Maybe it will rain.' }] },
  { id: 'tat-nhien', chunk: 'tất nhiên', en: 'of course',
    examples: [{ vi: 'Tất nhiên là được.', en: "Of course, that's fine." }] },
  { id: 'noi-chung', chunk: 'nói chung', en: 'in general; generally speaking',
    examples: [{ vi: 'Nói chung, tôi thích ở đây.', en: 'In general, I like it here.' }] },
];

// Blank the first whole-token occurrence of `target` in `vi` (escaped HTML).
// Same approach as _clozeBlank/_grBlank — kept as its own local copy so this
// tab stays self-contained rather than reaching into another module's
// private helper.
function _chunkBlank(vi, target) {
  const B = `[\\s.,!?;:"'“”‘’()\\[\\]…—–-]`;
  const re = new RegExp(`(^|${B})(${escapeRegex(target)})(?=$|${B})`, 'iu');
  const m = re.exec(vi);
  if (!m) return null;
  const idx = m.index + m[1].length;
  return `${esc(vi.slice(0, idx))}<span class="cz-blank">______</span>${esc(vi.slice(idx + m[2].length))}`;
}

// ── Progress store (uses the shared fsrsUpdate from srs.js) ──
function _chLoad() { try { return JSON.parse(localStorage.getItem(CHUNKS_KEY) || '{}'); } catch { return {}; } }
function _chSave(s) { try { localStorage.setItem(CHUNKS_KEY, JSON.stringify(s)); } catch {} }
function _chDaily() {
  const today = new Date().toDateString();
  let d; try { d = JSON.parse(localStorage.getItem(CHUNKS_DAILY_KEY) || '{}'); } catch { d = {}; }
  return d.date === today ? d : { date: today, count: 0 };
}
function _chNewAllowed() { return Math.max(0, CHUNKS_NEW_PER_DAY - _chDaily().count); }
function _chBumpNew() {
  const d = _chDaily(); d.count++;
  try { localStorage.setItem(CHUNKS_DAILY_KEY, JSON.stringify(d)); } catch {}
}

class ChunksModule {
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
      <div class="stats-bar" id="ch-stats"></div>
      <div class="card" id="ch-card">
        <div class="card-meta"><span class="card-dir" id="ch-dir">Chunks</span><span class="card-progress" id="ch-count"></span></div>
        <div class="gr-rule hidden" id="ch-rule"></div>
        <div class="cz-en" id="ch-en"></div>
        <div class="cz-sentence" id="ch-sentence"></div>
        <div class="card-input-row">
          <input id="ch-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Type the missing phrase… (Telex: as→á)">
          <button class="btn" id="ch-check">Check</button>
        </div>
        <button class="btn-ghost btn-dontknow" id="ch-dontknow" type="button">I don't know</button>
        <div id="ch-feedback" class="feedback hidden"></div>
        <button class="btn btn-next hidden" id="ch-next">Next →</button>
      </div>
      <div id="ch-done" class="done hidden">
        <div class="done-emoji">✅</div>
        <h2>Chunks done for now!</h2>
        <p id="ch-done-sub">Come back later — phrases return on the spaced-repetition schedule.</p>
      </div>
    `;
    const $ = s => this.container.querySelector(s);
    this.el = {
      stats: $('#ch-stats'), card: $('#ch-card'), dir: $('#ch-dir'), count: $('#ch-count'),
      rule: $('#ch-rule'), en: $('#ch-en'), sentence: $('#ch-sentence'),
      input: $('#ch-input'), check: $('#ch-check'), dontknow: $('#ch-dontknow'),
      feedback: $('#ch-feedback'), next: $('#ch-next'), done: $('#ch-done'), doneSub: $('#ch-done-sub'),
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
    const store = _chLoad();
    const now = Date.now();
    const due = CHUNKS.filter(c => store[c.id] && store[c.id].nextReview <= now);
    const fresh = CHUNKS.filter(c => !store[c.id]).slice(0, _chNewAllowed());
    this.queue = [...due, ...fresh].map(c => ({ c, isNew: !store[c.id] }));
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
    const { c, isNew } = this.current;
    const usable = c.examples.filter(ex => _chunkBlank(ex.vi, c.chunk));
    const ex = usable[Math.floor(Math.random() * usable.length)] || c.examples[0];
    this.current.ex = ex;

    this.el.dir.textContent = isNew ? 'New chunk' : 'Chunk review';
    // Show the phrase + meaning up-front only for brand-new chunks (it's
    // teaching, not a test) — same rationale as Grammar's new-point reveal.
    if (isNew) {
      this.el.rule.innerHTML = `<div class="gr-title">${esc(c.chunk)}</div><div class="gr-explain">${esc(c.en)}</div>`;
      this.el.rule.classList.remove('hidden');
    } else {
      this.el.rule.classList.add('hidden');
    }
    this.el.en.textContent = ex.en || '';
    this.el.sentence.innerHTML = _chunkBlank(ex.vi, c.chunk) || esc(ex.vi);
    this.el.count.textContent = `${this.queue.length} left`;
    this.el.feedback.className = 'feedback hidden';
    this.el.next.classList.add('hidden');
    this.el.dontknow.classList.remove('hidden');
    this.el.check.disabled = false;
    this.el.input.disabled = false;
    this.el.input.value = '';
    this.el.input.focus();
    this._refreshStats();
    this._shownAt = Date.now();   // start of the recall attempt, for rating inference
  }

  _submit() {
    const raw = this.el.input.value.trim();
    if (!raw) return;
    const correct = checkVietnamese(raw, this.current.c.chunk);
    if (correct) window.celebrateCorrect?.();
    this._reveal(correct, raw);
  }

  _dontKnow() {
    if (!this.el.feedback.classList.contains('hidden')) return;
    this._reveal(false, null);
  }

  _reveal(correct, typed) {
    const { c, ex, isNew, retried } = this.current;
    // Same "type the Vietnamese phrase" task as Grammar/Cloze's en-vi
    // direction, so it shares that latency bucket for rating inference.
    const rating = (typeof inferRating === 'function')
      ? inferRating(correct, { latencyMs: Date.now() - (this._shownAt || Date.now()), retried, bucket: 'en-vi' })
      : (correct ? GOOD : AGAIN);
    const store = _chLoad();
    store[c.id] = fsrsUpdate(store[c.id] || null, rating);
    _chSave(store);
    if (isNew) _chBumpNew();
    if (!correct) this.queue.splice(Math.min(this.queue.length, 4), 0, { c, isNew: false, retried: true }); // see it again soon

    this.session.total++;
    if (correct) this.session.correct++;

    const full = (typeof highlightTarget === 'function') ? highlightTarget(ex.vi, c.chunk) : esc(ex.vi);
    this.el.rule.innerHTML = `<div class="gr-title">${esc(c.chunk)}</div><div class="gr-explain">${esc(c.en)}</div>`;
    this.el.rule.classList.remove('hidden');
    this.el.feedback.className = `feedback ${correct ? 'correct' : 'incorrect'}`;
    this.el.feedback.innerHTML = `
      <div class="fb-verdict">${correct ? '✓ Correct!' : '✗ Incorrect'}</div>
      ${(!correct && typed) ? `<div class="fb-typed">You typed: <em>${esc(typed)}</em></div>` : ''}
      <div class="fb-word"><div class="fb-chars">${esc(c.chunk)}</div></div>
      <div class="fb-ex">
        <div class="fb-ex-zh">${full} <button class="zh-speak gr-speak" id="ch-speak" type="button" aria-label="Listen" title="Listen">🔊</button></div>
        <div class="fb-ex-en">${esc(ex.en || '')}</div>
      </div>
    `;
    this.el.feedback.querySelector('#ch-speak')?.addEventListener('click', () => speakVi(ex.vi));
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
    if (this._feedbackShownAt && Date.now() - this._feedbackShownAt < 300) return;
    this._feedbackShownAt = 0;
    if (!this.queue.length) { this._start(); return; }
    this._showCard();
  }

  _refreshStats() {
    const store = _chLoad();
    const known = CHUNKS.filter(c => store[c.id] && store[c.id].S >= 7).length;
    const acc = this.session.total ? Math.round(this.session.correct / this.session.total * 100) : '—';
    this.el.stats.innerHTML = `
      <div class="stat"><div class="sv">${this.queue.length}</div><div class="sl">Remaining</div></div>
      <div class="stat"><div class="sv">${known}/${CHUNKS.length}</div><div class="sl">Learned</div></div>
      <div class="stat"><div class="sv">${acc}${this.session.total ? '%' : ''}</div><div class="sl">Accuracy</div></div>
    `;
  }
}
