(() => {
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  const API = window.location.origin;
  const CLIENT_ID_KEY = 'taskflow_client_id';
  function getClientId(){
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if(!id){ id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(CLIENT_ID_KEY,id);} 
    return id;
  }
  function apiHeaders(extra){
    const h = Object.assign({'Content-Type':'application/json'}, extra||{});
    if (tg && tg.initData) h['X-Tg-Init-Data'] = tg.initData;
    else h['X-Client-Id'] = getClientId();
    return h;
  }

  const el = {
    subtitle: document.getElementById('subtitle'),
    menuUserName: document.getElementById('menuUserName'),
    menuUserHandle: document.getElementById('menuUserHandle'),
    menuAvatar: document.getElementById('menuAvatar'),

    // screens
    screenTasks: document.getElementById('screenTasks'),
    screenCalendar: document.getElementById('screenCalendar'),
    screenMenu: document.getElementById('screenMenu'),

    // tasks UI
    cards: document.getElementById('cards'),
    empty: document.getElementById('empty'),
    listTitle: document.getElementById('listTitle'),
    listCounter: document.getElementById('listCounter'),
    kpiActive: document.getElementById('kpiActive'),
    kpiToday: document.getElementById('kpiToday'),
    kpiOverdue: document.getElementById('kpiOverdue'),
    searchInput: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearch'),
    exportBtn: document.getElementById('exportBtn'),

    // calendar UI
    calTitle: document.getElementById('calTitle'),
    calGrid: document.getElementById('calGrid'),
    calPrev: document.getElementById('calPrev'),
    calNext: document.getElementById('calNext'),
    calToday: document.getElementById('calToday'),
    dayTitle: document.getElementById('dayTitle'),
    dayHint: document.getElementById('dayHint'),
    dayCards: document.getElementById('dayCards'),
    dayEmpty: document.getElementById('dayEmpty'),
    dayAddBtn: document.getElementById('dayAddBtn'),
    dayPanel: document.getElementById('dayPanel'),
    dayHandle: document.getElementById('dayHandle'),
    dayCollapse: document.getElementById('dayCollapse'),

    // menu UI
    mSync: document.getElementById('mSync'),
    mExport: document.getElementById('mExport'),
    mClearDone: document.getElementById('mClearDone'),
    defaultReminder: document.getElementById('defaultReminder'),
    overdueHighlight: document.getElementById('overdueHighlight'),
    tzSelect: document.getElementById('tzSelect'),
    themeSelect: document.getElementById('themeSelect'),

    // top buttons
    syncBtn: document.getElementById('syncBtn'),
    addBtn: document.getElementById('addBtn'),
    fab: document.getElementById('fab'),

    // toast
    toast: document.getElementById('toast'),

    // modal
    backdrop: document.getElementById('backdrop'),
    modal: document.getElementById('modal'),
    closeModal: document.getElementById('closeModal'),
    modalTitle: document.getElementById('modalTitle'),
    saveBtn: document.getElementById('saveBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    fTitle: document.getElementById('fTitle'),
    fDesc: document.getElementById('fDesc'),
    fDate: document.getElementById('fDate'),
    fTime: document.getElementById('fTime'),
    fPriority: document.getElementById('fPriority'),
    fReminder: document.getElementById('fReminder'),
  };

  let userId = 1;
  let authKey = 'u1';
  function getEffectiveUserKey(){
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) return String(tg.initDataUnsafe.user.id);
    return getClientId();
  }

  let tasks = [];
  let filter = 'inbox';
  let editingId = null;
  let search = '';

  // calendar state
  let calMonth = new Date(); calMonth.setDate(1);
  let selectedDay = new Date();

  // settings (persist)
  const settings = {
    defaultReminder: localStorage.getItem('defaultReminder') || 'on',
    overdueHighlight: localStorage.getItem('overdueHighlight') || 'on',
    // timezone: 'auto' or 'fixed:+3' (hours)
    timezone: localStorage.getItem('timezone') || 'auto',
  };

  // ---------- UI helpers ----------
  function toast(msg, tone='') {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.className = `toast show ${tone}`.trim();
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.toast.className = 'toast'; }, 1600);
  }

  function setVh() {
    const h = (tg?.viewportStableHeight || tg?.viewportHeight)
      ? (tg.viewportStableHeight || tg.viewportHeight)
      : window.innerHeight;
    document.documentElement.style.setProperty('--tg-vh', `${h}px`);
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (m) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[m]));
  }

  // ---------- Timezone ----------
  // We store due_at in DB as UTC time WITHOUT 'Z' (naive). Bot treats it as UTC.
  // UI shows times in selected timezone (auto/device or fixed offset).
  function deviceOffsetMinutes() {
    // minutes east of UTC
    return -new Date().getTimezoneOffset();
  }

  function tzOffsetMinutes() {
    if (settings.timezone === 'auto') return deviceOffsetMinutes();
    const m = settings.timezone.match(/^fixed:([+-]?\d{1,2})$/);
    if (!m) return deviceOffsetMinutes();
    const h = Number(m[1]);
    return h * 60;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function utcIsoNoZFromMillis(ms) {
    const d = new Date(ms);
    // use UTC getters to build ISO without Z
    const y = d.getUTCFullYear();
    const mo = pad(d.getUTCMonth()+1);
    const da = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const mm = pad(d.getUTCMinutes());
    return `${y}-${mo}-${da}T${hh}:${mm}:00`;
  }

  function utcMillisFromIsoNoZ(isoNoZ) {
    // interpret as UTC
    return Date.parse(isoNoZ + 'Z');
  }

  function localMillisFromUtcMillis(utcMs) {
    // "local" in выбранном часовом поясе
    return utcMs + tzOffsetMinutes() * 60000;
  }

  function fmtDue(isoNoZ) {
    if (!isoNoZ) return 'Без срока';
    const utcMs = utcMillisFromIsoNoZ(isoNoZ);
    const ms = localMillisFromUtcMillis(utcMs);
    const d = new Date(ms);
    // Use UTC methods because ms already includes offset (so UTC shows "local tz")
    const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth()+1)}.${d.getUTCFullYear()}`;
    const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    return `${date} ${time}`;
  }

  function dateStrFromUtcIso(isoNoZ) {
    const utcMs = utcMillisFromIsoNoZ(isoNoZ);
    const ms = localMillisFromUtcMillis(utcMs);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  }

  function timeStrFromUtcIso(isoNoZ) {
    const utcMs = utcMillisFromIsoNoZ(isoNoZ);
    const ms = localMillisFromUtcMillis(utcMs);
    const d = new Date(ms);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }

  function isoUtcNoZFromInputs(dateStr, timeStr) {
    if (!dateStr) return null;
    const [y,mo,da] = dateStr.split('-').map(Number);
    const [hh,mm] = (timeStr || '23:59').split(':').map(Number);
    // This is "local time" in выбранном поясе. Convert to UTC millis:
    const localMs = Date.UTC(y, mo-1, da, hh, mm, 0);
    const utcMs = localMs - tzOffsetMinutes() * 60000;
    return utcIsoNoZFromMillis(utcMs);
  }

  function dayKeyFromMillis(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  }

  function taskDayKey(t) {
    if (!t.due_at) return null;
    const utcMs = utcMillisFromIsoNoZ(t.due_at);
    const localMs = localMillisFromUtcMillis(utcMs);
    return dayKeyFromMillis(localMs);
  }

  function isOverdue(t) {
    if (settings.overdueHighlight !== 'on') return false;
    if (!t.due_at || t.completed) return false;
    const utcMs = utcMillisFromIsoNoZ(t.due_at);
    return utcMs < Date.now();
  }

  function isToday(t) {
    if (!t.due_at || t.completed) return false;
    const nowLocal = localMillisFromUtcMillis(Date.now());
    const kNow = dayKeyFromMillis(nowLocal);
    return taskDayKey(t) === kNow;
  }

  function isUpcoming(t) {
    if (!t.due_at || t.completed) return false;
    const utcMs = utcMillisFromIsoNoZ(t.due_at);
    const now = Date.now();
    const in48 = now + 48*60*60*1000;
    return utcMs > now && utcMs <= in48;
  }

  
  // ---------- Theme (dark/light) ----------
  const THEME_KEY = 'tf_theme_mode'; // auto | dark | light
  let _themeMode = (localStorage.getItem(THEME_KEY) || 'auto');

  function _prefersLight(){
    try{ return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches; }catch(_){ return false; }
  }

  function applyTheme(mode){
    _themeMode = mode || 'auto';
    if (!['auto','dark','light'].includes(_themeMode)) _themeMode = 'auto';
    localStorage.setItem(THEME_KEY, _themeMode);

    const html = document.documentElement;
    if (_themeMode === 'auto') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', _themeMode);

    const effective = (_themeMode === 'auto') ? (_prefersLight() ? 'light' : 'dark') : _themeMode;

    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', effective === 'light' ? '#F6F7FB' : '#0B0F14');

    try{
      if (tg && tg.setHeaderColor) tg.setHeaderColor(effective === 'light' ? '#F6F7FB' : '#0B0F14');
      if (tg && tg.setBackgroundColor) tg.setBackgroundColor(effective === 'light' ? '#F6F7FB' : '#0B0F14');
    }catch(_){}
  }

  function bindThemeUI(){
    if (!el.themeSelect) return;
    el.themeSelect.value = _themeMode;
    el.themeSelect.addEventListener('change', () => applyTheme(el.themeSelect.value));
  }

  try{
    const mm = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => { if (_themeMode === 'auto') applyTheme('auto'); };
    if (mm && mm.addEventListener) mm.addEventListener('change', handler);
    else if (mm && mm.addListener) mm.addListener(handler);
  }catch(_){}


// ---------- API ----------
  async function apiMe(){
    const r = await fetch(`${API}/api/me`, { headers: apiHeaders({}) });
    if (!r.ok) throw new Error('me failed');
    return await r.json();
  }

  async function apiGetTasks() {
    const r = await fetch(`${API}/api/tasks`, { headers: apiHeaders() });
    if (!r.ok) {
      let detail='';
      try{ const j=await r.json(); detail=j.detail||JSON.stringify(j);}catch(e){ try{detail=await r.text();}catch(_){} }
      throw new Error(detail || `HTTP ${r.status}`);
    }
    return await r.json();
  }
  async function apiCreate(payload) {
    const r = await fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      let detail='';
      try{ const j=await r.json(); detail=j.detail||JSON.stringify(j);}catch(e){ try{detail=await r.text();}catch(_){}}
      throw new Error(detail || `HTTP ${r.status}`);
    }
    const createdCount = Number(r.headers.get('X-Created-Count')||'0');
    const data = await r.json();
    return { data, createdCount };
  }
  async function apiUpdate(id, payload) {
    const r = await fetch(`${API}/api/tasks/${id}`, {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('update failed');
    return await r.json();
  }
  async function apiDelete(id) {
    const r = await fetch(`${API}/api/tasks/${id}`, { method: 'DELETE', headers: apiHeaders() });
    if (!r.ok) throw new Error('delete failed');
    return await r.json();
  }
  async function apiToggle(id, done) {
    const ep = done ? 'done' : 'undone';
    const r = await fetch(`${API}/api/tasks/${id}/${ep}`, { method: 'POST', headers: apiHeaders() });
    if (!r.ok) throw new Error('toggle failed');
    return await r.json();
  }
  async function apiMigrateUser(from_user_id, to_user_id) {
    const r = await fetch(`${API}/api/migrate_user`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ from_user_id, to_user_id })
    });
    if (!r.ok) throw new Error('migrate failed');
    return await r.json();
  }

  async function apiSnooze15(id) {
    const r = await fetch(`${API}/api/tasks/${id}/snooze15`, { method: 'POST', headers: apiHeaders() });
    if (!r.ok) throw new Error('snooze failed');
    return await r.json();
  }

  // ---------- Screens ----------
  function showScreen(name, navName) {
    el.screenTasks.classList.toggle('show', name==='tasks');
    el.screenCalendar.classList.toggle('show', name==='calendar');
    el.screenMenu.classList.toggle('show', name==='menu');

    document.querySelectorAll('.bottomNav .navBtn[data-screen]').forEach(b => {
      const act = (navName || name);
      b.classList.toggle('active', b.dataset.screen===act);
    });

    if (name === 'calendar') {
      renderCalendar();
      renderDayList();
    }
  }

  // ---------- Tasks view ----------
  function applyFilter(list) {
    let out = list;
    if (filter === 'active') out = out.filter(t => !t.completed);
    if (filter === 'inbox') out = out.filter(t => !t.completed && !t.due_at);
    if (filter === 'done') out = out.filter(t => t.completed);
    if (filter === 'overdue') out = out.filter(t => isOverdue(t));
    if (filter === 'today') out = out.filter(t => isToday(t));
    if (filter === 'upcoming') out = out.filter(t => isUpcoming(t));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(t => (t.title||'').toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q));
    }
    return out;
  }

  function updateKPIs() {
    const active = tasks.filter(t => !t.completed).length;
    const today = tasks.filter(t => isToday(t)).length;
    const overdue = tasks.filter(t => isOverdue(t)).length;
    el.kpiActive.textContent = String(active);
    el.kpiToday.textContent = String(today);
    el.kpiOverdue.textContent = String(overdue);
  }

  function setListTitle() {
    const map = { inbox:'Входящие', active:'Активные', today:'Сегодня', overdue:'Просрочено', upcoming:'Предстоящие', done:'Завершено' };
    el.listTitle.textContent = map[filter] || 'Задачи';
  }

  
function cardHTML(t) {
    const overdue = isOverdue(t);
    const pr = (t.priority || 'medium');
    const prClass = pr === 'high' ? 'high' : (pr === 'low' ? 'low' : 'med');
    const dueLabel = t.due_at
      ? (overdue
          ? `<span class="duePill bad">Просрочено • ${escapeHtml(fmtDue(t.due_at))}</span>`
          : `<span class="duePill accent">${escapeHtml(fmtDue(t.due_at))}</span>`)
      : `<span class="duePill">Без срока</span>`;

    const snoozeBtn = (!t.completed && t.due_at) ? `<button class="sAct ghost" data-action="snooze" title="Отложить">⏰</button>` : '';
    const toggleIcon = t.completed ? '↩' : '✓';

    return `
      <div class="card swipe" data-id="${t.id}">
        <div class="swipeActions" aria-hidden="true">
          <button class="sAct good" data-action="toggle" title="${t.completed ? 'Вернуть' : 'Готово'}">${toggleIcon}</button>
          <button class="sAct ghost" data-action="edit" title="Редактировать">✎</button>
          ${snoozeBtn}
          <button class="sAct bad" data-action="delete" title="Удалить">🗑</button>
        </div>

        <div class="cardBody">
          <button class="taskCheck ${t.completed ? 'done' : ''}" data-action="toggle" aria-label="${t.completed ? 'Вернуть' : 'Отметить выполненной'}">✓</button>

          <div class="taskMain">
            <div class="taskTitle ${t.completed ? 'done' : ''}">${escapeHtml(t.title)}</div>
            ${t.description ? `<div class="taskDesc">${escapeHtml(t.description)}</div>` : ''}
            <div class="taskMeta">
              ${dueLabel}
              <span class="prDot ${prClass}" title="Приоритет"></span>
              ${(t.reminder_enabled === false) ? `<span class="duePill">Напом. выкл</span>` : `<span class="duePill">Напом.</span>`}
            </div>
          </div>

          <div class="taskActionsMini">
            <button class="miniBtn" data-action="edit" aria-label="Редактировать">⋯</button>
          </div>
        </div>
      </div>
    `;
  }

function renderTasks() {
    const view = applyFilter(tasks);
    setListTitle();
    el.listCounter.textContent = String(view.length);
    updateKPIs();

    if (!view.length) {
      el.cards.innerHTML = '';
      el.empty.classList.add('show');
      return;
    }
    el.empty.classList.remove('show');
    el.cards.innerHTML = view.map(cardHTML).join('');
  }

  // ---------- Calendar view ----------
  function monthTitle(d) {
    return d.toLocaleDateString('ru-RU', { month:'long', year:'numeric' }).replace(/^./, c => c.toUpperCase());
  }

  function buildDayStats() {
    const m = new Map();
    for (const t of tasks) {
      const k = taskDayKey(t);
      if (!k) continue;
      const cur = m.get(k) || { total:0, overdue:0, done:0 };
      cur.total += 1;
      if (t.completed) cur.done += 1;
      if (isOverdue(t)) cur.overdue += 1;
      m.set(k, cur);
    }
    return m;
  }

  function renderCalendar() {
    const stats = buildDayStats();
    el.calTitle.textContent = monthTitle(calMonth);

    const first = new Date(calMonth);
    const year = first.getFullYear();
    const month = first.getMonth();

    const startDay = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(year, month+1, 0).getDate();

    const prevDays = startDay;
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i=prevDays; i>0; i--) {
      const dayNum = prevMonthDays - i + 1;
      const d = new Date(year, month-1, dayNum);
      cells.push({ date:d, inMonth:false });
    }
    for (let day=1; day<=daysInMonth; day++) {
      const d = new Date(year, month, day);
      cells.push({ date:d, inMonth:true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length-1].date;
      const d = new Date(last); d.setDate(d.getDate()+1);
      cells.push({ date:d, inMonth:false });
    }
    while (cells.length < 42) {
      const last = cells[cells.length-1].date;
      const d = new Date(last); d.setDate(d.getDate()+1);
      cells.push({ date:d, inMonth:false });
    }

    // today & selected in selected timezone
    const todayKey = dayKeyFromMillis(localMillisFromUtcMillis(Date.now()));
    const selKey = dayKeyFromMillis(Date.UTC(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), 12, 0, 0));

    el.calGrid.innerHTML = cells.map(c => {
      // For calendar cells, treat date object as local calendar date. Build key in that calendar month:
      const k = `${c.date.getFullYear()}-${pad(c.date.getMonth()+1)}-${pad(c.date.getDate())}`;
      const s = stats.get(k);
      const dots = [];
      if (s) {
        if (s.overdue > 0) dots.push('<span class="dot bad"></span>');
        const activeCount = s.total - s.done;
        if (activeCount > 0) dots.push('<span class="dot accent"></span>');
        if (s.done > 0) dots.push('<span class="dot good"></span>');
      }
      const cls = ['calDay', c.inMonth ? '' : 'muted', k===todayKey?'today':'', k===dayKeyFromMillis(Date.UTC(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), 12, 0, 0))?'selected':''].filter(Boolean).join(' ');
      return `
        <div class="${cls}" data-date="${k}">
          <div class="calNum">${c.date.getDate()}</div>
          <div class="calDots">${dots.slice(0,3).join('')}</div>
        </div>
      `;
    }).join('');

    el.calGrid.querySelectorAll('.calDay').forEach(cell => {
      cell.addEventListener('click', () => {
        const k = cell.dataset.date;
        const [y,m,d] = k.split('-').map(Number);
        selectedDay = new Date(y, m-1, d);
        renderCalendar();
        renderDayList();
      });
    });
  }

  function tasksForSelectedDay() {
    const k = `${selectedDay.getFullYear()}-${pad(selectedDay.getMonth()+1)}-${pad(selectedDay.getDate())}`;
    return tasks
      .filter(t => taskDayKey(t) === k)
      .sort((a,b) => {
        const ad = a.due_at ? utcMillisFromIsoNoZ(a.due_at) : 0;
        const bd = b.due_at ? utcMillisFromIsoNoZ(b.due_at) : 0;
        return ad - bd;
      });
  }

  function renderDayList() {
    const d = selectedDay;
    el.dayTitle.textContent = d.toLocaleDateString('ru-RU', { weekday:'long', day:'numeric', month:'long' }).replace(/^./, c=>c.toUpperCase());
    const list = tasksForSelectedDay();

    if (!list.length) {
      el.dayCards.innerHTML = '';
      el.dayEmpty.classList.add('show');
      return;
    }
    el.dayEmpty.classList.remove('show');
    el.dayCards.innerHTML = list.map(cardHTML).join('');
  }

  // ---------- Modal ----------
  function openModal(task=null, presetDate=null) {
    editingId = task ? task.id : null;

    el.modalTitle.textContent = task ? 'Редактирование' : 'Новая задача';
    el.deleteBtn.style.display = task ? 'inline-flex' : 'none';

    el.fTitle.value = task?.title || '';
    el.fDesc.value = task?.description || '';
    if (el.fPriority) el.fPriority.value = task?.priority || 'medium';

    const rem = (task ? (task.reminder_enabled !== false) : (settings.defaultReminder === 'on'));
    if (el.fReminder) el.fReminder.value = rem ? 'on' : 'off';

    if (task?.due_at) {
      el.fDate.value = dateStrFromUtcIso(task.due_at);
      el.fTime.value = timeStrFromUtcIso(task.due_at);
    } else if (presetDate) {
      // presetDate is a Date in calendar (local). Use that day, keep time empty.
      el.fDate.value = `${presetDate.getFullYear()}-${pad(presetDate.getMonth()+1)}-${pad(presetDate.getDate())}`;
      el.fTime.value = '';
    } else {
      el.fDate.value = '';
      el.fTime.value = '';
    }

    el.backdrop.classList.add('show');
    el.modal.classList.add('show');
    setTimeout(() => el.fTitle.focus(), 50);
  }

  function closeModal() {
    el.backdrop.classList.remove('show');
    el.modal.classList.remove('show');
  }

  async function saveModal() {
    const title = el.fTitle.value.trim();
    const description = el.fDesc.value.trim();
    if (!title) { toast('Введите название', 'warn'); return; }

    const due_at = isoUtcNoZFromInputs(el.fDate.value, el.fTime.value);
    const tzOff = tzOffsetMinutes();

    const payload = {
      title,
      description,
      priority: (el.fPriority ? el.fPriority.value : 'medium'),
      due_at,
      reminder_enabled: ((el.fReminder ? el.fReminder.value : 'on') !== 'off'),
      tz_offset_minutes: tzOff
    };

    try {
      if (!editingId) {
        const res = await apiCreate(payload);
        toast('Задача добавлена', 'good');
      } else {
        await apiUpdate(editingId, payload);
        toast('Сохранено', 'good');
      }
      closeModal();
      enableCalendarDrag();
      await refresh(true);
    } catch (e) {
      toast('Ошибка: ' + (e?.message || e), 'bad');
      console.error(e);
    }
  }

  async function deleteModal() {
    if (!editingId) return;
    if (!confirm('Удалить задачу?')) return;
    try {
      await apiDelete(editingId);
      toast('Удалено', 'good');
      closeModal();
      await refresh(true);
    } catch (e) {
      toast('Ошибка удаления', 'bad');
      console.error(e);
    }
  }

  async function clearDone() {
    const done = tasks.filter(t => t.completed);
    if (!done.length) { toast('Выполненных нет'); return; }
    if (!confirm(`Удалить выполненные (${done.length})?`)) return;
    try {
      for (const t of done) await apiDelete(t.id);
      toast('Очищено', 'good');
      await refresh(true);
    } catch (e) {
      toast('Ошибка очистки', 'bad');
      console.error(e);
    }
  }

  // ---------- Refresh ----------
  async function refresh(silent=false) {
    try {
      if (!silent) toast('Синхронизация…');
      tasks = await apiGetTasks();
      // Если пользователь раньше заходил в браузере, задачи могли сохраниться под user_id=1.
      // В Telegram user_id другой — предложим перенести.
      if (tasks.length === 0 && userId !== 1) {
        const legacyCached = localStorage.getItem('tasks_cache_1');
        if (legacyCached) {
          const legacy = JSON.parse(legacyCached || '[]');
          if (Array.isArray(legacy) && legacy.length > 0) {
            const ok = confirm('Похоже, у вас есть старые задачи (из браузера). Перенести их в ваш Telegram аккаунт?');
            if (ok) {
              try {
                const res = await apiMigrateUser(1, userId);
                toast(`Перенесено: ${res.migrated}`, 'good');
                tasks = await apiGetTasks();
              } catch (e) {
                toast('Не удалось перенести (проверь сервер)', 'warn');
                console.error(e);
              }
            }
          }
        }
      }

      localStorage.setItem(`tasks_cache_${getEffectiveUserKey()}`, JSON.stringify(tasks));
      if (el.subtitle) el.subtitle.textContent = 'Онлайн • синхронизировано';
    } catch (e) {
      const cached = localStorage.getItem(`tasks_cache_${getEffectiveUserKey()}`);
      tasks = cached ? JSON.parse(cached) : [];
      if (el.subtitle) el.subtitle.textContent = 'Оффлайн • показан кэш';
      toast('Нет связи с сервером', 'warn');
      console.error(e);
    }
    renderTasks();
    if (el.screenCalendar.classList.contains('show')) {
      renderCalendar();
      renderDayList();
    }
  }

  // ---------- Events ----------

  function bind() {
    // task filters
    document.querySelectorAll('#filtersTasks button[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#filtersTasks button[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filter = btn.dataset.filter;
        renderTasks();
      });
    });

    // bottom nav screens
    document.querySelectorAll('.bottomNav .navBtn[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.screen;
        if (s === 'overdue') {
          showScreen('tasks','overdue');
          filter = 'overdue';
          document.querySelectorAll('#filtersTasks button[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter==='overdue'));
          renderTasks();
          return;
        }
        showScreen(s);
      });
    });

    // search
    el.searchInput.addEventListener('input', () => { search = el.searchInput.value; renderTasks(); });
    el.clearSearch.addEventListener('click', () => { el.searchInput.value=''; search=''; renderTasks(); });

    // top buttons
    el.syncBtn.addEventListener('click', () => refresh());
    el.addBtn.addEventListener('click', () => openModal());
    el.fab.addEventListener('click', () => openModal());

    // calendar nav
    if (el.calToday) el.calToday.addEventListener('click', () => {
      const now = new Date();
      selectedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      renderCalendar();
      renderSelectedDay();
    });

    el.calPrev.addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()-1, 1); renderCalendar(); });
    el.calNext.addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 1); renderCalendar(); });
    el.dayAddBtn.addEventListener('click', () => openModal(null, new Date(selectedDay)));

    // export
    el.exportBtn.addEventListener('click', async () => {
      try {
        const data = JSON.stringify(tasks, null, 2);
        await navigator.clipboard.writeText(data);
        toast('Экспорт: JSON в буфер', 'good');
      } catch { toast('Не удалось скопировать', 'warn'); }
    });

    // menu actions
    el.mSync.addEventListener('click', () => refresh());
    el.mExport.addEventListener('click', () => el.exportBtn.click());
    el.mClearDone.addEventListener('click', clearDone);

    // menu settings
    el.defaultReminder.value = settings.defaultReminder;
    el.overdueHighlight.value = settings.overdueHighlight;

    el.defaultReminder.addEventListener('change', () => {
      settings.defaultReminder = el.defaultReminder.value;
      localStorage.setItem('defaultReminder', settings.defaultReminder);
      toast('Сохранено', 'good');
    });
    el.overdueHighlight.addEventListener('change', () => {
      settings.overdueHighlight = el.overdueHighlight.value;
      localStorage.setItem('overdueHighlight', settings.overdueHighlight);
      toast('Сохранено', 'good');
      renderTasks();
      if (el.screenCalendar.classList.contains('show')) { renderCalendar(); renderDayList(); }
    });

    // timezone selector
    if (el.tzSelect) {
      const opt = [];
      const dev = deviceOffsetMinutes();
      const devH = (dev/60);
      opt.push({ v:'auto', t:`Авто (по телефону, UTC${devH>=0?'+':''}${devH})` });
      for (let h=-12; h<=14; h++) opt.push({ v:`fixed:${h}`, t:`UTC${h>=0?'+':''}${h}` });
      el.tzSelect.innerHTML = opt.map(o => `<option value="${o.v}">${o.t}</option>`).join('');
      el.tzSelect.value = settings.timezone;

      el.tzSelect.addEventListener('change', () => {
        settings.timezone = el.tzSelect.value;
        localStorage.setItem('timezone', settings.timezone);
        toast('Часовой пояс сохранён', 'good');
        // re-render everything in new timezone
        renderTasks();
        if (el.screenCalendar.classList.contains('show')) { renderCalendar(); renderDayList(); }
      });
    }

    // modal
    el.backdrop.addEventListener('click', closeModal);
    el.closeModal.addEventListener('click', closeModal);
    el.saveBtn.addEventListener('click', saveModal);
    el.deleteBtn.addEventListener('click', deleteModal);

    // card actions (delegation) - tasks & day
    function onCardsClick(ev) {
      const btn = ev.target.closest('button[data-action]');
      if (!btn) return;
      const card = ev.target.closest('.card');
      if (!card) return;
      const id = Number(card.dataset.id);
      const t = tasks.find(x => x.id === id);
      const action = btn.dataset.action;
      // close swipe after action
      card.classList.remove('open');
      try{ tg?.HapticFeedback?.impactOccurred('light'); }catch{};

      (async () => {
        try {
          if (action === 'edit') { openModal(t); return; }
          if (action === 'delete') {
            if (!confirm('Удалить задачу?')) return;
            await apiDelete(id);
            toast('Удалено', 'good');
            await refresh(true);
            return;
          }
          if (action === 'toggle') {
            await apiToggle(id, !t.completed);
            toast(!t.completed ? 'Отмечено готово' : 'Возвращено', 'good');
            await refresh(true);
            return;
          }
          if (action === 'snooze') {
            await apiSnooze15(id);
            toast('Отложено на 15 минут', 'good');
            await refresh(true);
            return;
          }
        } catch (e) {
          toast('Ошибка действия', 'bad');
          console.error(e);
        }
      })();
    }
    // premium interactions
    enableSwipe(el.cards);
    enableSwipe(el.dayCards);
    initDayPanelSheet();

    el.cards.addEventListener('click', onCardsClick);
    el.dayCards.addEventListener('click', onCardsClick);
  }

  
  

  // ---------- Swipe actions (mobile friendly) ----------
  function enableSwipe(container){
    if (!container) return;

    let activeCard = null;

    function closeActive(){
      if (activeCard) activeCard.classList.remove('open');
      activeCard = null;
    }

    // close when tapping outside card buttons
    document.addEventListener('pointerdown', (e) => {
      if (!activeCard) return;
      if (!container.contains(e.target)) { closeActive(); return; }
      const card = e.target.closest('.card.swipe');
      if (!card) { closeActive(); return; }
      if (card !== activeCard && !e.target.closest('button')) closeActive();
    }, { passive:true });

    container.addEventListener('pointerdown', (ev) => {
      const card = ev.target.closest('.card.swipe');
      if (!card) return;
      if (ev.target.closest('button')) return;

      const body = card.querySelector('.cardBody');
      if (!body) return;

      if (activeCard && activeCard !== card) closeActive();

      let startX = ev.clientX;
      let startY = ev.clientY;
      let dragging = false;

      const openX = -190;

      const onMove = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!dragging) {
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) dragging = true;
          else return;
        }

        let x = dx;
        if (card.classList.contains('open')) x = openX + dx; // from open position

        x = Math.min(0, Math.max(openX, x));
        body.style.transition = 'none';
        body.style.transform = `translateX(${x}px)`;
      };

      const onUp = () => {
        container.removeEventListener('pointermove', onMove);
        container.removeEventListener('pointerup', onUp);
        container.removeEventListener('pointercancel', onUp);

        body.style.transition = '';
        const m = body.style.transform.match(/-?\d+/);
        const current = m ? Number(m[0]) : 0;
        body.style.transform = '';

        const shouldOpen = current < (openX/2);
        if (shouldOpen) {
          card.classList.add('open');
          activeCard = card;
        } else {
          card.classList.remove('open');
          if (activeCard === card) activeCard = null;
        }
      };

      container.addEventListener('pointermove', onMove);
      container.addEventListener('pointerup', onUp);
      container.addEventListener('pointercancel', onUp);
    });

    // clicking on a revealed area closes
    container.addEventListener('click', (e) => {
      const card = e.target.closest('.card.swipe');
      if (!card) return;
      if (!e.target.closest('button') && card.classList.contains('open')) {
        // tap on card body while open closes
        card.classList.remove('open');
        if (activeCard === card) activeCard = null;
      }
    });
  }

// --- Drag & drop in calendar (touch-friendly) ---
  function enableCalendarDrag(){
    const ghost = document.createElement('div');
    ghost.className = 'dragGhost card';
    ghost.style.display = 'none';
    document.body.appendChild(ghost);

    let dragId = null;
    let dragging = false;
    let startTimer = null;

    function clearTargets(){
      document.querySelectorAll('.calDay.dropTarget').forEach(d => d.classList.remove('dropTarget'));
    }

    function getDayCellFromPoint(x,y){
      const elAt = document.elementFromPoint(x,y);
      return elAt ? elAt.closest('.calDay') : null;
    }

    function showGhostFromCard(card, x, y){
      ghost.innerHTML = card.innerHTML;
      ghost.style.display = 'block';
      ghost.style.transform = `translate(${Math.max(8, x-ghost.offsetWidth/2)}px, ${Math.max(8, y-40)}px)`;
    }
    function moveGhost(x,y){
      ghost.style.transform = `translate(${Math.max(8, x-ghost.offsetWidth/2)}px, ${Math.max(8, y-40)}px)`;
    }
    function hideGhost(){
      ghost.style.display = 'none';
      ghost.style.transform = 'translate(-9999px,-9999px)';
      ghost.innerHTML = '';
    }

    async function dropToDay(taskId, dayKeyStr){
      const t = tasks.find(x => x.id === taskId);
      if (!t) return;
      let time = "23:59";
      if (t.due_at) time = timeStrFromUtcIso(t.due_at);
      const due_at = isoUtcNoZFromInputs(dayKeyStr, time);
      try{
        await apiUpdate(taskId, { due_at, tz_offset_minutes: tzOffsetMinutes() });
        toast('Перенесено', 'good');
        await refresh(true);
      }catch(e){
        toast('Не удалось перенести', 'bad');
        console.error(e);
      }
    }

    function attachTo(container){
      let downX = 0;
      let downY = 0;
      container.addEventListener('pointerdown', (ev) => {
        const card = ev.target.closest('.card');
        if (!card) return;
        if (ev.target.closest('button')) return;
        const id = Number(card.dataset.id);
        if (!id) return;

        downX = ev.clientX;
        downY = ev.clientY;

        startTimer = setTimeout(() => {
          dragging = true;
          dragId = id;
          card.classList.add('dragging');
          showGhostFromCard(card, ev.clientX, ev.clientY);
          try{ card.setPointerCapture(ev.pointerId); }catch{}
        }, 220);
      });

      container.addEventListener('pointermove', (ev) => {
        if (startTimer) {
          const dx0 = ev.clientX - downX;
          const dy0 = ev.clientY - downY;
          if (Math.abs(dx0) > 12 || Math.abs(dy0) > 12) { clearTimeout(startTimer); startTimer = null; }
        }
        if (!dragging) return;
        moveGhost(ev.clientX, ev.clientY);
        clearTargets();
        const cell = getDayCellFromPoint(ev.clientX, ev.clientY);
        if (cell) cell.classList.add('dropTarget');
      });

      container.addEventListener('pointerup', async (ev) => {
        if (startTimer){ clearTimeout(startTimer); startTimer = null; }
        if (!dragging) return;

        const card = container.querySelector(`.card[data-id="${dragId}"]`);
        const cell = getDayCellFromPoint(ev.clientX, ev.clientY);

        dragging = false;
        clearTargets();
        hideGhost();
        if (card) card.classList.remove('dragging');

        if (cell && cell.dataset.date){
          await dropToDay(dragId, cell.dataset.date);
        }
        dragId = null;
      });

      container.addEventListener('pointercancel', () => {
        if (startTimer){ clearTimeout(startTimer); startTimer = null; }
        dragging = false; dragId = null;
        clearTargets(); hideGhost();
        container.querySelectorAll('.card.dragging').forEach(c=>c.classList.remove('dragging'));
      });
    }

    if (el.dayCards) attachTo(el.dayCards);
  }


  // ---------- Telegram init ----------
  function initTelegram() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/i.test(ua) || (tg && tg.platform === 'ios');
    document.body.classList.toggle('isIOS', !!isIOS);
    // identity key for local caches
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
      userId = tg.initDataUnsafe.user.id;
      authKey = 'tg_' + String(userId);
    } else {
      authKey = 'dev_' + getClientId();
    }

    setVh();
    window.addEventListener('resize', setVh);
    tg?.onEvent?.('viewportChanged', setVh);

    if (tg) {
      tg.expand();
      const user = tg.initDataUnsafe?.user;
      if (user?.id) userId = user.id;

      const hour = new Date().getHours();
      let g = 'Привет';
      if (hour >= 5 && hour < 12) g = 'Доброе утро';
      else if (hour >= 12 && hour < 18) g = 'Добрый день';
      else if (hour >= 18 && hour < 23) g = 'Добрый вечер';

      if (el.subtitle) el.subtitle.textContent = `${g}, ${user?.first_name || 'друг'}!`;
    } else {
      if (el.subtitle) el.subtitle.textContent = 'Режим браузера';
    }

    calMonth = new Date(); calMonth.setDate(1);
    selectedDay = new Date();
  }

  async function boot(){
    initTelegram();
    applyTheme(_themeMode);
    bindThemeUI();
    try{
      const me = await apiMe();
      const fullName = [me.first_name, me.last_name].filter(Boolean).join(' ') || 'Пользователь';
      if (el.menuUserName) el.menuUserName.textContent = fullName;
      if (el.menuUserHandle) el.menuUserHandle.textContent = me.username ? '@' + me.username : (me.mode === 'telegram' ? 'Telegram' : 'Браузер');
      if (el.menuAvatar) {
        const initials = (me.first_name||'').slice(0,1) + (me.last_name||'').slice(0,1);
        el.menuAvatar.textContent = (initials || 'TF').toUpperCase();

      // Prefer Telegram nickname when available (even in browser mode)
      try{
        const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
        if (u){
          const tFull = [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@'+u.username : 'Пользователь');
          if (el.menuUserName) el.menuUserName.textContent = tFull;
          if (el.menuUserHandle) el.menuUserHandle.textContent = u.username ? '@' + u.username : 'Telegram';
          if (el.menuAvatar){
            const initials = ((u.first_name||'').slice(0,1) + (u.last_name||'').slice(0,1)) || (u.username||'').slice(0,2) || 'TF';
            el.menuAvatar.textContent = String(initials).toUpperCase();
          }
        }
      }catch(_){/* ignore */}

      }
    }catch(e){
      // telegram fallback user
      try{
        const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
        if (u){
          const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@'+u.username : 'Пользователь');
          if (el.menuUserName) el.menuUserName.textContent = fullName;
          if (el.menuUserHandle) el.menuUserHandle.textContent = u.username ? '@' + u.username : 'Telegram';
          if (el.menuAvatar){
            const initials = ((u.first_name||'').slice(0,1) + (u.last_name||'').slice(0,1)) || (u.username||'').slice(0,2) || 'TF';
            el.menuAvatar.textContent = String(initials).toUpperCase();
          }
        }
      }catch(_){ /* ignore */ }
    }
    bind();
    showScreen('tasks');
    await refresh(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // Script injected after DOMContentLoaded (Telegram WebView cache-busting loader)
    boot();
  }
})();

  // ---------- Day panel bottom sheet ----------
  function initDayPanelSheet(){
    if (!el.dayPanel) return;

    const key = authKey + ':dayPanelCollapsed';
    let collapsed = localStorage.getItem(key) === '1';

    function apply(){
      el.dayPanel.classList.toggle('collapsed', collapsed);
      if (el.dayCollapse) el.dayCollapse.textContent = collapsed ? '▴' : '▾';
    }
    function setCollapsed(v){
      collapsed = !!v;
      localStorage.setItem(key, collapsed ? '1' : '0');
      apply();
    }
    function toggle(){
      setCollapsed(!collapsed);
      try{ tg?.HapticFeedback?.impactOccurred('light'); }catch{}
    }

    if (el.dayCollapse) el.dayCollapse.addEventListener('click', toggle);
    if (el.dayHandle) el.dayHandle.addEventListener('click', toggle);

    // drag handle up/down
    let startY = 0;
    let moved = 0;
    let dragging = false;

    const onDown = (ev) => {
      if (!ev.isPrimary) return;
      startY = ev.clientY;
      moved = 0;
      dragging = true;
      el.dayPanel.style.transition = 'none';
      try{ el.dayHandle?.setPointerCapture(ev.pointerId); }catch{}
    };
    const onMove = (ev) => {
      if (!dragging) return;
      moved = ev.clientY - startY;
      const t = Math.max(-60, Math.min(160, moved));
      el.dayPanel.style.transform = `translateY(${t}px)`;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      el.dayPanel.style.transition = '';
      el.dayPanel.style.transform = '';
      if (moved > 40) setCollapsed(true);
      if (moved < -40) setCollapsed(false);
    };

    el.dayHandle?.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    apply();
  }



