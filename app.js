import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ====== GANTI DENGAN CONFIG MILIKMU ======
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

// ====== KATEGORI → FEATHER ICON MAPPING ======
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

// =========================================================
// UTILITAS
// =========================================================
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

// Splash screen control
const SPLASH_MIN_DURATION = 500;
const SPLASH_MAX_DURATION = 2000;   // Fallback: paksa hilang setelah 3.5s
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
// Fallback: kalau Firebase tidak response, paksa hilang
setTimeout(() => {
  if(!splashHidden){
    console.warn('[Splash] Fallback timeout — memaksa splash hilang');
    hideSplash();
  }
}, SPLASH_MAX_DURATION);

// =========================================================
// FEATHER ICONS REFRESH
// =========================================================
function refreshIcons(){
  if(window.feather) feather.replace({ 'stroke-width': 2 });
}

// =========================================================
// DARK MODE
// =========================================================
function initTheme(){
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  setTheme(theme);
}
function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  // Update ikon toggle
  const btn = document.getElementById('btn-theme-toggle');
  if(btn){
    btn.innerHTML = theme === 'dark' ? '<i data-feather="sun"></i>' : '<i data-feather="moon"></i>';
    refreshIcons();
  }
  // Update meta theme-color untuk PWA status bar
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', theme === 'dark' ? '#1A1410' : '#3B2A20');
  // Re-render chart kalau ada (chart perlu update warna teks)
  if(state.user && state.profile){
    try{ renderCharts(); }catch(e){}
  }
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// =========================================================
// TOAST
// =========================================================
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

// =========================================================
// FORM ERROR HELPERS
// =========================================================
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
function openModalEl(id){ document.getElementById(id).style.display='flex'; document.body.style.overflow='hidden'; }
function closeModalEl(id){ document.getElementById(id).style.display='none'; document.body.style.overflow=''; }

// =========================================================
// FIRESTORE
// =========================================================
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
    ...data,
    workspaceId: state.profile.workspaceId,
    createdBy: state.profile.username,
    createdAt: serverTimestamp()
  });
}
async function delCol(name, id){ await deleteDoc(doc(db, name, id)); }

// =========================================================
// REGISTER
// =========================================================
async function doRegister(){
  const username = document.getElementById('reg-username').value.trim().toLowerCase();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errBox = document.getElementById('reg-error');
  const btn = document.getElementById('btn-register');
  errBox.classList.remove('show'); errBox.textContent = '';

  if(!username){ errBox.textContent='Username wajib diisi.'; errBox.classList.add('show'); return; }
  if(!/^[a-z0-9_]{3,20}$/.test(username)){ errBox.textContent='Username 3-20 karakter, huruf kecil/angka/underscore.'; errBox.classList.add('show'); return; }
  if(!email){ errBox.textContent='Email wajib diisi.'; errBox.classList.add('show'); return; }
  if(!password || password.length < 6){ errBox.textContent='Password minimal 6 karakter.'; errBox.classList.add('show'); return; }

  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Memproses...';
  try{
    const unameSnap = await getDoc(doc(db, 'usernames', username));
    if(unameSnap.exists()) throw new Error('Username sudah dipakai. Pilih yang lain.');

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

// =========================================================
// LOGIN
// =========================================================
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
    if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-login-credentials'].includes(e.code)) msg = 'Username atau password salah.';
    else if(e.code === 'auth/too-many-requests') msg = 'Terlalu banyak percobaan. Coba nanti.';
    else if(e.code === 'auth/network-request-failed') msg = 'Koneksi internet bermasalah.';
    errBox.textContent = msg; errBox.classList.add('show');
  }finally{ btn.disabled = false; btn.textContent = orig; }
}

// =========================================================
// AUTH LISTENERS
// =========================================================
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

// Theme toggle button
document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

// =========================================================
// AUTH STATE
// =========================================================
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
    if(!userSnap.exists()){ await handleLegacyAccount(user); return; }

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
  }catch(e){
    console.error(e);
    toast('Error: ' + e.message, 'error');
    hideSplash();
  }
});

// =========================================================
// MIGRASI AKUN LAMA
// =========================================================
async function handleLegacyAccount(user){
  try{
    toast('Mendeteksi akun lama, migrasi...', 'warn', 'Mohon Tunggu');
    let baseUsername = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if(baseUsername.length < 3) baseUsername = 'user' + baseUsername;
    let username = baseUsername, attempt = 0;
    while(true){
      const snap = await getDoc(doc(db, 'usernames', username));
      if(!snap.exists()) break;
      attempt++;
      username = baseUsername + attempt;
      if(attempt > 99){ username = 'user' + Date.now(); break; }
    }
    const wsSnap = await getDoc(doc(db, 'workspaces', WORKSPACE_ID));
    const isOwner = !wsSnap.exists();
    const members = isOwner ? [] : (wsSnap.data().members || []);

    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid, email: user.email, username, workspaceId: WORKSPACE_ID,
      role: isOwner ? 'owner' : 'member', joinedAt: serverTimestamp(), kickedAt: null, legacy: true
    });

    if(isOwner){
      await setDoc(doc(db, 'workspaces', WORKSPACE_ID), {
        name: 'Workspace Utama', ownerUid: user.uid, members: [user.uid], createdAt: serverTimestamp()
      });
    } else {
      await updateDoc(doc(db, 'workspaces', WORKSPACE_ID), { members: [...members, user.uid] });
    }

    await setDoc(doc(db, 'usernames', username), { email: user.email, uid: user.uid });

    for(const collName of ['pemasukan','pengeluaran']){
      try{
        const q = query(collection(db, collName), where('userId','==',user.uid));
        const snap = await getDocs(q);
        for(const d of snap.docs){
          await updateDoc(doc(db, collName, d.id), { workspaceId: WORKSPACE_ID, createdBy: username });
        }
      }catch(e){ console.error('Migrasi '+collName, e); }
    }

    toast(`Migrasi sukses! Username kamu: ${username}. Refresh halaman.`, 'success', 'Migrasi Berhasil');
    setTimeout(() => window.location.reload(), 2500);
  }catch(e){
    console.error(e);
    toast('Migrasi gagal: ' + e.message, 'error');
    await signOut(auth);
  }
}

// =========================================================
// NAVIGASI
// =========================================================
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const openSidebar = () => { sidebar.classList.add('open'); overlay.classList.add('show'); };
const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
document.getElementById('hamburger').addEventListener('click', openSidebar);
overlay.addEventListener('click', closeSidebar);

const PAGE_TITLES = {
  dashboard:'Dashboard', detail:'Detail Transaksi', pemasukan:'Pemasukan',
  pengeluaran:'Pengeluaran', kategori:'Kategori', anggota:'Anggota',
  profil:'Profil Saya', laporan:'Laporan & Export'
};

function goToPage(page){
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  document.querySelectorAll('#bottom-nav button[data-page]').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const t = document.getElementById('page-'+page);
  if(t) t.classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page]||'';
  window.scrollTo({top:0,behavior:'smooth'});
  closeSidebar();
  if(page==='dashboard') renderCharts();
  if(page==='laporan') renderPreview();
  if(page==='detail') renderDetail();
  if(page==='anggota') renderAnggota();
  if(page==='profil') renderProfil();
  refreshIcons();
}

document.getElementById('nav').addEventListener('click', e=>{ const b=e.target.closest('button[data-page]'); if(b) goToPage(b.dataset.page); });
document.getElementById('bottom-nav').addEventListener('click', e=>{ const b=e.target.closest('button[data-page]'); if(b) goToPage(b.dataset.page); });
document.getElementById('link-ke-detail').addEventListener('click', e=>{ e.preventDefault(); goToPage('detail'); });
document.getElementById('btn-logout').addEventListener('click', () => { closeSidebar(); signOut(auth); });

// =========================================================
// INIT
// =========================================================
initTheme();
refreshIcons();

// =========================================================
// RENDER KATEGORI
// =========================================================
function renderKatSelects(){
  const build=(sel,list)=>{
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

// =========================================================
// FILTER PERIODE
// =========================================================
function getPeriodeRange(){
  const now = new Date();
  if(state.dashboardPeriode === 'bulan-ini'){
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
    const end = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
    return {start, end};
  }
  if(state.dashboardPeriode === 'tahun-ini'){
    const start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0,10);
    const end = new Date(now.getFullYear(), 11, 31).toISOString().slice(0,10);
    return {start, end};
  }
  return {start:null, end:null};
}
function filterByPeriode(arr){
  const {start, end} = getPeriodeRange();
  if(!start) return arr;
  return arr.filter(r => r.tanggal >= start && r.tanggal <= end);
}

// =========================================================
// STATS
// =========================================================
function renderStats(){
  const pem = filterByPeriode(state.pemasukan);
  const peng = filterByPeriode(state.pengeluaran);
  const tm = pem.reduce((s,r)=>s+Number(r.jumlah||0),0);
  const tk = peng.reduce((s,r)=>s+Number(r.jumlah||0),0);
  const saldo = tm - tk;
  document.getElementById('statPemasukan').textContent=fmtRpShort(tm);
  document.getElementById('statPengeluaran').textContent=fmtRpShort(tk);
  document.getElementById('statSaldo').textContent=fmtRpShort(saldo);
  document.getElementById('statPemasukanSub').textContent=pem.length+' transaksi';
  document.getElementById('statPengeluaranSub').textContent=peng.length+' transaksi';
  document.getElementById('statSaldoSub').textContent=saldo>=0?'Surplus':'Defisit';
}

// =========================================================
// TABLES
// =========================================================
function renderSimpleList(containerId, arr, type){
  const box = document.getElementById(containerId);
  if(!arr.length){
    box.innerHTML = `<div class="empty"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg><br>Belum ada data.</div>`;
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
        <button class="tx-delete" data-del="${type==='masuk'?'pemasukan':'pengeluaran'}" data-id="${r.id}" title="Hapus"><i data-feather="trash-2"></i></button>
      </div>
    </div>`).join('')}</div>`;
  refreshIcons();
}
function renderTables(){
  const dp=[...state.pemasukan].sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||''));
  const dk=[...state.pengeluaran].sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||''));
  document.getElementById('countPemasukan').textContent=dp.length;
  document.getElementById('countPengeluaran').textContent=dk.length;
  renderSimpleList('tablePemasukan', dp, 'masuk');
  renderSimpleList('tablePengeluaran', dk, 'keluar');

  const recent=[...state.pemasukan.map(r=>({...r,_tipe:'masuk'})),...state.pengeluaran.map(r=>({...r,_tipe:'keluar'}))]
    .sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||'')).slice(0,5);
  const rt=document.getElementById('recentTable');
  if(!recent.length){
    rt.innerHTML=`<div class="empty"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M22 6l-10 7L2 6"/></svg><br>Belum ada transaksi.</div>`;
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

// =========================================================
// DETAIL
// =========================================================
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
  document.getElementById('countDetail').textContent = all.length;
  const box = document.getElementById('detailList');
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

// =========================================================
// CHART
// =========================================================
function renderCharts(){
  if(typeof Chart === 'undefined') return;
  ['chartBulanan','chartKatKeluar','chartKatMasuk'].forEach(id=>{
    const c=document.getElementById(id);
    if(c){ const inst=Chart.getChart(c); if(inst) inst.destroy(); }
  });

  // Warna dinamis berdasarkan tema
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

  new Chart(document.getElementById('chartBulanan'),{
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
      plugins:{
        legend:{position:'top',labels:{color:textColor,font:{family:'Plus Jakarta Sans',size:12,weight:'600'},usePointStyle:true,boxWidth:10}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmtRp(c.parsed.y)}`}}
      },
      scales:{
        y:{
          beginAtZero:true,
          ticks:{color:textColor,font:{family:'Plus Jakarta Sans',size:11},callback:v=>fmtRpShort(v)},
          grid:{color:gridColor}
        },
        x:{
          ticks:{color:textColor,font:{family:'Plus Jakarta Sans',size:11}},
          grid:{display:false}
        }
      }
    }
  });

  const buildD=(id,arr,pal)=>{
    const agg={};
    arr.forEach(r=>{const k=r.kategori||'(Tanpa Kategori)'; agg[k]=(agg[k]||0)+Number(r.jumlah||0);});
    const lbl=Object.keys(agg); const val=lbl.map(l=>agg[l]);
    new Chart(document.getElementById(id),{
      type:'doughnut',
      data:{
        labels:lbl.length?lbl:['Belum ada'],
        datasets:[{
          data:val.length?val:[1],
          backgroundColor:lbl.length?pal:['#e5e7eb'],
          borderWidth:3,
          borderColor:isDark?'#2A1E16':'#fff'
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,cutout:'62%',
        plugins:{
          legend:{position:'bottom',labels:{padding:12,color:textColor,font:{family:'Plus Jakarta Sans',size:11,weight:'600'},usePointStyle:true,boxWidth:8}},
          tooltip:{callbacks:{label:c=>`${c.label}: ${fmtRp(c.parsed)}`}}
        }
      }
    });
  };
  buildD('chartKatKeluar',peng,['#7B5E4A','#A67C52','#C9B29A','#8B6B4A','#D1B89A','#5A4536','#3B2A20','#E8DCC4','#F2E7D5','#4A362A']);
  buildD('chartKatMasuk',pem,['#16a34a','#22c55e','#84cc16','#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7','#ec4899']);
}

// =========================================================
// RENDER ALL
// =========================================================
function renderAll(){
  renderKatSelects();
  renderKatLists();
  renderStats();
  renderTables();
  renderCharts();
  renderDetail();
  renderAnggota();
  renderProfil();
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

// =========================================================
// ANGGOTA
// =========================================================
async function renderAnggota(){
  if(!state.workspace || !state.profile) return;
  document.getElementById('ws-name-input').value = state.workspace.name || '';
  const isOwner = state.profile.role === 'owner';
  document.getElementById('btn-save-ws-name').style.display = isOwner ? 'inline-flex' : 'none';
  document.getElementById('ws-name-input').disabled = !isOwner;
  const box = document.getElementById('anggotaList');
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
          <div class="member-name">${esc(u.username||'(tanpa username)')} ${isMe?'<span style="color:var(--text-muted);font-weight:400">(Anda)</span>':''}<span class="member-role ${isOwnerRow?'owner':''}">${isOwnerRow?'Owner':'Member'}</span></div>
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

// =========================================================
// PROFIL
// =========================================================
function renderProfil(){
  if(!state.profile) return;
  document.getElementById('profileAvatar').textContent = (state.profile.username||'?')[0].toUpperCase();
  document.getElementById('profileUsername').textContent = state.profile.username || '-';
  document.getElementById('profileEmail').textContent = state.profile.email || '-';
  const roleEl = document.getElementById('profileRole');
  const role = state.profile.role || 'member';
  roleEl.textContent = role === 'owner' ? 'Owner' : role === 'removed' ? 'Removed' : 'Member';
  roleEl.className = 'member-role ' + (role === 'owner' ? 'owner' : role === 'removed' ? 'removed' : '');
}

// Ubah Username
document.getElementById('btn-ubah-username').addEventListener('click', () => {
  document.getElementById('new-username').value = state.profile.username || '';
  document.getElementById('err-username').classList.remove('show');
  openModalEl('modal-username');
  refreshIcons();
});
document.getElementById('btn-save-username').addEventListener('click', async () => {
  const newUname = document.getElementById('new-username').value.trim().toLowerCase();
  const errEl = document.getElementById('err-username');
  errEl.classList.remove('show');
  if(!newUname){ errEl.textContent='Username wajib diisi.'; errEl.classList.add('show'); return; }
  if(!/^[a-z0-9_]{3,20}$/.test(newUname)){ errEl.textContent='Username 3-20 karakter, huruf kecil/angka/underscore.'; errEl.classList.add('show'); return; }
  if(newUname === state.profile.username){ errEl.textContent='Username sama dengan yang sekarang.'; errEl.classList.add('show'); return; }
  const oldUname = state.profile.username;
  const btn = document.getElementById('btn-save-username');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Menyimpan...';
  try{
    const snap = await getDoc(doc(db, 'usernames', newUname));
    if(snap.exists()) throw new Error('Username sudah dipakai. Pilih yang lain.');
    await updateDoc(doc(db, 'users', state.user.uid), { username: newUname });
    await setDoc(doc(db, 'usernames', newUname), { email: state.profile.email, uid: state.user.uid });
    if(oldUname) await deleteDoc(doc(db, 'usernames', oldUname));
    state.profile.username = newUname;
    renderProfil();
    closeModalEl('modal-username');
    toast('Username berhasil diubah menjadi "' + newUname + '".', 'success');
  }catch(e){ errEl.textContent = e.message; errEl.classList.add('show'); }
  finally{ btn.disabled = false; btn.textContent = orig; }
});

// Ubah Email
document.getElementById('btn-ubah-email').addEventListener('click', () => {
  document.getElementById('new-email').value = '';
  document.getElementById('email-password').value = '';
  document.getElementById('err-email').classList.remove('show');
  openModalEl('modal-email');
  refreshIcons();
});
document.getElementById('btn-save-email').addEventListener('click', async () => {
  const newEmail = document.getElementById('new-email').value.trim();
  const password = document.getElementById('email-password').value;
  const errEl = document.getElementById('err-email');
  errEl.classList.remove('show');
  if(!newEmail){ errEl.textContent='Email baru wajib diisi.'; errEl.classList.add('show'); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)){ errEl.textContent='Format email tidak valid.'; errEl.classList.add('show'); return; }
  if(!password){ errEl.textContent='Password wajib diisi untuk verifikasi.'; errEl.classList.add('show'); return; }
  const btn = document.getElementById('btn-save-email');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Memproses...';
  try{
    const cred = EmailAuthProvider.credential(state.profile.email, password);
    await reauthenticateWithCredential(state.user, cred);
    await verifyBeforeUpdateEmail(state.user, newEmail);
    await updateDoc(doc(db, 'users', state.user.uid), { email: newEmail, emailVerified: false });
    state.profile.email = newEmail;
    renderProfil();
    closeModalEl('modal-email');
    toast('Link verifikasi dikirim ke email baru. Cek inbox & klik link untuk konfirmasi.', 'success', 'Email Terkirim');
  }catch(e){
    let msg = e.message;
    if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = 'Password salah.';
    else if(e.code === 'auth/email-already-in-use') msg = 'Email sudah digunakan akun lain.';
    else if(e.code === 'auth/invalid-email') msg = 'Format email tidak valid.';
    errEl.textContent = msg; errEl.classList.add('show');
  }finally{ btn.disabled = false; btn.textContent = orig; }
});

// Ubah Password
document.getElementById('btn-ubah-password').addEventListener('click', () => {
  document.getElementById('old-password').value = '';
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-password').value = '';
  document.getElementById('err-password').classList.remove('show');
  openModalEl('modal-password');
  refreshIcons();
});
document.getElementById('btn-save-password').addEventListener('click', async () => {
  const oldPass = document.getElementById('old-password').value;
  const newPass = document.getElementById('new-password').value;
  const confPass = document.getElementById('confirm-password').value;
  const errEl = document.getElementById('err-password');
  errEl.classList.remove('show');
  if(!oldPass){ errEl.textContent='Password lama wajib diisi.'; errEl.classList.add('show'); return; }
  if(!newPass || newPass.length < 6){ errEl.textContent='Password baru minimal 6 karakter.'; errEl.classList.add('show'); return; }
  if(newPass !== confPass){ errEl.textContent='Konfirmasi password tidak cocok.'; errEl.classList.add('show'); return; }
  if(newPass === oldPass){ errEl.textContent='Password baru harus berbeda dari yang lama.'; errEl.classList.add('show'); return; }
  const btn = document.getElementById('btn-save-password');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Menyimpan...';
  try{
    const cred = EmailAuthProvider.credential(state.profile.email, oldPass);
    await reauthenticateWithCredential(state.user, cred);
    await updatePassword(state.user, newPass);
    closeModalEl('modal-password');
    toast('Password berhasil diubah.', 'success');
  }catch(e){
    let msg = e.message;
    if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = 'Password lama salah.';
    else if(e.code === 'auth/weak-password') msg = 'Password terlalu lemah.';
    errEl.textContent = msg; errEl.classList.add('show');
  }finally{ btn.disabled = false; btn.textContent = orig; }
});

// Hapus Akun
document.getElementById('btn-hapus-akun').addEventListener('click', async () => {
  if(state.profile.role === 'owner'){
    const q = query(collection(db, 'users'), where('workspaceId','==',WORKSPACE_ID));
    const snap = await getDocs(q);
    const activeOthers = snap.docs.map(d => ({uid:d.id,...d.data()})).filter(u => u.uid !== state.user.uid && u.role !== 'removed');
    if(activeOthers.length > 0){
      toast(`Kamu masih owner dan ada ${activeOthers.length} member aktif. Keluarkan member dulu di menu Anggota sebelum hapus akun.`, 'error', 'Tidak Bisa Hapus');
      return;
    }
  }
  document.getElementById('confirm-delete-text').value = '';
  document.getElementById('delete-password').value = '';
  document.getElementById('err-hapus').classList.remove('show');
  openModalEl('modal-hapus');
  refreshIcons();
});
document.getElementById('btn-confirm-hapus').addEventListener('click', async () => {
  const confirmText = document.getElementById('confirm-delete-text').value.trim().toUpperCase();
  const password = document.getElementById('delete-password').value;
  const errEl = document.getElementById('err-hapus');
  errEl.classList.remove('show');
  if(confirmText !== 'HAPUS'){ errEl.textContent='Ketik "HAPUS" untuk konfirmasi.'; errEl.classList.add('show'); return; }
  if(!password){ errEl.textContent='Password wajib diisi.'; errEl.classList.add('show'); return; }
  const btn = document.getElementById('btn-confirm-hapus');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Menghapus...';
  try{
    const cred = EmailAuthProvider.credential(state.profile.email, password);
    await reauthenticateWithCredential(state.user, cred);
    try{ await deleteDoc(doc(db, 'usernames', state.profile.username)); }catch(e){ console.warn(e); }
    await deleteDoc(doc(db, 'users', state.user.uid));
    if(state.profile.role === 'owner'){
      try{ await deleteDoc(doc(db, 'workspaces', WORKSPACE_ID)); }catch(e){ console.warn(e); }
    } else {
      const newMembers = (state.workspace.members || []).filter(m => m !== state.user.uid);
      await updateDoc(doc(db, 'workspaces', WORKSPACE_ID), { members: newMembers });
    }
    await deleteUser(state.user);
    toast('Akun berhasil dihapus. Selamat tinggal!', 'success');
  }catch(e){
    let msg = e.message;
    if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = 'Password salah.';
    errEl.textContent = msg; errEl.classList.add('show');
    btn.disabled = false; btn.textContent = orig;
  }
});

// =========================================================
// MODAL ENTRY
// =========================================================
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

// =========================================================
// FORM PEMASUKAN / PENGELUARAN (Halaman)
// =========================================================
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

// =========================================================
// HAPUS TRANSAKSI
// =========================================================
document.addEventListener('click',async e=>{
  const btn=e.target.closest('button[data-del]'); if(!btn) return;
  const tipe=btn.dataset.del; const id=btn.dataset.id;
  if(!confirm('Yakin ingin menghapus data ini?')) return;
  try{
    await delCol(tipe,id);
    state[tipe]=state[tipe].filter(r=>r.id!==id);
    renderAll();
    renderPreview();
    toast('Data berhasil dihapus.','success');
  }catch(err){ toast('Gagal menghapus: '+err.message,'error'); }
});

// =========================================================
// KATEGORI
// =========================================================
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

// =========================================================
// LAPORAN
// =========================================================
function getFilteredRows(){
  const jenis=document.getElementById('expJenis').value;
  const dari=document.getElementById('expDari').value;
  const sampai=document.getElementById('expSampai').value;
  const inRange=t=>(!dari||t>=dari)&&(!sampai||t<=sampai);
  const rows=[];
  if(jenis==='semua'||jenis==='pemasukan'){
    state.pemasukan.filter(r=>inRange(r.tanggal)).forEach(r=>{
      rows.push({_tipe:'Pemasukan',Tanggal:r.tanggal,Kegunaan:r.kegunaan||'',Kategori:r.kategori||'',Jumlah:Number(r.jumlah)||0,Deskripsi:r.deskripsi||''});
    });
  }
  if(jenis==='semua'||jenis==='pengeluaran'){
    state.pengeluaran.filter(r=>inRange(r.tanggal)).forEach(r=>{
      rows.push({_tipe:'Pengeluaran',Tanggal:r.tanggal,Kegunaan:r.sumber||'',Kategori:r.kategori||'',Jumlah:Number(r.jumlah)||0,Deskripsi:r.deskripsi||''});
    });
  }
  return rows.sort((a,b)=>(a.Tanggal||'').localeCompare(b.Tanggal||''));
}
function renderPreview(){
  const rows=getFilteredRows();
  document.getElementById('countPreview').textContent=rows.length;
  const box=document.getElementById('tablePreview');
  if(!rows.length){
    box.innerHTML=`<div class="empty"><i data-feather="file-text" style="width:40px;height:40px;opacity:.4"></i><br>Tidak ada data pada filter ini.</div>`;
    refreshIcons();
    return;
  }
  const total=rows.reduce((s,r)=>s+r.Jumlah,0);
  box.innerHTML=`<div class="table-wrap"><table>
    <thead><tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>Kategori</th><th style="text-align:right">Jumlah</th></tr></thead>
    <tbody>
      ${rows.map(r=>`<tr>
        <td style="white-space:nowrap">${fmtTanggal(r.Tanggal)}</td>
        <td>${r._tipe==='Pemasukan'?'<span class="badge">Masuk</span>':'<span class="badge" style="background:var(--red-light);color:var(--red-dark)">Keluar</span>'}</td>
        <td>${esc(r.Kegunaan)}</td>
        <td>${esc(r.Kategori)}</td>
        <td class="num ${r._tipe==='Pemasukan'?'in':'out'}">${fmtRp(r.Jumlah)}</td>
      </tr>`).join('')}
      <tr style="background:var(--surface);font-weight:700">
        <td colspan="4" style="text-align:right">TOTAL</td>
        <td class="num">${fmtRp(total)}</td>
      </tr>
    </tbody>
  </table></div>`;
}
document.getElementById('btnPreview').addEventListener('click',renderPreview);
document.getElementById('btnExport').addEventListener('click',()=>{
  const rows=getFilteredRows();
  if(!rows.length){ toast('Tidak ada data untuk diexport.','error'); return; }
  try{
    const aoa=[['Tanggal','Kegunaan','Kategori','Jumlah','Deskripsi']];
    rows.forEach(r=>aoa.push([r.Tanggal,r.Kegunaan,r.Kategori,r.Jumlah,r.Deskripsi]));
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:13},{wch:28},{wch:20},{wch:16},{wch:36}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Laporan');
    XLSX.writeFile(wb,`Laporan_Keuangan_${todayISO()}.xlsx`);
    toast(`Berhasil export ${rows.length} baris.`,'success');
  }catch(e){ toast('Gagal export: '+e.message,'error'); }
});

// =========================================================
// INIT DATES
// =========================================================
document.getElementById('inTanggal').value=todayISO();
document.getElementById('outTanggal').value=todayISO();
document.getElementById('entry-tanggal').value=todayISO();

// =========================================================
// SERVICE WORKER (PWA)
// =========================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('[PWA] Service Worker terdaftar:', reg.scope))
      .catch(err => console.warn('[PWA] Gagal daftar Service Worker:', err));
  });
}
