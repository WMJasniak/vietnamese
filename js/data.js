// Vietnamese vocabulary data — bundled locally as data/vocab.json.
// Derived from Tatoeba VN-EN sentence-corpus word frequency + Wiktionary glosses
// (CC BY-SA 3.0). CEFR levels are a frequency-rank heuristic (top 1000 ≈ A1,
// 1001-2000 ≈ A2, 2001-3500 ≈ B1, 3501-5000 ≈ B2), not an official mapping.
const DATA_URL = 'data/vocab.json';

let _vocab = null;
let _index = null;
let _loadPromise = null;

async function loadVocabulary(onProgress) {
  if (_vocab) return _vocab;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    onProgress?.('Loading vocabulary…');
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    _vocab = await res.json();
    // Normalize: ensure every entry has a stable `id` (we use lowercase word)
    for (const w of _vocab) {
      w.id = w.id || w.word.toLowerCase();
    }
    _index = new Map(_vocab.map(w => [w.id, w]));
    return _vocab;
  })();
  return _loadPromise;
}

function getAllWords() { return _vocab || []; }
function getWord(id)  { return _index?.get(id) ?? null; }

// Strip Vietnamese diacritics — used by answer checker's "loose" mode.
// Maps every accented vowel to its base form and đ→d. Tone marks encode the
// 6 Vietnamese tones; stripping them turns "tôi" into "toi", "đường" into "duong", etc.
function stripDiacritics(s) {
  return String(s)
    .normalize('NFD')                        // decompose combining marks
    .replace(/[̀-ͯ]/g, '')          // remove combining diacritical marks
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');   // đ has no combining form
}
