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
    dayTitle: document.getElementById('dayTitle'),
    dayHint: document.getElementById('dayHint'),
    dayCards: document.getElementById('dayCards'),
    dayEmpty: document.getElementById('dayEmpty'),
    dayAddBtn: document.getElementById('dayAddBtn'),

    // menu UI
    mSync: document.getElementById('mSync'),
    mExport: document.getElementById('mExport'),
    mClearDone: document.getElementById('mClearDone'),
    defaultReminder: document.getElementById('defaultReminder'),
    overdueHighlight: document.getElementById('overdueHighlight'),
    tzSelect: document.getElementById('tzSelect'),

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
    fRepeat: document.getElementById('fRepeat'),
    fRepeatUntil: document.getElementById('fRepeatUntil'),
    weekdays: document.getElementById('weekdays'),
  };

  let userId = 1;
  let authKey = 'u1';
  function getEffectiveUserKey(){
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) return String(tg.initDataUnsafe.user.id);
    return getClientId();
  }

  let tasks = [];
  let filter = 'active';
  let editingId = null;
  let search = '';

  // calendar state
  let calMonth = new Date(); calMonth.setDate(1);
  let selectedDay = new Date();
  let repeatWeekdays = new Set([0]);

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
  function showScreen(name) {
    el.screenTasks.classList.toggle('show', name==='tasks');
    el.screenCalendar.classList.toggle('show', name==='calendar');
    el.screenMenu.classList.toggle('show', name==='menu');

    document.querySelectorAll('.bottomNav .navBtn[data-screen]').forEach(b => {
      b.classList.toggle('active', b.dataset.screen===name);
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
    const map = { active:'Активные', today:'Сегодня', overdue:'Просрочено', upcoming:'Скоро', done:'Готово' };
    el.listTitle.textContent = map[filter] || 'Задачи';
  }

  function cardHTML(t) {
    const overdue = isOverdue(t);
    const dueTag = t.due_at
      ? (overdue
          ? `<span class="tag bad">Просрочено • ${escapeHtml(fmtDue(t.due_at))}</span>`
          : `<span class="tag accent">${escapeHtml(fmtDue(t.due_at))}</span>`)
      : `<span class="tag">Без срока</span>`;
    const pr = (t.priority || 'medium');
    const prTag = pr === 'high' ? `<span class="tag bad">Высокий</span>` : (pr === 'low' ? `<span class="tag good">Низкий</span>` : `<span class="tag">Средний</span>`);
    const remTag = (t.reminder_enabled === false) ? `<span class="tag">Напом. выкл</span>` : `<span class="tag good">Напом. вкл</span>`;
    const doneTag = t.completed ? `<span class="tag good">Готово</span>` : '';
    return `
      <div class="card" data-id="${t.id}">
        <div class="cardTop">
          <div>
            <div class="cardTitle">${escapeHtml(t.title)}</div>
            ${t.description ? `<div class="cardDesc">${escapeHtml(t.description)}</div>` : ''}
          </div>
        </div>
        <div class="tags">
          ${dueTag}
          ${prTag}
          ${remTag}
          ${doneTag}
        </div>
        <div class="cardActions">
          <button class="smallBtn ${t.completed ? 'ghost' : 'good'}" data-action="toggle">${t.completed ? 'Вернуть' : 'Готово'}</button>
          <button class="smallBtn ghost" data-action="edit">Редакт.</button>
          <button class="smallBtn bad" data-action="delete">Удалить</button>
        </div>
        ${(!t.completed && t.due_at) ? `<div class="cardActions" style="margin-top:8px">
          <button class="smallBtn ghost" data-action="snooze">Отложить +15 мин</button>
        </div>` : ''}
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
    if (el.fRepeat) el.fRepeat.value = 'none';
    if (el.fRepeatUntil) el.fRepeatUntil.value = '';
    repeatWeekdays = new Set([0]);
    if (el.weekdays) { el.weekdays.style.display='none'; el.weekdays.querySelectorAll('.wd').forEach(b=>b.classList.remove('active')); }

    el.modalTitle.textContent = task ? 'Редактирование' : 'Новая задача';
    el.deleteBtn.style.display = task ? 'inline-flex' : 'none';

    el.fTitle.value = task?.title || '';
    el.fDesc.value = task?.description || '';
    el.fPriority.value = task?.priority || 'medium';

    const rem = (task ? (task.reminder_enabled !== false) : (settings.defaultReminder === 'on'));
    el.fReminder.value = rem ? 'on' : 'off';

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
    if (el.fRepeat && el.fRepeat.value !== 'none' && !el.fRepeatUntil.value) {
      toast('Введите дату окончания повтора', 'warn');
      return;
    }


    const due_at = isoUtcNoZFromInputs(el.fDate.value, el.fTime.value);
        const tzOff = tzOffsetMinutes();
    let recurrence = null;
    let recurrence_until = null;
    if (el.fRepeat && el.fRepeat.value !== 'none') {
      recurrence_until = el.fRepeatUntil.value || null;
      const freq = el.fRepeat.value === 'custom' ? 'weekly' : el.fRepeat.value;
      recurrence = { freq, interval: 1 };
      if (el.fRepeat.value === 'custom') {
        recurrence.byweekday = Array.from(repeatWeekdays).sort((a,b)=>a-b);
      }
    }

    const payload = {
      title,
      description,
      priority: el.fPriority.value,
      due_at,
      reminder_enabled: (el.fReminder.value !== 'off'),
      tz_offset_minutes: tzOff,
      recurrence,
      recurrence_until
    };

    try {
      if (!editingId) {
        const res = await apiCreate(payload);
        if (res.createdCount && res.createdCount > 1) toast(`Создано ${res.createdCount} задач`, 'good');
        else toast('Задача добавлена', 'good');
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
      // repeat UI
    function bindRepeatUI(){
      if (!el.fRepeat) return;
      const updateVisibility = () => {
        const v = el.fRepeat.value;
        if (el.weekdays) el.weekdays.style.display = (v === 'custom') ? 'flex' : 'none';
      };
      el.fRepeat.addEventListener('change', updateVisibility);
      updateVisibility();
      if (el.weekdays) {
        el.weekdays.querySelectorAll('.wd').forEach(btn => {
          btn.addEventListener('click', () => {
            const wd = Number(btn.dataset.wd);
            if (repeatWeekdays.has(wd)) repeatWeekdays.delete(wd);
            else repeatWeekdays.add(wd);
            btn.classList.toggle('active', repeatWeekdays.has(wd));
          });
        });
      }
    }

  function bind() {
    // task filters
    document.querySelectorAll('#filtersTasks .seg').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#filtersTasks .seg').forEach(b => b.classList.remove('active'));
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
          showScreen('tasks');
          filter = 'overdue';
          document.querySelectorAll('#filtersTasks .seg').forEach(b => b.classList.toggle('active', b.dataset.filter==='overdue'));
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
    el.cards.addEventListener('click', onCardsClick);
    el.dayCards.addEventListener('click', onCardsClick);
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
      container.addEventListener('pointerdown', (ev) => {
        const card = ev.target.closest('.card');
        if (!card) return;
        if (ev.target.closest('button')) return;
        const id = Number(card.dataset.id);
        if (!id) return;

        startTimer = setTimeout(() => {
          dragging = true;
          dragId = id;
          card.classList.add('dragging');
          showGhostFromCard(card, ev.clientX, ev.clientY);
          try{ card.setPointerCapture(ev.pointerId); }catch{}
        }, 220);
      });

      container.addEventListener('pointermove', (ev) => {
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
    try{
      const me = await apiMe();
      const fullName = [me.first_name, me.last_name].filter(Boolean).join(' ') || 'Пользователь';
      if (el.menuUserName) el.menuUserName.textContent = fullName;
      if (el.menuUserHandle) el.menuUserHandle.textContent = me.username ? '@' + me.username : (me.mode === 'telegram' ? 'Telegram' : 'Браузер');
      if (el.menuAvatar) {
        const initials = (me.first_name||'').slice(0,1) + (me.last_name||'').slice(0,1);
        el.menuAvatar.textContent = (initials || 'TF').toUpperCase();
      }
    }catch(e){ /* ignore */ }
    bind();
    bindRepeatUI();
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
