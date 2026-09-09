import { firebaseConfig, EDIT_EMAIL, EDIT_PASSWORD } from './firebase-config.js';
import { DEFAULT_DATA } from './data.js';

// ---------------- Firebase setup (loaded dynamically so a blocked/offline
// CDN request degrades gracefully instead of breaking the whole page) ----------------
let db = null;
let DOC_REF = null;
let firebaseReady = false;
let fx = {}; // holds onSnapshot / setDoc / getDoc once loaded

async function setupFirebase(){
  try{
    const [{ initializeApp }, { getFirestore, doc, onSnapshot, setDoc, getDoc }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js")
    ]);
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    DOC_REF = doc(db, 'controllerData', 'main');
    fx = { onSnapshot, setDoc, getDoc };
    firebaseReady = true;
  }catch(e){
    console.error('Firebase could not be loaded — check firebase-config.js and network access to gstatic.com', e);
    firebaseReady = false;
  }
}

const F = {
  sr: 'Sr. No.',
  model: 'Bike Model',
  variant: 'Version / Variant',
  wheel: 'Wheel Size',
  market: 'Market',
  status: 'Status',
  prod: 'Production Status',
  controller: 'Controller Part No.',
  connector: 'Connector / Hardware Variant',
  motor: 'Motor Model',
  motorV: 'Motor Voltage',
  ntc: 'NTC',
  display: 'Compatible Display Model',
  battV: 'Battery Voltage',
  maxA: 'Max Current'
};
const FIELD_LIST = [F.model, F.variant, F.wheel, F.market, F.status, F.prod, F.controller, F.connector, F.motor, F.motorV, F.ntc, F.display, F.battV, F.maxA];

const clean = v => (v === null || v === undefined || v === '') ? '—' : String(v);
const escapeAttr = s => String(s).replace(/"/g, '&quot;');

let DATA = [];
let nextId = 1;
let editMode = false;
let authenticated = false;
const openGroups = new Set();
let editingId = null;

// ---------------- DOM refs ----------------
const statRow = document.getElementById('statRow');
const marketSel = document.getElementById('marketFilter');
const statusSel = document.getElementById('statusFilter');
const prodSel = document.getElementById('prodFilter');
const searchInput = document.getElementById('searchInput');
const currentOnly = document.getElementById('currentOnly');
const currentPill = document.getElementById('currentPill');
const editModeInput = document.getElementById('editMode');
const editPill = document.getElementById('editPill');
const clearBtn = document.getElementById('clearBtn');
const resultCount = document.getElementById('resultCount');
const main = document.getElementById('main');
const syncStatus = document.getElementById('syncStatus');
const addModelBar = document.getElementById('addModelBar');
const addModelBtn = document.getElementById('addModelBtn');

const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const rowForm = document.getElementById('rowForm');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');

const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginClose = document.getElementById('loginClose');
const loginCancel = document.getElementById('loginCancel');
const loginError = document.getElementById('loginError');

// ---------------- Firestore sync ----------------
async function initData(){
  await setupFirebase();

  if(!firebaseReady){
    DATA = DEFAULT_DATA.map(r => ({...r}));
    assignIds();
    render();
    setSync('error', 'Firebase unavailable — showing local data only (edits won\u2019t be saved)');
    return;
  }
  try{
    const snap = await fx.getDoc(DOC_REF);
    if(!snap.exists()){
      DATA = DEFAULT_DATA.map(r => ({...r}));
      assignIds();
      await fx.setDoc(DOC_REF, { rows: DATA });
    }
  }catch(e){
    console.error('Initial Firestore read failed', e);
  }

  // Live sync: any change (by any user) re-renders automatically.
  fx.onSnapshot(DOC_REF, snap => {
    if(snap.exists() && Array.isArray(snap.data().rows)){
      DATA = snap.data().rows;
      assignIds();
      render();
    }
  }, err => {
    console.error('Firestore listen failed', err);
    setSync('error', 'Live sync lost — reload the page');
  });
}

function assignIds(){
  let maxId = 0;
  DATA.forEach(r => { if(r.id && r.id > maxId) maxId = r.id; });
  nextId = maxId + 1;
  DATA.forEach(r => { if(!r.id){ r.id = nextId++; } });
}

async function persist(){
  if(!firebaseReady){
    setSync('error', 'Firebase not configured — change not saved');
    return;
  }
  setSync('saving', 'Saving…');
  try{
    await fx.setDoc(DOC_REF, { rows: DATA });
    setSync('ok', 'Saved');
  }catch(e){
    setSync('error', 'Save failed — try again');
    throw e;
  }
}

let syncTimer;
function setSync(kind, msg){
  syncStatus.textContent = msg;
  syncStatus.className = 'sync-status' + (kind === 'saving' ? ' saving' : kind === 'error' ? ' error' : '');
  clearTimeout(syncTimer);
  if(kind === 'ok'){
    syncTimer = setTimeout(() => { syncStatus.textContent = ''; }, 2200);
  }
}

// ---------------- Grouping ----------------
function buildGroups(){
  const groups = [];
  const idx = {};
  DATA.forEach(row => {
    const model = row[F.model] || '(Unnamed model)';
    if(!idx.hasOwnProperty(model)){
      idx[model] = groups.length;
      groups.push({ model, rows: [] });
    }
    groups[idx[model]].rows.push(row);
  });
  return groups;
}

function populateFilters(){
  const markets = Array.from(new Set(DATA.map(r => r[F.market]).filter(Boolean))).sort();
  const statuses = Array.from(new Set(DATA.map(r => r[F.status]).filter(Boolean))).sort();
  const curMarket = marketSel.value, curStatus = statusSel.value, curProd = prodSel.value;
  marketSel.innerHTML = '<option value="">All markets</option>' + markets.map(m => `<option value="${escapeAttr(m)}">${m}</option>`).join('');
  statusSel.innerHTML = '<option value="">All statuses</option>' + statuses.map(s => `<option value="${escapeAttr(s)}">${s}</option>`).join('');
  prodSel.innerHTML = '<option value="">All production states</option><option value="Active">Active only</option><option value="Inactive">Inactive only</option>';
  if(markets.includes(curMarket)) marketSel.value = curMarket;
  if(statuses.includes(curStatus)) statusSel.value = curStatus;
  if(curProd) prodSel.value = curProd;
}

const searchFields = [F.model, F.variant, F.wheel, F.market, F.status, F.prod, F.controller, F.connector, F.motor, F.display];
function rowMatches(row, q, market, status, prod, curOnly){
  if(curOnly && row[F.status] !== 'Current') return false;
  if(market && row[F.market] !== market) return false;
  if(status && row[F.status] !== status) return false;
  if(prod && row[F.prod] !== prod) return false;
  if(q){
    const hay = searchFields.map(f => String(row[f] || '')).join(' | ').toLowerCase();
    if(!hay.includes(q)) return false;
  }
  return true;
}

// ---------------- Render ----------------
function render(){
  const groups = buildGroups();
  const totalVariantRows = DATA.length;
  const totalModels = groups.length;
  const currentCount = DATA.filter(r => r[F.status] === 'Current').length;
  const activeCount = DATA.filter(r => r[F.prod] === 'Active').length;

  statRow.innerHTML = [
    { num: totalModels, lbl: 'Bike models' },
    { num: totalVariantRows, lbl: 'Part combinations' },
    { num: currentCount, lbl: 'Current parts' },
    { num: activeCount, lbl: 'Active in production' }
  ].map(s => `<div class="stat"><div class="num">${s.num}</div><div class="lbl">${s.lbl}</div></div>`).join('');

  populateFilters();

  const q = searchInput.value.trim().toLowerCase();
  const market = marketSel.value;
  const status = statusSel.value;
  const prod = prodSel.value;
  const curOnly = currentOnly.checked;
  const isFiltering = !!(q || market || status || prod || curOnly);

  currentPill.classList.toggle('active', curOnly);
  editPill.classList.toggle('active', editMode);
  addModelBar.style.display = editMode ? 'block' : 'none';

  let visibleRowTotal = 0;
  let visibleGroupTotal = 0;
  const frag = document.createDocumentFragment();

  groups.forEach((g) => {
    const matched = g.rows.filter(r => rowMatches(r, q, market, status, prod, curOnly));
    if(matched.length === 0 && isFiltering) return;
    if(matched.length > 0) { visibleGroupTotal++; visibleRowTotal += matched.length; }
    else if(!isFiltering){ visibleGroupTotal++; visibleRowTotal += g.rows.length; }

    const rowsToShow = isFiltering ? matched : g.rows;

    const wheelSizes = Array.from(new Set(g.rows.map(r => r[F.wheel]).filter(w => w && w !== '—'))).join(', ');
    const marketsInGroup = Array.from(new Set(g.rows.map(r => r[F.market]).filter(Boolean)));
    const statusCounts = {};
    g.rows.forEach(r => { statusCounts[r[F.status]] = (statusCounts[r[F.status]]||0) + 1; });

    const isOpen = isFiltering || openGroups.has(g.model);
    const el = document.createElement('div');
    el.className = 'group' + (isOpen ? ' open' : '');
    el.dataset.model = g.model;

    const badgesHtml = Object.keys(statusCounts).map(s =>
      `<span class="badge badge-${String(s).replace(/[^A-Za-z]/g,'')}">${statusCounts[s]} ${s}</span>`
    ).join('');

    const colCount = editMode ? 10 : 9;

    el.innerHTML = `
      <div class="group-head" role="button" tabindex="0" aria-expanded="${isOpen ? 'true':'false'}">
        <div class="group-head-left">
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          <div>
            <div class="group-title">${g.model}</div>
            <div class="group-meta">${g.rows.length} variant${g.rows.length>1?'s':''}${marketsInGroup.length ? ' · ' + marketsInGroup.join(' / ') : ''}${wheelSizes ? ' · ' + wheelSizes : ''}</div>
          </div>
        </div>
        <div class="group-badges">${badgesHtml}</div>
      </div>
      <div class="group-body">
        <table>
          <thead>
            <tr>
              <th>Variant</th>
              <th>Status</th>
              <th>Production</th>
              <th>Controller Part No.</th>
              <th>Connector</th>
              <th>Motor</th>
              <th>NTC</th>
              <th>Display</th>
              <th>Battery / Max A</th>
              ${editMode ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rowsToShow.map(r => rowToTr(r, matched.includes(r), isFiltering)).join('')}
          </tbody>
          ${editMode ? `<tfoot><tr class="add-row-line"><td colspan="${colCount}"><button class="add-row-btn" data-add-model="${escapeAttr(g.model)}">+ Add variant to ${g.model}</button></td></tr></tfoot>` : ''}
        </table>
      </div>
    `;

    const head = el.querySelector('.group-head');
    head.addEventListener('click', () => toggleGroup(el));
    head.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggleGroup(el); }
    });

    frag.appendChild(el);
  });

  main.innerHTML = '';
  if(visibleGroupTotal === 0){
    main.innerHTML = `<div class="no-results"><h3>No matching parts</h3>Try a different model name, part number, or clear the filters.</div>`;
  } else {
    main.appendChild(frag);
  }

  resultCount.textContent = isFiltering
    ? `${visibleRowTotal} part combination${visibleRowTotal!==1?'s':''} across ${visibleGroupTotal} model${visibleGroupTotal!==1?'s':''}`
    : `${totalVariantRows} part combinations across ${totalModels} models`;

  main.querySelectorAll('.part-chip').forEach(chip => {
    chip.addEventListener('click', e => { e.stopPropagation(); copyToClipboard(chip.dataset.value, chip); });
  });
  main.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openForm(Number(btn.dataset.id)); });
  });
  main.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); requestDelete(Number(btn.dataset.id), btn); });
  });
  main.querySelectorAll('[data-add-model]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openForm(null, btn.dataset.addModel); });
  });
}

function rowToTr(r, isMatch, isFiltering){
  const dim = isFiltering && !isMatch ? ' dim' : '';
  const controller = clean(r[F.controller]);
  const isTbd = r[F.status] === 'TBD' || controller === 'TBD';
  const prodVal = r[F.prod] === 'Inactive' ? 'Inactive' : 'Active';
  const actionsCell = editMode ? `
    <td data-label="">
      <div class="row-actions" id="actions-${r.id}">
        <button class="icon-btn edit-btn" data-id="${r.id}" title="Edit" aria-label="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"></path></svg>
        </button>
        <button class="icon-btn danger delete-btn" data-id="${r.id}" title="Delete" aria-label="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
        </button>
      </div>
    </td>` : '';
  return `
    <tr class="${dim}">
      <td data-label="Variant">
        <div class="variant-label">${clean(r[F.variant])}</div>
        <div class="sub-label">${clean(r[F.wheel])} · ${clean(r[F.market])}</div>
      </td>
      <td data-label="Status"><span class="badge badge-${String(r[F.status]).replace(/[^A-Za-z]/g,'')}">${clean(r[F.status])}</span></td>
      <td data-label="Production"><span class="badge prod-${prodVal}">${prodVal}</span></td>
      <td data-label="Controller">${isTbd ? '<span class="sub-label">TBD</span>' : `<span class="part-chip" data-value="${escapeAttr(controller)}"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>${controller}</span>`}</td>
      <td data-label="Connector">${clean(r[F.connector])}</td>
      <td data-label="Motor">${clean(r[F.motor])}<div class="sub-label">${clean(r[F.motorV])}${r[F.ntc] && r[F.ntc]!=='—' ? ' · ' + r[F.ntc] : ''}</div></td>
      <td data-label="NTC">${clean(r[F.ntc])}</td>
      <td data-label="Display">${clean(r[F.display])}</td>
      <td data-label="Battery / Max A">${clean(r[F.battV])} · ${clean(r[F.maxA])}</td>
      ${actionsCell}
    </tr>
  `;
}

function toggleGroup(el){
  const opening = !el.classList.contains('open');
  el.classList.toggle('open');
  el.querySelector('.group-head').setAttribute('aria-expanded', opening ? 'true' : 'false');
  const model = el.dataset.model;
  if(opening) openGroups.add(model); else openGroups.delete(model);
}

function requestDelete(id, btn){
  const cell = btn.closest('.row-actions');
  if(!cell) return;
  cell.innerHTML = `
    <div class="confirm-delete">
      <span>Remove?</span>
      <button class="confirm-yes" data-confirm-id="${id}" title="Confirm delete" aria-label="Confirm delete">&#10003;</button>
      <button class="confirm-no" title="Cancel" aria-label="Cancel">&#10005;</button>
    </div>`;
  cell.querySelector('.confirm-yes').addEventListener('click', async e => {
    e.stopPropagation();
    await deleteRow(id);
  });
  cell.querySelector('.confirm-no').addEventListener('click', e => {
    e.stopPropagation();
    render();
  });
}

async function deleteRow(id){
  DATA = DATA.filter(r => r.id !== id);
  render();
  try{ await persist(); }catch(e){ showToast('Could not save — check connection'); }
}

// ---------------- Copy ----------------
function copyToClipboard(text, chip){
  const done = () => {
    chip.classList.add('copied');
    showToast(`Copied ${text}`);
    setTimeout(() => chip.classList.remove('copied'), 1200);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(ta);
    done();
  }
}

let toastTimer;
function showToast(msg){
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// ---------------- Add / edit modal ----------------
function openForm(id, presetModel){
  editingId = id;
  rowForm.reset();
  if(id){
    modalTitle.textContent = 'Edit part combination';
    const row = DATA.find(r => r.id === id);
    if(row){
      FIELD_LIST.forEach(f => {
        const input = rowForm.elements.namedItem(f);
        if(input) input.value = (row[f] && row[f] !== '—') ? row[f] : '';
      });
    }
  } else {
    modalTitle.textContent = 'Add part combination';
    if(presetModel){
      const input = rowForm.elements.namedItem(F.model);
      if(input) input.value = presetModel;
    }
  }
  modalOverlay.classList.add('show');
  setTimeout(() => { rowForm.elements.namedItem(F.model).focus(); }, 50);
}

function closeForm(){
  modalOverlay.classList.remove('show');
  editingId = null;
}

rowForm.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(rowForm);
  const values = {};
  FIELD_LIST.forEach(f => { values[f] = (fd.get(f) || '').toString().trim() || '—'; });

  if(!values[F.model] || values[F.model] === '—'){
    rowForm.elements.namedItem(F.model).focus();
    return;
  }

  if(editingId){
    const row = DATA.find(r => r.id === editingId);
    if(row) Object.assign(row, values);
  } else {
    DATA.push({ ...values, id: nextId++ });
  }
  openGroups.add(values[F.model]);
  closeForm();
  render();
  try{ await persist(); }catch(err){ showToast('Could not save — check connection'); }
});

modalClose.addEventListener('click', closeForm);
modalCancel.addEventListener('click', closeForm);
modalOverlay.addEventListener('click', e => { if(e.target === modalOverlay) closeForm(); });

addModelBtn.addEventListener('click', () => openForm(null));

// ---------------- Edit-mode login gate ----------------
editModeInput.addEventListener('change', () => {
  if(editModeInput.checked){
    if(authenticated){
      editMode = true;
      render();
    } else {
      editModeInput.checked = false;
      loginError.style.display = 'none';
      loginForm.reset();
      loginOverlay.classList.add('show');
      setTimeout(() => loginForm.elements.namedItem('email').focus(), 50);
    }
  } else {
    editMode = false;
    render();
  }
});

loginForm.addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  const email = (fd.get('email') || '').toString().trim().toLowerCase();
  const password = (fd.get('password') || '').toString();
  if(email === EDIT_EMAIL.toLowerCase() && password === EDIT_PASSWORD){
    authenticated = true;
    editMode = true;
    loginOverlay.classList.remove('show');
    editModeInput.checked = true;
    render();
  } else {
    loginError.style.display = 'block';
  }
});

function closeLogin(){ loginOverlay.classList.remove('show'); }
loginClose.addEventListener('click', closeLogin);
loginCancel.addEventListener('click', closeLogin);
loginOverlay.addEventListener('click', e => { if(e.target === loginOverlay) closeLogin(); });

document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  if(modalOverlay.classList.contains('show')) closeForm();
  if(loginOverlay.classList.contains('show')) closeLogin();
});

// ---------------- Toolbar events ----------------
searchInput.addEventListener('input', render);
marketSel.addEventListener('change', render);
statusSel.addEventListener('change', render);
prodSel.addEventListener('change', render);
currentOnly.addEventListener('change', render);
clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  marketSel.value = '';
  statusSel.value = '';
  prodSel.value = '';
  currentOnly.checked = false;
  render();
});

// ---------------- Boot ----------------
main.innerHTML = '<div class="no-results">Loading part data…</div>';
initData();
