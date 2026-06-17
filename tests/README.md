# Tests

No browser/Node needed. The suite loads the app's **actual** JavaScript into a
JS engine ([QuickJS](https://pypi.org/project/quickjs/), which has full Unicode
support — needed for the tone/diacritic logic), stubs the browser APIs
(localStorage, speechSynthesis, …), injects the real `data/vocab.json`, and runs
assertions against the shipped functions. It also does Python-side data and
wiring integrity checks.

```bash
pip install quickjs
python tests/run_tests.py
```

Exit code is non-zero if anything fails. Runs automatically in CI
([.github/workflows/test.yml](../.github/workflows/test.yml)).

## What's covered
- **Pure logic:** `telexCompile` (tone placement), `detectVietnameseTone`,
  `stripDiacritics`, `checkVietnamese`/`checkEnglish` (answer matching),
  `levenshtein`, FSRS scheduling (`fsrsUpdate`, `recordAnswer`, new/due
  selection), cloze/grammar blanking, the `PRIMARY_MEANING` override.
- **Content integrity:** every Grammar example's blank is cloze-able; vocab
  primary meanings are self-acceptable; tone detection is valid for all
  single-syllable words.
- **Data/wiring:** `vocab.json`/`sentences.json` shape; ids unique; every JS
  file is referenced in `index.html` and precached by the service worker.

## Not covered (needs a real browser/device)
DOM rendering, event/tab flows, TTS audio, and the Android native bridges
(file chooser, TextToSpeech, backup SAF, JS dialogs) — verify those by running
the app.
