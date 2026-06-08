// ════════════════════════════════════════════
// ПОРТАЛ АТТЕСТАЦИИ МарГУ — app.js v3
// ════════════════════════════════════════════

// ── DB ──
const DB = {
  get(k)      { try { return JSON.parse(localStorage.getItem(k)); } catch{ return null; } },
  set(k,v)    { localStorage.setItem(k, JSON.stringify(v)); },
  del(k)      { localStorage.removeItem(k); },
  all(pfx)    {
    const out=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith(pfx)){ try{ out.push(JSON.parse(localStorage.getItem(k))); }catch{} }
    }
    return out;
  }
};

// ── STATE ──
let CU=null, CP=null, pendReg=null, curOTP=null, otpTmr=null, selRole='student';

// ══════════════════════════════════════════
// INIT — очищаем старые demo-данные, запускаем чистую систему
// ══════════════════════════════════════════
function seed(){
  // Если уже инициализировано новой версией — ничего не трогаем
  if(DB.get('sv4')) return;

  // Полная очистка localStorage от старых demo-данных предыдущих версий
  localStorage.clear();

  // Инициализируем пустую базу
  DB.set('uidx', []);          // пустой индекс пользователей
  DB.set('admin_exists', false); // admin пока не зарегистрирован
  DB.set('sv4', true);           // флаг новой версии
}

// ══════════════════════════════════════════
// AUTH UI
// ══════════════════════════════════════════
function showTab(t){
  document.getElementById('tab-login').classList.toggle('on',t==='login');
  document.getElementById('tab-reg').classList.toggle('on',t==='reg');
  document.getElementById('pane-login').classList.toggle('dn',t!=='login');
  document.getElementById('pane-reg').classList.toggle('dn',t!=='reg');
  if(t==='reg') refreshAdminBtn();
}

function refreshAdminBtn(){
  const btn=document.getElementById('rb-admin');
  if(!btn) return;
  // DB.get возвращает false (boolean) — проверяем строго
  const adminExists = DB.get('admin_exists') === true;
  if(adminExists){
    btn.classList.add('disabled');
    btn.title='Администратор уже зарегистрирован в системе';
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
  document.getElementById('fg-group').classList.toggle('dn',selRole!=='student');
  document.getElementById('fg-dept').classList.toggle('dn',selRole==='student');
  document.getElementById('fg-disc').classList.toggle('dn',selRole!=='teacher');
}

function pickRole(r){
  const btn=document.getElementById('rb-'+r);
  if(btn&&btn.classList.contains('disabled')) return;
  selRole=r;
  highlightRole();
}

// ══════════════════════════════════════════
// REGISTER
// ══════════════════════════════════════════
function startReg(){
  const name=v('rn'), email=v('re'), phone=v('rph'), pass=v('rpass');
  const group=v('rg'), dept=v('rd'), disc=v('rdi');

  if(!name)  return toast('Введите ФИО','err');
  if(!email) return toast('Email обязателен','err');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Некорректный Email','err');
  if(!pass||pass.length<6) return toast('Пароль минимум 6 символов','err');
  if(selRole==='admin' && DB.get('admin_exists')===true) return toast('Администратор уже зарегистрирован в системе','err');

  const idx=DB.get('uidx')||[];
  if(idx.find(u=>u.email===email)) return toast('Email уже зарегистрирован','err');
  if(phone&&idx.find(u=>u.phone===phone)) return toast('Телефон уже зарегистрирован','err');

  pendReg={
    name, email, phone, pass, role:selRole, group, dept,
    disciplines: selRole==='teacher' ? disc.split(',').map(s=>s.trim()).filter(Boolean) : []
  };
  launchOTP(email, name);
}

function launchOTP(email, name){
  curOTP = String(100000+Math.floor(Math.random()*900000));
  // Show OTP screen
  document.getElementById('auth-screen').style.display='none';
  const os=document.getElementById('otp-screen');
  os.style.display='flex';
  document.getElementById('otp-desc').textContent=`Код подтверждения отправлен на ${email}`;
  for(let i=0;i<6;i++) document.getElementById('d'+i).value='';
  document.getElementById('d0').focus();
  startOtpTimer(60);

  // Always show code in toast (demo mode - works without backend)
  setTimeout(()=>toast('📧 Код подтверждения: '+curOTP,'warn'), 500);
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

function resendOTP(){
  if(pendReg) launchOTP(pendReg.email, pendReg.name);
}

function cancelOTP(){
  clearInterval(otpTmr);
  curOTP=null; pendReg=null;
  document.getElementById('otp-screen').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
}

function dn(i){ // digit next
  const val=document.getElementById('d'+i).value.replace(/\D/g,'');
  document.getElementById('d'+i).value=val;
  if(val&&i<5) document.getElementById('d'+(i+1)).focus();
  const code=[0,1,2,3,4,5].map(j=>document.getElementById('d'+j).value).join('');
  if(code.length===6) setTimeout(verifyOTP,100);
}

function db(e,i){ // digit back
  if(e.key==='Backspace'&&!document.getElementById('d'+i).value&&i>0){
    document.getElementById('d'+(i-1)).focus();
  }
}

function verifyOTP(){
  const code=[0,1,2,3,4,5].map(i=>document.getElementById('d'+i).value).join('');
  if(code.length<6) return toast('Введите все 6 цифр','err');
  if(code!==curOTP) return toast('Неверный код — попробуйте ещё раз','err');

  const d=pendReg;
  const id='u'+Date.now();
  const user={id,role:d.role,name:d.name,email:d.email,phone:d.phone,pass:d.pass,
    group:d.group,dept:d.dept,disciplines:d.disciplines||[],verified:true,createdAt:new Date().toISOString()};
  DB.set('user:'+id,user);
  const idx=DB.get('uidx')||[];
  idx.push({id,email:d.email,phone:d.phone||''});
  DB.set('uidx',idx);
  DB.set('notifs:'+id,[]);
  if(d.role==='admin') DB.set('admin_exists', true);

  clearInterval(otpTmr); curOTP=null; pendReg=null;
  document.getElementById('otp-screen').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  toast('✅ Аккаунт создан! Входим...','ok');
  setTimeout(()=>loginOK(user),600);
}

// ══════════════════════════════════════════
// LOGIN / LOGOUT
// ══════════════════════════════════════════
function doLogin(){
  const id=v('li'), pass=v('lp');
  if(!id||!pass) return toast('Заполните поля','err');
  const idx=DB.get('uidx')||[];
  const ref=idx.find(u=>u.email===id||u.phone===id);
  if(!ref) return toast('Пользователь не найден','err');
  const user=DB.get('user:'+ref.id);
  if(!user||user.pass!==pass) return toast('Неверный пароль','err');
  loginOK(user);
}

function loginOK(user){
  CU=user;
  DB.set('sess',user.id);
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('otp-screen').style.display='none';
  const app=document.getElementById('app-screen');
  app.style.display='flex';
  initApp();
}

function doLogout(){
  CU=null; DB.set('sess',null);
  document.getElementById('app-screen').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  refreshAdminBtn();
}

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

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
function rDash(){
  const role=CU.role;
  if(role==='student'){
    const my=DB.all('app:').filter(a=>a.studentId===CU.id);
    const comms=DB.all('comm:').filter(c=>c.status==='active');
    pc(`
      <h1 style="font-size:21px;font-weight:700;margin-bottom:3px;">Добро пожаловать, ${CU.name.split(' ')[1]||CU.name}! 👋</h1>
      <p style="color:var(--t2);font-size:13px;margin-bottom:22px;">Ваш портал аттестации МарГУ</p>
      <div class="sgrid">
        ${sc('#eef2ff','📋',my.length,'Всего заявок')}
        ${sc('#fff8e6','⏳',my.filter(a=>a.status==='pending').length,'На рассмотрении')}
        ${sc('#e6f7ee','✅',my.filter(a=>a.status==='passed').length,'Зачтено')}
        ${sc('#fee6e6','❌',my.filter(a=>a.status==='failed').length,'Не зачтено')}
      </div>
      <div class="qacts">
        ${qc('#eef2ff','📋','Подать заявку','На аттестацию',"go('apps')")}
        ${qc('#e6f7ee','📁','Документы','Загруженные файлы',"go('docs')")}
        ${qc('#fff8e6','📅','Расписание','Даты комиссий',"go('sched')")}
      </div>
      <div class="twocol">
        <div class="panel"><h2>Последние заявки</h2>
          ${my.length===0?empt('📭','Нет заявок'):tw(['Дисциплина','Статус','Дата'],
            my.slice(-4).map(a=>`<tr>
              <td><b>${a.discipline||a.type}</b></td>
              <td>${sbadge(a.status)}</td>
              <td style="color:var(--t2)">${fdate(a.createdAt)}</td>
            </tr>`))}
        </div>
        <div class="panel"><h2>Активные аттестационные события</h2>
          ${comms.length===0?empt('🏛️','Нет событий'):comms.map(c=>`
            <div style="padding:10px 0;border-bottom:1px solid var(--bd);">
              <div style="font-weight:700;font-size:13px;">${c.name}</div>
              <div style="font-size:12px;color:var(--t2);margin-top:3px;"><span class="dtag">${c.subject||'—'}</span> 📅 ${c.date?fdate(c.date):'Уточняется'}</div>
            </div>`).join('')}
        </div>
      </div>`);

  } else if(role==='teacher'){
    const discs=CU.disciplines||[];
    const allA=DB.all('app:').filter(a=>a.teacherId===CU.id||discs.includes(a.discipline));
    const comms=DB.all('comm:').filter(c=>c.teacherId===CU.id);
    pc(`
      <h1 style="font-size:21px;font-weight:700;margin-bottom:3px;">Добро пожаловать, ${CU.name.split(' ')[1]||CU.name}! 👨‍🏫</h1>
      <p style="color:var(--t2);font-size:13px;margin-bottom:22px;">Ваши дисциплины: ${discs.map(d=>`<span class="dtag">${d}</span>`).join('')}</p>
      <div class="sgrid">
        ${sc('#fff8e6','📋',allA.filter(a=>a.status==='pending').length,'Ожидают проверки')}
        ${sc('#e6f7ee','✅',allA.filter(a=>a.status==='passed').length,'Аттестовано')}
        ${sc('#eef2ff','🏛️',comms.length,'Моих событий')}
        ${sc('#f0e6ff','📚',discs.length,'Дисциплин')}
      </div>
      <div class="panel">
        <div class="flex jsb aic" style="margin-bottom:14px;">
          <h2 style="margin:0;">Заявки, ожидающие проверки</h2>
          <button class="btn sm blu" onclick="go('review')">Все →</button>
        </div>
        ${allA.filter(a=>a.status==='pending').length===0?empt('✨','Нет заявок для проверки'):
          tw(['Студент','Дисциплина','Тип','Дата',''],
          allA.filter(a=>a.status==='pending').slice(0,5).map(a=>{
            const st=DB.get('user:'+a.studentId);
            return `<tr>
              <td><b>${st?st.name:'?'}</b><div style="font-size:11px;color:var(--t2)">${st?st.group||'':''}</div></td>
              <td><span class="dtag">${a.discipline||'—'}</span></td>
              <td>${a.type||'—'}</td>
              <td style="color:var(--t2)">${fdate(a.createdAt)}</td>
              <td><button class="btn sm blu" onclick="openRM('${a.id}')">Рассмотреть</button></td>
            </tr>`;}))}
      </div>`);

  } else {
    const allA=DB.all('app:'), allU=DB.all('user:'), comms=DB.all('comm:');
    const stu=allU.filter(u=>u.role==='student'), tch=allU.filter(u=>u.role==='teacher');
    pc(`
      <h1 style="font-size:21px;font-weight:700;margin-bottom:3px;">Панель администратора ⚙️</h1>
      <p style="color:var(--t2);font-size:13px;margin-bottom:22px;">Аналитика и управление аттестацией МарГУ</p>
      <div class="sgrid">
        ${sc('#eef2ff','📋',allA.length,'Всего заявок')}
        ${sc('#e6f7ee','👨‍🎓',stu.length,'Студентов')}
        ${sc('#f0e6ff','🏛️',comms.length+'/'+comms.filter(c=>c.status==='active').length,'Событий/Активных')}
        ${sc('#fff8e6','👨‍🏫',tch.length,'Преподавателей')}
      </div>
      <div class="qacts">
        ${qc('#eef2ff','+','Создать событие','Аттестационное событие',"go('events')")}
        ${qc('#e6f7ee','👤','Пользователи','Управление аккаунтами',"go('users')")}
        ${qc('#fff8e6','📊','Отчёты','Экспорт данных',"go('reports')")}
      </div>
      <div class="twocol">
        <div class="panel"><h2>Статус заявок</h2>${chartStatus(allA)}</div>
        <div class="panel"><h2>Решения комиссий</h2>${chartDecision(allA)}</div>
      </div>`);
  }
}

// ══════════════════════════════════════════
// STUDENT — APPS
// ══════════════════════════════════════════
function rApps(){
  const my=DB.all('app:').filter(a=>a.studentId===CU.id);
  pc(`
    <div class="flex jsb aic" style="margin-bottom:22px;">
      <div><h1 style="font-size:21px;font-weight:700;">Мои заявки</h1>
        <p style="color:var(--t2);font-size:13px;">Заявки по дисциплинам</p></div>
      <button class="btn blu" onclick="showNewApp()">+ Новая заявка</button>
    </div>
    ${my.length===0?`<div class="panel">${empt('📭','Нет заявок',true)}</div>`:my.map(a=>appCard(a)).join('')}`);
}

function appCard(a){
  const tch=a.teacherId?DB.get('user:'+a.teacherId):null;
  const comm=a.commId?DB.get('comm:'+a.commId):null;
  const canEdit = a.status==='pending' || a.status==='revision';
  return `<div class="panel" style="margin-bottom:14px;" id="card-${a.id}">
    <div class="flex jsb aic" style="margin-bottom:10px;">
      <div>
        <div style="font-weight:700;font-size:15px;">${escH(a.title||a.type)}</div>
        <div style="font-size:12px;color:var(--t2);margin-top:3px;">
          <span class="dtag">${escH(a.discipline||'—')}</span>
          ${tch?`• ${escH(tch.name)}`:''}
          ${comm?`• ${escH(comm.name)}`:''}
        </div>
        <div style="font-size:11px;color:var(--t2);margin-top:2px;">Подано: ${fdate(a.createdAt)}</div>
      </div>
      ${sbadge(a.status)}
    </div>
    <div class="flowrow">${flowSteps(a.status)}</div>

    <!-- ФАЙЛЫ -->
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:6px;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;">
        <span>Документы (${(a.files||[]).length})</span>
        ${canEdit?`<button class="btn sm blu" onclick="addFileToApp('${escA(a.id)}')">+ Добавить файл</button>`:''}
      </div>
      ${(a.files||[]).length===0
        ? `<div style="font-size:12px;color:var(--t2);padding:8px 0;">Нет прикреплённых файлов</div>`
        : `<div class="flist">${(a.files||[]).map((f,i)=>`
            <div class="fi" style="justify-content:space-between;">
              <span style="flex:0 0 auto;">📄</span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 6px;">${escH(f.name)}</span>
              <span style="color:var(--t2);flex:0 0 auto;font-size:11px;">${escH(f.size||'')}</span>
              <div style="display:flex;gap:4px;margin-left:6px;">
                ${f.data?`<button class="btn sm blu" onclick="downloadFile('${escA(a.id)}',${i})">⬇</button>`:''}
                ${canEdit?`<button class="btn sm" style="background:#fee6e6;color:var(--dn);" onclick="delFileFromApp('${escA(a.id)}',${i})">🗑</button>`:''}
              </div>
            </div>`).join('')}
          </div>`}
    </div>

    ${a.tComment?`<div style="background:#f4f6fb;border-radius:8px;padding:11px;margin-bottom:10px;border-left:3px solid var(--pr);">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:3px;">КОММЕНТАРИЙ ПРЕПОДАВАТЕЛЯ</div>
      <div style="font-size:13px;">${escH(a.tComment)}</div>
    </div>`:''}
    ${a.status==='revision'?`<button class="btn sm blu" onclick="showRevision('${escA(a.id)}')">📎 Загрузить исправления</button>`:''}
  </div>`;
}

// ── Удалить файл из заявки ──
function delFileFromApp(appId, fileIdx){
  const a = DB.get('app:'+appId);
  if(!a) return;
  if(!confirm('Удалить файл «'+(a.files[fileIdx]?.name||'')+'»?')) return;
  a.files.splice(fileIdx, 1);
  DB.set('app:'+appId, a);
  toast('Файл удалён','ok');
  rApps();
}

// ── Добавить файл к заявке ──
function addFileToApp(appId){
  _pendingFiles = {};
  openM(`
    <h2>📎 Добавить файл к заявке</h2>
    <div class="fg">
      <label>Выберите файл(ы)</label>
      <div class="fdrop" id="aff-drop">
        <div style="font-size:30px;">📄</div>
        <p>Нажмите или перетащите файлы</p>
        <p style="font-size:11px;margin-top:2px;">PDF, DOCX, XLSX, JPG — до 20 МБ</p>
      </div>
      <input type="file" id="aff-input" multiple style="display:none">
      <div class="flist" id="aff-list"></div>
    </div>
    <div class="macts">
      <button class="btn out" id="aff-cancel">Отмена</button>
      <button class="btn blu" id="aff-submit">Прикрепить</button>
    </div>`);

  document.getElementById('aff-drop').addEventListener('click', ()=>document.getElementById('aff-input').click());
  document.getElementById('aff-drop').addEventListener('dragover', e=>{e.preventDefault();e.currentTarget.classList.add('dov');});
  document.getElementById('aff-drop').addEventListener('drop', e=>{e.preventDefault();e.currentTarget.classList.remove('dov');addFiles({files:e.dataTransfer.files},'aff-list');});
  document.getElementById('aff-input').addEventListener('change', function(){ addFiles(this,'aff-list'); });
  document.getElementById('aff-cancel').addEventListener('click', closeM);
  document.getElementById('aff-submit').addEventListener('click', ()=>{
    const newFiles = getFilesFromList('aff-list');
    if(!newFiles.length){ toast('Выберите хотя бы один файл','err'); return; }
    const a = DB.get('app:'+appId);
    if(!a) return;
    a.files = [...(a.files||[]), ...newFiles];
    DB.set('app:'+appId, a);
    _pendingFiles = {};
    const tch = a.teacherId ? DB.get('user:'+a.teacherId) : null;
    if(tch) addN(a.teacherId, 'Студент добавил файлы к заявке «'+(a.title||a.type)+'»');
    closeM();
    toast('Файл(ы) прикреплены','ok');
    rApps();
  });
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

function showNewApp(){
  const teachers=DB.all('user:').filter(u=>u.role==='teacher'&&(u.disciplines||[]).length>0);
  const comms=DB.all('comm:').filter(c=>c.status==='active');
  openM(`
    <h2>📋 Новая заявка</h2>
    <div class="fg"><label>Преподаватель *</label>
      <select id="mt">
        <option value="">— Выберите преподавателя —</option>
        ${teachers.map(t=>`<option value="${escA(t.id)}" data-d="${escA((t.disciplines||[]).join('||'))}">${escH(t.name)} (${escH(t.dept||'')})</option>`).join('')}
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
        ${comms.map(c=>`<option value="${escA(c.id)}">${escH(c.name)}</option>`).join('')}
      </select></div>
    <div class="fg"><label>Документы</label>
      <div class="fdrop" id="app-drop">
        <div style="font-size:26px;">📄</div><p>Нажмите или перетащите файлы</p>
        <p style="font-size:11px;margin-top:2px;">PDF, DOCX, XLSX — до 20 МБ</p>
      </div>
      <input type="file" id="mf" multiple style="display:none">
      <div class="flist" id="mfl"></div></div>
    <div class="fg"><label>Комментарий</label><input type="text" id="mcom" placeholder="Доп. информация..."/></div>
    <div class="macts">
      <button class="btn out" id="app-cancel">Отмена</button>
      <button class="btn blu" id="app-submit">Подать заявку</button>
    </div>`);

  document.getElementById('mt').addEventListener('change', onTchChange);
  document.getElementById('app-drop').addEventListener('click', ()=>document.getElementById('mf').click());
  document.getElementById('app-drop').addEventListener('dragover', e=>{e.preventDefault();e.currentTarget.classList.add('dov');});
  document.getElementById('app-drop').addEventListener('drop', e=>{e.preventDefault();e.currentTarget.classList.remove('dov');addFiles({files:e.dataTransfer.files},'mfl');});
  document.getElementById('mf').addEventListener('change', function(){ addFiles(this,'mfl'); });
  document.getElementById('app-cancel').addEventListener('click', closeM);
  document.getElementById('app-submit').addEventListener('click', submitApp);
}

function onTchChange(){
  const sel=document.getElementById('mt');
  const opt=sel.options[sel.selectedIndex];
  const discs=opt.dataset.d?opt.dataset.d.split('||').filter(Boolean):[];
  const ds=document.getElementById('md');
  ds.innerHTML=discs.length===0
    ?'<option value="">— Нет дисциплин —</option>'
    :'<option value="">— Выберите дисциплину —</option>'+discs.map(d=>`<option value="${d}">${d}</option>`).join('');
  ds.disabled=discs.length===0;
}

function submitApp(){
  const tId=v('mt'), disc=v('md'), type=v('mty'), title=v('mti'), commId=v('mc'), com=v('mcom');
  if(!tId)   return toast('Выберите преподавателя','err');
  if(!disc)  return toast('Выберите дисциплину','err');
  if(!title) return toast('Введите название','err');

  // Берём файлы с base64 данными
  const files = getFilesFromList('mfl');

  const id='a'+Date.now();
  const app={id, studentId:CU.id, teacherId:tId, discipline:disc, commId:commId||'',
    status:'pending', type, title, files, sComment:com, tComment:'',
    createdAt:new Date().toISOString()};
  DB.set('app:'+id, app);

  // Очищаем временное хранилище
  _pendingFiles = {};

  addN(tId, '📋 Новая заявка от '+CU.name+' по «'+disc+'»: «'+title+'»');
  addN(CU.id, '✅ Заявка «'+title+'» подана');
  closeM(); toast('Заявка подана!','ok'); rApps();
}

// ── DOCS ──
function rDocs(){
  const my = DB.all('app:').filter(a=>a.studentId===CU.id);
  const files = my.flatMap(a=>(a.files||[]).map((f,i)=>({
    ...f, appId:a.id, fileIdx:i,
    appTitle:escH(a.title||a.type),
    disc:a.discipline,
    date:a.createdAt,
    canEdit: a.status==='pending'||a.status==='revision'
  })));

  pc(`
    <div class="flex jsb aic" style="margin-bottom:22px;">
      <div>
        <h1 style="font-size:21px;font-weight:700;">Мои документы</h1>
        <p style="color:var(--t2);font-size:13px;">Все прикреплённые файлы по заявкам</p>
      </div>
    </div>

    ${my.length===0
      ? `<div class="panel">${empt('📁','Нет заявок — сначала подайте заявку, потом прикрепите документы')}</div>`
      : `<!-- По заявкам -->
        ${my.map(a=>{
          const canEdit = a.status==='pending'||a.status==='revision';
          const af = (a.files||[]);
          return `<div class="panel" style="margin-bottom:16px;">
            <div class="flex jsb aic" style="margin-bottom:12px;">
              <div>
                <div style="font-weight:700;font-size:14px;">${escH(a.title||a.type)}</div>
                <div style="font-size:12px;color:var(--t2);margin-top:2px;">
                  <span class="dtag">${escH(a.discipline||'—')}</span>
                  ${sbadge(a.status)}
                </div>
              </div>
              ${canEdit
                ? `<button class="btn sm blu" onclick="addFileToApp('${escA(a.id)}')">+ Добавить файл</button>`
                : `<span style="font-size:11px;color:var(--t2);">Редактирование закрыто</span>`}
            </div>

            ${af.length===0
              ? `<div style="padding:12px 0;font-size:13px;color:var(--t2);">
                  Нет прикреплённых файлов.
                  ${canEdit?`<a style="color:var(--pr);cursor:pointer;" onclick="addFileToApp('${escA(a.id)}')">Добавить →</a>`:''}
                </div>`
              : `<div class="flist">${af.map((f,i)=>`
                  <div class="fi" style="justify-content:space-between;">
                    <span style="flex:0 0 auto;font-size:16px;">📄</span>
                    <span style="flex:1;margin:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">${escH(f.name)}</span>
                    <span style="color:var(--t2);flex:0 0 auto;font-size:11px;margin-right:8px;">${escH(f.size||'')}</span>
                    <div style="display:flex;gap:5px;flex-shrink:0;">
                      ${f.data
                        ? `<button class="btn sm blu" onclick="downloadFile('${escA(a.id)}',${i})" title="Скачать">⬇ Скачать</button>`
                        : `<span style="font-size:11px;color:var(--t2);padding:4px;">нет данных</span>`}
                      ${canEdit
                        ? `<button class="btn sm" style="background:#fee6e6;color:var(--dn);border:none;" onclick="delFileFromApp('${escA(a.id)}',${i})" title="Удалить файл">🗑 Удалить</button>`
                        : ''}
                    </div>
                  </div>`).join('')}
                </div>`}
          </div>`;
        }).join('')}`}
  `);
}

// ── SCHEDULE ──
function rSched(){
  const comms=DB.all('comm:');
  pc(`<h1 style="font-size:21px;font-weight:700;margin-bottom:22px;">Расписание аттестации</h1>
    <div class="panel">
      ${comms.length===0?empt('📅','Нет событий'):
        tw(['Событие','Дисциплина','Дата','Статус'],comms.map(c=>`<tr>
          <td><b>${c.name}</b></td>
          <td><span class="dtag">${c.subject||'—'}</span></td>
          <td>${c.date?fdate(c.date):'Уточняется'}</td>
          <td>${c.status==='active'?'<span class="badge bg">Активно</span>':'<span class="badge bk">Завершено</span>'}</td>
        </tr>`))}
    </div>`);
}

// ══════════════════════════════════════════
// TEACHER — REVIEW
// ══════════════════════════════════════════
function rReview(){
  const discs=CU.disciplines||[];
  const apps=DB.all('app:').filter(a=>a.teacherId===CU.id||discs.includes(a.discipline));
  pc(`
    <div style="margin-bottom:18px;">
      <h1 style="font-size:21px;font-weight:700;">Заявки студентов</h1>
      <p style="color:var(--t2);font-size:13px;margin-top:4px;">Ваши дисциплины: ${discs.map(d=>`<span class="dtag">${d}</span>`).join(' ')||'<span style="color:var(--dn)">не указаны</span>'}</p>
    </div>
    <div class="ptabs">
      <button class="ptab on" onclick="fApps('all',this)">Все (${apps.length})</button>
      <button class="ptab" onclick="fApps('pending',this)">Ожидают (${apps.filter(a=>a.status==='pending').length})</button>
      <button class="ptab" onclick="fApps('passed',this)">Зачтено (${apps.filter(a=>a.status==='passed').length})</button>
      <button class="ptab" onclick="fApps('failed',this)">Не зачтено (${apps.filter(a=>a.status==='failed').length})</button>
      <button class="ptab" onclick="fApps('revision',this)">Доработка (${apps.filter(a=>a.status==='revision').length})</button>
    </div>
    <div class="panel" id="atbl">${appsTable(apps)}</div>`);
}

function fApps(status,btn){
  document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  const discs=CU.disciplines||[];
  let apps=DB.all('app:').filter(a=>a.teacherId===CU.id||discs.includes(a.discipline));
  if(status!=='all') apps=apps.filter(a=>a.status===status);
  document.getElementById('atbl').innerHTML=appsTable(apps);
}

function appsTable(apps){
  if(!apps.length) return empt('📭','Нет заявок');
  return tw(['Студент','Дисциплина','Работа','Файлы','Статус','Дата',''],apps.map(a=>{
    const st=DB.get('user:'+a.studentId);
    return `<tr>
      <td><b>${st?st.name:'?'}</b><div style="font-size:11px;color:var(--t2)">${st?st.group||'':''}</div></td>
      <td><span class="dtag">${a.discipline||'—'}</span></td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.title||a.type}</td>
      <td>${(a.files||[]).length?`<span class="badge bb">📄 ${a.files.length}</span>`:'<span class="badge bk">—</span>'}</td>
      <td>${sbadge(a.status)}</td>
      <td style="color:var(--t2)">${fdate(a.createdAt)}</td>
      <td><button class="btn sm blu" onclick="openRM('${a.id}')">Рассмотреть</button></td>
    </tr>`;
  }));
}

function openRM(aid){
  const a=DB.get('app:'+aid);
  if(!a) return toast('Заявка не найдена','err');
  if(CU.role==='teacher'){
    const discs=CU.disciplines||[];
    if(a.teacherId!==CU.id&&!discs.includes(a.discipline))
      return toast('Эта заявка не относится к вашим дисциплинам','err');
  }
  const st=DB.get('user:'+a.studentId);
  const comm=a.commId?DB.get('comm:'+a.commId):null;
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
        <div><span style="color:var(--t2)">Дата подачи:</span><br>${fdate(a.createdAt)}</div>
        <div><span style="color:var(--t2)">Статус:</span><br>${sbadge(a.status)}</div>
      </div>
    </div>
    ${a.files&&a.files.length?`<div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:8px;text-transform:uppercase;">Документы студента</div>
      <div class="flist">${a.files.map((f,i)=>`
        <div class="fi" style="justify-content:space-between;">
          <span style="flex:0 0 auto;">📄</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escH(f.name)}</span>
          <span style="color:var(--t2);flex:0 0 auto;margin:0 6px;">${escH(f.size||'')}</span>
          ${f.data
            ? `<button class="btn sm grn" style="flex:0 0 auto;" onclick="downloadFile('${escA(a.id)}',${i})">⬇ Скачать</button>`
            : `<span style="font-size:11px;color:var(--t2);flex:0 0 auto;">нет данных</span>`}
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

  document.getElementById('rm-close').addEventListener('click', closeM);
  document.getElementById('rm-revision').addEventListener('click', ()=>setStatus(aid,'revision'));
  document.getElementById('rm-failed').addEventListener('click',  ()=>setStatus(aid,'failed'));
  document.getElementById('rm-passed').addEventListener('click',  ()=>setStatus(aid,'passed'));
}

function setStatus(aid, status){
  const a=DB.get('app:'+aid);
  if(!a) return;
  const com=(document.getElementById('rm-comment')||{}).value||'';
  a.status=status; a.tComment=com; a.reviewedAt=new Date().toISOString(); a.reviewedBy=CU.id;
  DB.set('app:'+aid,a);
  const lb={passed:'зачтена ✅',failed:'не зачтена ❌',revision:'отправлена на доработку 🔄'};
  addN(a.studentId,'Заявка «'+(a.title||a.type)+'» '+(lb[status]||'обновлена')+(com?': '+com:''));
  closeM(); toast('Статус обновлён','ok');
  if(CP==='review') rReview();
  else if(CP==='allapps') rAllApps();
  else rDash();
}

// ══════════════════════════════════════════
// EVENTS (Аттестационные события) — teacher + admin
// ══════════════════════════════════════════
function rEvents(){
  const all  = DB.all('comm:');
  // Преподаватель видит ВСЕ события (чтобы мог добавлять), но создаёт от своего имени
  const list = CU.role==='teacher' ? all : all;
  const isAdmin = CU.role==='admin';
  const canCreate = CU.role==='admin' || CU.role==='teacher';

  const heads = isAdmin
    ? ['Название','Дисциплина','Председатель','Дата','Статус','Заявок','']
    : ['Название','Дисциплина','Председатель','Дата','Статус','Заявок'];

  const rows = list.map(c=>{
    const cnt = DB.all('app:').filter(a=>a.commId===c.id).length;
    const tch = c.teacherId ? DB.get('user:'+c.teacherId) : null;
    return `<tr>
      <td><b>${c.name}</b></td>
      <td><span class="dtag">${c.subject||'—'}</span></td>
      <td style="color:var(--t2)">${tch?tch.name:'—'}</td>
      <td style="color:var(--t2)">${c.date?fdate(c.date):'—'}</td>
      <td>${c.status==='active'?'<span class="badge bg">Активно</span>':'<span class="badge bk">Завершено</span>'}</td>
      <td><span class="badge bb">${cnt}</span></td>
      ${isAdmin?`<td><button class="del-btn" title="Удалить" onclick="delEvent('${c.id}')">🗑️</button></td>`:''}
    </tr>`;
  });

  pc(`
    <div class="flex jsb aic" style="margin-bottom:22px;">
      <div>
        <h1 style="font-size:21px;font-weight:700;">Аттестационные события</h1>
        <p style="color:var(--t2);font-size:13px;margin-top:3px;">
          ${CU.role==='teacher'?'Вы можете создавать события и назначать себя председателем':'Управление всеми аттестационными событиями'}
        </p>
      </div>
      ${canCreate?`<button class="btn blu" onclick="showCreateEvent()">+ Создать событие</button>`:''}
    </div>
    <div class="panel">
      ${list.length===0
        ? empt('🏛️','Нет событий. Нажмите «+ Создать событие» чтобы добавить.')
        : tw(heads, rows)}
    </div>`);
}

function showCreateEvent(){
  const teachers = DB.all('user:').filter(u=>u.role==='teacher');
  const isTeacher = CU.role==='teacher';

  const chairHTML = isTeacher
    ? `<div class="fg">
        <label>Председатель</label>
        <div style="background:#f0f4ff;border-radius:8px;padding:10px 13px;border:1.5px solid var(--bd);font-size:14px;font-weight:600;">
          👨‍🏫 ${escH(CU.name)}
        </div>
       </div>`
    : `<div class="fg">
        <label>Председатель (преподаватель)</label>
        <select id="ev-chair">
          <option value="">Без председателя</option>
          ${teachers.map(t=>`<option value="${escA(t.id)}">${escH(t.name)}${t.dept?' — '+escH(t.dept):''}</option>`).join('')}
        </select>
       </div>`;

  openM(`
    <h2>🏛️ Создать аттестационное событие</h2>
    <div class="fg">
      <label>Название события *</label>
      <input type="text" id="ev-name" placeholder="Комиссия по защите дипломных работ 2025"/>
    </div>
    <div class="fg">
      <label>Дисциплина / предмет</label>
      <input type="text" id="ev-subj" placeholder="Информационные системы"/>
    </div>
    ${chairHTML}
    <div class="fg">
      <label>Дата заседания</label>
      <input type="date" id="ev-date"/>
    </div>
    <div class="macts">
      <button class="btn out" id="ev-cancel">Отмена</button>
      <button class="btn blu" id="ev-submit">✅ Создать</button>
    </div>`);

  // Вешаем обработчики через JS — никаких inline onclick
  document.getElementById('ev-cancel').addEventListener('click', closeM);
  document.getElementById('ev-submit').addEventListener('click', function(){
    const name = (document.getElementById('ev-name').value||'').trim();
    const subj = (document.getElementById('ev-subj').value||'').trim();
    const date = (document.getElementById('ev-date').value||'').trim();
    const chairEl = document.getElementById('ev-chair');
    const tId = isTeacher ? CU.id : (chairEl ? chairEl.value : '');

    if(!name){ toast('Укажите название события','err'); return; }

    const id = 'c' + Date.now();
    DB.set('comm:'+id, {
      id, name, subject:subj, teacherId:tId, date,
      status:'active', createdBy:CU.id,
      createdAt: new Date().toISOString()
    });

    if(tId && tId !== CU.id) addN(tId, 'Вы назначены председателем события: «'+name+'»');
    addN(CU.id, 'Событие «'+name+'» успешно создано');

    closeM();
    toast('Событие создано!','ok');
    rEvents();
  });
}

// createEvent больше не нужна — логика встроена в showCreateEvent через addEventListener
function createEvent(){ /* не используется */ }

function delEvent(id){
  if(!confirm('Удалить аттестационное событие? Это действие нельзя отменить.')) return;
  DB.del('comm:'+id);
  toast('Событие удалено','ok');
  rEvents();
}

// ══════════════════════════════════════════
// TEACHER — STUDENTS
// ══════════════════════════════════════════
function rStuds(){
  const students=DB.all('user:').filter(u=>u.role==='student');
  const allA=DB.all('app:');
  pc(`<h1 style="font-size:21px;font-weight:700;margin-bottom:22px;">Студенты</h1>
    <div class="panel">
      ${students.length===0?empt('👥','Нет студентов'):
        tw(['ФИО','Группа','Email','Заявок','Статус'],students.map(s=>{
          const apps=allA.filter(a=>a.studentId===s.id);
          const passed=apps.filter(a=>a.status==='passed').length;
          const pend=apps.filter(a=>a.status==='pending').length;
          return `<tr>
            <td><b>${s.name}</b></td>
            <td>${s.group||'—'}</td>
            <td style="color:var(--t2)">${s.email||s.phone||'—'}</td>
            <td>${apps.length} <span style="color:var(--t2);font-size:11px">(✅${passed})</span></td>
            <td>${pend?'<span class="badge by">Ожидает</span>':passed?'<span class="badge bg">Аттестован</span>':'<span class="badge bk">—</span>'}</td>
          </tr>`;
        }))}
    </div>`);
}

// ══════════════════════════════════════════
// ADMIN — ALL APPS
// ══════════════════════════════════════════
function rAllApps(){
  const all=DB.all('app:');
  pc(`
    <div class="flex jsb aic" style="margin-bottom:22px;">
      <h1 style="font-size:21px;font-weight:700;">Все заявки</h1>
    </div>
    <div class="ptabs">
      <button class="ptab on" onclick="fAllApps('all',this)">Все (${all.length})</button>
      <button class="ptab" onclick="fAllApps('pending',this)">Ожидают (${all.filter(a=>a.status==='pending').length})</button>
      <button class="ptab" onclick="fAllApps('passed',this)">Зачтено (${all.filter(a=>a.status==='passed').length})</button>
      <button class="ptab" onclick="fAllApps('failed',this)">Не зачтено (${all.filter(a=>a.status==='failed').length})</button>
    </div>
    <div class="panel" id="aatbl">${adminAppsTable(all)}</div>`);
}

function fAllApps(status,btn){
  document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  let apps=DB.all('app:');
  if(status!=='all') apps=apps.filter(a=>a.status===status);
  document.getElementById('aatbl').innerHTML=adminAppsTable(apps);
}

function adminAppsTable(apps){
  if(!apps.length) return empt('📭','Нет заявок');
  return tw(['Студент','Дисциплина','Работа','Статус','Дата','Удалить'],apps.map(a=>{
    const st=DB.get('user:'+a.studentId);
    return `<tr>
      <td><b>${st?st.name:'?'}</b><div style="font-size:11px;color:var(--t2)">${st?st.group||'':''}</div></td>
      <td><span class="dtag">${a.discipline||'—'}</span></td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.title||a.type}</td>
      <td>${sbadge(a.status)}</td>
      <td style="color:var(--t2)">${fdate(a.createdAt)}</td>
      <td>
        <button class="btn sm blu" onclick="openRM('${a.id}')" style="margin-right:5px;">Смотреть</button>
        <button class="del-btn" title="Удалить заявку" onclick="delApp('${a.id}')">🗑️</button>
      </td>
    </tr>`;
  }));
}

function delApp(id){
  if(!confirm('Удалить эту заявку?')) return;
  DB.del('app:'+id);
  toast('Заявка удалена','ok'); rAllApps();
}

// ══════════════════════════════════════════
// ADMIN — USERS (with delete)
// ══════════════════════════════════════════
function rUsers(){
  const users=DB.all('user:');
  pc(`
    <div class="flex jsb aic" style="margin-bottom:22px;">
      <h1 style="font-size:21px;font-weight:700;">Пользователи системы</h1>
    </div>
    <div class="ptabs">
      <button class="ptab on" onclick="fUsers('all',this)">Все (${users.length})</button>
      <button class="ptab" onclick="fUsers('student',this)">Студенты (${users.filter(u=>u.role==='student').length})</button>
      <button class="ptab" onclick="fUsers('teacher',this)">Преподаватели (${users.filter(u=>u.role==='teacher').length})</button>
      <button class="ptab" onclick="fUsers('admin',this)">Администраторы (${users.filter(u=>u.role==='admin').length})</button>
    </div>
    <div class="panel" id="utbl">${usersTable(users)}</div>`);
}

function fUsers(role,btn){
  document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  let users=DB.all('user:');
  if(role!=='all') users=users.filter(u=>u.role===role);
  document.getElementById('utbl').innerHTML=usersTable(users);
}

function usersTable(users){
  if(!users.length) return empt('👥','Нет пользователей');
  const rbadge={student:'<span class="badge bb">Студент</span>',teacher:'<span class="badge bg">Преподаватель</span>',admin:'<span class="badge by">Администратор</span>'};
  return tw(['ФИО','Роль','Email','Дисциплины','Группа','Дата рег.','Удалить'],users.map(u=>`<tr>
    <td><b>${u.name}</b></td>
    <td>${rbadge[u.role]||u.role}</td>
    <td style="color:var(--t2)">${u.email||'—'}</td>
    <td>${(u.disciplines||[]).map(d=>`<span class="dtag">${d}</span>`).join('')||'—'}</td>
    <td>${u.group||'—'}</td>
    <td style="color:var(--t2)">${fdate(u.createdAt)}</td>
    <td>${u.id===CU.id?'<span style="color:var(--t2);font-size:12px;">Вы</span>':
      `<button class="del-btn" title="Удалить пользователя" onclick="delUser('${u.id}','${u.role}')">🗑️</button>`}
    </td>
  </tr>`));
}

function delUser(uid, role){
  if(uid===CU.id) return toast('Нельзя удалить себя','err');
  const u=DB.get('user:'+uid);
  if(!u) return;
  if(!confirm(`Удалить пользователя «${u.name}»? Все его заявки и данные будут удалены.`)) return;

  // Delete user
  DB.del('user:'+uid);
  DB.del('notifs:'+uid);

  // Update index
  const idx=(DB.get('uidx')||[]).filter(x=>x.id!==uid);
  DB.set('uidx',idx);

  // Если удалили администратора — снова разрешаем регистрацию admin
  if(role==='admin') DB.set('admin_exists', false);

  // Delete student's apps if student
  if(role==='student'){
    DB.all('app:').filter(a=>a.studentId===uid).forEach(a=>DB.del('app:'+a.id));
  }

  toast(`Пользователь «${u.name}» удалён`,'ok');
  rUsers();
}

// ══════════════════════════════════════════
// ADMIN — REPORTS
// ══════════════════════════════════════════
function rReports(){
  const allA=DB.all('app:'), stu=DB.all('user:').filter(u=>u.role==='student'), comms=DB.all('comm:');
  pc(`<h1 style="font-size:21px;font-weight:700;margin-bottom:22px;">Отчёты по аттестации</h1>
    <div class="twocol" style="margin-bottom:20px;">
      <div class="panel">
        <h2>Сводный отчёт</h2>
        <div style="display:flex;flex-direction:column;gap:11px;font-size:14px;">
          <div class="flex jsb"><span>Всего заявок:</span><b>${allA.length}</b></div>
          <div class="flex jsb"><span>Зачтено:</span><b style="color:var(--ac)">${allA.filter(a=>a.status==='passed').length}</b></div>
          <div class="flex jsb"><span>Не зачтено:</span><b style="color:var(--dn)">${allA.filter(a=>a.status==='failed').length}</b></div>
          <div class="flex jsb"><span>На рассмотрении:</span><b style="color:var(--am)">${allA.filter(a=>a.status==='pending').length}</b></div>
          <div class="flex jsb"><span>На доработке:</span><b style="color:var(--pr)">${allA.filter(a=>a.status==='revision').length}</b></div>
          <div style="border-top:1px solid var(--bd);padding-top:11px;" class="flex jsb"><span>Студентов:</span><b>${stu.length}</b></div>
          <div class="flex jsb"><span>Событий:</span><b>${comms.length}</b></div>
        </div>
        <button class="btn blu wf" style="margin-top:18px;" onclick="exportCSV()">📥 Экспорт CSV</button>
      </div>
      <div class="panel"><h2>Решения</h2>${chartDecision(allA)}</div>
    </div>
    <div class="panel"><h2>Статус заявок</h2>${chartStatus(allA)}</div>`);
}

function exportCSV(){
  const apps=DB.all('app:');
  let csv='ФИО;Группа;Дисциплина;Тип;Название;Статус;Дата подачи;Дата решения\n';
  apps.forEach(a=>{
    const s=DB.get('user:'+a.studentId);
    const sl={pending:'На рассмотрении',passed:'Зачтено',failed:'Не зачтено',revision:'На доработке'}[a.status]||a.status;
    csv+=`${s?s.name:'?'};${s?s.group||'—':'—'};${a.discipline||'—'};${a.type};${a.title||''};${sl};${fdate(a.createdAt)};${a.reviewedAt?fdate(a.reviewedAt):'—'}\n`;
  });
  const b=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(b);
  const link=document.createElement('a');link.href=url;link.download='margu_report.csv';link.click();
  toast('Отчёт выгружен','ok');
}

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
            ${u.name.split(' ').slice(0,2).map(w=>w[0]).join('')}
          </div>
          <div style="font-weight:700;font-size:17px;">${u.name}</div>
          <div style="font-size:13px;color:var(--t2);">${{student:'Студент',teacher:'Преподаватель',admin:'Администратор'}[u.role]}</div>
          <span class="badge bg" style="margin-top:6px;">✅ Email подтверждён</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px;font-size:13px;">
          ${u.email?`<div class="flex jsb"><span style="color:var(--t2)">Email:</span><b>${u.email}</b></div>`:''}
          ${u.phone?`<div class="flex jsb"><span style="color:var(--t2)">Телефон:</span><b>${u.phone}</b></div>`:''}
          ${u.group?`<div class="flex jsb"><span style="color:var(--t2)">Группа:</span><b>${u.group}</b></div>`:''}
          ${u.dept?`<div class="flex jsb"><span style="color:var(--t2)">Кафедра:</span><b>${u.dept}</b></div>`:''}
          ${(u.disciplines||[]).length?`<div><span style="color:var(--t2)">Дисциплины:</span><br>${u.disciplines.map(d=>`<span class="dtag">${d}</span>`).join(' ')}</div>`:''}
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

function chgPass(){
  const op=v('po'),np=v('pn');
  if(op!==CU.pass) return toast('Неверный текущий пароль','err');
  if(np.length<6)  return toast('Минимум 6 символов','err');
  CU.pass=np; DB.set('user:'+CU.id,CU); toast('Пароль изменён','ok');
}

// ══════════════════════════════════════════
// REVISION
// ══════════════════════════════════════════
function showRevision(aid){
  openM(`<h2>🔄 Загрузить исправления</h2>
    <div class="fg"><label>Файлы</label>
      <div class="fdrop" id="rev-drop">
        <div style="font-size:26px;">📄</div><p>Нажмите для выбора файлов</p>
      </div>
      <input type="file" id="rvf" multiple style="display:none">
      <div class="flist" id="rvfl"></div></div>
    <div class="fg"><label>Комментарий</label><input type="text" id="rvc2" placeholder="Опишите изменения..."/></div>
    <div class="macts">
      <button class="btn out" id="rev-cancel">Отмена</button>
      <button class="btn blu" id="rev-submit">Отправить</button>
    </div>`);

  document.getElementById('rev-drop').addEventListener('click', ()=>document.getElementById('rvf').click());
  document.getElementById('rvf').addEventListener('change', function(){ addFiles(this,'rvfl'); });
  document.getElementById('rev-cancel').addEventListener('click', closeM);
  document.getElementById('rev-submit').addEventListener('click', ()=>submitRev(aid));
}

function submitRev(aid){
  const a = DB.get('app:'+aid);
  const newFiles = getFilesFromList('rvfl');
  a.files = [...(a.files||[]), ...newFiles];
  a.status = 'pending';
  a.revisedAt = new Date().toISOString();
  DB.set('app:'+aid, a);
  _pendingFiles = {};
  if(a.teacherId) addN(a.teacherId, 'Студент загрузил исправления: «'+(a.title||a.type)+'»');
  closeM(); toast('Исправления отправлены','ok'); rApps();
}

// ══════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════
function chartStatus(apps){
  if(!apps.length) return empt('📊','Нет данных');
  const total=apps.length;
  return [
    ['⏳ На рассмотрении',var_am,apps.filter(a=>a.status==='pending').length],
    ['✅ Зачтено',var_ac,apps.filter(a=>a.status==='passed').length],
    ['❌ Не зачтено',var_dn,apps.filter(a=>a.status==='failed').length],
    ['🔄 На доработке','#2354a0',apps.filter(a=>a.status==='revision').length],
  ].map(([lb,col,cnt])=>`<div style="margin-bottom:11px;">
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
      <span>${lb}</span><span style="font-weight:700">${cnt}</span>
    </div>
    <div style="background:#f0f3fa;border-radius:4px;height:8px;">
      <div style="background:${col};height:8px;border-radius:4px;width:${Math.round(cnt/total*100)}%;transition:width .5s;"></div>
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
const var_am='#e8a020', var_ac='#4CAF82', var_dn='#e05252';

// ══════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════
function addN(uid,text){
  let ns=DB.get('notifs:'+uid)||[];
  ns.unshift({id:'n'+Date.now(),text,unread:true,time:new Date().toISOString()});
  if(ns.length>30) ns=ns.slice(0,30);
  DB.set('notifs:'+uid,ns);
  if(uid===CU?.id) updBadge();
}
function updBadge(){
  const ns=DB.get('notifs:'+CU.id)||[];
  const u=ns.filter(n=>n.unread).length;
  const b=document.getElementById('nbadge');
  if(b){b.textContent=u;b.classList.toggle('dn',u===0);}
}
function toggleNP(){
  const p=document.getElementById('npanel');
  p.classList.toggle('on');
  if(p.classList.contains('on')) renderNP();
}
function renderNP(){
  const ns=DB.get('notifs:'+CU.id)||[];
  ns.forEach(n=>n.unread=false);
  DB.set('notifs:'+CU.id,ns);
  updBadge();
  document.getElementById('nlist').innerHTML=ns.length===0
    ?`<div style="padding:18px;text-align:center;color:var(--t2);font-size:13px;">Нет уведомлений</div>`
    :ns.map(n=>`<div class="ni"><strong>${n.text}</strong><time>${new Date(n.time).toLocaleString('ru')}</time></div>`).join('');
}
function clearN(){
  DB.set('notifs:'+CU.id,[]);
  updBadge(); renderNP();
}
document.addEventListener('click',e=>{
  const p=document.getElementById('npanel'),b=document.getElementById('nbell');
  if(p&&!p.contains(e.target)&&b&&!b.contains(e.target)) p.classList.remove('on');
});

// ══════════════════════════════════════════
// FILE UPLOAD — читаем содержимое в base64
// ══════════════════════════════════════════
function dov(e){e.preventDefault();e.currentTarget.classList.add('dov');}
function doDrop(e,lid){e.preventDefault();e.currentTarget.classList.remove('dov');addFiles({files:e.dataTransfer.files},lid);}

// Глобальный список файлов с данными (name→base64), привязан к текущему модалу
let _pendingFiles = {};

function addFiles(inp, lid){
  const list = document.getElementById(lid);
  if(!list) return;
  Array.from(inp.files).forEach(f => {
    const sz = f.size > 1048576 ? (f.size/1048576).toFixed(1)+' МБ' : Math.round(f.size/1024)+' КБ';
    const key = f.name + '_' + Date.now();

    // Читаем файл в base64
    const reader = new FileReader();
    reader.onload = function(e){
      _pendingFiles[key] = { name: f.name, size: sz, type: f.type, data: e.target.result };
      // Обновляем data-key на элементе
      const el = list.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if(el) el.dataset.ready = '1';
    };
    reader.readAsDataURL(f);

    // Добавляем строку в список сразу
    const d = document.createElement('div');
    d.className = 'fi';
    d.dataset.key = key;
    d.innerHTML = `
      <span>📄</span>
      <span>${escH(f.name)}</span>
      <span style="color:var(--t2)">${sz}</span>
      <button type="button" style="background:none;border:none;cursor:pointer;color:var(--dn);font-size:14px;line-height:1;" onclick="this.parentElement.remove(); delete _pendingFiles['${key}']">×</button>`;
    list.appendChild(d);
  });
  if(inp.value !== undefined) inp.value = '';
}

// Получить массив файлов из списка (с base64 данными)
function getFilesFromList(lid){
  const list = document.getElementById(lid);
  if(!list) return [];
  const result = [];
  list.querySelectorAll('.fi[data-key]').forEach(el => {
    const key = el.dataset.key;
    if(_pendingFiles[key]){
      result.push(_pendingFiles[key]);
    } else {
      // Файл ещё читается или данных нет — берём только мета
      const spans = el.querySelectorAll('span');
      result.push({ name: spans[1]?.textContent||'', size: spans[2]?.textContent||'', type:'', data:null });
    }
  });
  return result;
}

// Скачать файл по сохранённым данным
function downloadFile(appId, fileIdx){
  const a = DB.get('app:'+appId);
  if(!a || !a.files || !a.files[fileIdx]) return toast('Файл не найден','err');
  const f = a.files[fileIdx];
  if(!f.data){ toast('Данные файла не сохранены. Студент должен повторно загрузить файл.','err'); return; }
  const link = document.createElement('a');
  link.href = f.data;
  link.download = f.name;
  link.click();
}

// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
function openM(html){document.getElementById('mb').innerHTML=html;document.getElementById('mo').classList.add('on');}
function closeMO(e){if(e.target.id==='mo') closeM();}
function closeM(){document.getElementById('mo').classList.remove('on');}

// ══════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════
function toast(msg,type=''){
  const t=document.createElement('div');t.className='toast '+type;t.textContent=msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(()=>t.remove(),3500);
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function v(id){const el=document.getElementById(id);return el?el.value.trim():'';}
function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function escA(s){return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fdate(d){try{return new Date(d).toLocaleDateString('ru');}catch{return'—';}}
function pc(html){document.getElementById('pc').innerHTML=html;}
function tw(heads,rows){
  return `<div class="tw"><table>
    <thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${Array.isArray(rows)?rows.join(''):rows}</tbody>
  </table></div>`;
}
function sc(bg,ico,val,label){
  return `<div class="scard"><div class="sico" style="background:${bg};">${ico}</div><div><h3>${val}</h3><p>${label}</p></div></div>`;
}
function qc(bg,ico,h,p,action){
  return `<div class="qcard" onclick="${action}"><div class="qico" style="background:${bg};">${ico}</div><div><h3>${h}</h3><p>${p}</p></div></div>`;
}
function empt(ico,msg,withBtn){
  return `<div class="empty"><div class="ei">${ico}</div><p>${msg}</p>
    ${withBtn?`<button class="btn blu" style="margin-top:14px;" onclick="showNewApp()">Подать заявку</button>`:''}</div>`;
}
function sbadge(s){
  return {
    pending:'<span class="badge by">⏳ На рассмотрении</span>',
    passed:'<span class="badge bg">✅ Зачтено</span>',
    failed:'<span class="badge br">❌ Не зачтено</span>',
    revision:'<span class="badge bb">🔄 На доработке</span>',
  }[s]||`<span class="badge bk">${s}</span>`;
}

// ══════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════
seed();                  // инициализация (только при первом запуске)
refreshAdminBtn();       // обновить кнопку admin на форме регистрации

// Восстановить сессию если была
const sess = DB.get('sess');
if(sess){
  const u = DB.get('user:'+sess);
  if(u) loginOK(u);
}
