// Stats dashboard for the Vietnamese app.
// Shows: study time + daily goal, knowledge categories, CEFR-level progress bars.
const CEFR_LABELS = { 1:'A1', 2:'A2', 3:'B1', 4:'B2', 5:'C1', 6:'C2' };
const CEFR_COLORS = { 1:'#4caf50', 2:'#7cb342', 3:'#f9a825', 4:'#fb8c00', 5:'#e53935', 6:'#8e24aa' };

class StatsModule {
  constructor(container) { this.container = container; this.words = []; this._render(); }
  init(words) { this.words = words; this.refresh(); }
  refresh() { this._render(); }

  _render() {
    if (!this.words.length) {
      this.container.innerHTML = `<p class="stats-placeholder">Open the <strong>Vocabulary</strong> tab first to load words.</p>`;
      return;
    }
    const time = getTimeStats();
    const goal = getGoalStats();
    const know = this._calcKnowledge();
    const cefr = this._calcCefr();

    this.container.innerHTML =
      this._timeSection(time, goal) +
      this._knowledgeSection(know) +
      this._cefrSection(cefr);
  }

  _calcKnowledge() {
    const r = { mastered: 0, familiar: 0, learning: 0, unseen: 0 };
    for (const w of this.words) {
      const d = getCardData(w.id, 'vi-en');
      if (!d)             r.unseen++;
      else if (d.S >= 30) r.mastered++;
      else if (d.S >= 7)  r.familiar++;
      else                r.learning++;
    }
    return r;
  }

  _calcCefr() {
    const levels = {};
    for (let i = 1; i <= 6; i++) levels[i] = { total: 0, known: 0, mastered: 0 };
    for (const w of this.words) {
      const n = Math.min(Math.max(w.cefrNum || 99, 1), 6);
      if ((w.cefrNum || 99) > 90) continue;
      levels[n].total++;
      const d = getCardData(w.id, 'vi-en');
      if (d?.S >= 1)  levels[n].known++;
      if (d?.S >= 30) levels[n].mastered++;
    }
    return levels;
  }

  _timeSection(time, goal) {
    const min = Math.floor(time.today / 60);
    const goalMin = Math.round(goal.goalSecs / 60);
    const pct = Math.min(100, (time.today / goal.goalSecs) * 100);
    return `
      <section class="stats-section">
        <div class="stats-h">Today</div>
        <div class="time-row">
          <div class="time-now">${min} <span class="time-unit">min</span></div>
          <div class="time-goal">of ${goalMin} min goal</div>
        </div>
        <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
        <div class="stats-h" style="margin-top:1rem;">Streak</div>
        <div class="streak-row">
          <div class="streak-num">${goal.streak}</div>
          <div class="streak-lbl">day${goal.streak !== 1 ? 's' : ''} hitting goal</div>
        </div>
        ${this._contribCalendar(goal.history)}
      </section>`;
  }

  // GitHub-style contribution heatmap of the last ~3 months.
  // Columns are weeks (oldest→newest), rows are weekdays (Sun→Sat).
  // We only track a daily goal-hit boolean, so cells are binary: hit / missed.
  _contribCalendar(history) {
    const WEEKS = 14; // ~3 months (incl. the current partial week)
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Start at the Sunday (WEEKS-1) weeks before the Sunday of the current week.
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - (WEEKS - 1) * 7);

    let cells = '', months = '', prevMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const colDate = new Date(start); colDate.setDate(start.getDate() + w * 7);
      const m = colDate.getMonth();
      months += `<div class="gh-month">${m !== prevMonth ? MONTHS[m] : ''}</div>`;
      prevMonth = m;
      // Column-major emission to match grid-auto-flow: column.
      for (let d = 0; d < 7; d++) {
        const date = new Date(start); date.setDate(start.getDate() + w * 7 + d);
        if (date > today) { cells += `<div class="gh-cell gh-future"></div>`; continue; }
        const hit = !!history[date.toDateString()];
        const isToday = date.getTime() === today.getTime();
        const label = date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
        cells += `<div class="gh-cell${hit ? ' gh-hit' : ''}${isToday ? ' gh-today' : ''}" title="${label}${hit ? ' · goal hit' : ''}"></div>`;
      }
    }
    const weekdays = ['', 'Mon', '', 'Wed', '', 'Fri', '']
      .map(l => `<div class="gh-weekday">${l}</div>`).join('');

    return `
      <div class="gh">
        <div class="gh-top"><div class="gh-corner"></div><div class="gh-months">${months}</div></div>
        <div class="gh-main">
          <div class="gh-weekdays">${weekdays}</div>
          <div class="gh-grid">${cells}</div>
        </div>
        <div class="gh-legend">
          <span class="gh-cell gh-hit"></span> Goal hit
          <span class="gh-cell"></span> Missed
        </div>
      </div>`;
  }

  _knowledgeSection(k) {
    const total = k.mastered + k.familiar + k.learning + k.unseen;
    const pct = v => total ? Math.round(v / total * 100) : 0;
    return `
      <section class="stats-section">
        <div class="stats-h">Vocabulary knowledge</div>
        <div class="know-bars">
          <div class="know-row"><span class="know-lbl">Mastered (S ≥ 30d)</span><span class="know-val">${k.mastered}</span></div>
          <div class="know-row"><span class="know-lbl">Familiar (S ≥ 7d)</span><span class="know-val">${k.familiar}</span></div>
          <div class="know-row"><span class="know-lbl">Learning</span><span class="know-val">${k.learning}</span></div>
          <div class="know-row know-row-dim"><span class="know-lbl">Not yet seen</span><span class="know-val">${k.unseen}</span></div>
        </div>
        <div class="hsk-bar-wrap" style="margin-top:.6rem;">
          ${k.mastered ? `<div class="hsk-bar-layer" style="left:0;width:${pct(k.mastered)}%;background:var(--correct)"></div>` : ''}
          ${k.familiar ? `<div class="hsk-bar-layer" style="left:${pct(k.mastered)}%;width:${pct(k.familiar)}%;background:#f9a825"></div>` : ''}
          ${k.learning ? `<div class="hsk-bar-layer" style="left:${pct(k.mastered) + pct(k.familiar)}%;width:${pct(k.learning)}%;background:#fb8c00"></div>` : ''}
        </div>
      </section>`;
  }

  _cefrSection(levels) {
    let rows = '';
    for (let i = 1; i <= 6; i++) {
      const l = levels[i]; if (!l.total) continue;
      const pct = Math.round(l.known / l.total * 100);
      const mastPct = Math.round(l.mastered / l.total * 100);
      const isFrontier = pct > 5 && pct < 95;
      const color = CEFR_COLORS[i];
      rows += `
        <div class="hsk-row${isFrontier ? ' hsk-frontier' : ''}">
          <div class="hsk-lbl">${CEFR_LABELS[i]}</div>
          <div class="hsk-bar-wrap">
            <div class="hsk-bar-layer" style="width:${pct}%;background:${color}55"></div>
            <div class="hsk-bar-layer" style="width:${mastPct}%;background:${color}"></div>
          </div>
          <div class="hsk-pct">${pct}%</div>
          <div class="hsk-cnt">${l.known}/${l.total}</div>
        </div>`;
    }
    return `
      <section class="stats-section">
        <div class="stats-h">CEFR level progress</div>
        <p class="stats-sub">Frequency-based CEFR mapping (top 1000 ≈ A1, 1001–2000 ≈ A2, 2001–3500 ≈ B1, 3501–5000 ≈ B2).</p>
        ${rows}
      </section>`;
  }
}
