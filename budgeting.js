// =========================================================
// BUDGETING MODULE — KeuanganKu
// Fase 1: CRUD Dompet
// =========================================================
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== STATE LOKAL BUDGETING =====
const budgetState = {
  wallets: [],
  activeTab: 'wallets', // 'wallets' | 'alokasi' | 'progress' | 'laporan'
  editingWalletId: null,
  currentWorkspaceId: null,
  currentUserId: null,
  deps: null // dependencies dari app.js
};

// ===== KONSTANTA =====
const PRIORITY_LEVELS = [
  { value: 1, label: 'Kebutuhan Utama',     color: '#3B2A20' },
  { value: 2, label: 'Kebutuhan Sekunder',  color: '#7B5E4A' },
  { value: 3, label: 'Keinginan',           color: '#A67C52' },
  { value: 4, label: 'Tabungan',            color: '#8B6B4A' },
  { value: 5, label: 'Utang',               color: '#5A4536' }
];

const WALLET_COLORS = [
  '#3B2A20', // Dark Chocolate
  '#7B5E4A', // Walnut
  '#A67C52', // Caramel
  '#8B6B4A', // Mocha
  '#5A4536', // Deep Brown
  '#D1B89A'  // Warm Beige
];

// ===== INIT =====
export function initBudgeting({ state, db, utils, workspaceId, userId }) {
  budgetState.deps = { state, db, utils };
  budgetState.currentWorkspaceId = workspaceId;
  budgetState.currentUserId = userId;

  setupBudgetingUI();
  loadWallets();
}

// ===== SETUP UI =====
function setupBudgetingUI() {
  // Tab switching
  document.querySelectorAll('#budgeting-tabs .budget-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      switchBudgetingTab(btn.dataset.btab);
    });
  });

  // Tombol tambah dompet
  const btnAdd = document.getElementById('btn-add-wallet');
  if (btnAdd) btnAdd.addEventListener('click', () => openWalletModal());

  // Modal form handlers
  const btnSave = document.getElementById('btn-save-wallet');
  const btnClose = document.getElementById('modal-wallet-close');
  const btnCancel = document.getElementById('btn-cancel-wallet');
  const modal = document.getElementById('modal-wallet');

  if (btnSave) btnSave.addEventListener('click', saveWallet);
  if (btnClose) btnClose.addEventListener('click', closeWalletModal);
  if (btnCancel) btnCancel.addEventListener('click', closeWalletModal);
  if (modal) modal.addEventListener('click', e => {
    if (e.target === modal) closeWalletModal();
  });

  // Color picker
  document.querySelectorAll('#wallet-color-picker .color-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#wallet-color-picker .color-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
}

// ===== TAB SWITCHING =====
function switchBudgetingTab(tab) {
  budgetState.activeTab = tab;
  document.querySelectorAll('#budgeting-tabs .budget-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.btab === tab);
  });
  document.querySelectorAll('.budgeting-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.btab === tab);
  });
  budgetState.deps.utils.refreshIcons();
}

// ===== LOAD WALLETS =====
async function loadWallets() {
  const { db } = budgetState.deps;
  const box = document.getElementById('wallet-list');
  if (!box) return;
  box.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Memuat dompet...</div>';
  try {
    const q = query(
      collection(db, 'wallets'),
      where('workspaceId', '==', budgetState.currentWorkspaceId),
      orderBy('priority', 'asc')
    );
    const snap = await getDocs(q);
    budgetState.wallets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderWalletList();
  } catch (e) {
    console.error('Load wallets error:', e);
    box.innerHTML = `<div class="empty">Gagal memuat dompet: ${budgetState.deps.utils.esc(e.message)}</div>`;
  }
}

// ===== RENDER WALLET LIST =====
function renderWalletList() {
  const { utils } = budgetState.deps;
  const box = document.getElementById('wallet-list');
  if (!box) return;

  const active = budgetState.wallets.filter(w => !w.archived);
  const archived = budgetState.wallets.filter(w => w.archived);

  if (!active.length && !archived.length) {
    box.innerHTML = `
      <div class="empty">
        <i data-feather="briefcase" style="width:40px;height:40px;opacity:.4"></i>
        <br>Belum ada dompet.
        <br><span style="font-size:12px;color:var(--text-muted)">Klik "+ Tambah Dompet" untuk mulai budgeting.</span>
      </div>`;
    utils.refreshIcons();
    return;
  }

  let html = '';

  // Active wallets
  if (active.length) {
    html += `<div class="wallet-list-grid">`;
    html += active.map(w => renderWalletCard(w, false)).join('');
    html += `</div>`;
  }

  // Archived wallets (collapsible)
  if (archived.length) {
    html += `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
      <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:.6px;margin-bottom:10px;cursor:pointer" id="toggle-archived">
        📦 DIARSIPKAN (${archived.length}) ▼
      </div>
      <div id="archived-list" style="display:none">
        ${archived.map(w => renderWalletCard(w, true)).join('')}
      </div>
    </div>`;
  }

  box.innerHTML = html;
  utils.refreshIcons();

  // Bind action buttons
  box.querySelectorAll('button[data-wallet-edit]').forEach(btn => {
    btn.addEventListener('click', () => openWalletModal(btn.dataset.walletEdit));
  });
  box.querySelectorAll('button[data-wallet-archive]').forEach(btn => {
    btn.addEventListener('click', () => archiveWallet(btn.dataset.walletArchive));
  });
  box.querySelectorAll('button[data-wallet-restore]').forEach(btn => {
    btn.addEventListener('click', () => restoreWallet(btn.dataset.walletRestore));
  });
  box.querySelectorAll('button[data-wallet-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteWallet(btn.dataset.walletDelete));
  });

  // Toggle archived
  const toggleArch = document.getElementById('toggle-archived');
  if (toggleArch) {
    toggleArch.addEventListener('click', () => {
      const list = document.getElementById('archived-list');
      const isHidden = list.style.display === 'none';
      list.style.display = isHidden ? 'block' : 'none';
      toggleArch.textContent = `📦 DIARSIPKAN (${archived.length}) ${isHidden ? '▲' : '▼'}`;
    });
  }
}

// ===== RENDER WALLET CARD =====
function renderWalletCard(w, isArchived) {
  const { utils } = budgetState.deps;
  const priorityObj = PRIORITY_LEVELS.find(p => p.value === w.priority) || PRIORITY_LEVELS[2];
  const categoriesText = (w.categories || []).length
    ? w.categories.join(', ')
    : 'Belum ada kategori';

  return `
    <div class="wallet-card ${isArchived ? 'archived' : ''}" style="border-left:4px solid ${w.color || '#3B2A20'}">
      <div class="wallet-header">
        <div style="flex:1;min-width:0">
          <div class="wallet-name">${utils.esc(w.name)}</div>
          ${w.description ? `<div class="wallet-desc">${utils.esc(w.description)}</div>` : ''}
        </div>
        <div class="wallet-priority-badge" style="background:${priorityObj.color}">
          ${priorityObj.label}
        </div>
      </div>
      <div class="wallet-info">
        <div class="wallet-budget">
          <span class="wallet-budget-label">Budget</span>
          <span class="wallet-budget-value">${utils.fmtRp(w.budget || 0)}</span>
          <span class="wallet-budget-period">/ ${w.period === 'weekly' ? 'minggu' : 'bulan'}</span>
        </div>
        ${w.rollOverSurplus ? `<div class="wallet-rollover">🔄 Roll-over: ON</div>` : ''}
      </div>
      <div class="wallet-categories">
        <span class="wallet-categories-label">Kategori:</span>
        <span class="wallet-categories-value">${utils.esc(categoriesText)}</span>
      </div>
      <div class="wallet-actions">
        ${!isArchived ? `
          <button class="btn-wallet btn-edit" data-wallet-edit="${w.id}">
            <i data-feather="edit-2" style="width:14px;height:14px"></i> Edit
          </button>
          <button class="btn-wallet btn-archive" data-wallet-archive="${w.id}">
            <i data-feather="archive" style="width:14px;height:14px"></i> Arsip
          </button>
        ` : `
          <button class="btn-wallet btn-restore" data-wallet-restore="${w.id}">
            <i data-feather="rotate-ccw" style="width:14px;height:14px"></i> Aktifkan
          </button>
          <button class="btn-wallet btn-delete" data-wallet-delete="${w.id}">
            <i data-feather="trash-2" style="width:14px;height:14px"></i> Hapus
          </button>
        `}
      </div>
    </div>
  `;
}

// ===== OPEN WALLET MODAL =====
function openWalletModal(walletId = null) {
  budgetState.editingWalletId = walletId;
  const modal = document.getElementById('modal-wallet');
  const title = document.getElementById('wallet-modal-title');
  if (!modal) return;

  // Reset form
  document.getElementById('wallet-name').value = '';
  document.getElementById('wallet-description').value = '';
  document.getElementById('wallet-budget').value = '';
  document.getElementById('wallet-period').value = 'monthly';
  document.getElementById('wallet-priority').value = '1';
  document.getElementById('wallet-rollover').checked = false;
  document.querySelectorAll('#wallet-color-picker .color-opt').forEach(o => o.classList.remove('selected'));
  document.querySelector('#wallet-color-picker .color-opt')?.classList.add('selected');

  // Render categories checkbox
  renderCategoryCheckboxes([]);

  if (walletId) {
    const w = budgetState.wallets.find(x => x.id === walletId);
    if (!w) return;
    title.textContent = 'Edit Dompet';
    document.getElementById('wallet-name').value = w.name || '';
    document.getElementById('wallet-description').value = w.description || '';
    document.getElementById('wallet-budget').value = w.budget || '';
    document.getElementById('wallet-period').value = w.period || 'monthly';
    document.getElementById('wallet-priority').value = String(w.priority || 1);
    document.getElementById('wallet-rollover').checked = !!w.rollOverSurplus;
    // Color
    document.querySelectorAll('#wallet-color-picker .color-opt').forEach(o => {
      o.classList.toggle('selected', o.dataset.color === w.color);
    });
    // Categories
    renderCategoryCheckboxes(w.categories || []);
  } else {
    title.textContent = 'Tambah Dompet';
  }

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  budgetState.deps.utils.refreshIcons();
}

function closeWalletModal() {
  document.getElementById('modal-wallet').style.display = 'none';
  document.body.style.overflow = '';
  budgetState.editingWalletId = null;
}

// ===== CATEGORY CHECKBOXES =====
function renderCategoryCheckboxes(selectedCategories) {
  const { state } = budgetState.deps;
  const box = document.getElementById('wallet-categories-list');
  if (!box) return;

  // Gabung kategori pemasukan + pengeluaran (unique)
  const allCats = Array.from(new Set([
    ...(state.katPemasukan || []),
    ...(state.katPengeluaran || [])
  ]));

  if (!allCats.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Belum ada kategori. Tambah di menu Kategori.</div>';
    return;
  }

  box.innerHTML = allCats.map(cat => `
    <label class="cat-checkbox">
      <input type="checkbox" value="${budgetState.deps.utils.esc(cat)}" ${selectedCategories.includes(cat) ? 'checked' : ''}>
      <span>${budgetState.deps.utils.esc(cat)}</span>
    </label>
  `).join('');
}

// ===== SAVE WALLET =====
async function saveWallet() {
  const { db, utils } = budgetState.deps;
  const btn = document.getElementById('btn-save-wallet');

  const name = document.getElementById('wallet-name').value.trim();
  const description = document.getElementById('wallet-description').value.trim();
  const budget = parseFloat(document.getElementById('wallet-budget').value) || 0;
  const period = document.getElementById('wallet-period').value;
  const priority = parseInt(document.getElementById('wallet-priority').value, 10);
  const rollOverSurplus = document.getElementById('wallet-rollover').checked;
  const color = document.querySelector('#wallet-color-picker .color-opt.selected')?.dataset.color || '#3B2A20';
  const categories = Array.from(document.querySelectorAll('#wallet-categories-list input[type=checkbox]:checked')).map(i => i.value);

  // Validasi
  if (!name) { utils.toast('Nama dompet wajib diisi.', 'error', 'Validasi'); return; }
  if (name.length > 40) { utils.toast('Nama dompet maksimal 40 karakter.', 'error', 'Validasi'); return; }
  if (budget < 0) { utils.toast('Budget tidak boleh minus.', 'error', 'Validasi'); return; }
  if (!priority || priority < 1 || priority > 5) { utils.toast('Prioritas tidak valid.', 'error', 'Validasi'); return; }

  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Menyimpan...';

  try {
    if (budgetState.editingWalletId) {
      // Update
      await updateDoc(doc(db, 'wallets', budgetState.editingWalletId), {
        name, description, budget, period, priority, rollOverSurplus, color, categories,
        updatedAt: serverTimestamp()
      });
      utils.toast(`Dompet "${name}" berhasil diperbarui.`, 'success');
    } else {
      // Create
      await addDoc(collection(db, 'wallets'), {
        userId: budgetState.currentUserId,
        workspaceId: budgetState.currentWorkspaceId,
        name, description, budget, period, priority, rollOverSurplus, color, categories,
        archived: false,
        createdAt: serverTimestamp()
      });
      utils.toast(`Dompet "${name}" berhasil dibuat.`, 'success');
    }
    closeWalletModal();
    await loadWallets();
  } catch (e) {
    console.error('Save wallet error:', e);
    utils.toast('Gagal menyimpan: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ===== ARCHIVE WALLET =====
async function archiveWallet(id) {
  const { db, utils } = budgetState.deps;
  const w = budgetState.wallets.find(x => x.id === id);
  if (!w) return;
  if (!confirm(`Arsipkan dompet "${w.name}"?\n\nDompet yang diarsipkan tidak akan muncul di pilihan input, tapi data transaksi lama tetap tersimpan.`)) return;
  try {
    await updateDoc(doc(db, 'wallets', id), { archived: true, updatedAt: serverTimestamp() });
    utils.toast(`Dompet "${w.name}" diarsipkan.`, 'success');
    await loadWallets();
  } catch (e) {
    utils.toast('Gagal mengarsipkan: ' + e.message, 'error');
  }
}

// ===== RESTORE WALLET =====
async function restoreWallet(id) {
  const { db, utils } = budgetState.deps;
  const w = budgetState.wallets.find(x => x.id === id);
  if (!w) return;
  try {
    await updateDoc(doc(db, 'wallets', id), { archived: false, updatedAt: serverTimestamp() });
    utils.toast(`Dompet "${w.name}" diaktifkan kembali.`, 'success');
    await loadWallets();
  } catch (e) {
    utils.toast('Gagal mengaktifkan: ' + e.message, 'error');
  }
}

// ===== DELETE WALLET (PERMANENT) =====
async function deleteWallet(id) {
  const { db, utils } = budgetState.deps;
  const w = budgetState.wallets.find(x => x.id === id);
  if (!w) return;
  const confirmText = prompt(`⚠️ HAPUS PERMANEN\n\nDompet "${w.name}" akan dihapus SELAMANYA.\nKetik HAPUS untuk konfirmasi:`);
  if (confirmText !== 'HAPUS') {
    if (confirmText !== null) utils.toast('Konfirmasi dibatalkan.', 'warn');
    return;
  }
  try {
    await deleteDoc(doc(db, 'wallets', id));
    utils.toast(`Dompet "${w.name}" dihapus permanen.`, 'success');
    await loadWallets();
  } catch (e) {
    utils.toast('Gagal menghapus: ' + e.message, 'error');
  }
}

// ===== PUBLIC API =====
export function getWallets() {
  return budgetState.wallets;
}

export function getActiveWallets() {
  return budgetState.wallets.filter(w => !w.archived);
}

export function getPriorityLevels() {
  return PRIORITY_LEVELS;
}

export function reloadWallets() {
  return loadWallets();
}

// ===== EKSPOSE KE WINDOW UNTUK DEBUGGING =====
window.budgetDebug = {
  state: budgetState,
  reload: loadWallets,
  openModal: openWalletModal
};