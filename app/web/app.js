(() => {
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  const API = window.location.origin;

  const el = {
    subtitle: document.getElementById('subtitle'),

    // screens
    screenTasks: document.getElementById('screenTasks'),
    screenCalendar: document.getElementById('screenCalendar'),
    screenMenu: document.getElementById('screenMenu'),
    bottomNav: document.querySelector('.bottomNav'),

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
  let tasks = [];
  let filter = 'active';
  let editingId = null;
  let search = '';

  // calendar state
  let calMonth = new Date(); // visible month
  calMonth.setDate(1);
  let selectedDay = new Date(); // selected date

  // settings
  const settings = {
    defaultReminder: localStorage.getItem('defaultReminder') || 'on',
    overdueHighlight: localStorage.getItem('overdueHighlight') || 'on',
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

  function fmtDue(due_at) {
    if (!due_at) return 'Без срока';
    const d = new Date(due_at);
    const date = d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' });
    const time = d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
    return `${date} ${time}`;
  }

  function dayKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth()+1).padStart(2,'0');
    const d = String(dateObj.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function taskDayKey(t) {
    if (!t.due_at) return null;
    const d = new Date(t.due_at); // local
    return dayKey(d);
  }

  function isOverdue(t) {
    if (settings.overdueHighlight !== 'on') return false;
    return !!(t.due_at && !t.completed && (new Date(t.due_at) < new Date()));
  }

  function isToday(t) {
    if (!t.due_at || t.completed) return false;
    const d = new Date(t.due_at);
    const now = new Date();
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
  }

  function isUpcoming(t) {
    if (!t.due_at || t.completed) return false;
    const d = new Date(t.due_at);
    const now = new Date();
    const in48 = new Date(now.getTime() + 48*60*60*1000);
    return d > now && d <= in48;
  }

  function isoFromInputs(dateStr, timeStr) {
    if (!dateStr) return null;
    const base = timeStr ? `${dateStr}T${timeStr}` : `${dateStr}T23:59`;
    const dt = new Date(base);
    return dt.toISOString();
  }

  // ---------- API ----------
  async function apiGetTasks() {
    const r = await fetch(`${API}/api/tasks/${userId}`);
    if (!r.ok) throw new Error('get tasks failed');
    return await r.json();
  }
  async function apiCreate(payload) {
    const r = await fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('create failed');
    return await r.json();
  }
  async function apiUpdate(id, payload) {
    const r = await fetch(`${API}/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('update failed');
    return await r.json();
  }
  async function apiDelete(id) {
    const r = await fetch(`${API}/api/tasks/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('delete failed');
    return await r.json();
  }
  async function apiToggle(id, done) {
    const ep = done ? 'done' : 'undone';
    const r = await fetch(`${API}/api/tasks/${id}/${ep}`, { method: 'POST' });
    if (!r.ok) throw new Error('toggle failed');
    return await r.json();
  }
  async function apiSnooze15(id) {
    const r = await fetch(`${API}/api/tasks/${id}/snooze15`, { method: 'POST' });
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

  // ---------- Calendar view (LeaderTask-like) ----------
  function monthTitle(d) {
    return d.toLocaleDateString('ru-RU', { month:'long', year:'numeric' }).replace(/^./, c => c.toUpperCase());
  }

  function buildDayStats() {
    // map dayKey -> { total, overdue, done }
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

    // Monday-based week: JS getDay() 0=Sun
    const startDay = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon
    const daysInMonth = new Date(year, month+1, 0).getDate();

    // previous month days to show
    const prevDays = startDay;
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];
    // prev month tail
    for (let i=prevDays; i>0; i--) {
      const dayNum = prevMonthDays - i + 1;
      const d = new Date(year, month-1, dayNum);
      cells.push({ date:d, inMonth:false });
    }
    // current month
    for (let day=1; day<=daysInMonth; day++) {
      const d = new Date(year, month, day);
      cells.push({ date:d, inMonth:true });
    }
    // next month head until full 6 weeks (42)
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length-1].date;
      const d = new Date(last);
      d.setDate(d.getDate()+1);
      cells.push({ date:d, inMonth:false });
    }
    if (cells.length < 42) {
      while (cells.length < 42) {
        const last = cells[cells.length-1].date;
        const d = new Date(last);
        d.setDate(d.getDate()+1);
        cells.push({ date:d, inMonth:false });
      }
    }

    const todayKey = dayKey(new Date());
    const selKey = dayKey(selectedDay);

    el.calGrid.innerHTML = cells.map(c => {
      const k = dayKey(c.date);
      const s = stats.get(k);
      const dots = [];
      if (s) {
        // LeaderTask-like: dots показывают состояние
        // overdue (красный), active (оранжевый), done (зелёный)
        if (s.overdue > 0) dots.push('<span class="dot bad"></span>');
        const activeCount = s.total - s.done;
        if (activeCount > 0) dots.push('<span class="dot accent"></span>');
        if (s.done > 0) dots.push('<span class="dot good"></span>');
      }
      const cls = [
        'calDay',
        c.inMonth ? '' : 'muted',
        k === todayKey ? 'today' : '',
        k === selKey ? 'selected' : ''
      ].filter(Boolean).join(' ');
      return `
        <div class="${cls}" data-date="${k}">
          <div class="calNum">${c.date.getDate()}</div>
          <div class="calDots">${dots.slice(0,3).join('')}</div>
        </div>
      `;
    }).join('');

    // click handler
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
    const k = dayKey(selectedDay);
    return tasks
      .filter(t => taskDayKey(t) === k)
      .sort((a,b) => {
        const ad = a.due_at ? new Date(a.due_at).getTime() : 0;
        const bd = b.due_at ? new Date(b.due_at).getTime() : 0;
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
    el.fPriority.value = task?.priority || 'medium';

    // reminder default from settings (new tasks)
    const rem = (task ? (task.reminder_enabled !== false) : (settings.defaultReminder === 'on'));
    el.fReminder.value = rem ? 'on' : 'off';

    const dateToUse = presetDate || (task?.due_at ? new Date(task.due_at) : null);

    if (dateToUse) {
      el.fDate.value = dateToUse.toISOString().slice(0,10);
      el.fTime.value = task?.due_at ? new Date(task.due_at).toTimeString().slice(0,5) : '';
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

    const due_at = isoFromInputs(el.fDate.value, el.fTime.value);
    const payload = {
      title,
      description,
      priority: el.fPriority.value,
      due_at,
      reminder_enabled: (el.fReminder.value !== 'off')
    };

    try {
      if (!editingId) {
        await apiCreate({ user_id: userId, ...payload });
        toast('Задача добавлена', 'good');
      } else {
        await apiUpdate(editingId, payload);
        toast('Сохранено', 'good');
      }
      closeModal();
      await refresh(true);
    } catch (e) {
      toast('Ошибка сохранения', 'bad');
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
      localStorage.setItem('tasks_cache', JSON.stringify(tasks));
      if (el.subtitle) el.subtitle.textContent = 'Онлайн • синхронизировано';
    } catch (e) {
      const cached = localStorage.getItem('tasks_cache');
      tasks = cached ? JSON.parse(cached) : [];
      if (el.subtitle) el.subtitle.textContent = 'Оффлайн • показан кэш';
      toast('Нет связи с сервером', 'warn');
      console.error(e);
    }
    renderTasks();
    // calendar reacts too
    if (el.screenCalendar.classList.contains('show')) {
      renderCalendar();
      renderDayList();
    }
  }

  // ---------- Events ----------
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
          // shortcut to overdue filter on tasks
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
      if (el.screenCalendar.classList.contains('show')) {
        renderCalendar();
        renderDayList();
      }
    });

    // modal
    el.backdrop.addEventListener('click', closeModal);
    el.closeModal.addEventListener('click', closeModal);
    el.saveBtn.addEventListener('click', saveModal);
    el.deleteBtn.addEventListener('click', deleteModal);

    // card actions (delegation) - shared for tasks and day list
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

  // ---------- Telegram init ----------
  function initTelegram() {
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

    // init calendar month to current month
    calMonth = new Date();
    calMonth.setDate(1);
    selectedDay = new Date();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initTelegram();
    bind();
    showScreen('tasks');
    await refresh(true);
  });
})();
