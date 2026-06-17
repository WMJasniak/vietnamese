// Telex input helper — lets a beginner type Vietnamese on a plain QWERTY
// keyboard. We compile the raw keys into proper Vietnamese as the user types.
// Rules (also shown in the Basics tab):
//   aa→â  ee→ê  oo→ô   aw→ă  ow→ơ  uw/w→ư   dd→đ
//   tone keys (typed at the END of the syllable): s=sắc f=huyền r=hỏi x=ngã j=nặng z=clear
//
// Tone PLACEMENT follows the modern Vietnamese rule, so "saus"→sáu, "toans"→toán,
// "hoaf"→hoà... wait, modern style is "hòa"; we implement the modern rule:
//   1. a vowel carrying a roof/horn (â ă ê ô ơ ư) wins;
//   2. else a single vowel takes it;
//   3. else if the syllable ends in a consonant → last vowel of the cluster;
//   4. else → second-to-last vowel of the cluster;
//   with the qu-/gi- glide exception (the u/i there isn't a tone-bearing vowel).
// This matches how Telex IMEs behave, assuming the tone key is typed last.

const _TONE_MARKS = { s: '́', f: '̀', r: '̉', x: '̃', j: '̣' };
const _ALL_TONE_COMBINING = /[̣̀́̃̉]/g;
const _QUALITY_MARKS = /[̛̂̆]/; // circumflex (â ê ô), breve (ă), horn (ơ ư)

function _stripTone(ch) {
  return ch.normalize('NFD').replace(_ALL_TONE_COMBINING, '').normalize('NFC');
}
function _hasQuality(ch) {
  return _QUALITY_MARKS.test(ch.normalize('NFD'));
}
function _baseLetter(ch) {
  return ch.normalize('NFD')[0].toLowerCase();
}
function _isVowelChar(ch) {
  return 'aeiouy'.includes(_baseLetter(ch));
}
function _isLetter(ch) {
  return /\p{L}/u.test(ch);
}
function _applyTone(ch, toneKey) {
  const base = _stripTone(ch);
  if (toneKey === 'z') return base;
  const composed = (base + _TONE_MARKS[toneKey]).normalize('NFC');
  return composed;
}
function _matchCase(out, src) {
  return src === src.toUpperCase() && src !== src.toLowerCase() ? out.toUpperCase() : out;
}

// Choose which index in `out` (a syllable's chars) gets the tone.
function _tonePosition(out, syllStart) {
  const vowels = [];
  for (let i = syllStart; i < out.length; i++) if (_isVowelChar(out[i])) vowels.push(i);
  if (!vowels.length) return -1;

  // qu- / gi- glide: the u/i right after q/g isn't tone-bearing (unless it's the
  // only vowel in the syllable).
  let cluster = vowels.slice();
  const c0 = _baseLetter(out[syllStart]);
  if (cluster.length > 1) {
    if (c0 === 'q' && _baseLetter(out[vowels[0]]) === 'u') cluster = cluster.slice(1);
    else if (c0 === 'g' && _baseLetter(out[vowels[0]]) === 'i' && out.length - syllStart > 2) cluster = cluster.slice(1);
  }
  if (!cluster.length) cluster = vowels;

  // 1) roof/horn vowel wins; if several (e.g. ươ), the LAST one (→ ơ in đường)
  let q = -1;
  for (const i of cluster) if (_hasQuality(out[i])) q = i;
  if (q >= 0) return q;
  // 2) single vowel
  if (cluster.length === 1) return cluster[0];
  // 3/4) final consonant? → last vowel, else second-to-last
  const lastVowel = cluster[cluster.length - 1];
  const hasFinalConsonant = lastVowel < out.length - 1;
  return hasFinalConsonant ? lastVowel : cluster[cluster.length - 2];
}

// Compile a raw Telex string into Vietnamese. Idempotent on already-composed
// text (re-running it changes nothing), so it's safe to run on every keystroke.
function telexCompile(raw) {
  const out = [];
  let syllStart = 0; // index in `out` where the current syllable begins

  for (const ch of raw) {
    const lower = ch.toLowerCase();

    if (!_isLetter(ch)) { out.push(ch); syllStart = out.length; continue; }

    // Tone keys (only act when there's a vowel in the current syllable)
    if (lower in _TONE_MARKS || lower === 'z') {
      const pos = _tonePosition(out, syllStart);
      if (pos >= 0) { out[pos] = _applyTone(out[pos], lower); continue; }
      out.push(ch); continue; // no vowel yet → literal
    }

    const prev = out.length > syllStart ? out[out.length - 1] : '';

    // dd → đ
    if (lower === 'd' && prev && _baseLetter(prev) === 'd' && !_hasQuality(prev)) {
      out[out.length - 1] = _matchCase('đ', ch); continue;
    }
    // aa ee oo → â ê ô (double same plain vowel)
    if ((lower === 'a' || lower === 'e' || lower === 'o') && prev && _baseLetter(prev) === lower && !_hasQuality(prev)) {
      const roofed = { a: 'â', e: 'ê', o: 'ô' }[lower];
      out[out.length - 1] = _matchCase(roofed, prev); continue;
    }
    // w → ă/ơ/ư on preceding a/o/u, else standalone ư
    if (lower === 'w') {
      if (prev && _baseLetter(prev) === 'a') { out[out.length - 1] = _matchCase('ă', prev); continue; }
      if (prev && _baseLetter(prev) === 'o') { out[out.length - 1] = _matchCase('ơ', prev); continue; }
      if (prev && _baseLetter(prev) === 'u') { out[out.length - 1] = _matchCase('ư', prev); continue; }
      out.push(_matchCase('ư', ch)); continue;
    }

    out.push(ch);
  }
  return out.join('');
}

// Attach live Telex conversion to an <input>. `isActive` is an optional
// predicate; when it returns false the input passes through untouched (used so
// English-answer cards don't get converted).
function attachTelex(input, isActive) {
  if (!input || input._telexBound) return;
  input._telexBound = true;
  input.addEventListener('input', () => {
    if (isActive && !isActive()) return;
    const before = input.value;
    const after = telexCompile(before);
    if (after !== before) {
      input.value = after; // caret jumps to end — fine for these short answer fields
    }
  });
}
