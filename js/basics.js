// Basics / Learn tab — the absolute-beginner foundation that pure flashcards
// skip: the alphabet (chữ Quốc ngữ) with pronunciation audio, the tone system,
// how to TYPE Vietnamese (Telex), and a handful of survival phrases.
// Content leans Northern (Hanoi) pronunciation, the textbook standard.
// All audio reuses speakVi() from vocab.js.

// Each letter: the letter, an example word, its English gloss, and a short
// pronunciation note (Northern). We speak the example word, not the bare
// letter — TTS reads isolated letters poorly, and words are what you need.
const ALPHABET = [
  { l: 'a',  ex: 'ba',    en: 'three / dad',  note: 'open "ah", like father' },
  { l: 'ă',  ex: 'ăn',    en: 'to eat',       note: 'short "a", clipped' },
  { l: 'â',  ex: 'cân',   en: 'to weigh',     note: 'like "uh" in "but"' },
  { l: 'b',  ex: 'bà',    en: 'grandmother',  note: 'like English b' },
  { l: 'c',  ex: 'cá',    en: 'fish',         note: 'hard "k", unaspirated' },
  { l: 'd',  ex: 'da',    en: 'skin',         note: 'North: "z"; South: "y"' },
  { l: 'đ',  ex: 'đi',    en: 'to go',        note: 'hard "d" like English d' },
  { l: 'e',  ex: 'em',    en: 'younger sibling', note: 'open "e", like "bet"' },
  { l: 'ê',  ex: 'đêm',   en: 'night',        note: 'closed "ay", like "they"' },
  { l: 'g',  ex: 'gà',    en: 'chicken',      note: 'like a soft g / French r' },
  { l: 'h',  ex: 'hai',   en: 'two',          note: 'like English h' },
  { l: 'i',  ex: 'in',    en: 'to print',     note: '"ee", like "see"' },
  { l: 'k',  ex: 'kem',   en: 'ice cream',    note: 'like "k" (only before e/ê/i)' },
  { l: 'l',  ex: 'làm',   en: 'to do',        note: 'like English l' },
  { l: 'm',  ex: 'mẹ',    en: 'mother',       note: 'like English m' },
  { l: 'n',  ex: 'năm',   en: 'year / five',  note: 'like English n' },
  { l: 'o',  ex: 'to',    en: 'big',          note: 'open "aw", like "law"' },
  { l: 'ô',  ex: 'cô',    en: 'aunt / Ms.',   note: 'closed "oh", like "go"' },
  { l: 'ơ',  ex: 'mơ',    en: 'to dream',     note: 'like "ur" in "fur"' },
  { l: 'p',  ex: 'pin',   en: 'battery',      note: 'like "p" (rare initially)' },
  { l: 'q',  ex: 'quê',   en: 'homeland',     note: 'always "qu" = "kw"' },
  { l: 'r',  ex: 'ra',    en: 'to go out',    note: 'North: "z"; South: rolled r' },
  { l: 's',  ex: 'sáu',   en: 'six',          note: 'like "s" (South: "sh")' },
  { l: 't',  ex: 'tốt',   en: 'good',         note: 'like "t", unaspirated' },
  { l: 'u',  ex: 'mua',   en: 'to buy',       note: '"oo", like "boot"' },
  { l: 'ư',  ex: 'tư',    en: 'four / private', note: 'unrounded "oo", say "oo" smiling' },
  { l: 'v',  ex: 'và',    en: 'and',          note: 'North: "v"; South: "y"' },
  { l: 'x',  ex: 'xa',    en: 'far',          note: 'like English "s"' },
  { l: 'y',  ex: 'mỹ',    en: 'beautiful / USA', note: 'like "i" = "ee"' },
];

// Tricky digraphs/trigraphs — these trip up every beginner.
const DIGRAPHS = [
  { l: 'ch', ex: 'chào', en: 'to greet',   note: 'like "ch" in "church"' },
  { l: 'gh', ex: 'ghế',  en: 'chair',      note: 'same as g (before e/ê/i)' },
  { l: 'gi', ex: 'gì',   en: 'what',       note: 'North: "z"; South: "y"' },
  { l: 'kh', ex: 'không',en: 'no / not',   note: 'raspy "kh", like Scottish "loch"' },
  { l: 'ng', ex: 'ngon', en: 'delicious',  note: 'like "ng" in "sing" — even at the start!' },
  { l: 'ngh',ex: 'nghe', en: 'to hear',    note: 'same "ng" sound (before e/ê/i)' },
  { l: 'nh', ex: 'nhà',  en: 'house',      note: 'like "ñ" in Spanish / "ny"' },
  { l: 'ph', ex: 'phở',  en: 'pho (soup)', note: 'like English "f"' },
  { l: 'th', ex: 'thứ',  en: 'order / day',note: 'aspirated "t", a puff of air' },
  { l: 'tr', ex: 'trà',  en: 'tea',        note: 'like "tr"; South closer to "ch"' },
];

// The six tones, shown on the syllable "ma" — the classic minimal set.
const TONES = [
  { syl: 'ma', name: 'ngang', en: 'level',   desc: 'flat, mid pitch (no mark)' },
  { syl: 'mà', name: 'huyền', en: 'falling',  desc: 'low, falling' },
  { syl: 'má', name: 'sắc',   en: 'rising',   desc: 'high, rising' },
  { syl: 'mả', name: 'hỏi',   en: 'dipping',  desc: 'dips down then up' },
  { syl: 'mã', name: 'ngã',   en: 'broken',   desc: 'rising with a glottal break' },
  { syl: 'mạ', name: 'nặng',  en: 'heavy',    desc: 'low, short, glottal stop' },
];

// How to TYPE Vietnamese with a normal QWERTY keyboard, Telex style.
// (The live auto-converter is a separate feature; this teaches the rules so
// the conversion isn't mysterious — e.g. "dd" becomes "đ".)
const TELEX_VOWELS = [
  { type: 'aa', out: 'â' }, { type: 'aw', out: 'ă' }, { type: 'ee', out: 'ê' },
  { type: 'oo', out: 'ô' }, { type: 'ow', out: 'ơ' }, { type: 'w / uw', out: 'ư' },
  { type: 'dd', out: 'đ' },
];
const TELEX_TONES = [
  { type: 's', out: '◌́  sắc',  ex: 'as → á' },
  { type: 'f', out: '◌̀  huyền', ex: 'af → à' },
  { type: 'r', out: '◌̉  hỏi',  ex: 'ar → ả' },
  { type: 'x', out: '◌̃  ngã',  ex: 'ax → ã' },
  { type: 'j', out: '◌̣  nặng', ex: 'aj → ạ' },
  { type: 'z', out: '(clear tone)', ex: 'áz → a' },
];

const PHRASES = [
  { vi: 'Xin chào',         en: 'Hello' },
  { vi: 'Cảm ơn',           en: 'Thank you' },
  { vi: 'Không có gì',      en: "You're welcome / no problem" },
  { vi: 'Tạm biệt',         en: 'Goodbye' },
  { vi: 'Vâng / Dạ',        en: 'Yes (polite)' },
  { vi: 'Không',            en: 'No' },
  { vi: 'Xin lỗi',          en: 'Sorry / excuse me' },
  { vi: 'Tôi tên là…',      en: 'My name is…' },
  { vi: 'Bạn khỏe không?',  en: 'How are you?' },
  { vi: 'Tôi không hiểu',   en: "I don't understand" },
  { vi: 'Bao nhiêu tiền?',  en: 'How much (money)?' },
  { vi: 'Ngon quá!',        en: 'So delicious!' },
];

class BasicsModule {
  constructor(container) {
    this.container = container;
    this._render();
  }
  init() {}
  activate() {}

  _render() {
    this.container.innerHTML = `
      <section class="stats-section">
        <div class="stats-h">Start here 👋</div>
        <p class="stats-sub">Vietnamese uses the Latin alphabet (chữ Quốc ngữ), so there are no new
        characters to memorize — but it is <strong>tonal</strong>, and the tones change a word's meaning.
        Spend a little time on the tones below before drilling vocabulary. Tap any 🔊 to listen.
        Pronunciation notes here follow the Northern (Hanoi) standard.</p>
      </section>

      <section class="stats-section">
        <div class="stats-h">The 6 tones</div>
        <p class="stats-sub">Same syllable "ma", six meanings. This is the #1 thing to get into your ear.</p>
        <div class="basics-tones">
          ${TONES.map(t => `
            <button class="basics-tone" type="button" data-say="${esc(t.syl)}">
              <div class="basics-tone-syl">${esc(t.syl)}</div>
              <div class="basics-tone-name">${esc(t.name)}</div>
              <div class="basics-tone-desc">${esc(t.en)} · ${esc(t.desc)}</div>
              <div class="basics-spk">🔊</div>
            </button>`).join('')}
        </div>
      </section>

      <section class="stats-section">
        <div class="stats-h">Alphabet &amp; sounds</div>
        <p class="stats-sub">29 letters. The vowels (and their roof/hook marks) are what take practice.</p>
        <div class="basics-grid">
          ${ALPHABET.map(a => `
            <button class="basics-letter" type="button" data-say="${esc(a.ex)}">
              <div class="basics-letter-l">${esc(a.l)}</div>
              <div class="basics-letter-note">${esc(a.note)}</div>
              <div class="basics-letter-ex">${esc(a.ex)} — ${esc(a.en)} 🔊</div>
            </button>`).join('')}
        </div>
      </section>

      <section class="stats-section">
        <div class="stats-h">Tricky letter combos</div>
        <div class="basics-grid">
          ${DIGRAPHS.map(a => `
            <button class="basics-letter" type="button" data-say="${esc(a.ex)}">
              <div class="basics-letter-l">${esc(a.l)}</div>
              <div class="basics-letter-note">${esc(a.note)}</div>
              <div class="basics-letter-ex">${esc(a.ex)} — ${esc(a.en)} 🔊</div>
            </button>`).join('')}
        </div>
      </section>

      <section class="stats-section">
        <div class="stats-h">How to type Vietnamese (Telex)</div>
        <p class="stats-sub">You don't need a special keyboard. With <strong>Telex</strong>, you add a key
        after a letter to give it a roof, hook, or tone. For example, type <code>dd</code> and it becomes
        <strong>đ</strong>; type <code>as</code> and it becomes <strong>á</strong>. This is exactly how
        the answer boxes in the app expect you to type.</p>
        <div class="basics-telex">
          <div class="basics-telex-col">
            <div class="basics-telex-h">Letters</div>
            <table class="basics-telex-t">
              ${TELEX_VOWELS.map(r => `<tr><td><code>${esc(r.type)}</code></td><td>→</td><td class="basics-telex-out">${esc(r.out)}</td></tr>`).join('')}
            </table>
          </div>
          <div class="basics-telex-col">
            <div class="basics-telex-h">Tones</div>
            <table class="basics-telex-t">
              ${TELEX_TONES.map(r => `<tr><td><code>${esc(r.type)}</code></td><td>${esc(r.out)}</td><td class="basics-telex-ex">${esc(r.ex)}</td></tr>`).join('')}
            </table>
          </div>
        </div>
        <p class="stats-note">Tip: the tone key goes at the end of the syllable — e.g. <code>vieejt</code> → <strong>việt</strong>, <code>tieesng</code> → <strong>tiếng</strong>.</p>
      </section>

      <section class="stats-section">
        <div class="stats-h">Survival phrases</div>
        <div class="basics-phrases">
          ${PHRASES.map(p => `
            <button class="basics-phrase" type="button" data-say="${esc(p.vi)}">
              <div class="basics-phrase-vi">${esc(p.vi)} <span class="basics-spk">🔊</span></div>
              <div class="basics-phrase-en">${esc(p.en)}</div>
            </button>`).join('')}
        </div>
      </section>
    `;

    // One delegated listener: any element with data-say speaks it.
    this.container.addEventListener('click', e => {
      const el = e.target.closest('[data-say]');
      if (el && typeof speakVi === 'function') speakVi(el.dataset.say);
    });
  }
}
