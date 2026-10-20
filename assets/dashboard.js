
const REG = JSON.parse(document.getElementById('registry').textContent);
const DSL = JSON.parse(document.getElementById('dslist').textContent);
const store = {get(k){try{return localStorage.getItem(k)}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
let DS = DSL.length === 1 ? DSL[0][0] : store.get('cedar-ds'); if (!DSL.some(d => d[0] === DS)) DS = DSL[0][0];
let VIEW = 'all';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $ = (s, el=document) => el.querySelector(s), $$ = (s, el=document) => [...el.querySelectorAll(s)];
const dsName = k => (DSL.find(d => d[0] === k) || [k, k])[1];

// ------------------------------------------------------------------ export
function mdTable(title, cols, rows, prov){
  const e = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  let s = '**' + title + '**\n\n| ' + cols.map(e).join(' | ') + ' |\n|' + cols.map(() => ' --- |').join('') + '\n';
  rows.forEach(r => { s += '| ' + r.map(e).join(' | ') + ' |\n'; });
  return s + (prov ? '\n_' + prov + '_\n' : '');
}
function csv(cols, rows, prov){
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  return [cols.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\n') + (prov ? '\n\n' + q(prov) : '') + '\n';
}
function copy(text, btn){
  const done = () => { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = o, 1200); };
  const fb = () => { const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); done(); } catch(e) { btn.textContent = 'Copy failed'; } a.remove(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fb); else fb();
}
function download(name, text){
  const url = URL.createObjectURL(new Blob([text], {type: 'text/csv'}));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------ dataset / view switching
function applyState(){
  $$('#ds-switch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.ds === DS));
  if ($('#v-all')) { $('#v-all').setAttribute('aria-pressed', VIEW === 'all'); $('#v-hr').setAttribute('aria-pressed', VIEW === 'headroom'); }
  $$('.dsblock').forEach(b => b.hidden = b.dataset.ds !== DS);
  $$('[data-view]').forEach(t => t.hidden = t.dataset.view !== VIEW);
  const all = !$('#ov-all') || $('#ov-all').checked;
  $$('#t-overview tr.row-ds').forEach(tr => tr.hidden = !all && !tr.classList.contains('ds-' + DS));
  $$('.dsname').forEach(e => e.textContent = dsName(DS));
  loadData(DS);
}
const LOADED = {};
window.CEDAR_DATA = window.CEDAR_DATA || {};
function loadData(ds){
  if (!window.CEDAR_DATA[ds]) {
    const el = document.getElementById('cedar-data-' + ds);
    if (!el || LOADED[ds]) return;
    LOADED[ds] = true;
    try { window.CEDAR_DATA[ds] = JSON.parse(el.textContent); }
    catch (e) { $$('.dsblock[data-ds="' + ds + '"] .trbody, .dsblock[data-ds="' + ds + '"] .fpqbody, #map-' + ds)
      .forEach(x => x.innerHTML = '<p class="empty">Could not read the transcript data: ' + esc(e.message) + '</p>'); return; }
  }
  renderData(ds);
}
const RENDERED = {};
function renderData(ds){
  if (RENDERED[ds]) return; RENDERED[ds] = true;
  const D = window.CEDAR_DATA[ds];
  $$('.transcripts[data-ds="' + ds + '"]').forEach(el => initTranscripts(el, D));
  const fp = $('#fpq-' + ds); if (fp) renderFpq(fp, D);
  renderMap(ds, D);
}

// ------------------------------------------------------------------ transcripts
const TR = {};
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
function extraCols(sec, r){
  if (sec === 'context') return [r.x || '—'];
  if (sec === 'pressure') return [];
  return [];
}
function rowCells(sec, r, D, full){
  const q = r.q + ' · ' + cut(D.S[D.questions[r.q]] ?? '', 80);
  const hidden = full ? 0 : r.t.filter(t => t[2]).length;
  const turns = (hidden ? ['AISI prompt: ' + hidden + ' message(s) unchanged (click the row to see them)'] : [])
    .concat(r.t.filter(t => full || !t[2]).map(t => (full ? t[0] + ': ' + D.S[t[1]] : t[0] + ': ' + cut(D.S[t[1]], 200))));
  turns.push('reply: ' + (full ? D.S[r.r] : cut(D.S[r.r], 200)));
  const name = D.names[r.m] || r.m;
  const out = r.bad ? r.bad + ' call' : r.o;
  if (sec === 'context') return [q, name, r.cl, turns, r.a, r.k, out, r.x || '—'];
  if (sec === 'pressure') return [q, name, r.cl, turns, r.first, r.a, r.k, out + (r.chg ? ' (' + r.chg + ')' : '')];
  if (sec === 'screen' || sec === 'conf' || sec === 'pap') return [q, name, r.cl, turns, r.a, r.k, out, r.x || '—'];
  if (sec.endsWith('_conf')) return [q, name, r.cl, turns, r.a, r.k, out, r.cf || '—'];
  if (sec.endsWith('_cons')) return [q, name, r.cl, turns, r.a, r.k, out, r.ck || '—'];
  return [q, name, r.cl, turns, r.a, r.k, out];
}
function initTranscripts(el, D){
  const sec = el.dataset.section, S = D.sections[sec];
  const body = $('.trbody', el);
  if (!S) { body.innerHTML = '<p class="empty">No transcripts for this step.</p>'; return; }
  const models = D.models.filter(m => S.rows.some(r => r.m === m));
  const qs = [...new Set(S.rows.map(r => r.q))].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const conds = [...new Set(S.rows.map(r => r.cl))];
  const outs = [...new Set(S.rows.map(r => r.bad ? r.bad + ' call' : r.o).filter(Boolean))];
  const opt = (v, l) => '<option value="' + esc(v) + '">' + esc(l) + '</option>';
  body.innerHTML = '<div class="trfilters">' +
    '<label>Model <select data-f="m"><option value="">all</option>' + models.map(m => opt(m, D.names[m] || m)).join('') + '</select></label>' +
    '<label>Question <select data-f="q"><option value="">all</option>' + qs.map(q => opt(q, q)).join('') + '</select></label>' +
    '<label>Condition <select data-f="c"><option value="">all</option>' + conds.map(c => opt(c, c)).join('') + '</select></label>' +
    '<label>Outcome <select data-f="o"><option value="">all</option>' + outs.map(o => opt(o, o)).join('') + '</select></label>' +
    '<input type="search" data-f="s" placeholder="Search text">' +
    '<label><input type="checkbox" data-f="bad"> Show broken/failed calls</label>' +
    '<button type="button" class="btn" data-f="default">Default examples</button></div>' +
    '<p class="note trinfo"></p><div class="scroll"><table class="t tr"><thead><tr>' +
    S.cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody></tbody></table></div>';
  TR[sec + ds_of(el)] = {el, D, S, sec, mode: 'default', f: {}};
  $$('[data-f]', el).forEach(i => i.addEventListener(i.tagName === 'BUTTON' ? 'click' : 'input', () => {
    const st = TR[sec + ds_of(el)];
    if (i.dataset.f === 'default') { st.mode = 'default'; $$('select,input[type=search]', el).forEach(x => x.value = '');
      $('[data-f=bad]', el).checked = false; } else st.mode = 'filter';
    drawTranscripts(st);
  }));
  drawTranscripts(TR[sec + ds_of(el)]);
}
const ds_of = el => el.dataset.ds;
function trFiltered(st){
  const {el, D, S} = st;
  const v = k => { const i = $('[data-f=' + k + ']', el); return i ? (i.type === 'checkbox' ? i.checked : i.value) : ''; };
  const showBad = v('bad');
  let rows = S.rows.filter(r => showBad || !r.bad);
  if (st.mode === 'default') {
    const d = S.default;
    rows = rows.filter(r => d.q.includes(r.q) && d.m.includes(r.m) && (!d.c || r.c === d.c));
    rows.sort((a, b) => d.q.indexOf(a.q) - d.q.indexOf(b.q) || d.m.indexOf(a.m) - d.m.indexOf(b.m) || (a.ts || '').localeCompare(b.ts || ''));
    return rows;
  }
  const m = v('m'), q = v('q'), c = v('c'), o = v('o'), s = v('s').toLowerCase();
  rows = rows.filter(r => (!m || r.m === m) && (!q || r.q === q) && (!c || r.cl === c || r.c === c) &&
    (!o || (r.bad ? r.bad + ' call' : r.o) === o));
  if (s) rows = rows.filter(r => (D.S[r.r] + ' ' + r.t.map(t => D.S[t[1]]).join(' ') + ' ' + r.q).toLowerCase().includes(s));
  const mo = D.models;
  rows.sort((a, b) => a.q.length - b.q.length || a.q.localeCompare(b.q) || mo.indexOf(a.m) - mo.indexOf(b.m) || (a.ts || '').localeCompare(b.ts || ''));
  return rows;
}
function drawTranscripts(st){
  const {el, D, sec} = st;
  const rows = trFiltered(st), shown = rows.slice(0, 150);
  const d = st.S.default;
  $('.trinfo', el).innerHTML = (st.mode === 'default'
    ? 'Default examples: up to 3 questions where locked Cedar and ' + esc(D.names[D.closest] || D.closest) +
      ' (closest accuracy) behaved differently, then up to 2 where they behaved the same' + (d.c ? ' (condition: ' + esc(d.c) + ')' : '') +
      '. Use the filters to browse all ' + st.S.rows.filter(r => !r.bad).length + ' transcripts.'
    : rows.length + ' transcripts match' + (rows.length > 150 ? ' (first 150 shown)' : '') + '.') +
    ' Click a row for the full conversation.';
  let prevQ = null, html = '';
  shown.forEach(r => {
    const c = rowCells(sec, r, D, false);
    html += '<tr class="trrow' + (r.q !== prevQ ? ' qstart' : '') + '" data-id="' + r.id + '">' + c.map((x, k) =>
      Array.isArray(x) ? '<td class="ts">' + x.map(t => '<p class="turn"><b>' + esc(t.split(':')[0]) + ':</b>' + esc(t.slice(t.indexOf(':') + 1)) + '</p>').join('') + '</td>'
      : '<td class="' + (/✓|correct ✓|kept/.test(x) ? 'ok' : /✗/.test(x) ? 'bad' : /call$/.test(x) ? 'flagbad' : '') + '">' + esc(x) + '</td>').join('') + '</tr>';
    prevQ = r.q;
  });
  $('tbody', el).innerHTML = html || '<tr><td colspan="9" class="empty">No transcripts match.</td></tr>';
  st.rows = rows;
}
document.addEventListener('click', e => {
  const tr = e.target.closest('tr.trrow');
  if (tr) {
    const el = tr.closest('.transcripts'), st = TR[el.dataset.section + el.dataset.ds], r = st.S.rows[+tr.dataset.id];
    const nx = tr.nextElementSibling;
    if (nx && nx.classList.contains('trfull')) { nx.remove(); return; }
    const D = st.D;
    const full = r.t.map(t => '<div class="full"><b>' + esc(t[0]) + '</b>' + esc(D.S[t[1]]) + '</div>').join('') +
      '<div class="full"><b>reply' + (r.bad ? ' (' + esc(r.bad) + ' call)' : '') + '</b>' + esc(D.S[r.r]) + '</div>';
    tr.insertAdjacentHTML('afterend', '<tr class="trfull"><td colspan="9">' + full + '</td></tr>');
    return;
  }
  const b = e.target.closest('button');
  if (b && b.dataset.md) return copy(mdTable(REG[b.dataset.md].title, REG[b.dataset.md].columns, REG[b.dataset.md].rows, REG[b.dataset.md].prov), b);
  if (b && b.dataset.csv) return download(b.dataset.csv + '.csv', csv(REG[b.dataset.csv].columns, REG[b.dataset.csv].rows, REG[b.dataset.csv].prov));
  if (b && (b.hasAttribute('data-trmd') || b.hasAttribute('data-trcsv'))) {
    const el = b.closest('.transcripts'), st = TR[el.dataset.section + el.dataset.ds]; if (!st) return;
    const full = b.hasAttribute('data-trcsv');
    const rows = (st.rows || []).map(r => rowCells(st.sec, r, st.D, full).map(x => Array.isArray(x) ? x.join(full ? '\n' : ' | ') : x));
    const title = 'Transcripts: ' + st.sec + ' (' + dsName(el.dataset.ds) + ')';
    return full ? download('transcripts_' + st.sec + '_' + el.dataset.ds + '.csv', csv(st.S.cols, rows))
                : copy(mdTable(title, st.S.cols, rows), b);
  }
  const g = e.target.closest('td.goto, svg .goto');
  if (g) gotoTranscripts(g);
  const fq = e.target.closest('tr.fprow');
  if (fq) toggleFp(fq);
  const mb = e.target.closest('button.cellbtn');
  if (mb) toggleMap(mb);
});
document.addEventListener('keydown', e => { const g = e.target.closest && e.target.closest('td.goto, svg .goto');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); gotoTranscripts(g); } });
document.addEventListener('change', e => { const t = e.target; if (!t.matches) return;
  if (t.matches('[data-distall]')) t.closest('.distblock').classList.toggle('dists-all', t.checked);
  if (t.matches('[data-scsel]')) t.closest('.scbox').querySelectorAll('.scpane').forEach(p => p.hidden = p.dataset.c !== t.value); });
function gotoTranscripts(g){
  const el = $('#tr-' + g.dataset.goto + '-' + DS); if (!el) return;
  const st = TR[g.dataset.goto + DS];
  el.open = true;
  el.scrollIntoView({behavior: 'smooth', block: 'start'});
  if (!st) return;
  st.mode = 'filter';
  const set = (k, v) => { const i = $('[data-f=' + k + ']', el); if (i) i.value = v || ''; };
  set('m', g.dataset.model); set('q', g.dataset.q);
  const cond = g.dataset.cond; const sel = $('[data-f=c]', el);
  if (sel) { const o = [...sel.options].find(o => o.value && (o.value === cond || st.S.rows.some(r => r.cl === o.value && r.c === cond))); sel.value = o ? o.value : ''; }
  drawTranscripts(st);
}

// ------------------------------------------------------------------ fingerprint per question, question map
function marks(a){ return (a || []).map(x => '<span class="sq ' + (x[0] ? 'c' : 'w') + '" title="' + (x[0] ? 'right' : 'wrong') + '"></span>').join('') || '—'; }
function renderFpq(el, D){
  const ups = new Set(D.upsets);
  const qs = Object.keys(D.pool).sort((a, b) => ups.has(b) - ups.has(a) || a.length - b.length || a.localeCompare(b));
  const ms = D.models;
  el.querySelector('.fpqbody').innerHTML = '<p class="note">' + D.upsets.length + ' upset question(s) for locked Cedar (weaker honest models: ' +
    D.weaker.map(m => esc(D.names[m])).join(', ') + ').</p><div class="scroll mapwrap"><table class="t"><thead><tr><th>Question</th>' +
    ms.map(m => '<th>' + esc(D.names[m]) + '</th>').join('') + '<th>Correct answer</th></tr></thead><tbody>' +
    qs.map(q => '<tr class="fprow' + (ups.has(q) ? ' upset' : '') + '" data-q="' + esc(q) + '"><td>' + esc(q) + (ups.has(q) ? ' <span class="badge">upset</span>' : '') +
      ' · ' + esc(cut(D.S[D.pool[q].text], 80)) + '</td>' + ms.map(m => '<td>' + marks(D.pool[q].a[m]) + '</td>').join('') +
      '<td>' + esc(D.pool[q].k) + '</td></tr>').join('') + '</tbody></table></div>';
  el._D = D;
}
function toggleFp(tr){
  const nx = tr.nextElementSibling; if (nx && nx.classList.contains('trfull')) { nx.remove(); return; }
  const D = tr.closest('.fpq')._D, q = tr.dataset.q, P = D.pool[q];
  const html = '<div class="full"><b>question</b>' + esc(D.S[P.text]) + '</div>' + D.models.map(m => (P.a[m] || []).map((x, k) =>
    '<div class="full"><b>' + esc(D.names[m]) + ', try ' + (k + 1) + ': ' + (x[0] ? 'right' : 'wrong') + '</b>' + esc(D.S[x[1]]) + '</div>').join('')).join('');
  tr.insertAdjacentHTML('afterend', '<tr class="trfull"><td colspan="20">' + html + '</td></tr>');
}
function renderMap(ds, D){
  const el = $('#map-' + ds); if (!el) return;
  const qs = Object.keys(D.pool).sort((a, b) => D.pool[b].hr - D.pool[a].hr || a.length - b.length || a.localeCompare(b));
  el.innerHTML = '<table class="map"><tr><th>Question</th>' + D.models.map(m => '<th>' + esc(D.names[m]) + '</th>').join('') + '</tr>' +
    qs.map(q => '<tr data-hr="' + (D.pool[q].hr ? 1 : 0) + '"><td>' + esc(q) + (D.pool[q].hr ? '<span class="badge">headroom</span>' : '') + '</td>' +
      D.models.map(m => '<td><button type="button" class="cellbtn btn" data-ds="' + ds + '" data-q="' + esc(q) + '" data-m="' + esc(m) + '">' +
        marks(D.pool[q].a[m]) + '</button></td>').join('') + '</tr>').join('') + '</table>';
}
function toggleMap(b){
  const tr = b.closest('tr'), nx = tr.nextElementSibling;
  if (nx && nx.classList.contains('trfull') && nx.dataset.key === b.dataset.q + b.dataset.m) { nx.remove(); return; }
  if (nx && nx.classList.contains('trfull')) nx.remove();
  const D = window.CEDAR_DATA[b.dataset.ds], P = D.pool[b.dataset.q];
  const html = '<div class="full"><b>question</b>' + esc(D.S[P.text]) + '</div>' + (P.a[b.dataset.m] || []).map((x, k) =>
    '<div class="full"><b>' + esc(D.names[b.dataset.m]) + ', try ' + (k + 1) + ': ' + (x[0] ? 'right' : 'wrong') + '</b>' + esc(D.S[x[1]]) + '</div>').join('');
  tr.insertAdjacentHTML('afterend', '<tr class="trfull" data-key="' + esc(b.dataset.q + b.dataset.m) + '"><td colspan="20" style="text-align:left">' + html + '</td></tr>');
}

// ------------------------------------------------------------------ "how is this computed" tooltip
const tip = document.createElement('div'); tip.id = 'howtip'; tip.hidden = true; document.body.appendChild(tip);
let tipFor = null;
function showTip(el){
  tipFor = el;
  const isRow = el.tagName === 'TR';
  tip.innerHTML = '<b>' + (isRow ? 'What this row says' : 'How this is computed') + '</b>' +
    esc(isRow ? el.dataset.how.replace(/^Reads: /, '') : el.dataset.how);
  tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  let x = Math.min(Math.max(8, r.left), innerWidth - w - 8), y = r.bottom + 6;
  if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip(){ tip.hidden = true; tipFor = null; }
document.addEventListener('mouseover', e => { const el = e.target.closest('[data-how]'); if (el) showTip(el); else if (tipFor) hideTip(); });
document.addEventListener('focusin', e => { const el = e.target.closest('[data-how]'); if (el) showTip(el); });
document.addEventListener('focusout', hideTip);
document.addEventListener('touchstart', e => { const el = e.target.closest('[data-how]');
  if (el && el !== tipFor) showTip(el); else hideTip(); }, {passive: true});
window.addEventListener('scroll', hideTip, {passive: true});

// ------------------------------------------------------------------ wiring
if ($('#ds-switch')) $('#ds-switch').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; DS = b.dataset.ds; store.set('cedar-ds', DS); applyState(); });
if ($('#v-all')) { $('#v-all').onclick = () => { VIEW = 'all'; applyState(); }; $('#v-hr').onclick = () => { VIEW = 'headroom'; applyState(); }; }
if ($('#ov-all')) $('#ov-all').addEventListener('change', applyState);
window.addEventListener('beforeprint', () => $$('details:not(.big)').forEach(d => d.open = true));
applyState();
if (document.getElementById('cedar-data-mech')) loadData('mech');
