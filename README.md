# Tiếng Việt — Vietnamese Learning

A self-contained, client-side web app for learning Vietnamese vocabulary with
spaced repetition. No build step, no framework, no backend — just static
HTML/CSS/JS. All progress is stored in your browser's `localStorage`.

## Running it

Because the app `fetch`es local JSON data files, you can't just open
`index.html` from the filesystem (browsers block `file://` fetches). Serve the
folder over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works. There is nothing to install or compile.

## Install on your phone (PWA)

This is a Progressive Web App: it installs to your home screen and works
offline (the app shell + the vocab/sentence data are cached by
[sw.js](sw.js); only Google TTS audio needs a connection).

1. Host it over HTTPS (see *Deploy to GitHub Pages* below — a service worker
   requires HTTPS, except on `localhost`).
2. On your phone, open the URL in **Chrome**.
3. Menu (⋮) → **Add to Home screen** / **Install app**.
4. Launch it from the new icon — it runs full-screen, no browser chrome, and
   works with no signal.

**Move your progress across devices:** progress lives in the browser per-device.
On your desktop go to **Settings → Export backup**, copy the JSON to your phone,
then **Settings → Import backup** there.

## Deploy to GitHub Pages

No build step — Pages serves the static files directly.

1. Create a new GitHub repo and push this folder to it (see *First push* below).
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, branch `main`, folder `/ (root)`, **Save**.
3. After a minute your app is at `https://<user>.github.io/<repo>/`.
   All paths here are relative, so a subpath like `/Vietnamese/` works fine.

### First push

```bash
git remote add origin https://github.com/<user>/<repo>.git
git branch -M main
git push -u origin main
```

## Features

- **Plan** — a timed, guided study session. Set minutes per segment; it counts
  down, auto-switches to the right tab, and only accrues time while you're
  active on that tab. The default is an evidence-based interleaved mix (see
  *Research basis* below).
- **Basics** — beginner foundation: the alphabet (chữ Quốc ngữ) with
  pronunciation audio, the six tones, a Telex typing cheat-sheet, and survival
  phrases. Everything is tap-to-listen.
- **Tones** — ear-training drill: hear a hidden word, identify its tone. The
  correct tone is derived from the word's diacritics, and the hardest tones
  (hỏi / ngã / nặng) come up more often.
- **Cloze** — fill-in-the-blank from real sentences. Reviews words you've
  already seen, in context; productive answers feed the SRS.
- **Listening** — dictation: hear a word, type what you hear (Telex supported).
- **Vocabulary** — the core flashcard trainer. Two independent card directions
  per word:
  - **vi → en**: see the Vietnamese word, type any English meaning (lenient,
    fuzzy matching).
  - **en → vi**: see the English meaning(s), type the Vietnamese word. Tone
    marks/diacritics required by default; a Settings toggle relaxes this.

  Each card can play Vietnamese text-to-speech (requires an OS vi-VN voice;
  see below). Feedback shows the full entry plus example sentences.
- **Reader** — paste Vietnamese text or upload a `.txt` / `.pdf` / `.epub`
  file. The app tokenizes it (greedy longest-match so compounds like
  "học sinh" are caught), shows which words you don't yet know within a chosen
  coverage target, and lets you push those words to the front of your
  new-card queue. Analyzed texts are saved with progress bars.
- **Stats** — study-time/daily-goal tracking with a streak, a vocabulary
  knowledge breakdown (learning / familiar / mastered), and per-CEFR-level
  progress bars.
- **Settings** — daily goal, auto-speak toggle, diacritic strictness, SRS
  retention target, new-words-per-day, and JSON backup export/import.

## Project layout

```
index.html        Shell: header, tab buttons, panel divs, ordered <script> tags
css/style.css     All styling
data/vocab.json       ~3,800 frequency-ranked words w/ glosses, POS, CEFR
data/sentences.json   ~12,000 Vietnamese–English example sentence pairs
js/
  app.js          Entry point: tab routing, study-time timer, daily-goal toast
  data.js         Loads vocab.json, builds id→word index, stripDiacritics()
  srs.js          FSRS-5 spaced repetition, daily counters, priority queue,
                  time tracking, settings, goal streaks  (the engine room)
  vocab.js        Flashcard module, fuzzy answer checking, Vietnamese TTS
  reader.js       Text import/analysis, tokenizer, unknown-word extraction
  sentences.js    Example-sentence lookup over sentences.json
  stats.js        Stats dashboard
  plan.js         Timed guided-study sessions
  settings.js     Settings UI + backup export/import
```

There are no modules/imports — scripts load in dependency order via plain
`<script>` tags and share one global namespace. Each tab is a module class
(`VocabModule`, `ReaderModule`, etc.) that renders into its panel `<div>`.

## How it works

### Spaced repetition

[js/srs.js](js/srs.js) implements **FSRS-5** (Free Spaced Repetition
Scheduler) with the published default weights. Because answers are graded
automatically, it uses binary grading: pass = 3, fail = 1. Each word has two
separate cards (`vi-en`, `en-vi`) with their own Difficulty/Stability state.
A failed card is requeued once within the session. New cards are introduced up
to a daily limit, with a Reader-driven **priority queue** so words from texts
you've pasted jump the line.

### Answer checking

[js/vocab.js](js/vocab.js):
- **vi → en** is forgiving — strips parentheticals/punctuation, ignores
  leading "to"/"a"/"the", allows Levenshtein typos, single-keyword and
  multi-word-phrase containment, with a stop-word list to avoid trivial
  matches.
- **en → vi** compares exactly by default (the test *is* tone/diacritic
  recall). The "Accept answers without diacritics" setting strips tone marks
  via `stripDiacritics()` for a lenient comparison.

### Data

`data/vocab.json` is frequency-ranked Vietnamese words with Wiktionary glosses
(CC BY-SA 3.0); `data/sentences.json` is Tatoeba VN–EN pairs (CC BY 2.0 FR).
**CEFR levels are a frequency-rank heuristic** (top 1000 ≈ A1, 1001–2000 ≈ A2,
2001–3500 ≈ B1, 3501–5000 ≈ B2), not an official mapping.

### Text-to-speech

Vietnamese audio uses the browser's `SpeechSynthesis` API and needs a vi-VN
voice installed in your OS:
- **Windows**: Settings → Time & Language → Speech → Add voices → "Vietnamese".
- **macOS**: System Settings → Accessibility → Spoken Content → System Voice →
  Manage Voices → Vietnamese.
- **Linux**: install `espeak-ng` plus a Vietnamese voice for speech-dispatcher.

If no voice is found, the app shows a one-time install banner.

## Data & privacy

Everything lives in your browser under `localStorage` keys prefixed `vn_`.
Nothing is sent anywhere. Use **Settings → Export backup** to save a JSON
snapshot and **Import backup** to restore it (e.g. on another device or
browser). PDF/EPUB parsing lazy-loads PDF.js / JSZip from a CDN on first use.

## Typing Vietnamese (Telex)

[js/telex.js](js/telex.js) lets you type Vietnamese on a normal keyboard in the
answer boxes (en→vi vocab, Cloze, Listening). Add a key after a letter:
`aa→â`, `aw→ă`, `ee→ê`, `oo→ô`, `ow→ơ`, `w`/`uw→ư`, `dd→đ`; tone keys typed at
the **end** of the syllable — `s`=sắc, `f`=huyền, `r`=hỏi, `x`=ngã, `j`=nặng,
`z`=clear. Tone placement follows the modern rule (e.g. `toans→toán`,
`dduwowngf→đường`). The rules are also shown in the Basics tab.

## Research basis

The default Plan and the learning modes are grounded in second-language
acquisition research:

- **Spaced repetition** — distributed practice reliably beats massing (Kim 2022
  meta-analysis); the app uses FSRS.
- **Retrieval practice & production** — recall beats recognition, and productive,
  in-context retrieval is especially durable → typed answers, and the Cloze mode.
- **Interleaving** — mixing skills/modalities within a session aids retention →
  the Plan interleaves tones, vocab, cloze, listening, and reading.
- **High-Variability Phonetic Training (HVPT)** — the best-supported method for
  L2 tone perception (varied talkers/words + immediate feedback) → the Tones
  drill uses varied words, rotating TTS voices, and instant feedback.
- **Vietnamese tone difficulty** — hỏi/ngã and nặng are hardest for learners, so
  the Tones drill over-samples them.
- **Dictation / output hypothesis** — combining listening with production aids
  acquisition → the Listening mode.
- **Comprehensible input (95–98% coverage)** — validates the Reader's
  coverage-target slicing and the in-context Cloze approach.

See the conversation/commit history for the specific papers consulted.

## Status

Learning modules built: Basics, Vocabulary, Tones, Cloze, Listening, Reader.
The codebase was adapted from a sibling Mandarin app. A grammar module is a
natural next addition.
