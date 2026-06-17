class SettingsModule {
  constructor(container) {
    this.container = container;
    this._build();
  }

  _build() {
    const s = getSettings();
    this.container.innerHTML = `
      <section class="stats-section">
        <div class="stats-h">Daily Goal</div>
        <div class="setting-row">
          <label class="setting-label" for="s-goal">Study time goal</label>
          <div class="setting-control">
            <input type="number" id="s-goal" class="setting-input" min="1" max="480" value="${s.dailyGoalMins}">
            <span class="setting-unit">minutes / day</span>
          </div>
        </div>
        <div class="setting-actions">
          <button class="btn" id="s-save">Save</button>
          <span id="s-saved" class="setting-saved hidden">✓ Saved</span>
        </div>
      </section>

      <section class="stats-section">
        <div class="stats-h">Learning Aids</div>
        <div class="setting-row">
          <span class="setting-label">Auto-speak Vietnamese in Vocabulary tab (vi→en cards only)</span>
          <label class="setting-toggle-label">
            <input type="checkbox" id="s-autospeak" ${s.autoSpeakVocab !== false ? 'checked' : ''}>
            <span id="s-autospeak-text">${s.autoSpeakVocab !== false ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div class="setting-row">
          <span class="setting-label">Accept en→vi answers without diacritics</span>
          <label class="setting-toggle-label">
            <input type="checkbox" id="s-no-diacritics" ${s.acceptNoDiacritics === true ? 'checked' : ''}>
            <span id="s-no-diacritics-text">${s.acceptNoDiacritics === true ? 'Lenient' : 'Strict'}</span>
          </label>
        </div>
        <div class="setting-hint">
          Strict mode (default) requires correct tone marks — "tôi" ≠ "toi". Lenient accepts both, useful when learning vocab without typing the diacritics.
        </div>
        <div class="setting-row">
          <span class="setting-label">SRS retention target</span>
          <div class="setting-control">
            <input type="range" id="s-retention" class="setting-range" min="70" max="97" step="1" value="${Math.round((s.retentionTarget || 0.9) * 100)}">
            <span class="setting-unit" id="s-retention-val">${Math.round((s.retentionTarget || 0.9) * 100)}%</span>
          </div>
        </div>
        <div class="setting-hint">
          Higher = more frequent reviews. ~90% is the research sweet spot.
        </div>
        <div class="setting-row">
          <span class="setting-label">New words per day</span>
          <div class="setting-control">
            <input type="number" id="s-new-per-day" class="setting-input" min="0" max="40" step="1" value="${s.newPerDay ?? 10}">
            <span class="setting-unit">new card directions / day</span>
          </div>
        </div>
      </section>

      <section class="stats-section">
        <div class="stats-h">Backup &amp; Restore</div>
        <div class="setting-row">
          <span class="setting-label">Save all progress to a file</span>
          <button class="btn" id="s-export">Export backup</button>
        </div>
        <div class="setting-row">
          <span class="setting-label">Load progress from a backup file</span>
          <button class="btn btn-ghost" id="s-import">Import backup</button>
          <input type="file" id="s-import-file" accept="application/json,.json" hidden>
        </div>
      </section>

      <section class="stats-section">
        <div class="stats-h">Reset Data</div>
        <div class="setting-row">
          <span class="setting-label">Study time (total &amp; today)</span>
          <button class="btn btn-ghost" id="s-reset-time">Reset timer</button>
        </div>
        <div class="setting-row">
          <span class="setting-label">Remove today from goal history</span>
          <button class="btn btn-ghost" id="s-reset-today-goal">Remove today</button>
        </div>
      </section>
    `;

    this.container.querySelector('#s-save').addEventListener('click', () => {
      const raw = Number(this.container.querySelector('#s-goal').value);
      const mins = Math.max(1, Math.min(480, raw || 30));
      saveSettings({ ...getSettings(), dailyGoalMins: mins });
      if (typeof rescalePlanToMinutes === 'function') rescalePlanToMinutes(mins);
      const msg = this.container.querySelector('#s-saved');
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 2000);
    });

    this.container.querySelector('#s-autospeak').addEventListener('change', e => {
      saveSettings({ ...getSettings(), autoSpeakVocab: e.target.checked });
      this.container.querySelector('#s-autospeak-text').textContent = e.target.checked ? 'On' : 'Off';
    });

    this.container.querySelector('#s-no-diacritics').addEventListener('change', e => {
      saveSettings({ ...getSettings(), acceptNoDiacritics: e.target.checked });
      this.container.querySelector('#s-no-diacritics-text').textContent = e.target.checked ? 'Lenient' : 'Strict';
    });

    const retention = this.container.querySelector('#s-retention');
    const retentionVal = this.container.querySelector('#s-retention-val');
    retention.addEventListener('input', e => { retentionVal.textContent = `${e.target.value}%`; });
    retention.addEventListener('change', e => {
      saveSettings({ ...getSettings(), retentionTarget: Number(e.target.value) / 100 });
    });

    this.container.querySelector('#s-new-per-day').addEventListener('change', e => {
      const n = Math.max(0, Math.min(40, Math.round(Number(e.target.value) || 0)));
      e.target.value = n;
      saveSettings({ ...getSettings(), newPerDay: n });
    });

    this.container.querySelector('#s-reset-time').addEventListener('click', () => {
      if (!confirm('Reset all study time? This cannot be undone.')) return;
      resetTimeStats();
    });
    this.container.querySelector('#s-reset-today-goal').addEventListener('click', () => {
      removeTodayGoal();
    });

    this.container.querySelector('#s-export').addEventListener('click', () => this._export());
    const fileInput = this.container.querySelector('#s-import-file');
    this.container.querySelector('#s-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) this._import(file);
      e.target.value = '';
    });
  }

  _export() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('vn_')) data[k] = localStorage.getItem(k);
    }
    const payload = { app: 'vietnamese-learning', version: 1, exportedAt: new Date().toISOString(), data };
    const json = JSON.stringify(payload, null, 2);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const filename = `vietnamese-backup-${stamp}.json`;

    // Android WebView ignores <a download>; route through the native "Save As"
    // dialog (SAF) so the file lands somewhere that survives app updates.
    if (window.AndroidBackup && typeof window.AndroidBackup.export === 'function') {
      try { window.AndroidBackup.export(filename, json); return; } catch {}
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  _import(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let payload;
      try { payload = JSON.parse(reader.result); } catch { alert('Invalid backup file.'); return; }
      const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
      if (!data || typeof data !== 'object') { alert('Invalid backup file: missing data.'); return; }
      const keys = Object.keys(data).filter(k => k.startsWith('vn_'));
      if (!keys.length) { alert('Backup contains no Vietnamese-app progress data.'); return; }
      if (!confirm(`Restore ${keys.length} item(s)? This will OVERWRITE your current progress.`)) return;
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('vn_')) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      for (const k of keys) {
        const v = data[k];
        if (typeof v === 'string') localStorage.setItem(k, v);
      }
      alert('Backup restored. The page will reload.');
      location.reload();
    };
    reader.readAsText(file);
  }
}
