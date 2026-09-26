'use strict';

const ITEMS = [
  { id: 'skaida', label: 'Patērētā skaida KAUSI' },
  { id: 'skelda_tehn', label: 'Patērētā šķelda (Tehnoloģiskā) KAUSI' },
  { id: 'skelda_ind', label: 'Dampings' },
  { id: 'izvesta_no_bedres', label: 'Izvesta šķelda no bedres laukumā KAUSI' },
  { id: 'kurinama', label: 'Kurināmā šķelda KAUSI' },
  { id: 'mizotajs_bedre', label: 'No mizotāja uz padeves bedri KAUSI' },
  { id: 'lapu_koku', label: 'Lapu koku šķelda kurināmais KAUSI' },
  { id: 'sieti_bedre', label: 'Atlikumi no sietiem uz kurināmā padeves bedres KAUSI' },
  { id: 'sieti_kurinamais', label: 'Atlikumi no sietiem pie kurināmā KAUSI' },
  { id: 'satirits_miza', label: 'Satīrīts no laukuma pie mizas KAUSI' },
  { id: 'mizotajs_laukums', label: 'No mizotāja uz laukumu (pie mizas) KAUSI' },
  { id: 'satirits_bedre', label: 'Satīrīts no laukuma. Uz padeves bedri KAUSI' },
  { id: 'miza_drupinata', label: 'Miza drupinātā no laukuma KAUSI' },
  { id: 'putekli', label: 'Izvestie putekļi m3' },
];

const TITLE = 'Kausu uzskaite GB';
const KEY_CURRENT = 'kausu.current';
const KEY_HISTORY = 'kausu.history';
const KEY_OPERATOR = 'kausu.operator';
const UNDO_LIMIT = 50;

const $ = (id) => document.getElementById(id);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---------- storage ----------

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('Neizdevās saglabāt!'); }
}

function isoDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function todayISO() {
  return isoDate(new Date());
}

function guessShift() {
  const h = new Date().getHours();
  return h >= 8 && h < 20 ? '08:00' : '20:00';
}

// A night shift belongs to the date it started: at 02:00 on 27.09 it is still the 26.09 20:00 shift.
function guessShiftDate() {
  const d = new Date();
  if (d.getHours() < 8) d.setDate(d.getDate() - 1);
  return isoDate(d);
}

function emptyCounts() {
  return Object.fromEntries(ITEMS.map((i) => [i.id, 0]));
}

function newShift() {
  return {
    date: guessShiftDate(),
    shift: guessShift(),
    operator: load(KEY_OPERATOR, ''),
    counts: emptyCounts(),
    updatedAt: Date.now(),
  };
}

let current = load(KEY_CURRENT, null) || newShift();
current.counts = { ...emptyCounts(), ...current.counts };
let history = load(KEY_HISTORY, []);
const undoStack = [];

function persist() {
  current.updatedAt = Date.now();
  save(KEY_CURRENT, current);
}

// ---------- formatting ----------

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function total(counts) {
  return ITEMS.reduce((s, i) => s + (counts[i.id] || 0), 0);
}

function headerLine(s) {
  return `${TITLE} / ${fmtDate(s.date)} ${s.shift}` + (s.operator ? ` / ${s.operator}` : '');
}

function shiftText(s) {
  const lines = ITEMS.map((i) => `${i.label}: ${s.counts[i.id] || 0}`);
  return [headerLine(s), '', ...lines].join('\n');
}

function csvCell(v) {
  const str = String(v ?? '');
  return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCSV(shifts) {
  const head = ['Datums', 'Maiņa', 'Operators', ...ITEMS.map((i) => i.label)];
  const rows = shifts.map((s) => [fmtDate(s.date), s.shift, s.operator, ...ITEMS.map((i) => s.counts[i.id] || 0)]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

// ---------- UI: counter ----------

function renderItems() {
  const ul = $('items');
  ul.innerHTML = '';
  for (const item of ITEMS) {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.id = item.id;
    li.innerHTML = `
      <div class="label"></div>
      <button class="step minus" aria-label="Mīnus">−</button>
      <input class="value" type="number" inputmode="numeric" pattern="[0-9]*" min="0">
      <button class="step plus" aria-label="Plus">+</button>`;
    li.querySelector('.label').textContent = item.label;
    li.querySelector('.value').setAttribute('aria-label', item.label);
    ul.appendChild(li);
  }
  refreshValues();
}

function refreshValues() {
  for (const li of $('items').children) {
    const input = li.querySelector('.value');
    if (document.activeElement !== input) input.value = current.counts[li.dataset.id];
  }
  $('totalCount').textContent = total(current.counts);
  $('undoBtn').disabled = undoStack.length === 0;
  $('subtitle').textContent = `${fmtDate(current.date)} ${current.shift}`;
}

function flash(id) {
  const li = $('items').querySelector(`[data-id="${id}"]`);
  if (!li) return;
  li.classList.add('flash');
  requestAnimationFrame(() => requestAnimationFrame(() => li.classList.remove('flash')));
}

function setCount(id, value, { recordUndo = true } = {}) {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  const prev = current.counts[id];
  if (v === prev) { refreshValues(); return; }
  if (recordUndo) {
    undoStack.push({ id, prev });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }
  current.counts[id] = v;
  persist();
  refreshValues();
  flash(id);
  if (navigator.vibrate) navigator.vibrate(15);
}

$('items').addEventListener('click', (e) => {
  const btn = e.target.closest('.step');
  if (!btn) return;
  const id = btn.closest('.row').dataset.id;
  setCount(id, current.counts[id] + (btn.classList.contains('plus') ? 1 : -1));
});

$('items').addEventListener('change', (e) => {
  if (!e.target.classList.contains('value')) return;
  setCount(e.target.closest('.row').dataset.id, e.target.value);
});

$('items').addEventListener('focusin', (e) => {
  if (e.target.classList.contains('value')) e.target.select();
});

$('undoBtn').addEventListener('click', () => {
  const last = undoStack.pop();
  if (!last) return;
  setCount(last.id, last.prev, { recordUndo: false });
  toast('Atsaukts');
});

function bindMeta() {
  $('dateInput').value = current.date;
  $('shiftInput').value = current.shift;
  $('operatorInput').value = current.operator;
  $('dateInput').addEventListener('change', (e) => { current.date = e.target.value || todayISO(); persist(); refreshValues(); });
  $('shiftInput').addEventListener('change', (e) => { current.shift = e.target.value; persist(); refreshValues(); });
  $('operatorInput').addEventListener('input', (e) => {
    current.operator = e.target.value.trim();
    save(KEY_OPERATOR, current.operator);
    persist();
  });
}

$('finishBtn').addEventListener('click', async () => {
  const ok = await showDialog(
    `<h2>Pabeigt maiņu?</h2><p>${esc(headerLine(current))}</p><p>Kopā: <strong>${total(current.counts)}</strong></p>` + countsTable(current),
    [{ label: 'Atcelt', value: '' }, { label: 'Saglabāt', value: 'ok', cls: 'primary' }]
  );
  if (ok !== 'ok') return;
  const finished = { ...current, counts: { ...current.counts }, finishedAt: Date.now() };
  history.unshift(finished);
  save(KEY_HISTORY, history);
  const operator = current.operator;
  current = newShift();
  current.operator = operator;
  // Next shift follows the finished one (a night shift finished at 07:50 → next is day shift of the following date).
  if (finished.shift === '08:00') {
    current.date = finished.date;
    current.shift = '20:00';
  } else {
    const d = new Date(finished.date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    current.date = isoDate(d);
    current.shift = '08:00';
  }
  persist();
  undoStack.length = 0;
  bindMetaValues();
  refreshValues();
  const act = await showDialog(
    `<h2>Maiņa saglabāta</h2><p>Nosūtīt atskaiti?</p>`,
    [{ label: 'Vēlāk', value: '' }, { label: 'Dalīties', value: 'share', cls: 'primary' }]
  );
  if (act === 'share') shareShift(finished);
});

function bindMetaValues() {
  $('dateInput').value = current.date;
  $('shiftInput').value = current.shift;
  $('operatorInput').value = current.operator;
}

$('shareBtn').addEventListener('click', () => shareShift(current));

// ---------- UI: history ----------

let view = 'counter';

$('navBtn').addEventListener('click', () => setView(view === 'counter' ? 'history' : 'counter'));

function setView(v) {
  view = v;
  $('counterView').hidden = v !== 'counter';
  $('historyView').hidden = v !== 'history';
  $('bottomBar').hidden = v !== 'counter';
  $('navBtn').textContent = v === 'counter' ? '☰' : '←';
  $('navBtn').setAttribute('aria-label', v === 'counter' ? 'Vēsture' : 'Atpakaļ');
  document.body.style.paddingBottom = v === 'counter' ? '' : '0';
  if (v === 'history') {
    $('subtitle').textContent = 'Vēsture';
    renderHistory();
  } else {
    refreshValues();
  }
  window.scrollTo(0, 0);
}

function renderHistory() {
  const ul = $('historyList');
  ul.innerHTML = '';
  $('historyEmpty').hidden = history.length > 0;
  $('exportAllBtn').hidden = history.length === 0;
  history.forEach((s, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<div><div class="h-main"></div><div class="h-sub"></div></div><div class="h-total"></div>`;
    li.querySelector('.h-main').textContent = `${fmtDate(s.date)} ${s.shift}`;
    li.querySelector('.h-sub').textContent = s.operator || '—';
    li.querySelector('.h-total').textContent = total(s.counts);
    li.addEventListener('click', () => openHistoryItem(idx));
    ul.appendChild(li);
  });
}

async function openHistoryItem(idx) {
  const s = history[idx];
  const act = await showDialog(
    `<h2>${esc(fmtDate(s.date))} ${esc(s.shift)}</h2><p>${esc(s.operator || '—')} · Kopā: <strong>${total(s.counts)}</strong></p>` + countsTable(s),
    [
      { label: 'Dzēst', value: 'delete', cls: 'danger' },
      { label: 'CSV', value: 'csv' },
      { label: 'Dalīties', value: 'share', cls: 'primary' },
      { label: 'Aizvērt', value: '' },
    ]
  );
  if (act === 'share') shareShift(s);
  else if (act === 'csv') exportCSV([s], `kausi_${s.date}_${s.shift.replace(':', '')}.csv`);
  else if (act === 'delete') {
    const sure = await showDialog(`<h2>Dzēst šo maiņu?</h2><p>To nevarēs atjaunot.</p>`,
      [{ label: 'Atcelt', value: '' }, { label: 'Dzēst', value: 'yes', cls: 'danger' }]);
    if (sure === 'yes') {
      history.splice(idx, 1);
      save(KEY_HISTORY, history);
      renderHistory();
    }
  }
}

$('exportAllBtn').addEventListener('click', () => exportCSV(history, `kausi_vesture_${todayISO()}.csv`));

// ---------- sharing / export ----------

async function shareShift(s) {
  const text = shiftText(s);
  if (navigator.share) {
    try { await navigator.share({ title: headerLine(s), text }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Nokopēts starpliktuvē');
  } catch {
    showDialog(`<h2>Atskaite</h2><pre style="white-space:pre-wrap">${esc(text)}</pre>`, [{ label: 'Aizvērt', value: '' }]);
  }
}

async function exportCSV(shifts, filename) {
  const blob = new Blob([toCSV(shifts)], { type: 'text/csv;charset=utf-8' });
  // iOS handles downloads poorly — hand the file to the share sheet instead.
  if (isIOS && navigator.canShare) {
    const file = new File([blob], filename, { type: 'text/csv' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; }
      catch (err) { if (err.name === 'AbortError') return; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- dialog / toast ----------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function countsTable(s) {
  return '<table>' + ITEMS.map((i) => `<tr><td>${esc(i.label)}</td><td>${s.counts[i.id] || 0}</td></tr>`).join('') + '</table>';
}

function showDialog(html, buttons) {
  const dlg = $('dialog');
  $('dialogBody').innerHTML = html;
  const menu = $('dialogMenu');
  menu.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = 'btn' + (b.cls ? ' ' + b.cls : '');
    btn.value = b.value;
    btn.textContent = b.label;
    menu.appendChild(btn);
  }
  dlg.returnValue = '';
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true });
    dlg.showModal();
  });
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

// ---------- platform ----------

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* not supported / denied */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------- init ----------

bindMeta();
renderItems();
setView('counter');
requestWakeLock();
