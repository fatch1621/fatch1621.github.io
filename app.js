import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const state = { pemasukan: [], pengeluaran: [], katPemasukan: [], katPengeluaran: [], user: null };
const DEF_KAT_M = ['Gaji','Bonus','Investasi','Penjualan','Usaha','Lainnya'];
const DEF_KAT_K = ['Makanan & Minuman','Transportasi','Belanja','Tagihan','Kesehatan','Hiburan','Pendidikan','Lainnya'];
const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

// IKON KATEGORI
const KAT_ICONS = {
  'Gaji':'💼','Bonus':'🎁','Investasi':'📈','Penjualan':'🛒','Usaha':'🏢','Lainnya':'📦',
  'Makanan & Minuman':'🍔','Transportasi':'🚗','Belanja':'🛍️','Tagihan':'🧾','Kesehatan':'💊',
  'Hiburan':'🎬','Pendidikan':'📚','Lain-lain':'📁'
};
const getKatIcon = n => KAT_ICONS[n] || '🏷️';

// ====== UTILITAS ======
const fmtRp = n => 'Rp ' + (Number(n)||0).toLocaleString('id-ID',{maximumFractionDigits:0});
const fmtTanggal = s => { if(!s) return '-'; const p=String(s).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s; };
const fmtBulan = k => { const [y,m]=k.split('-'); return BULAN[parseInt(m,10)-1]+' '+y; };
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const todayISO = () => { const d=new Date(); const off=d.getTimezoneOffset(); return new Date(d.getTime()-off*60000).toISOString().slice(0,10); };

function toast(msg, type='success', title=null){
  const box=document.getElementById('toastBox'); const el=document.createElement('div');
  el.className='toast '+(type==='error'?'error':type==='warn'?'warn':'');
  const icons={success:'✅',error:'⛔',warn:'⚠️'}; const titles={success:'Berhasil',error:'Terjadi Kesalahan',warn:'Perhatian'};
  el.innerHTML=`<div class="t-ico">${icons[type]||'✅'}</div><div class="t-body"><strong>${esc(title||titles[type]||'Info')}</strong><span>${esc(msg)}</span></div>`;
  box.appendChild(el); setTimeout(()=>{el.classList.add('hide');setTimeout(()=>el.remove(),300);}, type==='error'?5200:3400);
}
function setErr(id,msg){ const i=document.getElementById(id); const e=document.getElementById('err-'+id); if(i)i.classList.add('invalid'); if(e){e.textContent=msg;e.classList.add('show');} }
function clearErrs(form){ form.querySelectorAll('.invalid').forEach(el=>el.classList.remove('invalid')); form.querySelectorAll('.error-msg').forEach(el=>{el.textContent='';el.classList.remove('show');}); }

// ====== FIRESTORE ======
async function loadCol(name){
  if(!state.user) return [];
  try{
    const q=query(collection(db,name),where("userId","==",state.user.uid),orderBy("tanggal","desc"));
    const snap=await getDocs(q);
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){ console.error('Load error '+name,e); return []; }
}
async function saveCol(name,data){
  if(!state.user) throw new Error("User belum login");
  await addDoc(collection(db,name),{...data,userId:state.user.uid,createdAt:new Date()});
}
async function delCol(name,id){ await deleteDoc(doc(db,name,id)); }

// ====== AUTH ======
document.getElementById('btn-login').addEventListener('click',async()=>{
  const email=document.getElementById('auth-email').value;
  const pass=document.getElementById('auth-password').value;
  const errBox=document.getElementById('auth-error'); errBox.classList.remove('show'); errBox.textContent='';
  try{ await signInWithEmailAndPassword(auth,email,pass); }
  catch(e){ errBox.textContent="Login gagal: "+e.message; errBox.classList.add('show'); }
});
document.getElementById('btn-register').addEventListener('click',async()=>{
  const email=document.getElementById('auth-email').value;
  const pass=document.getElementById('auth-password').value;
  const errBox=document.getElementById('auth-error'); errBox.classList.remove('show'); errBox.textContent='';
  if(pass.length<6){ errBox.textContent="Password minimal 6 karakter."; errBox.classList.add('show'); return; }
  try{ await createUserWithEmailAndPassword(auth,email,pass); toast('Akun dibuat! Silakan login.','success'); }
  catch(e){ errBox.textContent="Registrasi gagal: "+e.message; errBox.classList.add('show'); }
});
document.getElementById('btn-logout').addEventListener('click',()=>signOut(auth));

onAuthStateChanged(auth,async(user)=>{
  const authPage=document.getElementById('auth-page');
  const appLayout=document.getElementById('app-layout');
  if(user){
    state.user=user;
    authPage.style.display='none'; appLayout.style.display='flex';
    state.katPemasukan=JSON.parse(localStorage.getItem('katPemasukan')||JSON.stringify(DEF_KAT_M));
    state.katPengeluaran=JSON.parse(localStorage.getItem('katPengeluaran')||JSON.stringify(DEF_KAT_K));
    state.pemasukan=await loadCol('pemasukan');
    state.pengeluaran=await loadCol('pengeluaran');
    renderAll();
    toast('Selamat datang, '+user.email,'success');
  }else{
    state.user=null;
    authPage.style.display='flex'; appLayout.style.display='none';
  }
});

// ====== NAVIGASI ======
document.getElementById('nav').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-page]');
  if(!btn) return;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const target=document.getElementById('page-'+btn.dataset.page);
  if(target) target.classList.add('active');
  // Update title topbar
  const titles={dashboard:'Dashboard',pemasukan:'Pemasukan',pengeluaran:'Pengeluaran',kategori:'Kategori',laporan:'Laporan & Export'};
  document.getElementById('topbar-title').textContent=titles[btn.dataset.page]||'';
  window.scrollTo({top:0,behavior:'smooth'});
  if(btn.dataset.page==='dashboard') renderCharts();
  if(btn.dataset.page==='laporan') renderPreview();
});

// ====== RENDER ======
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
    if(!list.length){ box.innerHTML=`<span style="color:var(--muted);font-size:12.5px">Belum ada kategori.</span>`; return; }
    box.innerHTML=list.map(k=>`<span class="kat-chip ${type==='keluar'?'exp':''}">${esc(k)}<button type="button" data-kat-type="${type}" data-kat-name="${esc(k)}">✕</button></span>`).join('');
  };
  draw('listKatMasuk',state.katPemasukan,'masuk');
  draw('listKatKeluar',state.katPengeluaran,'keluar');
}
function renderStats(){
  const tm=state.pemasukan.reduce((s,r)=>s+Number(r.jumlah||0),0);
  const tk=state.pengeluaran.reduce((s,r)=>s+Number(r.jumlah||0),0);
  const saldo=tm-tk;
  document.getElementById('statPemasukan').textContent=fmtRp(tm);
  document.getElementById('statPengeluaran').textContent=fmtRp(tk);
  document.getElementById('statSaldo').textContent=fmtRp(saldo);
  document.getElementById('statTotal').textContent=state.pemasukan.length+state.pengeluaran.length;
  document.getElementById('statPemasukanSub').textContent=state.pemasukan.length+' transaksi';
  document.getElementById('statPengeluaranSub').textContent=state.pengeluaran.length+' transaksi';
  document.getElementById('statSaldoSub').textContent=saldo>=0?'✅ Surplus':'⚠️ Defisit';
  document.getElementById('statSaldo').style.color=saldo>=0?'var(--primary)':'var(--red)';
}
function renderTables(){
  const tp=document.getElementById('tablePemasukan');
  const dp=[...state.pemasukan].sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||''));
  document.getElementById('countPemasukan').textContent=dp.length;
  tp.innerHTML=dp.length?`<table><thead><tr><th>Tanggal</th><th>Kegunaan</th><th>Kategori</th><th style="text-align:right">Jumlah</th><th>Deskripsi</th><th style="text-align:center">Aksi</th></tr></thead><tbody>${dp.map(r=>`<tr><td style="white-space:nowrap">${fmtTanggal(r.tanggal)}</td><td>${esc(r.kegunaan)}</td><td><span class="badge">${esc(r.kategori)}</span></td><td class="num in">${fmtRp(r.jumlah)}</td><td style="color:var(--muted)">${r.deskripsi?esc(r.deskripsi):'—'}</td><td style="text-align:center"><button class="btn btn-danger btn-sm" data-del="pemasukan" data-id="${r.id}">Hapus</button></td></tr>`).join('')}</tbody></table>`:`<div class="empty"><span class="big">📥</span>Belum ada data pemasukan.</div>`;

  const tk=document.getElementById('tablePengeluaran');
  const dk=[...state.pengeluaran].sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||''));
  document.getElementById('countPengeluaran').textContent=dk.length;
  tk.innerHTML=dk.length?`<table><thead><tr><th>Tanggal</th><th>Sumber</th><th>Kategori</th><th style="text-align:right">Jumlah</th><th>Deskripsi</th><th style="text-align:center">Aksi</th></tr></thead><tbody>${dk.map(r=>`<tr><td style="white-space:nowrap">${fmtTanggal(r.tanggal)}</td><td>${esc(r.sumber)}</td><td><span class="badge" style="background:#fef3c7;color:#92400e">${esc(r.kategori)}</span></td><td class="num out">${fmtRp(r.jumlah)}</td><td style="color:var(--muted)">${r.deskripsi?esc(r.deskripsi):'—'}</td><td style="text-align:center"><button class="btn btn-danger btn-sm" data-del="pengeluaran" data-id="${r.id}">Hapus</button></td></tr>`).join('')}</tbody></table>`:`<div class="empty"><span class="big">📤</span>Belum ada data pengeluaran.</div>`;

  const recent=[...state.pemasukan.map(r=>({...r,_tipe:'masuk'})),...state.pengeluaran.map(r=>({...r,_tipe:'keluar'}))].sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||'')).slice(0,7);
  const rt=document.getElementById('recentTable');
  rt.innerHTML=recent.length?`<table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>Kategori</th><th style="text-align:right">Jumlah</th></tr></thead><tbody>${recent.map(r=>`<tr><td style="white-space:nowrap">${fmtTanggal(r.tanggal)}</td><td>${r._tipe==='masuk'?'<span class="badge" style="background:#d1fae5;color:#065f46">Masuk</span>':'<span class="badge" style="background:#fee2e2;color:#991b1b">Keluar</span>'}</td><td>${esc(r._tipe==='masuk'?r.kegunaan:r.sumber)}</td><td>${esc(r.kategori)}</td><td class="num ${r._tipe==='masuk'?'in':'out'}">${r._tipe==='masuk'?'+':'−'} ${fmtRp(r.jumlah)}</td></tr>`).join('')}</tbody></table>`:`<div class="empty"><span class="big">📭</span>Belum ada transaksi.</div>`;
}
function renderCharts(){
  ['chartBulanan','chartKatKeluar','chartKatMasuk'].forEach(id=>{
    const c=document.getElementById(id);
    if(c){ const inst=Chart.getChart(c); if(inst) inst.destroy(); }
  });
  const map={};
  state.pemasukan.forEach(r=>{const k=(r.tanggal||'').slice(0,7); if(!k)return; map[k]=map[k]||{in:0,out:0}; map[k].in+=Number(r.jumlah||0);});
  state.pengeluaran.forEach(r=>{const k=(r.tanggal||'').slice(0,7); if(!k)return; map[k]=map[k]||{in:0,out:0}; map[k].out+=Number(r.jumlah||0);});
  const keys=Object.keys(map).sort().slice(-12);
  new Chart(document.getElementById('chartBulanan'),{
    type:'bar',
    data:{labels:keys.length?keys.map(fmtBulan):['Belum ada data'],datasets:[
      {label:'Pemasukan',data:keys.length?keys.map(k=>map[k].in):[0],backgroundColor:'#10b981',borderRadius:6},
      {label:'Pengeluaran',data:keys.length?keys.map(k=>map[k].out):[0],backgroundColor:'#ef4444',borderRadius:6}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmtRp(c.parsed.y)}`}}},scales:{y:{beginAtZero:true,ticks:{callback:v=>'Rp '+(v/1000)+'k'}}}}
  });
  const buildD=(id,arr,pal)=>{
    const agg={}; arr.forEach(r=>{const k=r.kategori||'(Tanpa Kategori)'; agg[k]=(agg[k]||0)+Number(r.jumlah||0);});
    const lbl=Object.keys(agg); const val=lbl.map(l=>agg[l]);
    new Chart(document.getElementById(id),{
      type:'doughnut',
      data:{labels:lbl.length?lbl:['Belum ada data'],datasets:[{data:val.length?val:[1],backgroundColor:lbl.length?pal:['#e5e7eb'],borderWidth:2,borderColor:'#fff'}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'right'},tooltip:{callbacks:{label:c=>`${c.label}: ${fmtRp(c.parsed)}`}}}}
    });
  };
  buildD('chartKatKeluar',state.pengeluaran,['#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#14b8a6','#06b6d4','#3b82f6','#8b5cf6']);
  buildD('chartKatMasuk',state.pemasukan,['#10b981','#22c55e','#84cc16','#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7','#ec4899']);
}
function renderAll(){ renderKatSelects(); renderKatLists(); renderStats(); renderTables(); renderCharts(); }

// ====== MODAL ENTRY BARU ======
const modal = document.getElementById('modal-entry');
const modalState = { tab:'expense', kategori:null, expr:'0', tanggal:todayISO() };

function openModal(tab='expense'){
  modalState.tab = tab;
  modalState.kategori = null;
  modalState.expr = '0';
  modalState.tanggal = todayISO();
  document.getElementById('entry-tanggal').value = todayISO();
  document.getElementById('entry-kegunaan').value = '';
  document.getElementById('entry-deskripsi').value = '';
  document.getElementById('search-kategori').value = '';
  document.getElementById('modal-tabs').querySelectorAll('button').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  updateModalFields();
  renderKategoriGrid('');
  updateAmountDisplay();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal(){
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function updateModalFields(){
  const isIncome = modalState.tab === 'income';
  document.getElementById('entry-label-kegunaan').innerHTML = isIncome ? 'Kegunaan <span class="req">*</span>' : 'Sumber <span class="req">*</span>';
  document.getElementById('entry-kegunaan').placeholder = isIncome ? 'cth: Gaji Bulan Ini' : 'cth: Toko Sembako';
}

function getKategoriList(){
  return modalState.tab === 'income' ? state.katPemasukan : state.katPengeluaran;
}

function renderKategoriGrid(filter=''){
  const grid = document.getElementById('kategori-grid');
  const list = getKategoriList();
  const filtered = filter ? list.filter(k => k.toLowerCase().includes(filter.toLowerCase())) : list;
  
  if(!filtered.length){
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:12.5px;padding:20px">Kategori tidak ditemukan.</div>`;
    return;
  }
  grid.innerHTML = filtered.map(k => `
    <div class="kategori-item ${modalState.kategori===k?'selected':''}" data-kat="${esc(k)}">
      <span class="kat-icon">${getKatIcon(k)}</span>
      <span class="kat-name">${esc(k)}</span>
    </div>
  `).join('') + `
    <div class="kategori-item" data-kat="__NEW__">
      <span class="kat-icon" style="color:var(--green-primary);font-weight:700">+</span>
      <span class="kat-name" style="color:var(--green-primary)">Baru</span>
    </div>`;
}

// Event kategori klik
document.getElementById('kategori-grid').addEventListener('click', e => {
  const item = e.target.closest('.kategori-item');
  if(!item) return;
  const kat = item.dataset.kat;
  if(kat === '__NEW__'){
    // Buka halaman kategori
    closeModal();
    document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
    document.querySelector('#nav button[data-page="kategori"]').classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-kategori').classList.add('active');
    document.getElementById('topbar-title').textContent = 'Kategori';
    return;
  }
  modalState.kategori = kat;
  renderKategoriGrid(document.getElementById('search-kategori').value);
});

// Search kategori
document.getElementById('search-kategori').addEventListener('input', e => {
  renderKategoriGrid(e.target.value);
});

// Tab switching
document.getElementById('modal-tabs').addEventListener('click', e => {
  const btn = e.target.closest('button[data-tab]');
  if(!btn) return;
  modalState.tab = btn.dataset.tab;
  modalState.kategori = null;
  document.getElementById('modal-tabs').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  updateModalFields();
  renderKategoriGrid(document.getElementById('search-kategori').value);
});

// Numpad
function updateAmountDisplay(){
  let val = modalState.expr;
  // Format angka dengan pemisah ribuan (hanya angka)
  let display = val;
  if(/^\d+$/.test(val)){
    display = Number(val).toLocaleString('id-ID');
  } else {
    // Ekspresi dengan operator, format angka-angkanya saja
    display = val.replace(/\d+/g, n => Number(n).toLocaleString('id-ID'));
  }
  document.getElementById('amount-number').textContent = display || '0';
}

function evalExpr(expr){
  try{
    // Ganti simbol ke operator JS
    let js = expr.replace(/÷/g,'/').replace(/×/g,'*').replace(/−/g,'-').replace(/\+/g,'+');
    // Hapus karakter terlarang
    js = js.replace(/[^0-9+\-*/.() ]/g,'');
    if(!js) return 0;
    // Hindari leading zero
    const result = Function('"use strict";return ('+js+')')();
    return Math.max(0, Number(result) || 0);
  }catch(e){ return 0; }
}

document.querySelector('.numpad').addEventListener('click', e => {
  const btn = e.target.closest('button[data-key]');
  if(!btn) return;
  const key = btn.dataset.key;
  
  if(key === '⌫'){
    modalState.expr = modalState.expr.slice(0, -1) || '0';
  } else if(['÷','×','−','+'].includes(key)){
    // Kalau ada operator di akhir, ganti dengan yang baru
    if(/[÷×−+]$/.test(modalState.expr)){
      modalState.expr = modalState.expr.slice(0, -1) + key;
    } else {
      modalState.expr += key;
    }
  } else if(key === '00'){
    if(modalState.expr === '0') modalState.expr = '0';
    else modalState.expr += '00';
  } else {
    // Angka
    if(modalState.expr === '0') modalState.expr = key;
    else modalState.expr += key;
  }
  updateAmountDisplay();
});

// Save entry
document.getElementById('btn-save-entry').addEventListener('click', async () => {
  const tanggal = document.getElementById('entry-tanggal').value.trim();
  const kegunaan = document.getElementById('entry-kegunaan').value.trim();
  const deskripsi = document.getElementById('entry-deskripsi').value.trim();
  const jumlah = evalExpr(modalState.expr);
  
  // Validasi
  if(!tanggal){ toast('Tanggal wajib diisi.','error','Validasi Gagal'); return; }
  if(!kegunaan){ toast('Field Kegunaan/Sumber wajib diisi.','error','Validasi Gagal'); return; }
  if(!modalState.kategori){ toast('Kategori wajib dipilih.','error','Validasi Gagal'); return; }
  if(!jumlah || jumlah <= 0){ toast('Jumlah wajib diisi dan lebih dari 0.','error','Validasi Gagal'); return; }
  
  const isIncome = modalState.tab === 'income';
  const collectionName = isIncome ? 'pemasukan' : 'pengeluaran';
  const data = isIncome
    ? { tanggal, kegunaan, kategori: modalState.kategori, jumlah, deskripsi }
    : { tanggal, sumber: kegunaan, kategori: modalState.kategori, jumlah, deskripsi };
  
  try{
    await saveCol(collectionName, data);
    state[collectionName] = await loadCol(collectionName);
    renderAll();
    closeModal();
    toast(`${isIncome?'Pemasukan':'Pengeluaran'} "${kegunaan}" ${fmtRp(jumlah)} berhasil disimpan.`,'success');
  }catch(err){
    toast('Gagal menyimpan: '+err.message,'error');
  }
});

// Modal open/close
document.getElementById('btn-new-entry').addEventListener('click', () => openModal('expense'));
document.getElementById('modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if(e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape' && modal.style.display === 'flex') closeModal(); });

// Link atur kategori
document.getElementById('link-atur-kategori').addEventListener('click', e => {
  e.preventDefault();
  closeModal();
  document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
  document.querySelector('#nav button[data-page="kategori"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-kategori').classList.add('active');
  document.getElementById('topbar-title').textContent = 'Kategori';
});

// ====== FORM PEMASUKAN (halaman) ======
document.getElementById('formPemasukan').addEventListener('submit',async e=>{
  e.preventDefault(); const form=e.target; clearErrs(form);
  const tanggal=document.getElementById('inTanggal').value.trim();
  const kegunaan=document.getElementById('inKegunaan').value.trim();
  const kategori=document.getElementById('inKategori').value.trim();
  const jumlahRaw=document.getElementById('inJumlah').value.trim();
  const deskripsi=document.getElementById('inDeskripsi').value.trim();
  const errs=[];
  if(!tanggal){setErr('inTanggal','Tanggal wajib diisi.');errs.push('Tanggal');}
  if(!kegunaan){setErr('inKegunaan','Kegunaan wajib diisi.');errs.push('Kegunaan');}
  if(!kategori){setErr('inKategori','Kategori wajib dipilih.');errs.push('Kategori');}
  if(!jumlahRaw){setErr('inJumlah','Jumlah wajib diisi.');errs.push('Jumlah');}
  else if(isNaN(Number(jumlahRaw))||Number(jumlahRaw)<=0){setErr('inJumlah','Jumlah harus angka > 0.');errs.push('Jumlah');}
  if(errs.length){ toast('Field bermasalah: '+errs.join(', '),'error','Gagal Menyimpan'); return; }
  try{
    await saveCol('pemasukan',{tanggal,kegunaan,kategori,jumlah:Number(jumlahRaw),deskripsi});
    state.pemasukan=await loadCol('pemasukan');
    form.reset(); clearErrs(form);
    document.getElementById('inTanggal').value=todayISO();
    renderAll();
    toast(`Pemasukan "${kegunaan}" berhasil disimpan.`,'success');
  }catch(err){ toast('Gagal: '+err.message,'error'); }
});

// ====== FORM PENGELUARAN (halaman) ======
document.getElementById('formPengeluaran').addEventListener('submit',async e=>{
  e.preventDefault(); const form=e.target; clearErrs(form);
  const tanggal=document.getElementById('outTanggal').value.trim();
  const sumber=document.getElementById('outSumber').value.trim();
  const kategori=document.getElementById('outKategori').value.trim();
  const jumlahRaw=document.getElementById('outJumlah').value.trim();
  const deskripsi=document.getElementById('outDeskripsi').value.trim();
  const errs=[];
  if(!tanggal){setErr('outTanggal','Tanggal wajib diisi.');errs.push('Tanggal');}
  if(!sumber){setErr('outSumber','Sumber wajib diisi.');errs.push('Sumber');}
  if(!kategori){setErr('outKategori','Kategori wajib dipilih.');errs.push('Kategori');}
  if(!jumlahRaw){setErr('outJumlah','Jumlah wajib diisi.');errs.push('Jumlah');}
  else if(isNaN(Number(jumlahRaw))||Number(jumlahRaw)<=0){setErr('outJumlah','Jumlah harus angka > 0.');errs.push('Jumlah');}
  if(errs.length){ toast('Field bermasalah: '+errs.join(', '),'error','Gagal Menyimpan'); return; }
  try{
    await saveCol('pengeluaran',{tanggal,sumber,kategori,jumlah:Number(jumlahRaw),deskripsi});
    state.pengeluaran=await loadCol('pengeluaran');
    form.reset(); clearErrs(form);
    document.getElementById('outTanggal').value=todayISO();
    renderAll();
    toast(`Pengeluaran "${sumber}" berhasil disimpan.`,'success');
  }catch(err){ toast('Gagal: '+err.message,'error'); }
});

// ====== HAPUS ======
document.addEventListener('click',async e=>{
  const btn=e.target.closest('button[data-del]'); if(!btn) return;
  const tipe=btn.dataset.del; const id=btn.dataset.id;
  if(!confirm('Yakin ingin menghapus data ini?')) return;
  try{
    await delCol(tipe,id);
    state[tipe]=state[tipe].filter(r=>r.id!==id);
    renderAll(); renderPreview();
    toast('Data berhasil dihapus.','success');
  }catch(err){ toast('Gagal menghapus: '+err.message,'error'); }
});

// ====== KATEGORI ======
function tambahKat(inputId,key){
  const inp=document.getElementById(inputId); const nama=inp.value.trim();
  if(!nama){ toast('Nama kategori tidak boleh kosong.','error'); return; }
  if(state[key].some(k=>k.toLowerCase()===nama.toLowerCase())){ toast('Kategori sudah ada.','error'); return; }
  state[key].push(nama);
  localStorage.setItem(key,JSON.stringify(state[key]));
  inp.value=''; renderKatSelects(); renderKatLists();
  toast(`Kategori "${nama}" ditambahkan.`,'success');
}
document.getElementById('formKatMasuk').addEventListener('submit',e=>{e.preventDefault(); tambahKat('inputKatMasuk','katPemasukan');});
document.getElementById('formKatKeluar').addEventListener('submit',e=>{e.preventDefault(); tambahKat('inputKatKeluar','katPengeluaran');});
document.addEventListener('click',e=>{
  const btn=e.target.closest('button[data-kat-type]'); if(!btn) return;
  const tipe=btn.dataset.katType; const nama=btn.dataset.katName;
  const key=tipe==='masuk'?'katPemasukan':'katPengeluaran';
  const dataKey=tipe==='masuk'?'pemasukan':'pengeluaran';
  if(state[dataKey].filter(r=>r.kategori===nama).length>0){ toast(`Kategori "${nama}" masih dipakai transaksi.`,'error'); return; }
  if(!confirm(`Hapus kategori "${nama}"?`)) return;
  state[key]=state[key].filter(k=>k!==nama);
  localStorage.setItem(key,JSON.stringify(state[key]));
  renderKatSelects(); renderKatLists();
  toast('Kategori dihapus.','success');
});

// ====== LAPORAN ======
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
  if(!rows.length){ box.innerHTML=`<div class="empty"><span class="big">📄</span>Tidak ada data pada filter ini.</div>`; return; }
  const total=rows.reduce((s,r)=>s+r.Jumlah,0);
  box.innerHTML=`<table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kegunaan</th><th>Kategori</th><th style="text-align:right">Jumlah</th><th>Deskripsi</th></tr></thead><tbody>${rows.map(r=>`<tr><td style="white-space:nowrap">${fmtTanggal(r.Tanggal)}</td><td>${r._tipe==='Pemasukan'?'<span class="badge" style="background:#d1fae5;color:#065f46">Masuk</span>':'<span class="badge" style="background:#fee2e2;color:#991b1b">Keluar</span>'}</td><td>${esc(r.Kegunaan)}</td><td>${esc(r.Kategori)}</td><td class="num ${r._tipe==='Pemasukan'?'in':'out'}">${fmtRp(r.Jumlah)}</td><td style="color:var(--muted)">${r.Deskripsi?esc(r.Deskripsi):'—'}</td></tr>`).join('')}<tr style="background:#f8fafc;font-weight:700"><td colspan="4" style="text-align:right">TOTAL</td><td class="num">${fmtRp(total)}</td><td></td></tr></tbody></table>`;
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

// ====== INIT ======
document.getElementById('inTanggal').value=todayISO();
document.getElementById('outTanggal').value=todayISO();
document.getElementById('entry-tanggal').value=todayISO();