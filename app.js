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
const KEY_CUSTOM = 'kausu.customItems';
const UNDO_LIMIT = 50;
const APP_VERSION = 8;

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

let customItems = load(KEY_CUSTOM, []);

function allItems() {
  return [...ITEMS, ...customItems];
}

// Finished shifts keep a snapshot of their fields, so renaming/deleting a custom field doesn't change history.
function itemsOf(s) {
  return s.items || (s === current ? allItems() : ITEMS);
}

function emptyCounts() {
  return Object.fromEntries(allItems().map((i) => [i.id, 0]));
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

function total(s) {
  return itemsOf(s).reduce((sum, i) => sum + (s.counts[i.id] || 0), 0);
}

function headerLine(s) {
  return `${TITLE} / ${fmtDate(s.date)} ${s.shift}` + (s.operator ? ` / ${s.operator}` : '');
}

// Monospace table sized to fit a phone-width WhatsApp/Telegram bubble without wrapping.
const TABLE_LABEL_W = 25;
const TABLE_NUM_W = 5;

function wrapLabel(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    for (let w = word; w; ) {
      const piece = w.slice(0, width);
      w = w.slice(width);
      if (!line) line = piece;
      else if (line.length + 1 + piece.length <= width) line += ' ' + piece;
      else { lines.push(line); line = piece; }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function tableRow(label, value) {
  const lines = wrapLabel(label.normalize('NFC'), TABLE_LABEL_W);
  return lines.map((l, k) =>
    k === lines.length - 1 ? l.padEnd(TABLE_LABEL_W) + String(value).padStart(TABLE_NUM_W) : l
  );
}

function shiftText(s) {
  const rule = '-'.repeat(TABLE_LABEL_W + TABLE_NUM_W);
  const rows = itemsOf(s).flatMap((i) => tableRow(i.label, s.counts[i.id] || 0));
  const table = [
    ...tableRow('Lauks', 'Sk.'),
    rule,
    ...rows,
    rule,
    ...tableRow('KOPĀ', total(s)),
  ];
  const meta = `${fmtDate(s.date)} ${s.shift === '20:00' ? 'Nakts' : 'Diena'} ${s.shift}` + (s.operator ? `\n${s.operator}` : '');
  return `*${TITLE}*\n${meta}\n\`\`\`\n${table.join('\n')}\n\`\`\``;
}

function csvCell(v) {
  const str = String(v ?? '');
  return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCSV(shifts) {
  // Union of all fields across the exported shifts, in first-seen order (newest label wins).
  const cols = new Map();
  for (const s of [...shifts].reverse()) for (const i of itemsOf(s)) cols.set(i.id, i.label);
  const ids = [...cols.keys()];
  const head = ['Datums', 'Maiņa', 'Operators', ...ids.map((id) => cols.get(id))];
  const rows = shifts.map((s) => [fmtDate(s.date), s.shift, s.operator, ...ids.map((id) => s.counts[id] || 0)]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

// ---------- UI: counter ----------

function renderItems() {
  const ul = $('items');
  ul.innerHTML = '';
  for (const item of allItems()) {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.id = item.id;
    li.innerHTML = `
      <div class="label"><span class="label-text"></span></div>
      <button class="step minus" aria-label="Mīnus">−</button>
      <input class="value" type="number" inputmode="numeric" pattern="[0-9]*" min="0">
      <button class="step plus" aria-label="Plus">+</button>`;
    li.querySelector('.label-text').textContent = item.label;
    if (item.custom) {
      const edit = document.createElement('button');
      edit.className = 'edit-field';
      edit.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
      edit.setAttribute('aria-label', 'Rediģēt lauku');
      li.querySelector('.label').appendChild(edit);
    }
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
  $('totalCount').textContent = total(current);
  $('undoBtn').disabled = undoStack.length === 0;
  $('subtitle').textContent = `${fmtDate(current.date)} ${current.shift}`;
  $('dateText').textContent = fmtDate(current.date);
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
  const edit = e.target.closest('.edit-field');
  if (edit) { editField(edit.closest('.row').dataset.id); return; }
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
    `<h2>Pabeigt maiņu?</h2><p>${esc(headerLine(current))}</p><p>Kopā: <strong>${total(current)}</strong></p>` + countsTable(current),
    [{ label: 'Atcelt', value: '' }, { label: 'Saglabāt', value: 'ok', cls: 'primary' }]
  );
  if (ok !== 'ok') return;
  const finished = {
    ...current,
    counts: { ...current.counts },
    items: allItems().map(({ id, label }) => ({ id, label })),
    finishedAt: Date.now(),
  };
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
    [{ label: 'Dalīties', value: 'share' }, { label: 'Vēlāk', value: '', cls: 'green' }]
  );
  if (act === 'share') shareShift(finished);
});

function bindMetaValues() {
  $('dateInput').value = current.date;
  $('shiftInput').value = current.shift;
  $('operatorInput').value = current.operator;
}

$('shareBtn').addEventListener('click', () => shareShift(current));

// ---------- custom fields ----------

function saveCustomItems() {
  save(KEY_CUSTOM, customItems);
  current.counts = { ...emptyCounts(), ...current.counts };
  persist();
  renderItems();
}

$('addFieldBtn').addEventListener('click', async () => {
  const label = await promptText('Jauns lauks', '', 'Piem. Zāģskaidas KAUSI');
  if (!label) return;
  customItems.push({ id: 'c_' + Date.now().toString(36), label, custom: true });
  saveCustomItems();
  const rows = $('items').children;
  rows[rows.length - 1].scrollIntoView({ block: 'center', behavior: 'smooth' });
  toast('Lauks pievienots');
});

async function editField(id) {
  const item = customItems.find((i) => i.id === id);
  if (!item) return;
  const act = await showDialog(
    `<h2>Rediģēt lauku</h2><label class="dlg-field">Nosaukums<input id="fieldName" type="text"></label>`,
    [{ label: 'Dzēst', value: 'delete', cls: 'danger' }, { label: 'Atcelt', value: '' }, { label: 'Saglabāt', value: 'ok', cls: 'primary' }],
    () => { const inp = $('fieldName'); inp.value = item.label; return inp; }
  );
  if (act === 'ok') {
    const label = $('fieldName').value.trim();
    if (label) { item.label = label; saveCustomItems(); }
  } else if (act === 'delete') {
    const sure = await showDialog(`<h2>Dzēst lauku “${esc(item.label)}”?</h2><p>Šīs maiņas skaits šim laukam tiks dzēsts. Saglabātās maiņas netiek mainītas.</p>`,
      [{ label: 'Atcelt', value: '' }, { label: 'Dzēst', value: 'yes', cls: 'danger' }]);
    if (sure !== 'yes') return;
    customItems = customItems.filter((i) => i.id !== id);
    delete current.counts[id];
    for (let k = undoStack.length - 1; k >= 0; k--) if (undoStack[k].id === id) undoStack.splice(k, 1);
    saveCustomItems();
  }
}

async function promptText(title, value, placeholder) {
  const act = await showDialog(
    `<h2>${esc(title)}</h2><label class="dlg-field">Nosaukums<input id="fieldName" type="text"></label>`,
    [{ label: 'Atcelt', value: '' }, { label: 'Pievienot', value: 'ok', cls: 'primary' }],
    () => { const inp = $('fieldName'); inp.value = value; inp.placeholder = placeholder; return inp; }
  );
  return act === 'ok' ? $('fieldName').value.trim() : '';
}

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
    li.querySelector('.h-total').textContent = total(s);
    li.addEventListener('click', () => openHistoryItem(idx));
    ul.appendChild(li);
  });
}

async function openHistoryItem(idx) {
  const s = history[idx];
  const act = await showDialog(
    `<h2>${esc(fmtDate(s.date))} ${esc(s.shift)}</h2><p>${esc(s.operator || '—')} · Kopā: <strong>${total(s)}</strong></p>` + countsTable(s),
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

// ---------- report image ----------

function wrapToWidth(ctx, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? line + ' ' + word : word;
    if (!line || ctx.measureText(test).width <= maxW) line = test;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function renderReportCanvas(s) {
  const W = 1080, PAD = 48, NUM_W = 200, LINE_H = 50, ROW_PAD = 22;
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const labelW = W - PAD * 2 - NUM_W - 24;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  ctx.font = `500 38px ${FONT}`;
  const rows = itemsOf(s).map((i) => ({ lines: wrapToWidth(ctx, i.label, labelW), value: s.counts[i.id] || 0 }));
  const HEADER_H = s.operator ? 250 : 200;
  const COLS_H = 76;
  const bodyH = rows.reduce((h, r) => h + r.lines.length * LINE_H + ROW_PAD * 2, 0);
  const TOTAL_H = 110;
  canvas.width = W;
  canvas.height = HEADER_H + COLS_H + bodyH + TOTAL_H + PAD;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, canvas.height);

  // header
  ctx.fillStyle = '#2e7d6b';
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 56px ${FONT}`;
  ctx.fillText(TITLE, PAD, 90);
  ctx.font = `500 42px ${FONT}`;
  ctx.fillText(`${fmtDate(s.date)} · ${s.shift === '20:00' ? 'Nakts' : 'Diena'} ${s.shift}`, PAD, 155);
  if (s.operator) ctx.fillText(s.operator, PAD, 212);

  // column headings
  let y = HEADER_H;
  ctx.fillStyle = '#eef3f1';
  ctx.fillRect(0, y, W, COLS_H);
  ctx.fillStyle = '#6a716e';
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText('Lauks', PAD, y + 50);
  ctx.textAlign = 'right';
  ctx.fillText('Skaits', W - PAD, y + 50);
  ctx.textAlign = 'left';
  y += COLS_H;

  // rows
  rows.forEach((r, idx) => {
    const h = r.lines.length * LINE_H + ROW_PAD * 2;
    if (idx % 2) { ctx.fillStyle = '#f6f8f7'; ctx.fillRect(0, y, W, h); }
    ctx.fillStyle = '#1c1f1e';
    ctx.font = `500 38px ${FONT}`;
    r.lines.forEach((l, k) => ctx.fillText(l, PAD, y + ROW_PAD + 38 + k * LINE_H));
    ctx.textAlign = 'right';
    ctx.font = `700 48px ${FONT}`;
    ctx.fillStyle = r.value ? '#1c1f1e' : '#b4bab7';
    ctx.fillText(String(r.value), W - PAD, y + h / 2 + 17);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#dde1df';
    ctx.fillRect(PAD, y + h - 2, W - PAD * 2, 2);
    y += h;
  });

  // total
  ctx.fillStyle = '#2e7d6b';
  ctx.fillRect(0, y, W, TOTAL_H);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText('KOPĀ', PAD, y + 70);
  ctx.textAlign = 'right';
  ctx.font = `800 58px ${FONT}`;
  ctx.fillText(String(total(s)), W - PAD, y + 74);
  ctx.textAlign = 'left';
  return canvas;
}

// Synchronous PNG conversion keeps the tap's user activation alive for navigator.share on iOS.
function canvasToFile(canvas, filename) {
  const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: 'image/png' });
}

async function shareShift(s) {
  const canvas = renderReportCanvas(s);
  const filename = `kausi_${s.date}_${s.shift.replace(':', '')}.png`;
  const file = canvasToFile(canvas, filename);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  // Fallback: show the image so it can be long-pressed/saved, plus a download button.
  const url = canvas.toDataURL('image/png');
  const act = await showDialog(
    `<h2>Atskaite</h2><p>Turi nospiestu attēlu, lai saglabātu vai kopētu.</p><img src="${url}" alt="Atskaite" style="width:100%;border:1px solid var(--line);border-radius:6px">`,
    [{ label: 'Aizvērt', value: '' }, { label: 'Lejupielādēt', value: 'dl', cls: 'primary' }]
  );
  if (act === 'dl') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
  return '<table>' + itemsOf(s).map((i) => `<tr><td>${esc(i.label)}</td><td>${s.counts[i.id] || 0}</td></tr>`).join('') + '</table>';
}

function showDialog(html, buttons, setup) {
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
  const input = setup && setup();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true });
    dlg.showModal();
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); dlg.close('ok'); }
      });
      input.focus();
    }
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
  // When an update takes over, reload once so the new version shows immediately (counts are already saved).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  });
}

// ---------- init ----------

$('version').textContent = 'Versija ' + APP_VERSION;
bindMeta();
renderItems();
setView('counter');
requestWakeLock();
