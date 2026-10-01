import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initBudgeting } from './budgeting.js';

const firebaseConfig = {
  apiKey: "AIzaSyAnadqK4sTVRyIyoDEJJzhKPH1GNDZ4_kg",
  authDomain: "catatan-keuangan-e9041.firebaseapp.com",
  projectId: "catatan-keuangan-e9041",
  storageBucket: "catatan-keuangan-e9041.firebasestorage.app",
  messagingSenderId: "591454138086",
  appId: "1:591454138086:web:9f567f0d97ba12de4f9527"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const WORKSPACE_ID = 'main-workspace';
const MAX_MEMBERS = 2;
const DEF_KAT_M = ['Gaji','Bonus','Investasi','Penjualan','Usaha','Lainnya'];
const DEF_KAT_K = ['Makanan & Minuman','Transportasi','Belanja','Tagihan','Kesehatan','Hiburan','Pendidikan','Lainnya'];
const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

const KAT_ICONS = {
  'Gaji':'briefcase','Bonus':'gift','Investasi':'trending-up','Penjualan':'shopping-cart',
  'Usaha':'home','Lainnya':'package',
  'Makanan & Minuman':'coffee','Transportasi':'truck','Belanja':'shopping-bag',
  'Tagihan':'file-text','Kesehatan':'heart','Hiburan':'film','Pendidikan':'book-open',
  'Lain-lain':'folder'
};
const getKatIcon = n => KAT_ICONS[n] || 'tag';

const state = {
  user: null, profile: null, workspace: null,
  pemasukan: [], pengeluaran: [],
  katPemasukan: [], katPengeluaran: [],
  detailFilter: 'semua', detailSearch: '', dashboardPeriode: 'semua'
};

const fmtRp = n => 'Rp ' + (Number(n)||0).toLocaleString('id-ID',{maximumFractionDigits:0});
const fmtRpShort = n => {
  n = Number(n)||0;
  if(Math.abs(n)>=1e9) return 'Rp '+(n/1e9).toFixed(1)+'M';
  if(Math.abs(n)>=1e6) return 'Rp '+(n/1e6).toFixed(1)+'Jt';
  if(Math.abs(n)>=1e3) return 'Rp '+(n/1e3).toFixed(0)+'k';
  return 'Rp '+n;
};
const fmtTanggal = s => { if(!s) return '-'; const p=String(s).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s; };
const fmtTanggalShort = s => { if(!s) return '-'; const p=String(s).split('-'); return p.length===3?`${p[2]} ${BULAN[parseInt(p[1],10)-1]}`:s; };
const fmtBulan = k => { const [y,m]=k.split('-'); return BULAN[parseInt(m,10)-1]+' '+y; };
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const todayISO = () => { const d=new Date(); const off=d.getTimezoneOffset(); return new Date(d.getTime()-off*60000).toISOString().slice(0,10); };

// Splash
const SPLASH_MIN_DURATION = 500;
const splashStartTime = Date.now();
let splashHidden = false;
function hideSplash(){
  if(splashHidden) return;
  splashHidden = true;
  const splash = document.getElementById('splash-screen');
  if(!splash) return;
  const elapsed = Date.now() - splashStartTime;
  const remaining = Math.max(0, SPLASH_MIN_DURATION - elapsed);
  setTimeout(() => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 500);
  }, remaining);
}
setTimeout(() => {
  if(!splashHidden){
    const authPage = document.getElementById('auth-page');
    if(authPage) authPage.style.display = 'flex';
    hideSplash();
  }
}, 8000);

function refreshIcons(){
  if(window.feather) feather.replace({ 'stroke-width': 2 });
}

function initTheme(){
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved || (prefersDark ? 'dark' : 'light'));
}
function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('btn-theme-toggle');
  if(btn){
    btn.innerHTML = theme === 'dark' ? '<i data-feather="sun"></i>' : '<i data-feather="moon"></i>';
    refreshIcons();
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', theme === 'dark' ? '#1A1410' : '#3B2A20');
  if(state.user && state.profile){ try{ renderCharts(); }catch(e){} }
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function toast(msg, type='success', title=null){
  const box=document.getElementById('toastBox');
  const el=document.createElement('div');
  el.className='toast '+(type==='error'?'error':type==='warn'?'warn':'');
  const icons={success:'check-circle',error:'x-circle',warn:'alert-triangle'};
  const titles={success:'Berhasil',error:'Terjadi Kesalahan',warn:'Perhatian'};
  el.innerHTML=`<div class="t-ico"><i data-feather="${icons[type]||'check-circle'}" style="width:20px;height:20px"></i></div><div class="t-body"><strong>${esc(title||titles[type]||'Info')}</strong><span>${esc(msg)}</span></div>`;
  box.appendChild(el);
  refreshIcons();
  setTimeout(()=>{el.classList.add('hide');setTimeout(()=>el.remove(),300);}, type==='error'?5200:3400);
}

function setErr(id,msg){
  const i=document.getElementById(id);
  const e=document.getElementById('err-'+id);
  if(i)i.classList.add('invalid');
  if(e){e.textContent=msg;e.classList.add('show');}
}
function clearErrs(form){
  form.querySelectorAll('.invalid').forEach(el=>el.classList.remove('invalid'));
  form.querySelectorAll('.error-msg').forEach(el=>{el.textContent='';el.classList.remove('show');});
}
function openModalEl(id){ const el=document.getElementById(id); if(el){el.style.display='flex';document.body.style.overflow='hidden';} }
function closeModalEl(id){ const el=document.getElementById(id); if(el){el.style.display='none';document.body.style.overflow='';} }

async function loadCol(name){
  if(!state.profile) return [];
  try{
    const q = query(collection(db, name), where("workspaceId","==",state.profile.workspaceId), orderBy("tanggal","desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){ console.error('Load error '+name, e); return []; }
}
async function saveCol(name, data){
  if(!state.profile) throw new Error("Belum login");
  await addDoc(collection(db, name), {
    ...data, workspaceId: state.profile.workspaceId,
    createdBy: state.profile.username, createdAt: serverTimestamp()
  });
}
async function delCol(name, id){ await deleteDoc(doc(db, name, id)); }

async function doRegister(){
  const username = document.getElementById('reg-username').value.trim().toLowerCase();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errBox = document.getElementById('reg-error');
  const btn = document.getElementById('btn-register');
  errBox.classList.remove('show'); errBox.textContent = '';
  if(!username){ errBox.textContent='Username wajib diisi.'; errBox.classList.add('show'); return; }
  if(!/^[a-z0-9_]{3,20}$/.test(username)){ errBox.textContent='Username 3-20 karakter huruf kecil/angka/underscore.'; errBox.classList.add('show'); return; }
  if(!email){ errBox.textContent='Email wajib diisi.'; errBox.classList.add('show'); return; }
  if(!password || password.length < 6){ errBox.textContent='Password minimal 6 karakter.'; errBox.classList.add('show'); return; }
  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Memproses...';
  try{
    const unameSnap = await getDoc(doc(db, 'usernames', username));
    if(unameSnap.exists()) throw new Error('Username sudah dipakai.');
    const wsSnap = await getDoc(doc(db, 'workspaces', WORKSPACE_ID));
    let isOwner = false, members = [];
    if(wsSnap.exists()){
      members = wsSnap.data().members || [];
      if(members.length >= MAX_MEMBERS) throw new Error(`Kuota workspace penuh (max ${MAX_MEMBERS} akun).`);
    } else { isOwner = true; }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    await setDoc(doc(db, 'users', uid), {
      uid, email, username, workspaceId: WORKSPACE_ID,
      role: isOwner ? 'owner' : 'member',
      joinedAt: serverTimestamp(), kickedAt: null
    });
    if(isOwner){
      await setDoc(doc(db, 'workspaces', WORKSPACE_ID), {
        name: 'Workspace Utama', ownerUid: uid, members: [uid], createdAt: serverTimestamp()
      });
    } else {
      await updateDoc(doc(db, 'workspaces', WORKSPACE_ID), { members: [...members, uid] });
    }
    await setDoc(doc(db, 'usernames', username), { email, uid });
    toast('Akun berhasil dibuat! Silakan login.', 'success');
    document.getElementById('login-username').value = username;
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';
  }catch(e){
    let msg = e.message;
    if(e.code === 'auth/email-already-in-use') msg = 'Email sudah terdaftar.';
    else if(e.code === 'auth/invalid-email') msg = 'Format email tidak valid.';
    else if(e.code === 'auth/weak-password') msg = 'Password terlalu lemah.';
    else if(e.code === 'auth/network-request-failed') msg = 'Koneksi internet bermasalah.';
    errBox.textContent = msg; errBox.classList.add('show');
  }finally{ btn.disabled = false; btn.textContent = orig; }
}

async function doLogin(){
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errBox = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  errBox.classList.remove('show'); errBox.textContent = '';
  if(!username){ errBox.textContent='Username wajib diisi.'; errBox.classList.add('show'); return; }
  if(!password){ errBox.textContent='Password wajib diisi.'; errBox.classList.add('show'); return; }
  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Memproses...';
  try{
    const unameSnap = await getDoc(doc(db, 'usernames', username));
    if(!unameSnap.exists()) throw new Error('Username tidak ditemukan.');
    await signInWithEmailAndPassword(auth, unameSnap.data().email, password);
  }catch(e){
    let msg = e.message;
    if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(e.code)) msg = 'Username atau password salah.';
    else if(e.code === 'auth/network-request-failed') msg = 'Koneksi internet bermasalah.';
    errBox.textContent = msg; errBox.classList.add('show');
  }finally{ btn.disabled = false; btn.textContent = orig; }
}

document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('btn-register').addEventListener('click', doRegister);
document.getElementById('login-password').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
document.getElementById('reg-password').addEventListener('keydown', e => { if(e.key==='Enter') doRegister(); });
document.getElementById('toggle-to-register').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
});
document.getElementById('toggle-to-login').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
});
document.getElementById('btn-logout-removed').addEventListener('click', () => signOut(auth));
['login-username','login-password'].forEach(id => document.getElementById(id).addEventListener('input', () => document.getElementById('login-error').classList.remove('show')));
['reg-username','reg-email','reg-password'].forEach(id => document.getElementById(id).addEventListener('input', () => document.getElementById('reg-error').classList.remove('show')));
document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

onAuthStateChanged(auth, async (user) => {
  const authPage = document.getElementById('auth-page');
  const appLayout = document.getElementById('app-layout');
  const removedPage = document.getElementById('removed-page');
  if(!user){
    state.user = null; state.profile = null; state.workspace = null;
    authPage.style.display = 'flex';
    appLayout.style.display = 'none';
    removedPage.style.display = 'none';
    refreshIcons();
    hideSplash();
    return;
  }
  state.user = user;
  try{
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if(!userSnap.exists()){ await signOut(auth); hideSplash(); return; }
    state.profile = userSnap.data();
    if(state.profile.role === 'removed'){
      authPage.style.display = 'none';
      appLayout.style.display = 'none';
      removedPage.style.display = 'flex';
      refreshIcons();
      hideSplash();
      return;
    }
    const wsSnap = await getDoc(doc(db, 'workspaces', state.profile.workspaceId));
    if(!wsSnap.exists()){ toast('Workspace tidak ditemukan.', 'error'); await signOut(auth); return; }
    state.workspace = { id: wsSnap.id, ...wsSnap.data() };
    state.katPemasukan = JSON.parse(localStorage.getItem('katPemasukan') || JSON.stringify(DEF_KAT_M));
    state.katPengeluaran = JSON.parse(localStorage.getItem('katPengeluaran') || JSON.stringify(DEF_KAT_K));
    state.pemasukan = await loadCol('pemasukan');
    state.pengeluaran = await loadCol('pengeluaran');
    authPage.style.display = 'none';
    removedPage.style.display = 'none';
    appLayout.style.display = 'block';
    renderAll();
    refreshIcons();
    toast(`Selamat datang, ${state.profile.username}!`, 'success');
    hideSplash();
    initBudgeting({
      state: state, db: db,
      workspaceId: state.profile.workspaceId,
      userId: state.user.uid,
      utils: { fmtRp, fmtRpShort, esc, todayISO, toast, refreshIcons, getKatIcon }
    });
  }catch(e){
    console.error('[Auth Error]', e);
    toast('Error: ' + e.message, 'error');
    hideSplash();
  }
});

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const openSidebar = () => { sidebar.classList.add('open'); overlay.classList.add('show'); };
const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
document.getElementById('hamburger').addEventListener('click', openSidebar);
overlay.addEventListener('click', closeSidebar);

const PAGE_TITLES = {
  dashboard:'Dashboard', detail:'Detail Transaksi', pemasukan:'Pemasukan',
  pengeluaran:'Pengeluaran', kategori:'Kategori', budgeting:'Budgeting',
  anggota:'Anggota'
};

function goToPage(page){
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  document.querySelectorAll('#bottom-nav button[data-page]').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
  const t = document.getElementById('page-'+page);
  if(t){ t.classList.add('active'); t.style.display = 'block'; }
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page]||'';
  window.scrollTo({top:0,behavior:'smooth'});
  closeSidebar();
  try{
    if(page==='dashboard') renderCharts();
    if(page==='detail') renderDetail();
    if(page==='anggota') renderAnggota();
  }catch(e){ console.error(e); }
  refreshIcons();
}

document.getElementById('nav').addEventListener('click', e=>{ const b=e.target.closest('button[data-page]'); if(b) goToPage(b.dataset.page); });
document.getElementById('bottom-nav').addEventListener('click', e=>{ const b=e.target.closest('button[data-page]'); if(b) goToPage(b.dataset.page); });
document.getElementById('link-ke-detail').addEventListener('click', e=>{ e.preventDefault(); goToPage('detail'); });
document.getElementById('btn-logout').addEventListener('click', () => { closeSidebar(); signOut(auth); });

function renderKatSelects(){
  const build=(sel,list)=>{
    if(!sel) return;
    const prev=sel.value;
    sel.innerHTML=`<option value="">-- Pilih Kategori --</option>`+list.map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join('');
    if(list.includes(prev)) sel.value=prev;
  };
  build(document.getElementById('inKategori'),state.katPemasukan);
  build(document.getElementById('outKategori'),state.katPengeluaran);
}
function renderKatLists(){
  const draw=(id,list,type)=>{
    const box=document.getElementById(id);
    if(!box) return;
    if(!list.length){
      box.innerHTML=`<span style="color:var(--text-muted);font-size:12.5px">Belum ada kategori.</span>`;
      return;
    }
    box.innerHTML=list.map(k=>`
      <span class="kat-chip ${type==='keluar'?'exp':''}">
        ${esc(k)}
        <button type="button" data-kat-type="${type}" data-kat-name="${esc(k)}">✕</button>
      </span>`).join('');
  };
  draw('listKatMasuk',state.katPemasukan,'masuk');
  draw('listKatKeluar',state.katPengeluaran,'keluar');
}

function getPeriodeRange(){
  const now = new Date();
  if(state.dashboardPeriode === 'bulan-ini'){
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10),
      end: new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10)
    };
  }
  if(state.dashboardPeriode === 'tahun-ini'){
    return {
      start: new Date(now.getFullYear(), 0, 1).toISOString().slice(0,10),
      end: new Date(now.getFullYear(), 11, 31).toISOString().slice(0,10)
    };
  }
  return {start:null, end:null};
}
function filterByPeriode(arr){
  const {start, end} = getPeriodeRange();
  if(!start) return arr;
  return arr.filter(r => r.tanggal >= start && r.tanggal <= end);
}

function renderStats(){
  const pem = filterByPeriode(state.pemasukan);
  const peng = filterByPeriode(state.pengeluaran);
  const tm = pem.reduce((s,r)=>s+Number(r.jumlah||0),0);
  const tk = peng.reduce((s,r)=>s+Number(r.jumlah||0),0);
  const saldo = tm - tk;
  const el = (id) => document.getElementById(id);
  if(el('statPemasukan')) el('statPemasukan').textContent=fmtRpShort(tm);
  if(el('statPengeluaran')) el('statPengeluaran').textContent=fmtRpShort(tk);
  if(el('statSaldo')) el('statSaldo').textContent=fmtRpShort(saldo);
  if(el('statPemasukanSub')) el('statPemasukanSub').textContent=pem.length+' transaksi';
  if(el('statPengeluaranSub')) el('statPengeluaranSub').textContent=peng.length+' transaksi';
  if(el('statSaldoSub')) el('statSaldoSub').textContent=saldo>=0?'Surplus':'Defisit';
}

function renderSimpleList(containerId, arr, type){
  const box = document.getElementById(containerId);
  if(!box) return;
  if(!arr.length){
    box.innerHTML = `<div class="empty"><i data-feather="${type==='masuk'?'download':'upload'}" style="width:40px;height:40px;opacity:.4"></i><br>Belum ada data.</div>`;
    refreshIcons();
    return;
  }
  box.innerHTML = `<div class="tx-list">${arr.map(r=>`
    <div class="tx-item">
      <div class="tx-icon"><i data-feather="${getKatIcon(r.kategori)}"></i></div>
      <div class="tx-body">
        <div class="tx-title">${esc(type==='masuk'?r.kegunaan:r.sumber)}</div>
        <div class="tx-sub">${esc(r.kategori)}${r.deskripsi?' · '+esc(r.deskripsi):''}</div>
        ${r.createdBy?`<div class="tx-author">oleh: ${esc(r.createdBy)}</div>`:''}
      </div>
      <div>
        <div class="tx-amount ${type==='masuk'?'in':'out'}">${type==='masuk'?'+':'−'} ${fmtRpShort(r.jumlah)}</div>
        <div class="tx-date">${fmtTanggalShort(r.tanggal)}</div>
        <button class="tx-delete" data-del="${type==='masuk'?'pemasukan':'pengeluaran'}" data-id="${r.id}"><i data-feather="trash-2"></i></button>
      </div>
    </div>`).join('')}</div>`;
  refreshIcons();
}
function renderTables(){
  const dp=[...state.pemasukan].sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||''));
  const dk=[...state.pengeluaran].sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||''));
  const el = (id) => document.getElementById(id);
  if(el('countPemasukan')) el('countPemasukan').textContent=dp.length;
  if(el('countPengeluaran')) el('countPengeluaran').textContent=dk.length;
  renderSimpleList('tablePemasukan', dp, 'masuk');
  renderSimpleList('tablePengeluaran', dk, 'keluar');

  const recent=[...state.pemasukan.map(r=>({...r,_tipe:'masuk'})),...state.pengeluaran.map(r=>({...r,_tipe:'keluar'}))]
    .sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||'')).slice(0,5);
  const rt=document.getElementById('recentTable');
  if(!rt) return;
  if(!recent.length){
    rt.innerHTML=`<div class="empty"><i data-feather="inbox" style="width:40px;height:40px;opacity:.4"></i><br>Belum ada transaksi.</div>`;
    refreshIcons();
    return;
  }
  rt.innerHTML=`<div class="tx-list">${recent.map(r=>{
    const isMasuk = r._tipe==='masuk';
    return `<div class="tx-item">
      <div class="tx-icon"><i data-feather="${getKatIcon(r.kategori)}"></i></div>
      <div class="tx-body">
        <div class="tx-title">${esc(isMasuk?r.kegunaan:r.sumber)}</div>
        <div class="tx-sub">${esc(r.kategori)}</div>
        ${r.createdBy?`<div class="tx-author">oleh: ${esc(r.createdBy)}</div>`:''}
      </div>
      <div>
        <div class="tx-amount ${isMasuk?'in':'out'}">${isMasuk?'+':'−'} ${fmtRpShort(r.jumlah)}</div>
        <div class="tx-date">${fmtTanggalShort(r.tanggal)}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
  refreshIcons();
}

function renderDetail(){
  let all = [
    ...state.pemasukan.map(r=>({...r, _tipe:'masuk', _keterangan:r.kegunaan})),
    ...state.pengeluaran.map(r=>({...r, _tipe:'keluar', _keterangan:r.sumber}))
  ].sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||''));
  if(state.detailFilter !== 'semua') all = all.filter(r => r._tipe === state.detailFilter);
  if(state.detailSearch){
    const q = state.detailSearch.toLowerCase();
    all = all.filter(r =>
      (r._keterangan||'').toLowerCase().includes(q) ||
      (r.kategori||'').toLowerCase().includes(q) ||
      (r.deskripsi||'').toLowerCase().includes(q)
    );
  }
  const countEl = document.getElementById('countDetail');
  if(countEl) countEl.textContent = all.length;
  const box = document.getElementById('detailList');
  if(!box) return;
  if(!all.length){
    box.innerHTML = `<div class="empty"><i data-feather="search" style="width:40px;height:40px;opacity:.4"></i><br>Tidak ada transaksi.</div>`;
    refreshIcons();
    return;
  }
  const grouped = {};
  all.forEach(r => { const d = r.tanggal || 'unknown'; (grouped[d] = grouped[d] || []).push(r); });
  const dates = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  box.innerHTML = dates.map(date => `
    <div class="detail-date-header">${fmtTanggal(date)}</div>
    <div class="tx-list">${grouped[date].map(r => {
      const isMasuk = r._tipe==='masuk';
      return `<div class="tx-item">
        <div class="tx-icon"><i data-feather="${getKatIcon(r.kategori)}"></i></div>
        <div class="tx-body">
          <div class="tx-title">${esc(r._keterangan)}</div>
          <div class="tx-sub">${esc(r.kategori)}${r.deskripsi?' · '+esc(r.deskripsi):''}</div>
          ${r.createdBy?`<div class="tx-author">oleh: ${esc(r.createdBy)}</div>`:''}
        </div>
        <div>
          <div class="tx-amount ${isMasuk?'in':'out'}">${isMasuk?'+':'−'} ${fmtRpShort(r.jumlah)}</div>
          <button class="tx-delete" data-del="${isMasuk?'pemasukan':'pengeluaran'}" data-id="${r.id}"><i data-feather="trash-2"></i></button>
        </div>
      </div>`;
    }).join('')}</div>
  `).join('');
  refreshIcons();
}
document.querySelectorAll('#page-detail .chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#page-detail .chip').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.detailFilter = btn.dataset.dfilter;
    renderDetail();
  });
});
document.getElementById('detail-search').addEventListener('input', e => {
  state.detailSearch = e.target.value;
  renderDetail();
});

function renderCharts(){
  if(typeof Chart === 'undefined') return;
  ['chartBulanan','chartKatKeluar','chartKatMasuk'].forEach(id=>{
    const c=document.getElementById(id);
    if(c){ const inst=Chart.getChart(c); if(inst) inst.destroy(); }
  });
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#C9B29A' : '#7B5E4A';
  const gridColor = isDark ? 'rgba(201,178,154,.1)' : 'rgba(123,94,74,.1)';
  const greenColor = isDark ? '#22c55e' : '#16a34a';
  const redColor = isDark ? '#ef4444' : '#dc2626';

  const pem = filterByPeriode(state.pemasukan);
  const peng = filterByPeriode(state.pengeluaran);
  const map={};
  pem.forEach(r=>{const k=(r.tanggal||'').slice(0,7); if(!k)return; map[k]=map[k]||{in:0,out:0}; map[k].in+=Number(r.jumlah||0);});
  peng.forEach(r=>{const k=(r.tanggal||'').slice(0,7); if(!k)return; map[k]=map[k]||{in:0,out:0}; map[k].out+=Number(r.jumlah||0);});
  const keys=Object.keys(map).sort().slice(-12);

  const cb = document.getElementById('chartBulanan');
  if(cb){
    new Chart(cb,{
      type:'bar',
      data:{
        labels:keys.length?keys.map(fmtBulan):['Belum ada'],
        datasets:[
          {label:'Masuk',data:keys.length?keys.map(k=>map[k].in):[0],backgroundColor:greenColor,borderRadius:8},
          {label:'Keluar',data:keys.length?keys.map(k=>map[k].out):[0],backgroundColor:redColor,borderRadius:8}
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'top',labels:{color:textColor,font:{family:'Plus Jakarta Sans',size:12,weight:'600'},usePointStyle:true,boxWidth:10}}},
        scales:{
          y:{beginAtZero:true,ticks:{color:textColor,font:{family:'Plus Jakarta Sans',size:11},callback:v=>fmtRpShort(v)},grid:{color:gridColor}},
          x:{ticks:{color:textColor,font:{family:'Plus Jakarta Sans',size:11}},grid:{display:false}}
        }
      }
    });
  }

  const buildD=(id,arr,pal)=>{
    const canvas = document.getElementById(id);
    if(!canvas) return;
    const agg={};
    arr.forEach(r=>{const k=r.kategori||'(Tanpa Kategori)'; agg[k]=(agg[k]||0)+Number(r.jumlah||0);});
    const lbl=Object.keys(agg); const val=lbl.map(l=>agg[l]);
    new Chart(canvas,{
      type:'doughnut',
      data:{
        labels:lbl.length?lbl:['Belum ada'],
        datasets:[{data:val.length?val:[1],backgroundColor:lbl.length?pal:['#e5e7eb'],borderWidth:3,borderColor:isDark?'#2A1E16':'#fff'}]
      },
      options:{
        responsive:true,maintainAspectRatio:false,cutout:'62%',
        plugins:{legend:{position:'bottom',labels:{padding:12,color:textColor,font:{family:'Plus Jakarta Sans',size:11,weight:'600'},usePointStyle:true,boxWidth:8}}}
      }
    });
  };
  buildD('chartKatKeluar',peng,['#7B5E4A','#A67C52','#C9B29A','#8B6B4A','#D1B89A','#5A4536','#3B2A20','#E8DCC4','#F2E7D5','#4A362A']);
  buildD('chartKatMasuk',pem,['#16a34a','#22c55e','#84cc16','#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7','#ec4899']);
}

function renderAll(){
  renderKatSelects();
  renderKatLists();
  renderStats();
  renderTables();
  renderCharts();
  renderDetail();
  renderAnggota();
  refreshIcons();
}

document.querySelectorAll('#page-dashboard .chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#page-dashboard .chip').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.dashboardPeriode = btn.dataset.periode;
    renderStats();
    renderCharts();
  });
});

async function renderAnggota(){
  if(!state.workspace || !state.profile) return;
  const wsInput = document.getElementById('ws-name-input');
  if(!wsInput) return;
  wsInput.value = state.workspace.name || '';
  const isOwner = state.profile.role === 'owner';
  const btnSave = document.getElementById('btn-save-ws-name');
  if(btnSave) btnSave.style.display = isOwner ? 'inline-flex' : 'none';
  wsInput.disabled = !isOwner;
  const box = document.getElementById('anggotaList');
  if(!box) return;
  box.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Memuat...</div>';
  try{
    const q = query(collection(db, 'users'), where('workspaceId','==',WORKSPACE_ID));
    const snap = await getDocs(q);
    const allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    const active = allUsers.filter(u => u.role !== 'removed');
    const removed = allUsers.filter(u => u.role === 'removed');
    document.getElementById('countAnggota').textContent = active.length + ' / ' + MAX_MEMBERS;
    if(!active.length){ box.innerHTML = '<div class="empty">Belum ada anggota.</div>'; return; }
    let html = active.map(u => {
      const isMe = u.uid === state.user.uid;
      const isOwnerRow = u.role === 'owner';
      const canKick = isOwner && !isMe && !isOwnerRow;
      return `<div class="member-item">
        <div class="member-avatar ${isOwnerRow?'owner':''}">${esc((u.username||'?')[0])}</div>
        <div class="member-info">
          <div class="member-name">${esc(u.username||'-')} ${isMe?'<span style="color:var(--text-muted);font-weight:400">(Anda)</span>':''}<span class="member-role ${isOwnerRow?'owner':''}">${isOwnerRow?'Owner':'Member'}</span></div>
          <div class="member-username">${esc(u.email||'')}</div>
        </div>
        <div class="member-actions">${canKick?`<button class="btn-kick" data-kick="${u.uid}">Keluarkan</button>`:''}</div>
      </div>`;
    }).join('');
    if(removed.length){
      html += `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:.6px;margin-bottom:10px">DIKELUARKAN</div>
        ${removed.map(u => `<div class="member-item">
          <div class="member-avatar removed">${esc((u.username||'?')[0])}</div>
          <div class="member-info">
            <div class="member-name">${esc(u.username||'-')}<span class="member-role removed">Removed</span></div>
            <div class="member-username">${esc(u.email||'')}</div>
          </div>
          <div class="member-actions">${isOwner && active.length < MAX_MEMBERS?`<button class="btn-restore" data-restore="${u.uid}">Aktifkan</button>`:''}</div>
        </div>`).join('')}
      </div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('button[data-kick]').forEach(btn => btn.addEventListener('click', () => kickMember(btn.dataset.kick)));
    box.querySelectorAll('button[data-restore]').forEach(btn => btn.addEventListener('click', () => restoreMember(btn.dataset.restore)));
  }catch(e){
    box.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

async function kickMember(uid){
  if(state.profile.role !== 'owner'){ toast('Hanya owner yang bisa mengeluarkan member.', 'error'); return; }
  if(uid === state.user.uid){ toast('Tidak bisa mengeluarkan diri sendiri.', 'error'); return; }
  if(!confirm('Yakin ingin mengeluarkan member ini?')) return;
  try{
    await updateDoc(doc(db, 'users', uid), { role: 'removed', kickedAt: serverTimestamp() });
    const newMembers = (state.workspace.members || []).filter(m => m !== uid);
    await updateDoc(doc(db, 'workspaces', WORKSPACE_ID), { members: newMembers });
    state.workspace.members = newMembers;
    toast('Member berhasil dikeluarkan.', 'success');
    renderAnggota();
  }catch(e){ toast('Gagal: ' + e.message, 'error'); }
}
async function restoreMember(uid){
  if((state.workspace.members || []).length >= MAX_MEMBERS){ toast('Slot sudah penuh.', 'error'); return; }
  if(!confirm('Aktifkan kembali member ini?')) return;
  try{
    await updateDoc(doc(db, 'users', uid), { role: 'member', kickedAt: null });
    await updateDoc(doc(db, 'workspaces', WORKSPACE_ID), { members: [...(state.workspace.members||[]), uid] });
    state.workspace.members.push(uid);
    toast('Member diaktifkan kembali.', 'success');
    renderAnggota();
  }catch(e){ toast('Gagal: ' + e.message, 'error'); }
}
document.getElementById('btn-save-ws-name').addEventListener('click', async () => {
  if(state.profile.role !== 'owner') return;
  const name = document.getElementById('ws-name-input').value.trim();
  if(!name){ toast('Nama workspace tidak boleh kosong.', 'error'); return; }
  try{
    await updateDoc(doc(db, 'workspaces', WORKSPACE_ID), { name });
    state.workspace.name = name;
    toast('Nama workspace disimpan.', 'success');
  }catch(e){ toast('Gagal: ' + e.message, 'error'); }
});

const modal = document.getElementById('modal-entry');
const modalState = { tab:'expense', kategori:null, expr:'0' };

function openModal(tab='expense'){
  modalState.tab=tab; modalState.kategori=null; modalState.expr='0';
  document.getElementById('entry-tanggal').value=todayISO();
  document.getElementById('entry-kegunaan').value='';
  document.getElementById('entry-deskripsi').value='';
  document.getElementById('search-kategori').value='';
  document.getElementById('modal-tabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  updateModalFields();
  renderKategoriGrid('');
  updateAmountDisplay();
  modal.style.display='flex';
  document.body.style.overflow='hidden';
  refreshIcons();
}
function closeModal(){
  modal.style.display='none';
  document.body.style.overflow='';
}
function updateModalFields(){
  const isIncome = modalState.tab === 'income';
  document.getElementById('entry-label-kegunaan').innerHTML = isIncome ? 'Sumber <span class="req">*</span>' : 'Kegunaan <span class="req">*</span>';
  document.getElementById('entry-kegunaan').placeholder = isIncome ? 'cth: PT ABC / Klien' : 'cth: Beli Sembako';
}
function getKategoriList(){ return modalState.tab==='income'?state.katPemasukan:state.katPengeluaran; }
function renderKategoriGrid(filter=''){
  const grid=document.getElementById('kategori-grid');
  if(!grid) return;
  const list=getKategoriList();
  const filtered=filter?list.filter(k=>k.toLowerCase().includes(filter.toLowerCase())):list;
  if(!filtered.length){
    grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:12.5px;padding:20px">Kategori tidak ditemukan.</div>`;
    return;
  }
  grid.innerHTML=filtered.map(k=>`
    <div class="kategori-item ${modalState.kategori===k?'selected':''}" data-kat="${esc(k)}">
      <span class="kat-icon"><i data-feather="${getKatIcon(k)}"></i></span>
      <span class="kat-name">${esc(k)}</span>
    </div>`).join('')+`
    <div class="kategori-item" data-kat="__NEW__">
      <span class="kat-icon" style="color:var(--primary-light)"><i data-feather="plus"></i></span>
      <span class="kat-name" style="color:var(--primary-light)">Baru</span>
    </div>`;
  refreshIcons();
}
document.getElementById('kategori-grid').addEventListener('click',e=>{
  const item=e.target.closest('.kategori-item'); if(!item) return;
  const kat=item.dataset.kat;
  if(kat==='__NEW__'){ closeModal(); goToPage('kategori'); return; }
  modalState.kategori=kat;
  renderKategoriGrid(document.getElementById('search-kategori').value);
});
document.getElementById('search-kategori').addEventListener('input',e=>renderKategoriGrid(e.target.value));
document.getElementById('modal-tabs').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-tab]'); if(!btn) return;
  modalState.tab=btn.dataset.tab; modalState.kategori=null;
  document.getElementById('modal-tabs').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  updateModalFields();
  renderKategoriGrid(document.getElementById('search-kategori').value);
});

function updateAmountDisplay(){
  let val=modalState.expr; let display;
  if(/^\d+$/.test(val)) display=Number(val).toLocaleString('id-ID');
  else display=val.replace(/\d+/g,n=>Number(n).toLocaleString('id-ID'));
  document.getElementById('amount-number').textContent=display||'0';
}
function evalExpr(expr){
  try{
    let js=expr.replace(/÷/g,'/').replace(/×/g,'*').replace(/−/g,'-');
    js=js.replace(/[^0-9+\-*/.() ]/g,'');
    if(!js) return 0;
    const r=Function('"use strict";return ('+js+')')();
    return Math.max(0, Number(r)||0);
  }catch(e){ return 0; }
}
document.querySelector('.numpad').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-key]'); if(!btn) return;
  const k=btn.dataset.key;
  if(k==='⌫') modalState.expr=modalState.expr.slice(0,-1)||'0';
  else if(['÷','×','−','+'].includes(k)){
    if(/[÷×−+]$/.test(modalState.expr)) modalState.expr=modalState.expr.slice(0,-1)+k;
    else modalState.expr+=k;
  }
  else if(k==='00'){ if(modalState.expr!=='0') modalState.expr+='00'; }
  else { if(modalState.expr==='0') modalState.expr=k; else modalState.expr+=k; }
  updateAmountDisplay();
});

document.getElementById('btn-save-entry').addEventListener('click', async ()=>{
  const tanggal=document.getElementById('entry-tanggal').value.trim();
  const kegunaan=document.getElementById('entry-kegunaan').value.trim();
  const deskripsi=document.getElementById('entry-deskripsi').value.trim();
  const jumlah=evalExpr(modalState.expr);
  if(!tanggal){ toast('Tanggal wajib diisi.','error'); return; }
  if(!kegunaan){ toast('Field Kegunaan/Sumber wajib diisi.','error'); return; }
  if(!modalState.kategori){ toast('Kategori wajib dipilih.','error'); return; }
  if(!jumlah||jumlah<=0){ toast('Jumlah wajib > 0.','error'); return; }
  const isIncome=modalState.tab==='income';
  const collectionName=isIncome?'pemasukan':'pengeluaran';
  const data=isIncome
    ?{tanggal,kegunaan,kategori:modalState.kategori,jumlah,deskripsi}
    :{tanggal,sumber:kegunaan,kategori:modalState.kategori,jumlah,deskripsi};
  try{
    await saveCol(collectionName,data);
    state[collectionName]=await loadCol(collectionName);
    renderAll();
    closeModal();
    toast(`${isIncome?'Pemasukan':'Pengeluaran'} "${kegunaan}" ${fmtRp(jumlah)} tersimpan.`,'success');
  }catch(err){ toast('Gagal: '+err.message,'error'); }
});

document.getElementById('btn-new-entry').addEventListener('click',()=>openModal('expense'));
document.getElementById('modal-close').addEventListener('click',closeModal);
modal.addEventListener('click',e=>{ if(e.target===modal) closeModal(); });
document.getElementById('link-atur-kategori').addEventListener('click',e=>{ e.preventDefault(); closeModal(); goToPage('kategori'); });

document.getElementById('formPemasukan').addEventListener('submit',async e=>{
  e.preventDefault(); const form=e.target; clearErrs(form);
  const tanggal=document.getElementById('inTanggal').value.trim();
  const kegunaan=document.getElementById('inKegunaan').value.trim();
  const kategori=document.getElementById('inKategori').value.trim();
  const jumlahRaw=document.getElementById('inJumlah').value.trim();
  const deskripsi=document.getElementById('inDeskripsi').value.trim();
  const errs=[];
  if(!tanggal){setErr('inTanggal','Tanggal wajib diisi.');errs.push('Tanggal');}
  if(!kegunaan){setErr('inKegunaan','Sumber wajib diisi.');errs.push('Sumber');}
  if(!kategori){setErr('inKategori','Kategori wajib dipilih.');errs.push('Kategori');}
  if(!jumlahRaw){setErr('inJumlah','Jumlah wajib diisi.');errs.push('Jumlah');}
  else if(isNaN(Number(jumlahRaw))||Number(jumlahRaw)<=0){setErr('inJumlah','Jumlah harus > 0.');errs.push('Jumlah');}
  if(errs.length){ toast('Field bermasalah: '+errs.join(', '),'error'); return; }
  try{
    await saveCol('pemasukan',{tanggal,kegunaan,kategori,jumlah:Number(jumlahRaw),deskripsi});
    state.pemasukan=await loadCol('pemasukan');
    form.reset(); clearErrs(form);
    document.getElementById('inTanggal').value=todayISO();
    renderAll();
    toast(`Pemasukan "${kegunaan}" tersimpan.`,'success');
  }catch(err){ toast('Gagal: '+err.message,'error'); }
});
document.getElementById('formPengeluaran').addEventListener('submit',async e=>{
  e.preventDefault(); const form=e.target; clearErrs(form);
  const tanggal=document.getElementById('outTanggal').value.trim();
  const sumber=document.getElementById('outSumber').value.trim();
  const kategori=document.getElementById('outKategori').value.trim();
  const jumlahRaw=document.getElementById('outJumlah').value.trim();
  const deskripsi=document.getElementById('outDeskripsi').value.trim();
  const errs=[];
  if(!tanggal){setErr('outTanggal','Tanggal wajib diisi.');errs.push('Tanggal');}
  if(!sumber){setErr('outSumber','Kegunaan wajib diisi.');errs.push('Kegunaan');}
  if(!kategori){setErr('outKategori','Kategori wajib dipilih.');errs.push('Kategori');}
  if(!jumlahRaw){setErr('outJumlah','Jumlah wajib diisi.');errs.push('Jumlah');}
  else if(isNaN(Number(jumlahRaw))||Number(jumlahRaw)<=0){setErr('outJumlah','Jumlah harus > 0.');errs.push('Jumlah');}
  if(errs.length){ toast('Field bermasalah: '+errs.join(', '),'error'); return; }
  try{
    await saveCol('pengeluaran',{tanggal,sumber,kategori,jumlah:Number(jumlahRaw),deskripsi});
    state.pengeluaran=await loadCol('pengeluaran');
    form.reset(); clearErrs(form);
    document.getElementById('outTanggal').value=todayISO();
    renderAll();
    toast(`Pengeluaran "${sumber}" tersimpan.`,'success');
  }catch(err){ toast('Gagal: '+err.message,'error'); }
});

document.addEventListener('click',async e=>{
  const btn=e.target.closest('button[data-del]'); if(!btn) return;
  const tipe=btn.dataset.del; const id=btn.dataset.id;
  if(!confirm('Yakin ingin menghapus data ini?')) return;
  try{
    await delCol(tipe,id);
    state[tipe]=state[tipe].filter(r=>r.id!==id);
    renderAll();
    toast('Data berhasil dihapus.','success');
  }catch(err){ toast('Gagal menghapus: '+err.message,'error'); }
});

function tambahKat(inputId,key){
  const inp=document.getElementById(inputId); const nama=inp.value.trim();
  if(!nama){ toast('Nama kategori tidak boleh kosong.','error'); return; }
  if(state[key].some(k=>k.toLowerCase()===nama.toLowerCase())){ toast('Kategori sudah ada.','error'); return; }
  state[key].push(nama);
  localStorage.setItem(key,JSON.stringify(state[key]));
  inp.value='';
  renderKatSelects();
  renderKatLists();
  toast(`Kategori "${nama}" ditambahkan.`,'success');
}
document.getElementById('formKatMasuk').addEventListener('submit',e=>{e.preventDefault(); tambahKat('inputKatMasuk','katPemasukan');});
document.getElementById('formKatKeluar').addEventListener('submit',e=>{e.preventDefault(); tambahKat('inputKatKeluar','katPengeluaran');});
document.addEventListener('click',e=>{
  const btn=e.target.closest('button[data-kat-type]'); if(!btn) return;
  const tipe=btn.dataset.katType; const nama=btn.dataset.katName;
  const key=tipe==='masuk'?'katPemasukan':'katPengeluaran';
  const dataKey=tipe==='masuk'?'pemasukan':'pengeluaran';
  if(state[dataKey].filter(r=>r.kategori===nama).length>0){ toast(`Kategori "${nama}" masih dipakai.`,'error'); return; }
  if(!confirm(`Hapus kategori "${nama}"?`)) return;
  state[key]=state[key].filter(k=>k!==nama);
  localStorage.setItem(key,JSON.stringify(state[key]));
  renderKatSelects();
  renderKatLists();
  toast('Kategori dihapus.','success');
});

document.getElementById('inTanggal').value=todayISO();
document.getElementById('outTanggal').value=todayISO();
document.getElementById('entry-tanggal').value=todayISO();

initTheme();
refreshIcons();
