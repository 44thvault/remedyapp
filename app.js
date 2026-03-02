/*═══════════════════════════════════════════════════════
  TERRA MATERIA v4 — APPLICATION LOGIC
  Architecture: DataStore → Filter → Render → State → App
  
  All traditional-use claims are based on documented
  sources. Each remedy includes verifiable citation URLs.
═══════════════════════════════════════════════════════*/

// ════════════════ DATA STORE ════════════════
// Loaded from remedies.json; holds all data once fetched.

let DB = { remedies: [], conditions: [], chipGroups: [], tagFilters: [], aliases: {} };

async function loadData() {
  try {
    const res = await fetch('remedies.json');
    if (!res.ok) throw new Error('Failed to load data');
    DB = await res.json();
    App.init();
  } catch (e) {
    console.error('Data load error:', e);
    document.getElementById('resGrid').innerHTML =
      '<div class="nores"><h3>Unable to load remedy data</h3><p>Please ensure remedies.json is in the same directory.</p></div>';
    document.getElementById('resArea').style.display = 'block';
  }
}

// ════════════════ FILTER ENGINE ════════════════

const Filter = {
  _get(id) { return DB.remedies.find(r => r.id === id); },

  byCond(cid) {
    const c = DB.conditions.find(x => x.id === cid);
    return c ? c.rids.map(id => this._get(id)).filter(Boolean) : [];
  },

  byTag(tag) {
    return DB.remedies.filter(r => r.tags.includes(tag));
  },

  byGroup(label) {
    const g = DB.chipGroups.find(x => x.label === label);
    if (!g) return [];
    const seen = new Set(), out = [];
    g.terms.forEach(t => this.byCond(t).forEach(r => {
      if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    }));
    return out;
  },

  search(raw) {
    const q = raw.toLowerCase().trim();
    if (!q) return { results: [], label: '' };

    // 1. Exact condition match
    let cond = DB.conditions.find(c => c.id === q || c.label.toLowerCase() === q);
    if (cond) return { results: this.byCond(cond.id), label: cond.label };

    // 2. Alias match
    if (DB.aliases[q]) {
      cond = DB.conditions.find(c => c.id === DB.aliases[q]);
      if (cond) return { results: this.byCond(cond.id), label: cond.label };
    }

    // 3. Partial alias match
    for (const [key, val] of Object.entries(DB.aliases)) {
      if (key.includes(q) || q.includes(key)) {
        cond = DB.conditions.find(c => c.id === val);
        if (cond) return { results: this.byCond(cond.id), label: cond.label };
      }
    }

    // 4. Partial condition label match
    cond = DB.conditions.find(c => c.label.toLowerCase().includes(q) || c.id.includes(q));
    if (cond) return { results: this.byCond(cond.id), label: cond.label };

    // 5. Full-text remedy search
    const res = DB.remedies.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.sci && r.sci.toLowerCase().includes(q)) ||
      r.supports.some(s => s.toLowerCase().includes(q)) ||
      r.tags.some(t => t.toLowerCase().includes(q)) ||
      r.cat.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q)
    );
    return { results: res, label: raw };
  },

  random(n) {
    const shuffled = [...DB.remedies].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n);
  }
};

// ════════════════ RENDER ENGINE ════════════════

const Render = {
  // SVG icon strings
  _extSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  _chevSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="6 9 12 15 18 9"/></svg>',
  _heartSvg(fill) { return `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.5" width="15" height="15"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`; },
  _noteSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="15" height="15"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',

  card(r, i) {
    const fav = State.favs.includes(r.id);
    const noteData = State.notes[r.id] || '';
    const hasNote = noteData.length > 0;
    const d = Math.min(i * 0.05, 0.5);
    const lat = r.sci ? `<div class="rc-lat">${r.sci}</div>` : '';
    const trad = r.traditions.map(t => `<span class="b-tr">${t}</span>`).join('');

    // Related remedies — use data-id to avoid quote-breaking in onclick
    let relatedHtml = '';
    if (r.related && r.related.length) {
      const relPills = r.related.map(rid => {
        const rel = Filter._get(rid);
        return rel ? `<button class="related-pill" data-rid="${rid}" onclick="App.searchById('${rid}')">${rel.name}</button>` : '';
      }).filter(Boolean).join('');
      if (relPills) {
        relatedHtml = `<div class="db"><div class="dl">Related Remedies</div><div class="related-row">${relPills}</div></div>`;
      }
    }

    // User note
    const noteHtml = hasNote
      ? `<div class="user-note">📝 ${this._esc(noteData)}</div>`
      : '';

    return `<article class="rc" style="animation-delay:${d}s" aria-label="${r.name}">
<div class="rc-bar"></div><div class="rc-body">
<div class="rc-top"><div class="rc-badges"><span class="b-cat">${r.cat}</span>${trad}</div>
<div class="rc-actions">
<button class="note-btn${hasNote?' has':''}" onclick="App.openNote('${r.id}')" aria-label="Add note" title="Add note">${this._noteSvg}</button>
<button class="fav${fav?' on':''}" onclick="App.fav('${r.id}')" aria-label="${fav?'Remove':'Save'} favorite" title="Favorite">${this._heartSvg(fav?'currentColor':'none')}</button>
</div></div>
<h3 class="rc-name">${r.name}</h3>${lat}
<div class="rc-sup"><div class="rc-sup-h">Traditionally used to support</div><ul>${r.supports.map(s=>`<li>${s}</li>`).join('')}</ul></div>
<div class="rc-tags">${r.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
<button class="xbtn" onclick="Render.expand(this)" aria-expanded="false">Learn More ${this._chevSvg}</button>
<div class="xdet"><div class="xdet-in">
<div class="db"><div class="dl">Traditional Use</div><div class="dt">${r.summary}</div></div>
<div class="db"><div class="dl">Preparation Methods</div><div class="dt"><ul>${r.preps.map(p=>`<li>${p}</li>`).join('')}</ul></div></div>
${r.serving?`<div class="db"><div class="dl">Traditional Serving Guidance</div><div class="dt">${r.serving}</div></div>`:''}
<div class="db"><div class="dl">Modern Context</div><div class="dt">${r.modern}</div></div>
<div class="db"><div class="dl">Safety Considerations</div><div class="saf"><div class="dt">${r.safety}</div></div></div>
${relatedHtml}
<div class="db"><div class="dl ref-h">Sources</div>${r.refs.map(x=>`<a class="ref-a" href="${x.u}" target="_blank" rel="noopener noreferrer">${this._extSvg} ${x.t}</a>`).join('')}</div>
${noteHtml}
</div></div></div></article>`;
  },

  expand(btn) {
    const det = btn.nextElementSibling;
    const open = det.classList.toggle('o');
    btn.classList.toggle('o', open);
    btn.setAttribute('aria-expanded', open);
    btn.innerHTML = (open ? 'Show Less ' : 'Learn More ') + this._chevSvg;
  },

  show(items, title) {
    const area = document.getElementById('resArea');
    const grid = document.getElementById('resGrid');
    const titleEl = document.getElementById('resTitle');
    const countEl = document.getElementById('resN');

    titleEl.innerHTML = title;
    area.style.display = 'block';
    document.getElementById('browseArea').style.display = items.length ? 'none' : 'block';
    document.getElementById('tipsSection').style.display = 'none';

    if (!items.length) {
      grid.innerHTML = '<div class="nores"><h3>No supports found</h3><p>Try: headache, cold, sore throat, anxiety, insomnia, digestion, fatigue, immunity, or brain fog.</p></div>';
      countEl.textContent = '';
      return;
    }

    countEl.textContent = items.length + ' support' + (items.length !== 1 ? 's' : '');
    grid.innerHTML = items.map((r, i) => this.card(r, i)).join('');
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  showFavs() {
    const favItems = DB.remedies.filter(r => State.favs.includes(r.id));
    if (!favItems.length) {
      this.show([], 'Your <em>Saved</em> Remedies');
      document.getElementById('resGrid').innerHTML = '<div class="nores"><h3>No saved remedies yet</h3><p>Tap the heart icon on any remedy to save it here.</p></div>';
    } else {
      this.show(favItems, 'Your <em>Saved</em> Remedies');
    }
    document.getElementById('browseArea').style.display = 'none';
    document.getElementById('tipsSection').style.display = 'none';
  },

  chips() {
    const cc = document.getElementById('condChips');
    const tc = document.getElementById('tagChips');
    cc.innerHTML = '<span class="chip-label">By concern</span>' +
      DB.chipGroups.map(g =>
        `<button class="chip" data-ct="g" onclick="App.chip('g','${g.label}',this)">${g.label}</button>`
      ).join('');
    tc.innerHTML = '<span class="chip-label">By property</span>' +
      DB.tagFilters.map(t =>
        `<button class="chip" data-ct="t" onclick="App.chip('t',\`${t}\`,this)">${t}</button>`
      ).join('');
  },

  browse() {
    document.getElementById('browseGrid').innerHTML = DB.conditions.map(c =>
      `<div class="bc" onclick="App.browseC('${c.id}')" role="button" tabindex="0" aria-label="Browse ${c.label}">
        <div class="bc-i">${c.icon}</div>
        <div class="bc-n">${c.label}</div>
        <div class="bc-c">${c.rids.length} support${c.rids.length !== 1 ? 's' : ''}</div>
      </div>`
    ).join('');
  },

  tips() {
    const picks = Filter.random(4);
    document.getElementById('tipsGrid').innerHTML = picks.map(r =>
      `<div class="tip-card" onclick="App.searchById('${r.id}')" tabindex="0" aria-label="Explore ${this._esc(r.name)}">
        <div class="tip-name">${r.name}</div>
        <div class="tip-cat">${r.cat} · ${r.traditions[0] || ''}</div>
        <div class="tip-desc">${r.summary}</div>
      </div>`
    ).join('');
  },

  favBadge() {
    document.getElementById('favDot').classList.toggle('on', State.favs.length > 0);
  },

  skeleton() {
    const grid = document.getElementById('resGrid');
    grid.innerHTML = Array(4).fill(
      '<div class="sk"><div class="sk-l w40 h18"></div><div class="sk-l w80"></div><div class="sk-l w60"></div><div class="sk-l w80"></div><div class="sk-l w40"></div></div>'
    ).join('');
    document.getElementById('resArea').style.display = 'block';
    document.getElementById('tipsSection').style.display = 'none';
  },

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};

// ════════════════ STATE MANAGER ════════════════

const State = {
  favs: [],
  notes: {},
  theme: 'light',
  tab: 'explore',

  load() {
    try {
      this.favs = JSON.parse(localStorage.getItem('tm4_f') || '[]');
      this.notes = JSON.parse(localStorage.getItem('tm4_n') || '{}');
      this.theme = localStorage.getItem('tm4_t') || 'light';
      const last = localStorage.getItem('tm4_q');
      if (last) document.getElementById('q').value = last;
    } catch (e) { /* localStorage unavailable */ }
    if (this.theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    Render.favBadge();
  },

  saveFavs() {
    try { localStorage.setItem('tm4_f', JSON.stringify(this.favs)); } catch (e) {}
    Render.favBadge();
  },

  saveNotes() {
    try { localStorage.setItem('tm4_n', JSON.stringify(this.notes)); } catch (e) {}
  },

  saveTheme() {
    try { localStorage.setItem('tm4_t', this.theme); } catch (e) {}
  },

  saveQuery(q) {
    try { localStorage.setItem('tm4_q', q); } catch (e) {}
  }
};

// ════════════════ APP CONTROLLER ════════════════

const App = {
  _noteTarget: null,

  init() {
    State.load();
    Render.chips();
    Render.browse();
    Render.tips();

    // Search on Enter
    document.getElementById('q').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.search();
    });

    // Back to top button
    window.addEventListener('scroll', () => {
      document.getElementById('btt').classList.toggle('on', scrollY > 400);
    });

    // Close modal on overlay click
    document.getElementById('noteModal').addEventListener('click', e => {
      if (e.target === document.getElementById('noteModal')) this.closeNote();
    });

    // Close modal on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeNote();
    });
  },

  search(query) {
    query = query || document.getElementById('q').value.trim();
    if (!query) return;
    document.getElementById('q').value = query;
    State.saveQuery(query);
    this.clearChips();
    this.tab('explore', document.querySelector('[data-t="explore"]'));

    Render.skeleton();
    setTimeout(() => {
      const { results, label } = Filter.search(query);
      Render.show(results, `Supports for <em>${Render._esc(label || query)}</em>`);
    }, 200);
  },

  searchById(id) {
    const r = Filter._get(id);
    if (!r) return;
    document.getElementById('q').value = r.name;
    Render.skeleton();
    setTimeout(() => Render.show([r], `<em>${Render._esc(r.name)}</em>`), 150);
    document.getElementById('browseArea').style.display = 'none';
    document.getElementById('tipsSection').style.display = 'none';
  },

  searchDirect(name) {
    // Search for a specific remedy by name (safe to call from JS, not from inline onclick with special chars)
    const r = DB.remedies.find(x => x.name === name);
    if (r) {
      this.searchById(r.id);
    } else {
      this.search(name);
    }
  },

  chip(type, val, el) {
    const wasActive = el.classList.contains('on');
    this.clearChips();
    if (wasActive) { this.reset(); return; }
    el.classList.add('on');

    Render.skeleton();
    setTimeout(() => {
      let results, title;
      if (type === 'g') {
        results = Filter.byGroup(val);
        title = `<em>${val}</em> supports`;
      } else {
        results = Filter.byTag(val);
        title = `Tagged <em>${val}</em>`;
      }
      Render.show(results, title);
    }, 180);
  },

  browseC(id) {
    const c = DB.conditions.find(x => x.id === id);
    if (!c) return;
    document.getElementById('q').value = c.label;
    State.saveQuery(c.label);
    this.clearChips();

    Render.skeleton();
    setTimeout(() => Render.show(Filter.byCond(id), `Supports for <em>${c.label}</em>`), 180);
  },

  clearChips() {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  },

  tab(t, btn) {
    State.tab = t;
    document.querySelectorAll('.tbtn').forEach(b => {
      b.classList.remove('on');
      b.setAttribute('aria-selected', 'false');
    });
    if (btn) {
      btn.classList.add('on');
      btn.setAttribute('aria-selected', 'true');
    }

    if (t === 'favs') {
      document.getElementById('browseArea').style.display = 'none';
      document.getElementById('tipsSection').style.display = 'none';
      Render.showFavs();
    } else {
      const q = document.getElementById('q').value.trim();
      if (!q) {
        document.getElementById('resArea').style.display = 'none';
        document.getElementById('browseArea').style.display = 'block';
        document.getElementById('tipsSection').style.display = 'block';
      }
    }
  },

  showFavs() {
    if (State.tab === 'favs') {
      this.tab('explore', document.querySelector('[data-t="explore"]'));
      this.reset();
    } else {
      this.tab('favs', document.querySelector('[data-t="favs"]'));
    }
  },

  fav(id) {
    const idx = State.favs.indexOf(id);
    if (idx > -1) State.favs.splice(idx, 1);
    else State.favs.push(id);
    State.saveFavs();

    if (State.tab === 'favs') {
      Render.showFavs();
      return;
    }

    // Update button in place
    document.querySelectorAll('.fav').forEach(btn => {
      if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes("'" + id + "'")) {
        const on = State.favs.includes(id);
        btn.classList.toggle('on', on);
        btn.innerHTML = Render._heartSvg(on ? 'currentColor' : 'none');
      }
    });
  },

  // ═══ NOTES ═══
  openNote(id) {
    this._noteTarget = id;
    const r = Filter._get(id);
    document.getElementById('noteModalTitle').textContent = 'Note — ' + (r ? r.name : '');
    document.getElementById('noteText').value = State.notes[id] || '';
    document.getElementById('noteModal').style.display = 'flex';
    document.getElementById('noteText').focus();
  },

  saveNote() {
    if (!this._noteTarget) return;
    const text = document.getElementById('noteText').value.trim();
    if (text) {
      State.notes[this._noteTarget] = text;
    } else {
      delete State.notes[this._noteTarget];
    }
    State.saveNotes();
    this.closeNote();

    // Re-render current view
    if (State.tab === 'favs') {
      Render.showFavs();
    } else {
      const q = document.getElementById('q').value.trim();
      if (q) this.search(q);
    }
  },

  closeNote() {
    document.getElementById('noteModal').style.display = 'none';
    this._noteTarget = null;
  },

  theme() {
    State.theme = State.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', State.theme);
    State.saveTheme();
  },

  reset() {
    document.getElementById('q').value = '';
    document.getElementById('resArea').style.display = 'none';
    document.getElementById('browseArea').style.display = 'block';
    document.getElementById('tipsSection').style.display = 'block';
    this.clearChips();
    this.tab('explore', document.querySelector('[data-t="explore"]'));
    Render.tips(); // Refresh tips
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// ════════════════ BOOT ════════════════
document.addEventListener('DOMContentLoaded', () => loadData());
