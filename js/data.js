// Vietnamese vocabulary data — bundled locally as data/vocab.json.
// Word list + frequency: Tatoeba VN-EN sentence corpus. Glosses: rebuilt from
// kaikki.org / Wiktextract (structured Wiktionary, CC BY-SA) — deduped, with
// inflection/alt-form senses dropped and senses Wiktionary tags as
// obsolete/archaic/dated/historical moved to the end. The PRIMARY_MEANING map
// below then floats the learner-relevant sense to the front for common words
// (Wiktionary leaves some old senses, e.g. tôi="servant", untagged).
// CEFR levels are a frequency-rank heuristic (top 1000 ≈ A1, 1001-2000 ≈ A2,
// 2001-3500 ≈ B1, 3501-5000 ≈ B2), not an official mapping.
const DATA_URL = 'data/vocab.json';

// The bundled glosses come from Wiktionary in etymological order, so some very
// common words lead with an archaic/obscure sense (e.g. "tôi" = "slave",
// "là" = "fine silk"). This curated map forces the meaning a learner actually
// wants to the front for the highest-frequency words. The original senses are
// kept (just reordered/deduped). Add more entries here as needed.
const PRIMARY_MEANING = {
  'tôi': 'I, me',
  'là': 'to be',
  'đã': 'already; did (past/completed marker)',
  'đang': 'to be doing now (-ing marker)',
  'sẽ': 'will (future marker)',
  'rồi': 'already',
  'không': 'not; no',
  'chưa': 'not yet',
  'những': 'some (plural marker)',
  'các': 'the, all (plural marker)',
  'của': 'of; belonging to (possessive)',
  'được': 'can, to be able to; to get',
  'phải': 'must, to have to; right (correct)',
  'với': 'with',
  'trong': 'in, inside',
  'bị': 'to undergo (passive marker, for unpleasant things)',
  'mình': 'oneself; I/me (intimate); body',
  'ta': 'I, me; we',
  'nên': 'should, ought to; so, therefore',
  'họ': 'they, them; surname',
  'tiếng': 'language; sound',
  'cậu': 'you (to a male friend); maternal uncle',
  'cả': 'all, whole',
  'thì': 'then; (topic/emphasis particle)',
  'con': 'child; (classifier for animals)',
  'có thể': 'can, to be able to',
  'không thể': 'cannot, to be unable to',
  'để': 'to put, to place; in order to',
  'anh': 'elder brother; you (to a man)',
  'đó': 'that; there',
  'đây': 'here; this',
};

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
    // Normalize: ensure every entry has a stable `id` (we use lowercase word),
    // and float the curated primary meaning to the front where we have one.
    for (const w of _vocab) {
      w.id = w.id || w.word.toLowerCase();
      const pm = PRIMARY_MEANING[w.word];
      if (pm) {
        const rest = (w.meanings || []).filter(m => String(m).trim().toLowerCase() !== pm.toLowerCase());
        w.meanings = [pm, ...rest];
      }
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
