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

## Android app

[.github/workflows/android.yml](.github/workflows/android.yml) wraps the same
static site in a thin native WebView shell ([android/](android/)) and
publishes a signed APK to the repo's `android-latest` GitHub Release on every
push to `main`. **Settings → Check for updates** lets the installed app pull
new builds directly — no manual re-download needed: it fetches a small
version marker on launch (and on demand), and if a newer build exists,
downloads the APK and hands off to the system installer (which still asks for
one confirmation tap — Android doesn't allow silent self-update). See
[MainActivity.java](android/app/src/main/java/com/wmjasniak/tiengviet/MainActivity.java)'s
`UpdateBridge` for the native half and `checkForAndroidUpdate()` in
[js/app.js](js/app.js) for the JS half.

## Features

### Home: one guided session, no tab-picking

The app's default screen isn't a menu — it's a single "Ready to learn?"
session that auto-decides what to practice and auto-advances through it,
tab-switching itself on a timer. There's nothing to configure beyond the
daily length (Settings); tapping "Start learning" is the only decision.
This is a deliberate design choice, not just a convenience:

- **Every drill is grouped into one of six categories** — ear training
  (Tones/Sounds), Vocabulary, Structures (Grammar/Chunks), Cloze, Listening,
  Speaking — rather than switching between all ~8 individual drills every
  session. Interleaving 2 skills per session is well-evidenced for
  retention; cramming many distinct tasks into one sitting measurably hurts
  novices more than it helps, so a shared category rotates which specific
  module fills it by calendar day (both still get regular practice across a
  2-day window) or by whichever currently has content ready.
- **Time allocation shifts by stage** (same known-word thresholds the app
  already used): heavier on ear-training/vocabulary early since input
  should outweigh output for beginners, shifting toward sentences and
  speaking as vocabulary grows — but Speaking always gets a modest slice
  even on day one, since output practice should never be zero.
- **Nothing is ever scheduled with nothing to do.** Each category is
  resolved to an actual module right before it starts (not all
  precomputed), checking live content availability at that exact moment —
  e.g. Cloze needs previously-seen vocabulary, which may not exist at the
  very start of a new learner's first session but usually does by the time
  the session reaches it, since Vocabulary runs first in the same session
  and seeds newly-seen words. Anything that turns out empty (including a
  daily new-card cap already used up) is swapped live for Listening, the
  one drill with no such dependency. Reader (needs text you paste yourself)
  and Basics (a static reference, not a drill) are never auto-scheduled —
  there's no default content for either, so a timed rotation would
  guarantee exactly the "nothing to do" failure this is meant to avoid.
- **A persistent session bar** (pause / skip ahead / stop, current segment,
  time remaining) stays visible across every tab the session switches you
  to — otherwise those controls would live only on the Home screen itself,
  which the session immediately switches away from.

Every individual drill — Vocab, Tones, Sounds, Cloze, Grammar, Chunks,
Listening, Speak, Reader, Basics — is still fully reachable from **More**,
for free practice on one specific skill or Reader's paste-your-own-text
workflow. It's just not presented as an equal top-level choice: Home,
Stats, and Settings are the only primary destinations.

- **Basics** — beginner foundation: the alphabet (chữ Quốc ngữ) with
  pronunciation audio, the six tones, a Telex typing cheat-sheet, and survival
  phrases. Everything is tap-to-listen.
- **Tones** — ear-training drill: hear a hidden word, identify its tone. The
  correct tone is derived from the word's diacritics, and the hardest tones
  (hỏi / ngã / nặng) come up more often.
- **Sounds** — Tones' sibling for consonant/vowel contrasts instead of pitch:
  hear a word, pick which sound it has (t/th/đ, ư/u, ng-/nh-/n-, kh-/h-/c-).
  Deliberately skips s/x, tr/ch, and d/gi/r — in the Hanoi/Northern
  pronunciation this app teaches, those are fully merged and sound identical,
  so there'd be nothing to actually hear; the sounds it drills instead are
  ones that are both genuinely distinct in that dialect and have no
  equivalent in English at all.
- **Cloze** — fill-in-the-blank from real sentences. Reviews words you've
  already seen, in context; productive answers feed the SRS.
- **Grammar** — beginner grammar points taught through real example sentences,
  drilled as cloze and scheduled by the same FSRS spaced-repetition engine.
- **Chunks** — formulaic multi-word expressions ("không sao đâu", "ăn cơm
  chưa") drilled and SRS-scheduled the same way as Grammar, distinct from
  Vocab's single words and from Basics' 12 static survival phrases. Fluency
  research treats these as stored and retrieved as a unit rather than
  composed word-by-word, so they get their own ongoing deck instead of
  living only inside single-word vocab cards.
- **Listening** — dictation: hear a word, type what you hear (Telex supported).
- **Speak** — production practice: hear a model word or sentence, say it back.
  Where the browser supports Vietnamese speech recognition, it transcribes
  your attempt and compares it to the target; otherwise it records you and
  plays your attempt back right after the model so you can judge it by ear.
  Session-only — not scheduled by the SRS (speech-to-text for a tonal
  language is too noisy to trust for that).
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
  speak.js        Speaking-practice tab: ASR/record-and-echo pronunciation drill
  stats.js        Stats dashboard
  plan.js         Home screen: stage/availability-aware session scheduler
                  (still named "plan" internally for continuity)
  settings.js     Settings UI + backup export/import
```

There are no modules/imports — scripts load in dependency order via plain
`<script>` tags and share one global namespace. Each tab is a module class
(`VocabModule`, `ReaderModule`, etc.) that renders into its panel `<div>`.

## How it works

### Spaced repetition

[js/srs.js](js/srs.js) implements **FSRS-5** (Free Spaced Repetition
Scheduler) with the published default weights, including the full 4-point
Again/Hard/Good/Easy rating (not just pass/fail). Since nothing in the UI
asks the learner to pick one of those buttons — grading is automatic —
`inferRating()` derives it instead: wrong answers are Again; a card just
missed and then answered correctly again this session is capped at Hard;
otherwise Hard/Good/Easy come from how fast the correct answer came
relative to the learner's own recent typing speed for that kind of card
(a personal, not fixed, baseline). Each word has two separate cards
(`vi-en`, `en-vi`) with their own Difficulty/Stability state. A failed card
is requeued once within the session. New cards are introduced up
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

`data/vocab.json` is a frequency-ranked Vietnamese word list (Tatoeba corpus)
with glosses rebuilt from [kaikki.org / Wiktextract](https://kaikki.org)
(structured Wiktionary, CC BY-SA) — deduped, inflection senses removed, and
archaic/obsolete senses pushed to the end; a curated `PRIMARY_MEANING` map in
[js/data.js](js/data.js) floats the learner-relevant sense first for common
words. `data/sentences.json` is Tatoeba VN–EN pairs (CC BY 2.0 FR).
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

The default Home session and the learning modes are grounded in
second-language acquisition research (see also the *Home* section above for
the session-structuring rationale specifically):

- **Spaced repetition** — distributed practice reliably beats massing (Kim 2022
  meta-analysis); the app uses FSRS.
- **Retrieval practice & production** — recall beats recognition, and productive,
  in-context retrieval is especially durable → typed answers, and the Cloze mode.
- **Interleaving, without over-fragmenting** — mixing skills/modalities within a
  session aids retention (contextual interference effect), but the benefit is
  demonstrated with a couple of alternating tasks, not many at once, and
  over-fragmenting a session measurably hurts novices more than it helps →
  Home groups the ~8 drills into a handful of categories and rotates which
  specific one fills a shared slot by day, rather than interleaving all of
  them every single session.
- **Input before output, but never zero output** — beginners benefit from
  weighting comprehension/perception over production early on, shifting
  gradually as proficiency grows, while still practicing production in some
  amount from day one → Home's per-stage time split, and Speaking's minimum
  slice at every stage.
- **High-Variability Phonetic Training (HVPT)** — the best-supported method for
  L2 sound perception (varied talkers/words + immediate feedback) → both the
  Tones drill (pitch) and the Sounds drill (consonants/vowels) use varied
  words, rotating TTS voices, and instant feedback.
- **Vietnamese tone difficulty** — hỏi/ngã and nặng are hardest for learners, so
  the Tones drill over-samples them.
- **Dictation / output hypothesis** — combining listening with production aids
  acquisition → the Listening mode.
- **ASR-assisted pronunciation training** — a meta-analysis found a large effect
  on segmental accuracy (consonants/vowels) and a small one on suprasegmentals
  (tone) → the Speak mode targets segmental production specifically, as the
  complement to Tones' perception-focused HVPT drill.
- **Comprehensible input (95–98% coverage)** — validates the Reader's
  coverage-target slicing and the in-context Cloze approach.
- **Formulaic sequences** — multi-word expressions are stored/retrieved as a
  unit rather than composed word-by-word, and are a strong predictor of
  fluency (Wray 2002; Nation) → the Chunks mode gives them their own
  SRS-scheduled deck instead of only ever appearing inside single-word cards.

See the conversation/commit history for the specific papers consulted.

## Status

Learning modules built: Basics, Vocabulary, Tones, Sounds, Cloze, Grammar,
Chunks, Listening, Speak, Reader. The codebase was adapted from a sibling
Mandarin app.
