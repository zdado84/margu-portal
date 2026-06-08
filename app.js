// ════════════════════════════════════════════
// ПОРТАЛ АТТЕСТАЦИИ МарГУ — Firebase Edition
// ════════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, updateDoc,
  collection, query, where, getDocs, addDoc, orderBy, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ══════════════════════════════════════════
// 🔥 FIREBASE CONFIG — вставьте свои данные
// ══════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyA54x_oTjpCTOkAX0-7bfw6DPx0vEunIDg",
  authDomain: "marsu-portal.firebaseapp.com",
  projectId: "marsu-portal",
  storageBucket: "marsu-portal.firebasestorage.app",
  messagingSenderId: "977267364230",
  appId: "1:977267364230:web:e617c548e70ce5f36d1c07"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── STATE ──
let CU = null, CP = null;
let pendReg = null, curOTP = null, otpTmr = null, selRole = 'student';
let _pendingFiles = {};
let _unsub = null; // realtime listener

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
const v    = id => { const el=document.getElementById(id); return el?el.value.trim():''; };
const escH = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const escA = s  => String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fdate= d  => { try{ return new Date(d).toLocaleDateString('ru'); }catch{ return'—'; } };
const pc   = html => document.getElementById('pc').innerHTML = html;

function toast(msg, type=''){
  const t = document.createElement('div');
  t.className = 'toast '+type;
  t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(()=>t.remove(), 3500);
}

function showScreen(name){
  ['loading-screen','auth-screen','otp-screen','app-screen'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(id === name){ el.style.display = (id==='app-screen')?'flex':'flex'; }
    else { el.style.display='none'; }
  });
}

// ══════════════════════════════════════════
// FIRESTORE HELPERS
// ══════════════════════════════════════════
async function fbGet(col, id){ const s=await getDoc(doc(db,col,id)); return s.exists()?{id:s.id,...s.data()}:null; }
async function fbSet(col, id, data){ await setDoc(doc(db,col,id), data, {merge:true}); }
async function fbDel(col, id){ await deleteDoc(doc(db,col,id)); }
async function fbAll(col){
  const s = await getDocs(collection(db,col));
  return s.docs.map(d=>({id:d.id,...d.data()}));
}
async function fbWhere(col, field, val){
  const q = query(collection(db,col), where(field,'==',val));
  const s = await getDocs(q);
  return s.docs.map(d=>({id:d.id,...d.data()}));
}

// ══════════════════════════════════════════
// AUTH UI
// ══════════════════════════════════════════
function showTab(t){
  document.getElementById('tab-login').classList.toggle('on',t==='login');
  document.getElementById('tab-reg').classList.toggle('on',t==='reg');
  document.getElementById('pane-login').classList.toggle('dn',t!=='login');
  document.getElementById('pane-reg').classList.toggle('dn',t!=='reg');
  if(t==='reg') checkAdminBtn();
}

async function checkAdminBtn(){
  const snap = await fbGet('meta','settings');
  const adminExists = snap && snap.adminExists === true;
  const btn = document.getElementById('rb-admin');
  if(!btn) return;
  if(adminExists){
    btn.classList.add('disabled');
    btn.title='Администратор уже зарегистрирован';
    if(selRole==='admin'){ selRole='student'; highlightRole(); }
  } else {
    btn.classList.remove('disabled');
    btn.title='';
  }
}

function highlightRole(){
  ['student','teacher','admin'].forEach(r=>{
    const b=document.getElementById('rb-'+r);
    if(b) b.classList.toggle('on',r===selRole);
  });
  document.getElementById('fg-group').classList.toggle('dn', selRole!=='student');
  document.getElementById('fg-dept').classList.toggle('dn',  selRole==='student');
  document.getElementById('fg-disc').classList.toggle('dn',  selRole!=='teacher');
}

function pickRole(r){
  const btn=document.getElementById('rb-'+r);
  if(btn&&btn.classList.contains('disabled')) return;
  selRole=r; highlightRole();
}

// ══════════════════════════════════════════
// REGISTER
// ══════════════════════════════════════════
async function startReg(){
  const name=v('rn'), email=v('re'), phone=v('rph'), pass=v('rpass');
  const group=v('rg'), dept=v('rd'), disc=v('rdi');

  if(!name)  return toast('Введите ФИО','err');
  if(!email) return toast('Email обязателен','err');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Некорректный Email','err');
  if(!pass||pass.length<6) return toast('Пароль минимум 6 символов','err');

  // Проверяем admin
  if(selRole==='admin'){
    const snap = await fbGet('meta','settings');
    if(snap && snap.adminExists===true) return toast('Администратор уже зарегистрирован','err');
  }

  const btn = document.getElementById('reg-btn');
  btn.disabled = true; btn.textContent = 'Проверка...';

  // Проверяем дубликат email через Firebase Auth
  pendReg = {
    name, email, phone, pass, role:selRole, group, dept,
    disciplines: selRole==='teacher' ? disc.split(',').map(s=>s.trim()).filter(Boolean) : []
  };

  btn.disabled=false; btn.textContent='📧 Получить код подтверждения';
  launchOTP(email, name);
}
window.startReg = startReg;

function launchOTP(email, name){
  curOTP = String(100000+Math.floor(Math.random()*900000));
  showScreen('otp-screen');
  document.getElementById('otp-desc').textContent = `Код отправлен на ${email}`;
  for(let i=0;i<6;i++) document.getElementById('d'+i).value='';
  document.getElementById('d0').focus();
  startOtpTimer(60);
  setTimeout(()=>toast('📧 Код подтверждения: '+curOTP,'warn'),500);
}

function startOtpTimer(sec){
  clearInterval(otpTmr);
  let s=sec;
  document.getElementById('otw').classList.remove('dn');
  document.getElementById('ors').classList.add('dn');
  document.getElementById('otc').textContent=s;
  otpTmr=setInterval(()=>{
    s--;
    const el=document.getElementById('otc');
    if(el) el.textContent=s;
    if(s<=0){
      clearInterval(otpTmr);
      document.getElementById('otw').classList.add('dn');
      document.getElementById('ors').classList.remove('dn');
    }
  },1000);
}
window.resendOTP = ()=>{ if(pendReg) launchOTP(pendReg.email, pendReg.name); };
window.cancelOTP = ()=>{
  clearInterval(otpTmr); curOTP=null; pendReg=null;
  showScreen('auth-screen');
};

function otpNext(i){
  const val=document.getElementById('d'+i).value.replace(/\D/g,'');
  document.getElementById('d'+i).value=val;
  if(val&&i<5) document.getElementById('d'+(i+1)).focus();
  const code=[0,1,2,3,4,5].map(j=>document.getElementById('d'+j).value).join('');
  if(code.length===6) setTimeout(verifyOTP,100);
}
function otpBack(e,i){
  if(e.key==='Backspace'&&!document.getElementById('d'+i).value&&i>0)
    document.getElementById('d'+(i-1)).focus();
}
window.otpNext=otpNext; window.otpBack=otpBack;

async function verifyOTP(){
  const code=[0,1,2,3,4,5].map(i=>document.getElementById('d'+i).value).join('');
  if(code.length<6) return toast('Введите все 6 цифр','err');
  if(code!==curOTP) return toast('Неверный код','err');

  const d=pendReg;
  try{
    // Создаём пользователя в Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, d.email, d.pass);
    const uid  = cred.user.uid;

    // Сохраняем профиль в Firestore
    const userObj = {
      id:uid, role:d.role, name:d.name, email:d.email, phone:d.phone||'',
      group:d.group||'', dept:d.dept||'', disciplines:d.disciplines||[],
      verified:true, createdAt:new Date().toISOString()
    };
    await fbSet('users', uid, userObj);

    // Если admin — ставим флаг
    if(d.role==='admin'){
      await fbSet('meta','settings',{adminExists:true, adminId:uid});
    }

    // Создаём пустой список уведомлений
    await fbSet('notifs', uid, {list:[]});

    clearInterval(otpTmr); curOTP=null; pendReg=null;
    toast('✅ Аккаунт создан!','ok');
    // onAuthStateChanged подхватит сам

  }catch(err){
    console.error(err);
    if(err.code==='auth/email-already-in-use') toast('Email уже зарегистрирован','err');
    else toast('Ошибка: '+err.message,'err');
  }
}
window.verifyOTP = verifyOTP;

// ══════════════════════════════════════════
// LOGIN / LOGOUT
// ══════════════════════════════════════════
async function doLogin(){
  const email=v('li'), pass=v('lp');
  if(!email||!pass) return toast('Заполните поля','err');
  const btn=document.getElementById('login-btn');
  btn.disabled=true; btn.textContent='Вход...';
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged подхватит
  }catch(err){
    btn.disabled=false; btn.textContent='Войти';
    if(err.code==='auth/user-not-found'||err.code==='auth/wrong-password'||err.code==='auth/invalid-credential')
      toast('Неверный email или пароль','err');
    else toast('Ошибка входа: '+err.message,'err');
  }
}
window.doLogin = doLogin;

async function doLogout(){
  if(_unsub){ _unsub(); _unsub=null; }
  await signOut(auth);
  CU=null;
  showScreen('auth-screen');
  checkAdminBtn();
}
window.doLogout = doLogout;

// ══════════════════════════════════════════
// AUTH STATE OBSERVER
// ══════════════════════════════════════════
onAuthStateChanged(auth, async user=>{
  if(user){
    try{
      const profile = await fbGet('users', user.uid);
      if(!profile){ await signOut(auth); showScreen('auth-screen'); return; }
      CU = profile;
      document.getElementById('login-btn').disabled=false;
      document.getElementById('login-btn').textContent='Войти';
      showScreen('app-screen');
      initApp();
    }catch(e){
      console.error(e);
      showScreen('auth-screen');
    }
  } else {
    showScreen('auth-screen');
    checkAdminBtn();
  }
});

// ══════════════════════════════════════════
// APP INIT
// ══════════════════════════════════════════
function initApp(){
  const av=CU.name.split(' ').slice(0,2).map(w=>w[0]).join('');
  document.getElementById('uav').textContent=av;
  document.getElementById('uname').textContent=CU.name.split(' ').slice(0,2).join(' ');

  const navMap={
    student:[
      {id:'dash',lb:'🏠 Главная'},{id:'apps',lb:'📋 Мои заявки'},
      {id:'docs',lb:'📁 Документы'},{id:'sched',lb:'📅 Расписание'},{id:'prof',lb:'👤 Профиль'}
    ],
    teacher:[
      {id:'dash',lb:'🏠 Главная'},{id:'review',lb:'📋 Заявки студентов'},
      {id:'events',lb:'🏛️ Аттестационные события'},{id:'studs',lb:'👥 Студенты'},{id:'prof',lb:'👤 Профиль'}
    ],
    admin:[
      {id:'dash',lb:'🏠 Главная'},{id:'allapps',lb:'📋 Все заявки'},
      {id:'users',lb:'👥 Пользователи'},{id:'events',lb:'🏛️ Аттестационные события'},{id:'reports',lb:'📊 Отчёты'}
    ]
  };
  const tabs=navMap[CU.role]||[];
  document.getElementById('nav').innerHTML=tabs.map(t=>
    `<button class="nbtn" id="nb-${t.id}" onclick="go('${t.id}')">${t.lb}</button>`
  ).join('');
  updBadge();
  go('dash');
}

function go(page){
  CP=page;
  document.querySelectorAll('.nbtn').forEach(b=>b.classList.remove('on'));
  const nb=document.getElementById('nb-'+page);
  if(nb) nb.classList.add('on');
  const map={
    dash:rDash, apps:rApps, docs:rDocs, sched:rSched, prof:rProf,
    review:rReview, events:rEvents, studs:rStuds,
    allapps:rAllApps, users:rUsers, reports:rReports
  };
  if(map[page]) map[page]();
}
window.go = go;

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
async function rDash(){
  pc('<div class="empty"><div class="ei">⏳</div><p>Загрузка...</p></div>');
  const role=CU.role;
  if(role==='student'){
    const apps = await fbWhere('apps','studentId',CU.id);
    const comms = await fbAll('comms');
    const active = comms.filter(c=>c.status==='active');
    pc(`
      <h1 style="font-size:21px;font-weight:700;margin-bottom:3px;">Добро пожаловать, ${escH(CU.name.split(' ')[1]||CU.name)}! 👋</h1>
      <p style="color:var(--t2);font-size:13px;margin-bottom:22px;">Ваш портал аттестации МарГУ</p>
      <div class="sgrid">
        ${sc('#eef2ff','📋',apps.length,'Всего заявок')}
        ${sc('#fff8e6','⏳',apps.filter(a=>a.status==='pending').length,'На рассмотрении')}
        ${sc('#e6f7ee','✅',apps.filter(a=>a.status==='passed').length,'Зачтено')}
        ${sc('#fee6e6','❌',apps.filter(a=>a.status==='failed').length,'Не зачтено')}
      </div>
      <div class="qacts">
        ${qc('#eef2ff','📋','Подать заявку','На аттестацию',"go('apps')")}
        ${qc('#e6f7ee','📁','Документы','Загруженные файлы',"go('docs')")}
        ${qc('#fff8e6','📅','Расписание','Даты событий',"go('sched')")}
      </div>
      <div class="twocol">
        <div class="panel"><h2>Последние заявки</h2>
          ${apps.length===0?empt('📭','Нет заявок'):
            tw(['Дисциплина','Статус','Дата'],apps.slice(-4).map(a=>`<tr>
              <td><b>${escH(a.discipline||a.type)}</b></td>
              <td>${sbadge(a.status)}</td>
              <td style="color:var(--t2)">${fdate(a.createdAt)}</td>
            </tr>`))}
        </div>
        <div class="panel"><h2>Аттестационные события</h2>
          ${active.length===0?empt('🏛️','Нет событий'):active.map(c=>`
            <div style="padding:10px 0;border-bottom:1px solid var(--bd);">
              <div style="font-weight:700;font-size:13px;">${escH(c.name)}</div>
              <div style="font-size:12px;color:var(--t2);margin-top:3px;"><span class="dtag">${escH(c.subject||'—')}</span> 📅 ${c.date?fdate(c.date):'Уточняется'}</div>
            </div>`).join('')}
        </div>
      </div>`);

  } else if(role==='teacher'){
    const discs = CU.disciplines||[];
    const allApps = await fbAll('apps');
    const myApps = allApps.filter(a=>a.teacherId===CU.id||discs.includes(a.discipline));
    const comms = await fbWhere('comms','teacherId',CU.id);
    pc(`
      <h1 style="font-size:21px;font-weight:700;margin-bottom:3px;">Добро пожаловать, ${escH(CU.name.split(' ')[1]||CU.name)}! 👨‍🏫</h1>
      <p style="color:var(--t2);font-size:13px;margin-bottom:22px;">Ваши дисциплины: ${discs.map(d=>`<span class="dtag">${escH(d)}</span>`).join('')||'не указаны'}</p>
      <div class="sgrid">
        ${sc('#fff8e6','📋',myApps.filter(a=>a.status==='pending').length,'Ожидают проверки')}
        ${sc('#e6f7ee','✅',myApps.filter(a=>a.status==='passed').length,'Аттестовано')}
        ${sc('#eef2ff','🏛️',comms.length,'Моих событий')}
        ${sc('#f0e6ff','📚',discs.length,'Дисциплин')}
      </div>
      <div class="panel">
        <div class="flex jsb aic" style="margin-bottom:14px;">
          <h2 style="margin:0;">Ожидают проверки</h2>
          <button class="btn sm blu" onclick="go('review')">Все →</button>
        </div>
        ${myApps.filter(a=>a.status==='pending').length===0?empt('✨','Нет заявок для проверки'):
          tw(['Студент','Дисциплина','Тип','Дата',''],
          (await Promise.all(myApps.filter(a=>a.status==='pending').slice(0,5).map(async a=>{
            const st = await fbGet('users',a.studentId);
            return `<tr>
              <td><b>${escH(st?st.name:'?')}</b><div style="font-size:11px;color:var(--t2)">${escH(st?st.group||'':'')}</div></td>
              <td><span class="dtag">${escH(a.discipline||'—')}</span></td>
              <td>${escH(a.type||'—')}</td>
              <td style="color:var(--t2)">${fdate(a.createdAt)}</td>
              <td><button class="btn sm blu" onclick="openRM('${escA(a.id)}')">Рассмотреть</button></td>
            </tr>`;
          }))))}
      </div>`);

  } else {
    const allApps=await fbAll('apps'), allUsers=await fbAll('users'), comms=await fbAll('comms');
    const stu=allUsers.filter(u=>u.role==='student'), tch=allUsers.filter(u=>u.role==='teacher');
    pc(`
      <h1 style="font-size:21px;font-weight:700;margin-bottom:3px;">Панель администратора ⚙️</h1>
      <p style="color:var(--t2);font-size:13px;margin-bottom:22px;">Аналитика и управление аттестацией МарГУ</p>
      <div class="sgrid">
        ${sc('#eef2ff','📋',allApps.length,'Всего заявок')}
        ${sc('#e6f7ee','👨‍🎓',stu.length,'Студентов')}
        ${sc('#f0e6ff','🏛️',comms.length+'/'+comms.filter(c=>c.status==='active').length,'Событий/Активных')}
        ${sc('#fff8e6','👨‍🏫',tch.length,'Преподавателей')}
      </div>
      <div class="qacts">
        ${qc('#eef2ff','+','Создать событие','Аттестационное событие',"go('events')")}
        ${qc('#e6f7ee','👤','Пользователи','Управление',"go('users')")}
        ${qc('#fff8e6','📊','Отчёты','Экспорт данных',"go('reports')")}
      </div>
      <div class="twocol">
        <div class="panel"><h2>Статус заявок</h2>${chartStatus(allApps)}</div>
        <div class="panel"><h2>Решения</h2>${chartDecision(allApps)}</div>
      </div>`);
  }
}

// ══════════════════════════════════════════
// STUDENT — APPS
// ══════════════════════════════════════════
async function rApps(){
  pc('<div class="empty"><div class="ei">⏳</div><p>Загрузка...</p></div>');
  const apps = await fbWhere('apps','studentId',CU.id);
  apps.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  pc(`
    <div class="flex jsb aic" style="margin-bottom:22px;">
      <div><h1 style="font-size:21px;font-weight:700;">Мои заявки</h1>
        <p style="color:var(--t2);font-size:13px;">Заявки по дисциплинам</p></div>
      <button class="btn blu" onclick="showNewApp()">+ Новая заявка</button>
    </div>
    ${apps.length===0?`<div class="panel">${empt('📭','Нет заявок',true)}</div>`:apps.map(a=>appCard(a)).join('')}`);
}

function appCard(a){
  const canEdit = a.status==='pending'||a.status==='revision';
  return `<div class="panel" style="margin-bottom:14px;">
    <div class="flex jsb aic" style="margin-bottom:10px;">
      <div>
        <div style="font-weight:700;font-size:15px;">${escH(a.title||a.type)}</div>
        <div style="font-size:12px;color:var(--t2);margin-top:3px;">
          <span class="dtag">${escH(a.discipline||'—')}</span>
        </div>
        <div style="font-size:11px;color:var(--t2);margin-top:2px;">Подано: ${fdate(a.createdAt)}</div>
      </div>
      ${sbadge(a.status)}
    </div>
    <div class="flowrow">${flowSteps(a.status)}</div>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:6px;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;">
        <span>Документы (${(a.files||[]).length})</span>
        ${canEdit?`<button class="btn sm blu" onclick="addFileToApp('${escA(a.id)}')">+ Добавить</button>`:''}
      </div>
      ${(a.files||[]).length===0
        ?`<div style="font-size:12px;color:var(--t2);padding:6px 0;">Нет файлов ${canEdit?`<a style="color:var(--pr);cursor:pointer;" onclick="addFileToApp('${escA(a.id)}')">Добавить →</a>`:''}.</div>`
        :`<div class="flist">${(a.files||[]).map((f,i)=>`
          <div class="fi" style="justify-content:space-between;">
            <span>📄</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 6px;">${escH(f.name)}</span>
            <span style="color:var(--t2);font-size:11px;">${escH(f.size||'')}</span>
            <div style="display:flex;gap:4px;margin-left:6px;">
              ${f.data?`<button class="btn sm blu" onclick="downloadFile('${escA(a.id)}',${i})">⬇</button>`:''}
              ${canEdit?`<button class="btn sm" style="background:#fee6e6;color:var(--dn);" onclick="delFileFromApp('${escA(a.id)}',${i})">🗑</button>`:''}
            </div>
          </div>`).join('')}</div>`}
    </div>
    ${a.tComment?`<div style="background:#f4f6fb;border-radius:8px;padding:11px;margin-bottom:10px;border-left:3px solid var(--pr);">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:3px;">КОММЕНТАРИЙ ПРЕПОДАВАТЕЛЯ</div>
      <div style="font-size:13px;">${escH(a.tComment)}</div>
    </div>`:''}
    ${a.status==='revision'?`<button class="btn sm blu" onclick="showRevision('${escA(a.id)}')">📎 Загрузить исправления</button>`:''}
  </div>`;
}

function flowSteps(status){
  const steps=['Подача','Проверка','Комиссия','Результат'];
  const ai={pending:1,revision:1,passed:3,failed:3}[status]??0;
  return steps.map((s,i)=>`
    <div class="fstep" style="padding:8px 12px;">
      <div class="fdot ${i<ai?'fd-done':i===ai?'fd-act':'fd-pnd'}">${i<ai?'✓':i+1}</div>
      <div class="flab">${s}</div>
    </div>${i<steps.length-1?'<div class="farr">→</div>':''}`).join('');
}

async function delFileFromApp(appId, fileIdx){
  const a = await fbGet('apps',appId);
  if(!a) return;
  const fname = a.files[fileIdx]?.name||'';
  if(!confirm('Удалить файл «'+fname+'»?')) return;
  a.files.splice(fileIdx,1);
  await fbSet('apps',appId,{files:a.files});
  toast('Файл удалён','ok'); rApps();
}
window.delFileFromApp = delFileFromApp;

function addFileToApp(appId){
  _pendingFiles={};
  openM(`
    <h2>📎 Добавить файл к заявке</h2>
    <div class="fg"><label>Файлы</label>
      <div class="fdrop" id="aff-drop"><div style="font-size:28px;">📄</div><p>Нажмите или перетащите</p></div>
      <input type="file" id="aff-input" multiple style="display:none">
      <div class="flist" id="aff-list"></div>
    </div>
    <div class="macts">
      <button class="btn out" id="aff-cancel">Отмена</button>
      <button class="btn blu" id="aff-submit">Прикрепить</button>
    </div>`);
  document.getElementById('aff-drop').addEventListener('click',()=>document.getElementById('aff-input').click());
  document.getElementById('aff-drop').addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('dov');});
  document.getElementById('aff-drop').addEventListener('drop',e=>{e.preventDefault();e.currentTarget.classList.remove('dov');addFiles({files:e.dataTransfer.files},'aff-list');});
  document.getElementById('aff-input').addEventListener('change',function(){addFiles(this,'aff-list');});
  document.getElementById('aff-cancel').addEventListener('click',closeM);
  document.getElementById('aff-submit').addEventListener('click',async()=>{
    const newFiles=getFilesFromList('aff-list');
    if(!newFiles.length){toast('Выберите файл','err');return;}
    const a=await fbGet('apps',appId);
    if(!a) return;
    const upd=[...(a.files||[]),...newFiles];
    await fbSet('apps',appId,{files:upd});
    if(a.teacherId) await addN(a.teacherId,'Студент добавил файлы: «'+(a.title||a.type)+'»');
    _pendingFiles={}; closeM(); toast('Файлы прикреплены','ok'); rApps();
  });
}
window.addFileToApp = addFileToApp;

async function showNewApp(){
  const teachers = await fbAll('users');
  const tlist = teachers.filter(u=>u.role==='teacher'&&(u.disciplines||[]).length>0);
  const comms = await fbAll('comms');
  const active = comms.filter(c=>c.status==='active');
  _pendingFiles={};
  openM(`
    <h2>📋 Новая заявка</h2>
    <div class="fg"><label>Преподаватель *</label>
      <select id="mt">
        <option value="">— Выберите преподавателя —</option>
        ${tlist.map(t=>`<option value="${escA(t.id)}" data-d="${escA((t.disciplines||[]).join('||'))}">${escH(t.name)} (${escH(t.dept||'')})</option>`).join('')}
      </select></div>
    <div class="fg"><label>Дисциплина *</label>
      <select id="md" disabled><option value="">— Сначала выберите преподавателя —</option></select></div>
    <div class="fg"><label>Тип аттестации</label>
      <select id="mty">
        <option>Дипломная работа</option><option>Курсовая работа</option>
        <option>Промежуточная аттестация</option><option>Государственный экзамен</option><option>Практика</option>
      </select></div>
    <div class="fg"><label>Название / тема *</label><input type="text" id="mti" placeholder="Название работы..."/></div>
    <div class="fg"><label>Аттестационное событие</label>
      <select id="mc">
        <option value="">Без события</option>
        ${active.map(c=>`<option value="${escA(c.id)}">${escH(c.name)}</option>`).join('')}
      </select></div>
    <div class="fg"><label>Документы</label>
      <div class="fdrop" id="app-drop"><div style="font-size:26px;">📄</div><p>Нажмите или перетащите файлы</p></div>
      <input type="file" id="mf" multiple style="display:none">
      <div class="flist" id="mfl"></div></div>
    <div class="fg"><label>Комментарий</label><input type="text" id="mcom" placeholder="Доп. информация..."/></div>
    <div class="macts">
      <button class="btn out" id="app-cancel">Отмена</button>
      <button class="btn blu" id="app-submit">Подать заявку</button>
    </div>`);
  document.getElementById('mt').addEventListener('change',onTchChange);
  document.getElementById('app-drop').addEventListener('click',()=>document.getElementById('mf').click());
  document.getElementById('app-drop').addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('dov');});
  document.getElementById('app-drop').addEventListener('drop',e=>{e.preventDefault();e.currentTarget.classList.remove('dov');addFiles({files:e.dataTransfer.files},'mfl');});
  document.getElementById('mf').addEventListener('change',function(){addFiles(this,'mfl');});
  document.getElementById('app-cancel').addEventListener('click',closeM);
  document.getElementById('app-submit').addEventListener('click',submitApp);
}
window.showNewApp = showNewApp;

function onTchChange(){
  const sel=document.getElementById('mt');
  const opt=sel.options[sel.selectedIndex];
  const discs=opt.dataset.d?opt.dataset.d.split('||').filter(Boolean):[];
  const ds=document.getElementById('md');
  ds.innerHTML=discs.length===0
    ?'<option value="">— Нет дисциплин —</option>'
    :'<option value="">— Выберите дисциплину —</option>'+discs.map(d=>`<option value="${escA(d)}">${escH(d)}</option>`).join('');
  ds.disabled=discs.length===0;
}

async function submitApp(){
  const tId=v('mt'),disc=v('md'),type=v('mty'),title=v('mti'),commId=v('mc'),com=v('mcom');
  if(!tId)   return toast('Выберите преподавателя','err');
  if(!disc)  return toast('Выберите дисциплину','err');
  if(!title) return toast('Введите название','err');
  const files=getFilesFromList('mfl');
  const id='a'+Date.now();
  await fbSet('apps',id,{
    id,studentId:CU.id,teacherId:tId,discipline:disc,commId:commId||'',
    status:'pending',type,title,files,sComment:com,tComment:'',
    createdAt:new Date().toISOString()
  });
  _pendingFiles={};
  await addN(tId,'📋 Новая заявка от '+CU.name+' по «'+disc+'»: «'+title+'»');
  await addN(CU.id,'✅ Заявка «'+title+'» подана');
  closeM(); toast('Заявка подана!','ok'); rApps();
}

// ── DOCS ──
async function rDocs(){
  pc('<div class="empty"><div class="ei">⏳</div><p>Загрузка...</p></div>');
  const apps = await fbWhere('apps','studentId',CU.id);
  pc(`
    <div class="flex jsb aic" style="margin-bottom:22px;">
      <div><h1 style="font-size:21px;font-weight:700;">Мои документы</h1>
        <p style="color:var(--t2);font-size:13px;">Файлы по заявкам</p></div>
    </div>
    ${apps.length===0?`<div class="panel">${empt('📁','Нет заявок')}</div>`:
      apps.map(a=>{
        const canEdit=a.status==='pending'||a.status==='revision';
        return `<div class="panel" style="margin-bottom:14px;">
          <div class="flex jsb aic" style="margin-bottom:12px;">
            <div>
              <div style="font-weight:700;font-size:14px;">${escH(a.title||a.type)}</div>
              <div style="margin-top:3px;"><span class="dtag">${escH(a.discipline||'—')}</span> ${sbadge(a.status)}</div>
            </div>
            ${canEdit?`<button class="btn sm blu" onclick="addFileToApp('${escA(a.id)}')">+ Добавить файл</button>`
              :`<span style="font-size:11px;color:var(--t2);">Редактирование закрыто</span>`}
          </div>
          ${(a.files||[]).length===0
            ?`<div style="font-size:13px;color:var(--t2);padding:8px 0;">Нет файлов${canEdit?` <a style="color:var(--pr);cursor:pointer;" onclick="addFileToApp('${escA(a.id)}')">Добавить →</a>`:''}</div>`
            :`<div class="flist">${(a.files||[]).map((f,i)=>`
              <div class="fi" style="justify-content:space-between;">
                <span>📄</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 8px;font-weight:500;">${escH(f.name)}</span>
                <span style="color:var(--t2);font-size:11px;margin-right:8px;">${escH(f.size||'')}</span>
                <div style="display:flex;gap:5px;flex-shrink:0;">
                  ${f.data?`<button class="btn sm blu" onclick="downloadFile('${escA(a.id)}',${i})">⬇ Скачать</button>`:''}
                  ${canEdit?`<button class="btn sm" style="background:#fee6e6;color:var(--dn);" onclick="delFileFromApp('${escA(a.id)}',${i})">🗑 Удалить</button>`:''}
                </div>
              </div>`).join('')}</div>`}
        </div>`;
      }).join('')}`);
}

// ── SCHEDULE ──
async function rSched(){
  const comms=await fbAll('comms');
  pc(`<h1 style="font-size:21px;font-weight:700;margin-bottom:22px;">Расписание аттестации</h1>
    <div class="panel">
      ${comms.length===0?empt('📅','Нет событий'):
        tw(['Событие','Дисциплина','Дата','Статус'],comms.map(c=>`<tr>
          <td><b>${escH(c.name)}</b></td>
          <td><span class="dtag">${escH(c.subject||'—')}</span></td>
          <td>${c.date?fdate(c.date):'Уточняется'}</td>
          <td>${c.status==='active'?'<span class="badge bg">Активно</span>':'<span class="badge bk">Завершено</span>'}</td>
        </tr>`))}
    </div>`);
}

// ══════════════════════════════════════════
// TEACHER — REVIEW
// ══════════════════════════════════════════
async function rReview(){
  pc('<div class="empty"><div class="ei">⏳</div><p>Загрузка...</p></div>');
  const discs=CU.disciplines||[];
  const allApps=await fbAll('apps');
  const apps=allApps.filter(a=>a.teacherId===CU.id||discs.includes(a.discipline));
  apps.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  pc(`
    <div style="margin-bottom:18px;">
      <h1 style="font-size:21px;font-weight:700;">Заявки студентов</h1>
      <p style="color:var(--t2);font-size:13px;margin-top:4px;">Ваши дисциплины: ${discs.map(d=>`<span class="dtag">${escH(d)}</span>`).join(' ')||'<span style="color:var(--dn)">не указаны</span>'}</p>
    </div>
    <div class="ptabs">
      <button class="ptab on" onclick="fApps('all',this)">Все (${apps.length})</button>
      <button class="ptab" onclick="fApps('pending',this)">Ожидают (${apps.filter(a=>a.status==='pending').length})</button>
      <button class="ptab" onclick="fApps('passed',this)">Зачтено (${apps.filter(a=>a.status==='passed').length})</button>
      <button class="ptab" onclick="fApps('failed',this)">Не зачтено (${apps.filter(a=>a.status==='failed').length})</button>
    </div>
    <div class="panel" id="atbl">${await appsTable(apps)}</div>`);
}

async function fApps(status,btn){
  document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
  const discs=CU.disciplines||[];
  let apps=await fbAll('apps');
  apps=apps.filter(a=>a.teacherId===CU.id||discs.includes(a.discipline));
  if(status!=='all') apps=apps.filter(a=>a.status===status);
  document.getElementById('atbl').innerHTML=await appsTable(apps);
}
window.fApps=fApps;

async function appsTable(apps){
  if(!apps.length) return empt('📭','Нет заявок');
  const rows=await Promise.all(apps.map(async a=>{
    const st=await fbGet('users',a.studentId);
    return `<tr>
      <td><b>${escH(st?st.name:'?')}</b><div style="font-size:11px;color:var(--t2)">${escH(st?st.group||'':'')}</div></td>
      <td><span class="dtag">${escH(a.discipline||'—')}</span></td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escH(a.title||a.type)}</td>
      <td>${(a.files||[]).length?`<span class="badge bb">📄 ${a.files.length}</span>`:'<span class="badge bk">—</span>'}</td>
      <td>${sbadge(a.status)}</td>
      <td style="color:var(--t2)">${fdate(a.createdAt)}</td>
      <td><button class="btn sm blu" onclick="openRM('${escA(a.id)}')">Рассмотреть</button></td>
    </tr>`;
  }));
  return tw(['Студент','Дисциплина','Работа','Файлы','Статус','Дата',''],rows);
}

async function openRM(aid){
  const a=await fbGet('apps',aid);
  if(!a) return toast('Заявка не найдена','err');
  if(CU.role==='teacher'){
    const discs=CU.disciplines||[];
    if(a.teacherId!==CU.id&&!discs.includes(a.discipline))
      return toast('Эта заявка не из ваших дисциплин','err');
  }
  const st=await fbGet('users',a.studentId);
  const comm=a.commId?await fbGet('comms',a.commId):null;
  openM(`
    <h2>📋 Заявка на аттестацию</h2>
    <div style="background:#f4f6fb;border-radius:10px;padding:13px;margin-bottom:16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
        <div><span style="color:var(--t2)">Студент:</span><br><b>${escH(st?st.name:'—')}</b></div>
        <div><span style="color:var(--t2)">Группа:</span><br>${escH(st?st.group||'—':'—')}</div>
        <div><span style="color:var(--t2)">Дисциплина:</span><br><span class="dtag">${escH(a.discipline||'—')}</span></div>
        <div><span style="color:var(--t2)">Тип:</span><br>${escH(a.type)}</div>
        <div style="grid-column:1/-1"><span style="color:var(--t2)">Название:</span><br><b>${escH(a.title||'—')}</b></div>
        ${comm?`<div style="grid-column:1/-1"><span style="color:var(--t2)">Событие:</span><br>${escH(comm.name)}</div>`:''}
        <div><span style="color:var(--t2)">Дата:</span><br>${fdate(a.createdAt)}</div>
        <div><span style="color:var(--t2)">Статус:</span><br>${sbadge(a.status)}</div>
      </div>
    </div>
    ${a.files&&a.files.length?`<div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:8px;text-transform:uppercase;">Документы студента</div>
      <div class="flist">${a.files.map((f,i)=>`
        <div class="fi" style="justify-content:space-between;">
          <span>📄</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 6px;">${escH(f.name)}</span>
          <span style="color:var(--t2);flex:0 0 auto;font-size:11px;">${escH(f.size||'')}</span>
          ${f.data?`<button class="btn sm grn" onclick="downloadFile('${escA(a.id)}',${i})">⬇ Скачать</button>`:'<span style="font-size:11px;color:var(--t2);">нет данных</span>'}
        </div>`).join('')}
      </div>
    </div>`:`<div style="background:#fff8e6;border-radius:8px;padding:11px;font-size:13px;margin-bottom:14px;">⚠️ Документы не загружены</div>`}
    <div class="fg"><label>Комментарий (отправится студенту)</label>
      <input type="text" id="rm-comment" placeholder="Ваш комментарий..." value="${escA(a.tComment||'')}"/></div>
    <div class="macts">
      <button class="btn out" id="rm-close">Закрыть</button>
      <button class="btn out" id="rm-revision">🔄 На доработку</button>
      <button class="btn red" id="rm-failed">❌ Не зачтено</button>
      <button class="btn grn" id="rm-passed">✅ Зачтено</button>
    </div>`);
  document.getElementById('rm-close').addEventListener('click',closeM);
  document.getElementById('rm-revision').addEventListener('click',()=>setStatus(aid,'revision'));
  document.getElementById('rm-failed').addEventListener('click',()=>setStatus(aid,'failed'));
  document.getElementById('rm-passed').addEventListener('click',()=>setStatus(aid,'passed'));
}
window.openRM=openRM;

async function setStatus(aid,status){
  const com=(document.getElementById('rm-comment')||{}).value||'';
  await fbSet('apps',aid,{status,tComment:com,reviewedAt:new Date().toISOString(),reviewedBy:CU.id});
  const a=await fbGet('apps',aid);
  const lb={passed:'зачтена ✅',failed:'не зачтена ❌',revision:'на доработку 🔄'};
  await addN(a.studentId,'Заявка «'+(a.title||a.type)+'» '+(lb[status]||'обновлена')+(com?': '+com:''));
  closeM(); toast('Статус обновлён','ok');
  if(CP==='review') rReview(); else if(CP==='allapps') rAllApps(); else rDash();
}

// ══════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════
async function rEvents(){
  pc('<div class="empty"><div class="ei">⏳</div><p>Загрузка...</p></div>');
  const comms=await fbAll('comms');
  const isAdmin=CU.role==='admin';
  const heads=isAdmin?['Название','Дисциплина','Председатель','Дата','Статус','Заявок','']:
                      ['Название','Дисциплина','Председатель','Дата','Статус','Заявок'];
  const allApps=await fbAll('apps');
  const rows=await Promise.all(comms.map(async c=>{
    const cnt=allApps.filter(a=>a.commId===c.id).length;
    const tch=c.teacherId?await fbGet('users',c.teacherId):null;
    return `<tr>
      <td><b>${escH(c.name)}</b></td>
      <td><span class="dtag">${escH(c.subject||'—')}</span></td>
      <td style="color:var(--t2)">${escH(tch?tch.name:'—')}</td>
      <td style="color:var(--t2)">${c.date?fdate(c.date):'—'}</td>
      <td>${c.status==='active'?'<span class="badge bg">Активно</span>':'<span class="badge bk">Завершено</span>'}</td>
      <td><span class="badge bb">${cnt}</span></td>
      ${isAdmin?`<td><button class="del-btn" onclick="delEvent('${escA(c.id)}')">🗑️</button></td>`:''}
    </tr>`;
  }));
  pc(`
    <div class="flex jsb aic" style="margin-bottom:22px;">
      <div><h1 style="font-size:21px;font-weight:700;">Аттестационные события</h1></div>
      <button class="btn blu" onclick="showCreateEvent()">+ Создать событие</button>
    </div>
    <div class="panel">${comms.length===0?empt('🏛️','Нет событий'):tw(heads,rows)}</div>`);
}

async function showCreateEvent(){
  const teachers=await fbAll('users');
  const tlist=teachers.filter(u=>u.role==='teacher');
  const isTeacher=CU.role==='teacher';
  const chairHTML=isTeacher
    ?`<div class="fg"><label>Председатель</label>
       <div style="background:#f0f4ff;border-radius:8px;padding:10px 13px;border:1.5px solid var(--bd);font-size:14px;font-weight:600;">👨‍🏫 ${escH(CU.name)}</div>
       </div>`
    :`<div class="fg"><label>Председатель</label>
       <select id="ev-chair">
         <option value="">Без председателя</option>
         ${tlist.map(t=>`<option value="${escA(t.id)}">${escH(t.name)}${t.dept?' — '+escH(t.dept):''}</option>`).join('')}
       </select></div>`;
  openM(`
    <h2>🏛️ Создать аттестационное событие</h2>
    <div class="fg"><label>Название *</label><input type="text" id="ev-name" placeholder="Комиссия по защите..."/></div>
    <div class="fg"><label>Дисциплина</label><input type="text" id="ev-subj" placeholder="Информационные системы"/></div>
    ${chairHTML}
    <div class="fg"><label>Дата заседания</label><input type="date" id="ev-date"/></div>
    <div class="macts">
      <button class="btn out" id="ev-cancel">Отмена</button>
      <button class="btn blu" id="ev-submit">✅ Создать</button>
    </div>`);
  document.getElementById('ev-cancel').addEventListener('click',closeM);
  document.getElementById('ev-submit').addEventListener('click',async()=>{
    const name=(document.getElementById('ev-name').value||'').trim();
    const subj=(document.getElementById('ev-subj').value||'').trim();
    const date=(document.getElementById('ev-date').value||'').trim();
    const chairEl=document.getElementById('ev-chair');
    const tId=isTeacher?CU.id:(chairEl?chairEl.value:'');
    if(!name){toast('Укажите название','err');return;}
    const id='c'+Date.now();
    await fbSet('comms',id,{id,name,subject:subj,teacherId:tId,date,status:'active',createdBy:CU.id,createdAt:new Date().toISOString()});
    if(tId&&tId!==CU.id) await addN(tId,'Вы назначены председателем: «'+name+'»');
    await addN(CU.id,'Событие «'+name+'» создано');
    closeM(); toast('Событие создано!','ok'); rEvents();
  });
}
window.showCreateEvent=showCreateEvent;

async function delEvent(id){
  if(!confirm('Удалить событие?')) return;
  await fbDel('comms',id);
  toast('Событие удалено','ok'); rEvents();
}
window.delEvent=delEvent;

// ══════════════════════════════════════════
// TEACHER — STUDENTS
// ══════════════════════════════════════════
async function rStuds(){
  const students=await fbAll('users');
  const stu=students.filter(u=>u.role==='student');
  const allApps=await fbAll('apps');
  pc(`<h1 style="font-size:21px;font-weight:700;margin-bottom:22px;">Студенты</h1>
    <div class="panel">
      ${stu.length===0?empt('👥','Нет студентов'):
        tw(['ФИО','Группа','Email','Заявок','Статус'],stu.map(s=>{
          const apps=allApps.filter(a=>a.studentId===s.id);
          const passed=apps.filter(a=>a.status==='passed').length;
          const pend=apps.filter(a=>a.status==='pending').length;
          return `<tr>
            <td><b>${escH(s.name)}</b></td>
            <td>${escH(s.group||'—')}</td>
            <td style="color:var(--t2)">${escH(s.email||'—')}</td>
            <td>${apps.length} <span style="color:var(--t2);font-size:11px">(✅${passed})</span></td>
            <td>${pend?'<span class="badge by">Ожидает</span>':passed?'<span class="badge bg">Аттестован</span>':'<span class="badge bk">—</span>'}</td>
          </tr>`;
        }))}
    </div>`);
}

// ══════════════════════════════════════════
// ADMIN — ALL APPS
// ══════════════════════════════════════════
async function rAllApps(){
  pc('<div class="empty"><div class="ei">⏳</div><p>Загрузка...</p></div>');
  const all=await fbAll('apps');
  all.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  pc(`
    <h1 style="font-size:21px;font-weight:700;margin-bottom:18px;">Все заявки</h1>
    <div class="ptabs">
      <button class="ptab on" onclick="fAllApps('all',this)">Все (${all.length})</button>
      <button class="ptab" onclick="fAllApps('pending',this)">Ожидают (${all.filter(a=>a.status==='pending').length})</button>
      <button class="ptab" onclick="fAllApps('passed',this)">Зачтено (${all.filter(a=>a.status==='passed').length})</button>
      <button class="ptab" onclick="fAllApps('failed',this)">Не зачтено (${all.filter(a=>a.status==='failed').length})</button>
    </div>
    <div class="panel" id="aatbl">${await adminAppsTable(all)}</div>`);
}

async function fAllApps(status,btn){
  document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
  let apps=await fbAll('apps');
  if(status!=='all') apps=apps.filter(a=>a.status===status);
  document.getElementById('aatbl').innerHTML=await adminAppsTable(apps);
}
window.fAllApps=fAllApps;

async function adminAppsTable(apps){
  if(!apps.length) return empt('📭','Нет заявок');
  const rows=await Promise.all(apps.map(async a=>{
    const st=await fbGet('users',a.studentId);
    return `<tr>
      <td><b>${escH(st?st.name:'?')}</b><div style="font-size:11px;color:var(--t2)">${escH(st?st.group||'':'')}</div></td>
      <td><span class="dtag">${escH(a.discipline||'—')}</span></td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escH(a.title||a.type)}</td>
      <td>${sbadge(a.status)}</td>
      <td style="color:var(--t2)">${fdate(a.createdAt)}</td>
      <td>
        <button class="btn sm blu" onclick="openRM('${escA(a.id)}')" style="margin-right:4px;">Смотреть</button>
        <button class="del-btn" onclick="delApp('${escA(a.id)}')">🗑️</button>
      </td>
    </tr>`;
  }));
  return tw(['Студент','Дисциплина','Работа','Статус','Дата',''],rows);
}

async function delApp(id){
  if(!confirm('Удалить заявку?')) return;
  await fbDel('apps',id); toast('Заявка удалена','ok'); rAllApps();
}
window.delApp=delApp;

// ══════════════════════════════════════════
// ADMIN — USERS
// ══════════════════════════════════════════
async function rUsers(){
  pc('<div class="empty"><div class="ei">⏳</div><p>Загрузка...</p></div>');
  const users=await fbAll('users');
  pc(`
    <h1 style="font-size:21px;font-weight:700;margin-bottom:18px;">Пользователи системы</h1>
    <div class="ptabs">
      <button class="ptab on" onclick="fUsers('all',this)">Все (${users.length})</button>
      <button class="ptab" onclick="fUsers('student',this)">Студенты (${users.filter(u=>u.role==='student').length})</button>
      <button class="ptab" onclick="fUsers('teacher',this)">Преподаватели (${users.filter(u=>u.role==='teacher').length})</button>
    </div>
    <div class="panel" id="utbl">${usersTable(users)}</div>`);
}

async function fUsers(role,btn){
  document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
  let users=await fbAll('users');
  if(role!=='all') users=users.filter(u=>u.role===role);
  document.getElementById('utbl').innerHTML=usersTable(users);
}
window.fUsers=fUsers;

function usersTable(users){
  if(!users.length) return empt('👥','Нет пользователей');
  const rb={student:'<span class="badge bb">Студент</span>',teacher:'<span class="badge bg">Преподаватель</span>',admin:'<span class="badge by">Администратор</span>'};
  return tw(['ФИО','Роль','Email','Дисциплины','Группа','Дата','Удалить'],users.map(u=>`<tr>
    <td><b>${escH(u.name)}</b></td>
    <td>${rb[u.role]||u.role}</td>
    <td style="color:var(--t2)">${escH(u.email||'—')}</td>
    <td>${(u.disciplines||[]).map(d=>`<span class="dtag">${escH(d)}</span>`).join('')||'—'}</td>
    <td>${escH(u.group||'—')}</td>
    <td style="color:var(--t2)">${fdate(u.createdAt)}</td>
    <td>${u.id===CU.id?'<span style="font-size:11px;color:var(--t2)">Вы</span>':
      `<button class="del-btn" onclick="delUser('${escA(u.id)}','${escA(u.role)}','${escA(u.name)}')">🗑️</button>`}
    </td>
  </tr>`));
}

async function delUser(uid,role,name){
  if(uid===CU.id) return toast('Нельзя удалить себя','err');
  if(!confirm('Удалить «'+name+'»? Все его заявки будут удалены.')) return;
  await fbDel('users',uid);
  await fbDel('notifs',uid);
  if(role==='admin') await fbSet('meta','settings',{adminExists:false});
  const apps=await fbWhere('apps','studentId',uid);
  for(const a of apps) await fbDel('apps',a.id);
  toast('Пользователь удалён','ok'); rUsers();
}
window.delUser=delUser;

// ══════════════════════════════════════════
// ADMIN — REPORTS
// ══════════════════════════════════════════
async function rReports(){
  const allApps=await fbAll('apps');
  const stu=(await fbAll('users')).filter(u=>u.role==='student');
  const comms=await fbAll('comms');
  pc(`<h1 style="font-size:21px;font-weight:700;margin-bottom:22px;">Отчёты по аттестации</h1>
    <div class="twocol" style="margin-bottom:20px;">
      <div class="panel">
        <h2>Сводный отчёт</h2>
        <div style="display:flex;flex-direction:column;gap:11px;font-size:14px;">
          <div class="flex jsb"><span>Всего заявок:</span><b>${allApps.length}</b></div>
          <div class="flex jsb"><span>Зачтено:</span><b style="color:var(--ac)">${allApps.filter(a=>a.status==='passed').length}</b></div>
          <div class="flex jsb"><span>Не зачтено:</span><b style="color:var(--dn)">${allApps.filter(a=>a.status==='failed').length}</b></div>
          <div class="flex jsb"><span>На рассмотрении:</span><b style="color:var(--am)">${allApps.filter(a=>a.status==='pending').length}</b></div>
          <div style="border-top:1px solid var(--bd);padding-top:11px;" class="flex jsb"><span>Студентов:</span><b>${stu.length}</b></div>
          <div class="flex jsb"><span>Событий:</span><b>${comms.length}</b></div>
        </div>
        <button class="btn blu wf" style="margin-top:18px;" onclick="exportCSV()">📥 Экспорт CSV</button>
      </div>
      <div class="panel"><h2>Решения</h2>${chartDecision(allApps)}</div>
    </div>
    <div class="panel"><h2>Статус заявок</h2>${chartStatus(allApps)}</div>`);
}

async function exportCSV(){
  const apps=await fbAll('apps');
  let csv='ФИО;Группа;Дисциплина;Тип;Название;Статус;Дата подачи\n';
  for(const a of apps){
    const s=await fbGet('users',a.studentId);
    const sl={pending:'На рассмотрении',passed:'Зачтено',failed:'Не зачтено',revision:'На доработке'}[a.status]||a.status;
    csv+=`${s?s.name:'?'};${s?s.group||'—':'—'};${a.discipline||'—'};${a.type};${a.title||''};${sl};${fdate(a.createdAt)}\n`;
  }
  const b=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(b);
  const link=document.createElement('a');link.href=url;link.download='margu_report.csv';link.click();
  toast('Отчёт выгружен','ok');
}
window.exportCSV=exportCSV;

// ══════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════
function rProf(){
  const u=CU;
  pc(`<h1 style="font-size:21px;font-weight:700;margin-bottom:22px;">Мой профиль</h1>
    <div class="twocol">
      <div class="panel">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="width:76px;height:76px;border-radius:50%;background:var(--pr);color:#fff;font-size:28px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;">
            ${escH(u.name.split(' ').slice(0,2).map(w=>w[0]).join(''))}
          </div>
          <div style="font-weight:700;font-size:17px;">${escH(u.name)}</div>
          <div style="font-size:13px;color:var(--t2);">${{student:'Студент',teacher:'Преподаватель',admin:'Администратор'}[u.role]}</div>
          <span class="badge bg" style="margin-top:6px;">✅ Email подтверждён</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px;font-size:13px;">
          ${u.email?`<div class="flex jsb"><span style="color:var(--t2)">Email:</span><b>${escH(u.email)}</b></div>`:''}
          ${u.phone?`<div class="flex jsb"><span style="color:var(--t2)">Телефон:</span><b>${escH(u.phone)}</b></div>`:''}
          ${u.group?`<div class="flex jsb"><span style="color:var(--t2)">Группа:</span><b>${escH(u.group)}</b></div>`:''}
          ${u.dept?`<div class="flex jsb"><span style="color:var(--t2)">Кафедра:</span><b>${escH(u.dept)}</b></div>`:''}
          ${(u.disciplines||[]).length?`<div><span style="color:var(--t2)">Дисциплины:</span><br>${u.disciplines.map(d=>`<span class="dtag">${escH(d)}</span>`).join(' ')}</div>`:''}
          <div class="flex jsb"><span style="color:var(--t2)">Регистрация:</span><b>${fdate(u.createdAt)}</b></div>
        </div>
      </div>
      <div class="panel">
        <h2>Изменить пароль</h2>
        <div class="fg"><label>Текущий пароль</label><input type="password" id="po" placeholder="Текущий пароль"/></div>
        <div class="fg"><label>Новый пароль</label><input type="password" id="pn" placeholder="Мин. 6 символов"/></div>
        <button class="btn blu wf" onclick="chgPass()">Сохранить</button>
      </div>
    </div>`);
}

async function chgPass(){
  const op=v('po'),np=v('pn');
  if(!op||!np) return toast('Заполните оба поля','err');
  if(np.length<6) return toast('Минимум 6 символов','err');
  try{
    const credential=EmailAuthProvider.credential(CU.email,op);
    await reauthenticateWithCredential(auth.currentUser,credential);
    await updatePassword(auth.currentUser,np);
    toast('Пароль изменён','ok');
  }catch(e){
    if(e.code==='auth/wrong-password') toast('Неверный текущий пароль','err');
    else toast('Ошибка: '+e.message,'err');
  }
}
window.chgPass=chgPass;

// ══════════════════════════════════════════
// REVISION
// ══════════════════════════════════════════
function showRevision(aid){
  _pendingFiles={};
  openM(`<h2>🔄 Загрузить исправления</h2>
    <div class="fg"><label>Файлы</label>
      <div class="fdrop" id="rev-drop"><div style="font-size:26px;">📄</div><p>Нажмите для выбора</p></div>
      <input type="file" id="rvf" multiple style="display:none">
      <div class="flist" id="rvfl"></div></div>
    <div class="fg"><label>Комментарий</label><input type="text" id="rvc2" placeholder="Опишите изменения..."/></div>
    <div class="macts">
      <button class="btn out" id="rev-cancel">Отмена</button>
      <button class="btn blu" id="rev-submit">Отправить</button>
    </div>`);
  document.getElementById('rev-drop').addEventListener('click',()=>document.getElementById('rvf').click());
  document.getElementById('rvf').addEventListener('change',function(){addFiles(this,'rvfl');});
  document.getElementById('rev-cancel').addEventListener('click',closeM);
  document.getElementById('rev-submit').addEventListener('click',async()=>{
    const newFiles=getFilesFromList('rvfl');
    const a=await fbGet('apps',aid);
    if(!a) return;
    a.files=[...(a.files||[]),...newFiles];
    await fbSet('apps',aid,{files:a.files,status:'pending',revisedAt:new Date().toISOString()});
    _pendingFiles={};
    if(a.teacherId) await addN(a.teacherId,'Студент загрузил исправления: «'+(a.title||a.type)+'»');
    closeM(); toast('Исправления отправлены','ok'); rApps();
  });
}
window.showRevision=showRevision;

// ══════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════
async function addN(uid,text){
  const snap=await fbGet('notifs',uid)||{list:[]};
  const list=snap.list||[];
  list.unshift({id:'n'+Date.now(),text,unread:true,time:new Date().toISOString()});
  await fbSet('notifs',uid,{list:list.slice(0,30)});
  if(uid===CU?.id) updBadge();
}

async function updBadge(){
  const snap=await fbGet('notifs',CU.id);
  const list=snap?snap.list||[]:[];
  const u=list.filter(n=>n.unread).length;
  const b=document.getElementById('nbadge');
  if(b){b.textContent=u;b.classList.toggle('dn',u===0);}
}

async function toggleNP(){
  const p=document.getElementById('npanel');
  p.classList.toggle('on');
  if(p.classList.contains('on')) renderNP();
}
window.toggleNP=toggleNP;

async function renderNP(){
  const snap=await fbGet('notifs',CU.id);
  let list=snap?snap.list||[]:[];
  list.forEach(n=>n.unread=false);
  await fbSet('notifs',CU.id,{list});
  updBadge();
  document.getElementById('nlist').innerHTML=list.length===0
    ?`<div style="padding:18px;text-align:center;color:var(--t2);font-size:13px;">Нет уведомлений</div>`
    :list.map(n=>`<div class="ni"><strong>${escH(n.text)}</strong><time>${new Date(n.time).toLocaleString('ru')}</time></div>`).join('');
}

async function clearN(){
  await fbSet('notifs',CU.id,{list:[]});
  updBadge(); renderNP();
}
window.clearN=clearN;

document.addEventListener('click',e=>{
  const p=document.getElementById('npanel'),b=document.getElementById('nbell');
  if(p&&!p.contains(e.target)&&b&&!b.contains(e.target)) p.classList.remove('on');
});

// ══════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════
function addFiles(inp,lid){
  const list=document.getElementById(lid);
  if(!list) return;
  Array.from(inp.files).forEach(f=>{
    const sz=f.size>1048576?(f.size/1048576).toFixed(1)+' МБ':Math.round(f.size/1024)+' КБ';
    const key=f.name+'_'+Date.now();
    const reader=new FileReader();
    reader.onload=e=>{ _pendingFiles[key]={name:f.name,size:sz,type:f.type,data:e.target.result}; };
    reader.readAsDataURL(f);
    const d=document.createElement('div'); d.className='fi'; d.dataset.key=key;
    d.innerHTML=`<span>📄</span><span style="flex:1;">${escH(f.name)}</span><span style="color:var(--t2)">${sz}</span>
      <button type="button" style="background:none;border:none;cursor:pointer;color:var(--dn);font-size:14px;" onclick="this.parentElement.remove();delete _pendingFiles['${escA(key)}']">×</button>`;
    list.appendChild(d);
  });
  if(inp.value!==undefined) inp.value='';
}

function getFilesFromList(lid){
  const list=document.getElementById(lid);
  if(!list) return [];
  return Array.from(list.querySelectorAll('.fi[data-key]')).map(el=>{
    const key=el.dataset.key;
    return _pendingFiles[key]||{name:el.querySelector('span:nth-child(2)').textContent,size:'',type:'',data:null};
  });
}

async function downloadFile(appId,fileIdx){
  const a=await fbGet('apps',appId);
  if(!a||!a.files||!a.files[fileIdx]) return toast('Файл не найден','err');
  const f=a.files[fileIdx];
  if(!f.data){toast('Данные файла отсутствуют','err');return;}
  const link=document.createElement('a');link.href=f.data;link.download=f.name;link.click();
}
window.downloadFile=downloadFile;

// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
function openM(html){document.getElementById('mb').innerHTML=html;document.getElementById('mo').classList.add('on');}
function closeMO(e){if(e.target.id==='mo') closeM();}
function closeM(){document.getElementById('mo').classList.remove('on');}
window.closeMO=closeMO;

// ══════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════
function chartStatus(apps){
  if(!apps.length) return empt('📊','Нет данных');
  const total=apps.length;
  return [
    ['⏳ На рассмотрении','#e8a020',apps.filter(a=>a.status==='pending').length],
    ['✅ Зачтено','#4CAF82',apps.filter(a=>a.status==='passed').length],
    ['❌ Не зачтено','#e05252',apps.filter(a=>a.status==='failed').length],
    ['🔄 На доработке','#2354a0',apps.filter(a=>a.status==='revision').length],
  ].map(([lb,col,cnt])=>`<div style="margin-bottom:11px;">
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span>${lb}</span><span style="font-weight:700">${cnt}</span></div>
    <div style="background:#f0f3fa;border-radius:4px;height:8px;">
      <div style="background:${col};height:8px;border-radius:4px;width:${Math.round(cnt/total*100)}%;"></div>
    </div>
  </div>`).join('');
}

function chartDecision(apps){
  const passed=apps.filter(a=>a.status==='passed').length;
  const failed=apps.filter(a=>a.status==='failed').length;
  const total=passed+failed;
  if(!total) return empt('🏛️','Нет данных решений');
  const pct=Math.round(passed/total*100);
  return `<div style="display:flex;align-items:center;gap:22px;">
    <div style="position:relative;width:96px;height:96px;flex-shrink:0;">
      <svg viewBox="0 0 36 36" style="width:100%;height:100%;">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f0f3fa" stroke-width="3"/>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#4CAF82" stroke-width="3"
          stroke-dasharray="${pct} ${100-pct}" stroke-dashoffset="25" transform="rotate(-90 18 18)"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;">${pct}%</div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
      <div class="flex jsb" style="font-size:13px;"><span>✅ Зачтено</span><b style="color:#4CAF82">${passed}</b></div>
      <div class="flex jsb" style="font-size:13px;"><span>❌ Не зачтено</span><b style="color:#e05252">${failed}</b></div>
      <div class="flex jsb" style="font-size:13px;border-top:1px solid var(--bd);padding-top:8px;"><span>Всего решений</span><b>${total}</b></div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════
function tw(heads,rows){
  const arr=Array.isArray(rows)?rows:[rows];
  return `<div class="tw"><table>
    <thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${arr.join('')}</tbody>
  </table></div>`;
}
function sc(bg,ico,val,label){ return `<div class="scard"><div class="sico" style="background:${bg};">${ico}</div><div><h3>${val}</h3><p>${label}</p></div></div>`; }
function qc(bg,ico,h,p,action){ return `<div class="qcard" onclick="${action}"><div class="qico" style="background:${bg};">${ico}</div><div><h3>${h}</h3><p>${p}</p></div></div>`; }
function empt(ico,msg,withBtn){ return `<div class="empty"><div class="ei">${ico}</div><p>${msg}</p>${withBtn?`<button class="btn blu" style="margin-top:14px;" onclick="showNewApp()">Подать заявку</button>`:''}</div>`; }
function sbadge(s){ return {pending:'<span class="badge by">⏳ На рассмотрении</span>',passed:'<span class="badge bg">✅ Зачтено</span>',failed:'<span class="badge br">❌ Не зачтено</span>',revision:'<span class="badge bb">🔄 На доработке</span>'}[s]||`<span class="badge bk">${s}</span>`; }

// expose tab functions
window.showTab=showTab; window.pickRole=pickRole;
