// Example-sentence dataset (Tatoeba VN-EN pairs, CC-BY 2.0 FR).
// Bundled as data/sentences.json (~1 MB, ~12k pairs filtered to 2–15 tokens).
// Lookup is a word-boundary scan (Vietnamese is space-separated, unlike
// Chinese), with per-word memoization for fast vocab card rendering.
const SENT_URL = 'data/sentences.json';

let _sentences = null;
let _sentLoadPromise = null;
const _vnHitCache = new Map();

async function _vnFetch() {
  const res = await fetch(SENT_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function loadSentences() {
  if (_sentences) return Promise.resolve();
  if (_sentLoadPromise) return _sentLoadPromise;
  _sentLoadPromise = _vnFetch()
    .then(arr => { _sentences = Array.isArray(arr) ? arr : []; })
    .catch(err => { console.warn('Failed to load sentences', err); _sentences = []; })
    .finally(() => { _sentLoadPromise = null; });
  return _sentLoadPromise;
}

// Word-boundary check: does `sentence` contain `word` as a discrete token?
// Splits sentence by whitespace + Vietnamese punctuation, then case-insensitive compares.
const _PUNCT_RE = /[\s.,!?;:"'“”‘’()\[\]…—–-]+/u;
function _hasWord(sentence, word) {
  const target = word.toLowerCase();
  for (const tok of sentence.toLowerCase().split(_PUNCT_RE)) {
    if (tok === target) return true;
  }
  // Also try multi-word phrases (e.g. "học sinh") as substring with boundaries
  if (target.includes(' ')) {
    return new RegExp(`(?:^|[\\s.,!?;:'\"()\\[\\]…—–-])${escapeRegex(target)}(?=$|[\\s.,!?;:'\"()\\[\\]…—–-])`, 'iu').test(sentence);
  }
  return false;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getExamples(word, n = 2) {
  if (!_sentences || !word) return [];
  const key = word.toLowerCase();
  let hits = _vnHitCache.get(key);
  if (!hits) {
    hits = [];
    const MAX = 8;
    for (const s of _sentences) {
      if (_hasWord(s.vi, key)) {
        hits.push(s);
        if (hits.length >= MAX) break;
      }
    }
    _vnHitCache.set(key, hits);
  }
  return hits.slice(0, n);
}

// Wrap occurrences of `target` (whole-word, case-insensitive) in <span class="ex-target">.
function highlightTarget(viText, target) {
  if (!target) return _vnEsc(viText);
  const pattern = new RegExp(`(^|[\\s.,!?;:'"“”‘’()\\[\\]…—–-])(${escapeRegex(target)})(?=$|[\\s.,!?;:'"“”‘’()\\[\\]…—–-])`, 'giu');
  return _vnEsc(viText).replace(pattern, (m, pre, hit) =>
    `${_vnEsc(pre)}<span class="ex-target">${_vnEsc(hit)}</span>`);
}

function _vnEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
