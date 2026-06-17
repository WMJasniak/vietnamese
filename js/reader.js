// Reader: paste/upload Vietnamese text, find unknown words, prioritize them
// for vocab study. Supports paste, .txt, .pdf (PDF.js), .epub (JSZip).
// Saved texts with progress bars are recorded under `vn_reader_texts_v1`.
const READER_TEXTS_KEY = 'vn_reader_texts_v1';
const PDFJS_URL    = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.js';
const JSZIP_URL    = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

let _readerVocab = null;   // word.id (lowercase) -> word object
let _readerMaxLen = 1;     // max token count of any vocab entry (for greedy phrase match)
let _pdfReady = null;
let _zipReady = null;

function _readerEnsureDict() {
  if (_readerVocab) return;
  _readerVocab = new Map();
  if (typeof getAllWords !== 'function') return;
  for (const w of getAllWords()) {
    if (!w || !w.word) continue;
    _readerVocab.set(w.word.toLowerCase(), w);
    const n = w.word.split(/\s+/).length;
    if (n > _readerMaxLen) _readerMaxLen = n;
  }
}

// Greedy longest-match tokenizer for Vietnamese. Words are space-separated,
// but compound entries ("học sinh", "vì vậy") need multi-token matching.
const PUNCT_RE = /[\s.,!?;:"'“”‘’()\[\]…—–-]+/u;
function _readerTokenize(text) {
  _readerEnsureDict();
  const cleaned = (text || '').toLowerCase().split(PUNCT_RE).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < cleaned.length) {
    let matched = null;
    for (let L = Math.min(_readerMaxLen, cleaned.length - i); L >= 1; L--) {
      const phrase = cleaned.slice(i, i + L).join(' ');
      if (_readerVocab.has(phrase)) { matched = phrase; break; }
    }
    if (matched) { out.push(matched); i += matched.split(' ').length; }
    else         { out.push(cleaned[i]); i++; }
  }
  return out;
}

// ── File extraction ────────────────────────────────────
async function _loadJsScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function _ensurePdfJs() {
  if (window.pdfjsLib) return;
  if (!_pdfReady) _pdfReady = _loadJsScript(PDFJS_URL)
    .then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; });
  return _pdfReady;
}
async function _ensureJsZip() {
  if (window.JSZip) return;
  if (!_zipReady) _zipReady = _loadJsScript(JSZIP_URL);
  return _zipReady;
}

async function _extractTxt(file)  { return file.text(); }
async function _extractPdf(file) {
  await _ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    out.push(tc.items.map(it => it.str).join(' '));
  }
  return out.join('\n');
}
async function _extractEpub(file) {
  await _ensureJsZip();
  const zip = await window.JSZip.loadAsync(file);
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('EPUB: missing container.xml');
  const opfPath = containerXml.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error('EPUB: no OPF path in container.xml');
  const opfDir = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';
  const opfXml = await zip.file(opfPath).async('text');
  const manifest = {};
  for (const m of opfXml.matchAll(/<item\s+([^>]+?)\/?\s*>/g)) {
    const attrs = {};
    for (const a of m[1].matchAll(/(\w+)\s*=\s*"([^"]+)"/g)) attrs[a[1]] = a[2];
    if (attrs.id && attrs.href) manifest[attrs.id] = attrs.href;
  }
  const spineIds = [];
  for (const m of opfXml.matchAll(/<itemref\s+[^>]*idref\s*=\s*"([^"]+)"/g)) spineIds.push(m[1]);
  const parts = [];
  for (const id of spineIds) {
    const href = manifest[id]; if (!href) continue;
    const html = await zip.file(opfDir + href)?.async('text');
    if (!html) continue;
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      parts.push(doc.body?.textContent || '');
    } catch { parts.push(html.replace(/<[^>]+>/g, ' ')); }
  }
  return parts.join('\n');
}

async function _extractFile(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.pdf'))  return _extractPdf(file);
  if (name.endsWith('.epub')) return _extractEpub(file);
  if (name.endsWith('.mobi') || name.endsWith('.azw') || name.endsWith('.azw3')) {
    throw new Error('MOBI/AZW not supported. Convert to .txt or .epub with Calibre and try again.');
  }
  return _extractTxt(file);
}

// ── Analysis ───────────────────────────────────────────
function _analyze(text) {
  const tokens = _readerTokenize(text);
  const freq = new Map();
  for (const t of tokens) { if (t) freq.set(t, (freq.get(t) || 0) + 1); }
  const total = [...freq.values()].reduce((a, b) => a + b, 0);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
  return { sorted, total, unique: freq.size };
}
function _coverageSlice(sorted, total, pct) {
  const target = total * pct;
  let cum = 0; const out = [];
  for (const [word, count] of sorted) {
    out.push({ word, count }); cum += count;
    if (cum >= target) break;
  }
  return out;
}
function _isReaderKnown(word) {
  if (typeof getCardData !== 'function') return false;
  const d = getCardData(word, 'vi-en');
  return !!(d && d.S >= 7);
}
function _readerHsk(word) {
  return _readerVocab?.get(word)?.cefr ?? null;
}

// ── Saved texts ────────────────────────────────────────
function _loadTexts() {
  try { return JSON.parse(localStorage.getItem(READER_TEXTS_KEY) || '[]'); }
  catch { return []; }
}
function _saveTexts(arr) {
  try { localStorage.setItem(READER_TEXTS_KEY, JSON.stringify(arr)); } catch {}
}
function _addText(title, wordIds, coveragePct) {
  const arr = _loadTexts();
  const d = new Date();
  arr.unshift({
    id: `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: (title || '').trim() || `Untitled · ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    words: wordIds.slice(),
    coverage: coveragePct,
    createdAt: Date.now(),
  });
  _saveTexts(arr);
}
function _deleteText(id) { _saveTexts(_loadTexts().filter(t => t.id !== id)); }
function _textProgress(text) {
  if (!text?.words?.length) return { known: 0, total: 0, pct: 0 };
  let k = 0;
  for (const w of text.words) if (_isReaderKnown(w)) k++;
  return { known: k, total: text.words.length, pct: (k / text.words.length) * 100 };
}

// ── Module ─────────────────────────────────────────────
class ReaderModule {
  constructor(container) {
    this.container = container;
    this._text = '';
    this._analysis = null;
    this._coveragePct = 0.95;
    this._build();
  }
  init() {}
  activate() { this._renderTexts(); }

  _build() {
    this.container.innerHTML = `
      <section id="rd-texts"></section>
      <section class="rd-input">
        <div class="rd-h">Add new text</div>
        <p class="rd-hint">Paste Vietnamese text or upload a file. We'll find the words you don't yet know and you can prioritize them in your vocabulary queue.</p>
        <input type="text" id="rd-title" class="rd-title-input" placeholder="Title (optional) — e.g. 'Đắc Nhân Tâm ch.1'" autocomplete="off">
        <textarea id="rd-text" placeholder="Paste Vietnamese text here…" rows="6"></textarea>
        <div class="rd-input-actions">
          <label class="btn-ghost rd-file-btn">
            📂 Upload .txt / .pdf / .epub
            <input type="file" id="rd-file" accept=".txt,.pdf,.epub" hidden>
          </label>
          <span class="rd-file-name" id="rd-file-name"></span>
          <span class="rd-flex"></span>
          <button class="btn" id="rd-analyze">Analyze</button>
        </div>
        <p class="rd-note">.mobi/.azw3 not supported — convert with Calibre first.</p>
      </section>
      <section id="rd-result"></section>
    `;
    const $ = sel => this.container.querySelector(sel);
    this.el = {
      texts: $('#rd-texts'), title: $('#rd-title'), text: $('#rd-text'),
      file: $('#rd-file'), fileName: $('#rd-file-name'),
      analyze: $('#rd-analyze'), result: $('#rd-result'),
    };
    this.el.text.addEventListener('input', e => { this._text = e.target.value; });
    this.el.file.addEventListener('change', e => this._onFile(e.target.files?.[0]));
    this.el.analyze.addEventListener('click', () => this._runAnalysis());
    this._renderTexts();
  }

  _renderTexts() {
    if (!this.el) return;
    const texts = _loadTexts();
    if (!texts.length) { this.el.texts.innerHTML = ''; return; }
    this.el.texts.innerHTML = `
      <div class="rd-texts-h">Saved texts</div>
      <div class="rd-texts-list">${texts.map(t => this._renderTextRow(t)).join('')}</div>
    `;
    this.el.texts.querySelectorAll('.rd-text-del').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this saved text? (your vocab progress on its words is kept)')) return;
        _deleteText(btn.dataset.id); this._renderTexts();
      });
    });
  }

  _renderTextRow(t) {
    const { known, total, pct } = _textProgress(t);
    const complete = total > 0 && known === total;
    const d = new Date(t.createdAt || 0);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `
      <div class="rd-text-card ${complete ? 'rd-text-card--done' : ''}">
        <div class="rd-text-h">
          <span class="rd-text-title">${_rdEsc(t.title)}${complete ? ' ✓' : ''}</span>
          <span class="rd-text-meta">${ds} · ${Math.round((t.coverage || 0.95) * 100)}% coverage</span>
          <button class="rd-text-del" data-id="${_rdEsc(t.id)}" title="Delete">✕</button>
        </div>
        <div class="rd-text-progress">
          <div class="rd-pbar"><div class="rd-pbar-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <span class="rd-text-pct">${known} / ${total} <span class="rd-dim">(${pct.toFixed(0)}%)</span></span>
        </div>
      </div>`;
  }

  async _onFile(file) {
    if (!file) return;
    this.el.fileName.textContent = `${file.name} (extracting…)`;
    try {
      const text = await _extractFile(file);
      this._text = text;
      this.el.text.value = text.slice(0, 50_000);
      this.el.fileName.textContent = `${file.name} · ${text.length.toLocaleString()} chars`;
    } catch (err) {
      this.el.fileName.textContent = '';
      this._renderError(err.message || String(err));
    }
  }

  async _runAnalysis() {
    const text = (this.el.text.value || this._text || '').trim();
    if (!text) { this._renderError('Paste some text or upload a file first.'); return; }
    if (this.el.text.value && this.el.text.value !== this._text.slice(0, 50_000)) this._text = this.el.text.value;
    if (typeof getAllWords !== 'function' || !getAllWords().length) {
      this._renderError("Vocabulary list isn't loaded yet — open the Vocabulary tab once, then come back."); return;
    }
    this._analysis = _analyze(this._text);
    if (!this._analysis.total) { this._renderError('No Vietnamese tokens detected in the text.'); return; }
    this._renderResult();
  }

  _renderError(msg) { this.el.result.innerHTML = `<div class="rd-err">${_rdEsc(msg)}</div>`; }

  _renderResult() {
    const a = this._analysis, pct = this._coveragePct;
    const slice = _coverageSlice(a.sorted, a.total, pct);
    const unknown = slice.filter(({ word }) => !_isReaderKnown(word));
    const known = slice.length - unknown.length;
    const skipped = a.unique - slice.length;
    let knownTokens = 0;
    for (const [word, count] of a.sorted) if (_isReaderKnown(word)) knownTokens += count;
    const comprehension = (knownTokens / a.total) * 100;
    const rows = unknown.map(({ word, count }) => {
      const inDict = _readerVocab.has(word);
      const cefr = _readerHsk(word);
      return `<tr><td class="rd-word">${_rdEsc(word)}</td><td class="rd-num">${count}</td><td class="rd-num">${cefr || (inDict ? '—' : '<span class="rd-dim">not in list</span>')}</td></tr>`;
    }).join('');
    this.el.result.innerHTML = `
      <div class="rd-summary">
        <div class="rd-stat"><div class="rd-stat-v">${a.total.toLocaleString()}</div><div class="rd-stat-l">tokens</div></div>
        <div class="rd-stat"><div class="rd-stat-v">${a.unique.toLocaleString()}</div><div class="rd-stat-l">unique</div></div>
        <div class="rd-stat"><div class="rd-stat-v">${comprehension.toFixed(1)}%</div><div class="rd-stat-l">you already know</div></div>
      </div>
      <div class="rd-coverage">
        <label class="rd-cov-row" for="rd-cov">
          <span class="rd-cov-lbl">Coverage target</span>
          <input type="range" id="rd-cov" min="60" max="99" step="1" value="${Math.round(pct*100)}">
          <span class="rd-cov-v" id="rd-cov-v">${Math.round(pct*100)}%</span>
        </label>
        <p class="rd-cov-explain">At ${Math.round(pct*100)}%, the top <strong>${slice.length}</strong> most-frequent words cover ${Math.round(pct*100)}% of all token occurrences. <strong>${skipped}</strong> rare words are skipped.</p>
      </div>
      <div class="rd-targets-h">
        <h3>Unknown target words: ${unknown.length}</h3>
        <span class="rd-dim">(${known} already known in target slice)</span>
      </div>
      ${unknown.length ? `
        <div class="rd-table-wrap">
          <table class="rd-table">
            <thead><tr><th>Word</th><th>Freq</th><th>Level</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="rd-actions">
          <button class="btn" id="rd-add">Prioritize ${unknown.length} word${unknown.length === 1 ? '' : 's'} in vocab queue</button>
          <span id="rd-add-msg" class="rd-dim"></span>
        </div>` : `
        <p class="rd-dim">No unknown words in this slice — you already know the words at ${Math.round(pct*100)}% coverage. Try raising the slider.</p>`}
    `;
    this.container.querySelector('#rd-cov')?.addEventListener('input', e => {
      this._coveragePct = Number(e.target.value) / 100;
      this._renderResult();
    });
    const addBtn = this.container.querySelector('#rd-add');
    addBtn?.addEventListener('click', () => {
      const ids = unknown.map(u => u.word).filter(w => _readerVocab.has(w));
      if (!ids.length) { this.container.querySelector('#rd-add-msg').textContent = 'No target words found in the vocabulary list.'; return; }
      addPriorityWords(ids);
      _addText(this.el.title.value, ids, pct);
      addBtn.disabled = true; addBtn.textContent = `✓ Added ${ids.length}`;
      this.container.querySelector('#rd-add-msg').textContent = `Open the Vocabulary tab — these words come first in the next new-card slots.`;
      this.el.title.value = '';
      this._renderTexts();
    });
  }
}

function _rdEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
