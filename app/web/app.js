/* TaskFlow — TickTick iOS inspired (Telegram Mini App) */
/* Build: 1770550367 */

(() => {
  'use strict';

  const TG = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // ---- Elements ----
  const el = (id) => document.getElementById(id);
  const app = el('app');

  const userSubtitle = el('userSubtitle');
  const menuUserName = el('menuUserName');

  const syncBtn = el('syncBtn');
  const topAddBtn = el('topAddBtn');

  const seg = el('topSeg');
  const segThumb = el('segThumb');

  const screenTasks = el('screenTasks');
  const screenCalendar = el('screenCalendar');
  const screenOverdue = el('screenOverdue');
  const screenMenu = el('screenMenu');

  const bottomNav = el('bottomNav');
  const navAddBtn = el('navAddBtn');
  const fabAdd = el('fabAdd');

  const searchInput = el('searchInput');
  const clearSearch = el('clearSearch');
  const exportBtn = el('exportBtn');

  const smartChips = el('smartChips');
  const taskList = el('taskList');
  const emptyState = el('emptyState');
  const listTitle = el('listTitle');
  const taskCount = el('taskCount');

  const overdueList = el('overdueList');
  const overdueEmpty = el('overdueEmpty');
  const overdueCount = el('overdueCount');

  const calTitle = el('calTitle');
  const calPrev = el('calPrev');
  const calNext = el('calNext');
  const calGrid = el('calGrid');

  const daySheet = el('daySheet');
  const dayTitle = el('dayTitle');
  const dayTaskList = el('dayTaskList');
  const dayEmpty = el('dayEmpty');
  const addTaskForDayBtn = el('addTaskForDayBtn');

  const menuSync = el('menuSync');
  const menuExport = el('menuExport');
  const menuClearDone = el('menuClearDone');
  const themeSelect = el('themeSelect');
  const tzSelect = el('tzSelect');

  const modalOverlay = el('taskModalOverlay');
  const closeTaskModal = el('closeTaskModal');
  const taskModalTitle = el('taskModalTitle');
  const taskTitleInput = el('taskTitleInput');
  const taskDescInput = el('taskDescInput');
  const taskDateInput = el('taskDateInput');
  const taskTimeInput = el('taskTimeInput');
  const taskPrioritySelect = el('taskPrioritySelect');
  const taskRemindSelect = el('taskRemindSelect');
  const saveTaskBtn = el('saveTaskBtn');

  const toast = el('toast');

  // ---- State ----
  const LS = {
    theme: 'tf_theme',
    tz: 'tf_tz',
  };

  let state = {
    user: null,
    screen: 'tasks',            // tasks | calendar | overdue | menu
    seg: 'inbox',               // inbox | today | calendar
    filter: 'inbox',            // inbox | today | upcoming | overdue | done
    search: '',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    tasks: [],
    selectedDayISO: null,       // YYYY-MM-DD
    calCursor: new Date(),      // month cursor
    editingTaskId: null,
    addingForDayISO: null,
  };

  // ---- Utilities ----
  function isTelegram() {
    return !!TG;
  }

  function haptic(type='impact', style='light') {
    try {
      if (!TG || !TG.HapticFeedback) return;
      if (type === 'impact') TG.HapticFeedback.impactOccurred(style);
      if (type === 'notification') TG.HapticFeedback.notificationOccurred(style);
      if (type === 'selection') TG.HapticFeedback.selectionChanged();
    } catch (_) {}
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
  }

  function parseISODate(iso) {
    // iso = YYYY-MM-DD
    const [y,m,dd] = iso.split('-').map(Number);
    return new Date(y, m-1, dd);
  }

  function fmtDayTitle(iso) {
    const d = parseISODate(iso);
    try {
      return d.toLocaleDateString('ru-RU', { weekday:'long', day:'numeric', month:'long' });
    } catch {
      return iso;
    }
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x;
  }

  function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23,59,59,999);
    return x;
  }

  function nowInTZ() {
    // For filtering logic we can compare by local dates rendered in user's TZ.
    // We'll convert task's due_at (UTC ISO) -> date in selected TZ using Intl.
    return new Date();
  }

  function toZonedParts(dateObj, timeZone) {
    const fmt = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute:'2-digit', hour12:false,
    });
    const parts = fmt.formatToParts(dateObj);
    const get = (t) => parts.find(p=>p.type===t)?.value || '';
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      hour: Number(get('hour')),
      minute: Number(get('minute')),
    };
  }

  function taskDueISO(task) {
    return task.due_at || task.dueAt || task.deadline || null;
  }

  function taskDone(task) {
    return !!(task.is_done ?? task.done ?? task.completed);
  }

  function taskTitle(task) {
    return task.title || task.name || '';
  }

  function taskDesc(task) {
    return task.description || task.desc || '';
  }

  function taskPriority(task) {
    return task.priority || task.prio || 'medium';
  }

  function taskRemind(task) {
    return !!(task.remind ?? task.reminder ?? task.remind_enabled);
  }

  function isOverdue(task) {
    const due = taskDueISO(task);
    if (!due) return false;
    if (taskDone(task)) return false;
    const dueDate = new Date(due);
    return dueDate.getTime() < Date.now();
  }

  function sameZonedDate(d1, d2, tz) {
    const p1 = toZonedParts(d1, tz);
    const p2 = toZonedParts(d2, tz);
    return p1.year===p2.year && p1.month===p2.month && p1.day===p2.day;
  }

  function zonedISODateFromUTC(utcISO, tz) {
    const d = new Date(utcISO);
    const p = toZonedParts(d, tz);
    return p.year + '-' + pad2(p.month) + '-' + pad2(p.day);
  }

  function fmtZonedTime(utcISO, tz) {
    const d = new Date(utcISO);
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    } catch {
      return '';
    }
  }

  function setTheme(theme) {
    // theme: auto|light|dark
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const applied = (theme === 'auto') ? (sysDark ? 'dark' : 'light') : theme;
    document.documentElement.setAttribute('data-theme', applied);

    // theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', applied === 'dark' ? '#0B0F17' : '#F3F6FF');

    // Telegram colors
    if (TG) {
      try {
        TG.setHeaderColor(applied === 'dark' ? '#0B0F17' : '#F3F6FF');
        TG.setBackgroundColor(applied === 'dark' ? '#0B0F17' : '#F3F6FF');
      } catch (_) {}
    }
  }

  function loadPrefs() {
    const t = localStorage.getItem(LS.theme) || 'auto';
    themeSelect.value = t;
    setTheme(t);

    const tz = localStorage.getItem(LS.tz);
    if (tz) state.tz = tz;
  }

  function savePrefs() {
    localStorage.setItem(LS.theme, themeSelect.value);
    localStorage.setItem(LS.tz, state.tz);
  }

  function setupTelegram() {
    if (!TG) return;

    document.documentElement.classList.add('tg');

    try {
      TG.ready();
      TG.expand();
      TG.enableClosingConfirmation();
    } catch (_) {}

    // set subtitle & username
    const u = TG.initDataUnsafe && TG.initDataUnsafe.user ? TG.initDataUnsafe.user : null;
    state.user = u;
    if (u) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || (u.username ? '@'+u.username : 'Пользователь');
      userSubtitle.textContent = name;
      menuUserName.textContent = name;
    } else {
      userSubtitle.textContent = 'Гость';
      menuUserName.textContent = 'Гость';
    }

    // viewport fixes
    const applyVH = () => {
      const h = TG.viewportStableHeight || window.innerHeight;
      document.documentElement.style.setProperty('--vh', h + 'px');
      document.body.style.height = h + 'px';
    };
    applyVH();
    TG.onEvent('viewportChanged', applyVH);
    window.addEventListener('resize', applyVH);
  }

  function populateTimezones() {
    // keep list lightweight (common + offset)
    const common = [
      'Europe/Moscow','Europe/Kiev','Europe/Warsaw','Europe/London',
      'Europe/Berlin','Europe/Paris','Asia/Dubai','Asia/Yekaterinburg',
      'Asia/Almaty','Asia/Bishkek','Asia/Tashkent','Asia/Baku',
      'Asia/Novosibirsk','Asia/Krasnoyarsk','Asia/Irkutsk','Asia/Yakutsk',
      'Asia/Vladivostok','Asia/Magadan','Asia/Kamchatka',
      'Asia/Tbilisi','Asia/Yerevan','Asia/Tokyo','Asia/Seoul',
      'America/New_York','America/Chicago','America/Denver','America/Los_Angeles'
    ];
    const uniq = Array.from(new Set([state.tz, ...common]));
    tzSelect.innerHTML = '';
    for (const z of uniq) {
      const opt = document.createElement('option');
      opt.value = z;
      opt.textContent = z;
      tzSelect.appendChild(opt);
    }
    tzSelect.value = state.tz;
  }

  // ---- API ----
  function apiBase() {
    // same origin
    return '';
  }

  async function apiFetch(path, opts={}) {
    const url = apiBase() + path;
    const headers = Object.assign({'Content-Type': 'application/json'}, opts.headers || {});
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      const txt = await res.text().catch(()=> '');
      throw new Error(txt || ('HTTP ' + res.status));
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  async function loadTasks() {
    // try several endpoints to support older backend variations
    const endpoints = ['/api/tasks', '/tasks', '/api/v1/tasks'];
    let lastErr = null;
    for (const ep of endpoints) {
      try {
        const data = await apiFetch(ep, { method:'GET' });
        if (Array.isArray(data)) {
          state.tasks = data;
          return;
        }
        if (data && Array.isArray(data.tasks)) {
          state.tasks = data.tasks;
          return;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Не удалось загрузить задачи');
  }

  async function createTask(payload) {
    const endpoints = ['/api/tasks', '/tasks', '/api/v1/tasks'];
    let lastErr = null;
    for (const ep of endpoints) {
      try {
        const data = await apiFetch(ep, { method:'POST', body: JSON.stringify(payload) });
        return data;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Не удалось создать задачу');
  }

  async function updateTask(id, payload) {
    const endpoints = [`/api/tasks/${id}`, `/tasks/${id}`, `/api/v1/tasks/${id}`];
    let lastErr = null;
    for (const ep of endpoints) {
      try {
        const data = await apiFetch(ep, { method:'PUT', body: JSON.stringify(payload) });
        return data;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Не удалось обновить задачу');
  }

  async function deleteTask(id) {
    const endpoints = [`/api/tasks/${id}`, `/tasks/${id}`, `/api/v1/tasks/${id}`];
    let lastErr = null;
    for (const ep of endpoints) {
      try {
        const data = await apiFetch(ep, { method:'DELETE' });
        return data;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Не удалось удалить задачу');
  }

  async function toggleDone(id, done) {
    // try PATCH toggle endpoints
    const tryPayloads = [
      { is_done: done },
      { done },
      { completed: done },
    ];
    const endpoints = [`/api/tasks/${id}`, `/tasks/${id}`, `/api/v1/tasks/${id}`];

    let lastErr = null;
    for (const ep of endpoints) {
      for (const p of tryPayloads) {
        try {
          const data = await apiFetch(ep, { method:'PATCH', body: JSON.stringify(p) });
          return data;
        } catch (e) {
          lastErr = e;
        }
      }
    }
    // fallback PUT
    for (const ep of endpoints) {
      for (const p of tryPayloads) {
        try {
          const data = await apiFetch(ep, { method:'PUT', body: JSON.stringify(p) });
          return data;
        } catch (e) {
          lastErr = e;
        }
      }
    }
    throw lastErr || new Error('Не удалось изменить статус');
  }

  // ---- Rendering / Filters ----
  function getFilteredTasks(filter, search) {
    const q = (search || '').trim().toLowerCase();
    const tz = state.tz;
    const today = new Date();

    let list = state.tasks.slice();

    if (q) {
      list = list.filter(t =>
        (taskTitle(t).toLowerCase().includes(q)) ||
        (taskDesc(t).toLowerCase().includes(q))
      );
    }

    // Smart filters
    if (filter === 'done') {
      list = list.filter(t => taskDone(t));
    } else if (filter === 'overdue') {
      list = list.filter(t => isOverdue(t));
    } else if (filter === 'today') {
      list = list.filter(t => {
        const due = taskDueISO(t);
        if (!due) return false;
        return sameZonedDate(new Date(due), today, tz) && !taskDone(t);
      });
    } else if (filter === 'upcoming') {
      list = list.filter(t => {
        const due = taskDueISO(t);
        if (!due) return false;
        if (taskDone(t)) return false;
        const dueD = new Date(due);
        // after today (zoned)
        const dueISO = zonedISODateFromUTC(due, tz);
        const todayISO = zonedISODateFromUTC(new Date().toISOString(), tz);
        return dueISO > todayISO;
      });
    } else if (filter === 'inbox') {
      // Inbox: not done; either no date or future/today (like TickTick inbox is general list)
      list = list.filter(t => !taskDone(t));
    }

    // sort: by due date (null last) then priority
    const prioRank = (p) => (p === 'high' ? 0 : p === 'medium' ? 1 : 2);
    list.sort((a,b) => {
      const ad = taskDueISO(a);
      const bd = taskDueISO(b);
      if (ad && bd) return new Date(ad) - new Date(bd);
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      return prioRank(taskPriority(a)) - prioRank(taskPriority(b));
    });

    return list;
  }

  function updateTitles() {
    const map = {
      inbox: 'Входящие',
      today: 'Сегодня',
      upcoming: 'Предстоящие',
      overdue: 'Просрочено',
      done: 'Завершено',
    };
    listTitle.textContent = map[state.filter] || 'Задачи';
  }

  function renderTaskList(container, list, opts={ compact:false }) {
    container.innerHTML = '';
    for (const t of list) {
      const id = t.id ?? t.task_id ?? t.taskId;
      const row = document.createElement('div');
      row.className = 'taskRow enter' + (taskDone(t) ? ' isDone' : '') + (isOverdue(t) ? ' isOverdue' : '');
      row.dataset.id = String(id || '');

      const acts = document.createElement('div');
      acts.className = 'taskRowActions';
      acts.innerHTML = '<div class="actLeft">Готово</div><div class="actRight">Удалить</div>';
      row.appendChild(acts);

      const inner = document.createElement('div');
      inner.className = 'taskRowInner';
      row.appendChild(inner);

      const check = document.createElement('div');
      check.className = 'taskCheck' + (taskDone(t) ? ' isChecked' : '');
      check.title = 'Завершить';
      inner.appendChild(check);

      const main = document.createElement('div');
      main.className = 'taskMain';
      inner.appendChild(main);

      const title = document.createElement('div');
      title.className = 'taskTitle';
      title.textContent = taskTitle(t) || 'Без названия';
      main.appendChild(title);

      const desc = taskDesc(t);
      if (desc) {
        const d = document.createElement('div');
        d.className = 'taskDesc';
        d.textContent = desc;
        main.appendChild(d);
      }

      const meta = document.createElement('div');
      meta.className = 'taskMeta';
      main.appendChild(meta);

      const due = taskDueISO(t);
      if (due) {
        const b1 = document.createElement('span');
        b1.className = 'badge blue';
        const dISO = zonedISODateFromUTC(due, state.tz);
        const tStr = fmtZonedTime(due, state.tz);
        b1.textContent = dISO + (tStr ? (' • ' + tStr) : '');
        meta.appendChild(b1);
      } else {
        const b1 = document.createElement('span');
        b1.className = 'badge gray';
        b1.textContent = 'Без даты';
        meta.appendChild(b1);
      }

      const pr = taskPriority(t);
      const prB = document.createElement('span');
      prB.className = 'badge' + (pr === 'high' ? ' red' : pr === 'low' ? ' gray' : '');
      prB.textContent = pr === 'high' ? 'Высокий' : pr === 'low' ? 'Низкий' : 'Средний';
      meta.appendChild(prB);

      if (taskRemind(t) && due) {
        const rB = document.createElement('span');
        rB.className = 'badge';
        rB.textContent = '⏰ Напомнит';
        meta.appendChild(rB);
      }

      const more = document.createElement('button');
      more.className = 'taskMore';
      more.type = 'button';
      more.title = 'Изменить';
      inner.appendChild(more);

      // events
      check.addEventListener('click', async (e) => {
        e.stopPropagation();
        haptic('selection');
        await onToggleDone(id, !taskDone(t));
      });

      more.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(t);
      });

      row.addEventListener('click', () => {
        openEditModal(t);
      });

      attachSwipe(row, inner, id);

      container.appendChild(row);
    }
  }

  function renderTasksScreen() {
    updateTitles();
    const list = getFilteredTasks(state.filter, state.search);
    taskCount.textContent = String(list.length);
    renderTaskList(taskList, list);
    emptyState.style.display = list.length ? 'none' : 'block';
  }

  function renderOverdueScreen() {
    const list = getFilteredTasks('overdue', '');
    overdueCount.textContent = String(list.length);
    renderTaskList(overdueList, list);
    overdueEmpty.style.display = list.length ? 'none' : 'block';
  }

  function renderDaySheet() {
    const iso = state.selectedDayISO || isoDate(new Date());
    dayTitle.textContent = fmtDayTitle(iso);
    const list = state.tasks.filter(t => {
      const due = taskDueISO(t);
      if (!due) return false;
      return zonedISODateFromUTC(due, state.tz) === iso && !taskDone(t);
    });
    renderTaskList(dayTaskList, list, { compact:true });
    dayEmpty.style.display = list.length ? 'none' : 'block';
  }

  function renderCalendar() {
    const d = new Date(state.calCursor);
    const year = d.getFullYear();
    const month = d.getMonth();
    const title = d.toLocaleDateString('ru-RU', { month:'long', year:'numeric' });
    calTitle.textContent = title.charAt(0).toUpperCase() + title.slice(1);

    // grid start: Monday
    const first = new Date(year, month, 1);
    const firstWeekday = (first.getDay() + 6) % 7; // 0 = Monday
    const start = new Date(year, month, 1 - firstWeekday);

    const todayISO = zonedISODateFromUTC(new Date().toISOString(), state.tz);
    const selectedISO = state.selectedDayISO || todayISO;

    // map tasks by day for dots
    const dayMap = new Map();
    for (const t of state.tasks) {
      const due = taskDueISO(t);
      if (!due) continue;
      const iso = zonedISODateFromUTC(due, state.tz);
      const arr = dayMap.get(iso) || [];
      arr.push(t);
      dayMap.set(iso, arr);
    }

    calGrid.innerHTML = '';
    for (let i=0;i<42;i++) {
      const cur = new Date(start);
      cur.setDate(start.getDate()+i);
      const iso = isoDate(cur);

      const cell = document.createElement('div');
      cell.className = 'calDay';
      cell.dataset.iso = iso;

      if (cur.getMonth() !== month) cell.classList.add('isOtherMonth');
      if (iso === selectedISO) cell.classList.add('isSelected');
      if (iso === todayISO) cell.classList.add('isToday');

      const n = document.createElement('div');
      n.className = 'calNum';
      n.textContent = String(cur.getDate());
      cell.appendChild(n);

      const tasks = dayMap.get(iso) || [];
      if (tasks.length) {
        const dots = document.createElement('div');
        dots.className = 'calDots';
        const anyOver = tasks.some(t => isOverdue(t) && !taskDone(t));
        const dot = document.createElement('div');
        dot.className = 'dot' + (anyOver ? ' red' : '');
        dots.appendChild(dot);
        if (tasks.length > 2) {
          const dot2 = document.createElement('div');
          dot2.className = 'dot';
          dots.appendChild(dot2);
        }
        cell.appendChild(dots);
      }

      cell.addEventListener('click', () => {
        haptic('selection');
        state.selectedDayISO = iso;
        renderCalendar();
        renderDaySheet();
      });

      calGrid.appendChild(cell);
    }

    if (!state.selectedDayISO) state.selectedDayISO = selectedISO;
    renderDaySheet();
  }

  // ---- Swipe gestures ----
  function attachSwipe(row, inner, id) {
    let startX = 0;
    let currentX = 0;
    let dragging = false;

    const threshold = 88;

    function onDown(e) {
      // ignore if clicking on checkbox/more
      const t = e.target;
      if (t && (t.closest('.taskCheck') || t.closest('.taskMore'))) return;

      dragging = true;
      startX = (e.touches ? e.touches[0].clientX : e.clientX);
      currentX = 0;
      inner.style.transition = 'none';
      row.classList.add('dragging');
    }

    function onMove(e) {
      if (!dragging) return;
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      currentX = x - startX;
      // clamp
      currentX = Math.max(-140, Math.min(140, currentX));
      inner.style.transform = `translateX(${currentX}px)`;
      e.preventDefault();
    }

    async function onUp() {
      if (!dragging) return;
      dragging = false;
      inner.style.transition = '';
      row.classList.remove('dragging');

      const dx = currentX;
      currentX = 0;

      if (dx > threshold) {
        // done
        inner.style.transform = 'translateX(0px)';
        haptic('notification', 'success');
        await onToggleDone(id, true);
        return;
      }
      if (dx < -threshold) {
        // delete
        inner.style.transform = 'translateX(0px)';
        haptic('notification', 'warning');
        await onDelete(id);
        return;
      }

      inner.style.transform = 'translateX(0px)';
    }

    row.addEventListener('touchstart', onDown, { passive: true });
    row.addEventListener('touchmove', onMove, { passive: false });
    row.addEventListener('touchend', onUp, { passive: true });

    row.addEventListener('pointerdown', onDown);
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', onUp);
    row.addEventListener('pointercancel', onUp);
  }

  // ---- Modal ----
  function openModal() {
    modalOverlay.classList.add('show');
    modalOverlay.setAttribute('aria-hidden', 'false');
    // Telegram main button not used; keep UI consistent
    setTimeout(() => taskTitleInput.focus(), 50);
  }

  function closeModal() {
    modalOverlay.classList.remove('show');
    modalOverlay.setAttribute('aria-hidden', 'true');
    state.editingTaskId = null;
    state.addingForDayISO = null;
  }

  function resetModalFields() {
    taskTitleInput.value = '';
    taskDescInput.value = '';
    taskDateInput.value = '';
    taskTimeInput.value = '';
    taskPrioritySelect.value = 'medium';
    taskRemindSelect.value = 'on';
  }

  function openAddModal(forDayISO=null) {
    resetModalFields();
    state.editingTaskId = null;
    state.addingForDayISO = forDayISO;

    taskModalTitle.textContent = 'Новая задача';
    if (forDayISO) {
      taskDateInput.value = forDayISO;
    }
    openModal();
  }

  function openEditModal(task) {
    resetModalFields();
    const id = task.id ?? task.task_id ?? task.taskId;
    state.editingTaskId = id;

    taskModalTitle.textContent = 'Изменить задачу';

    taskTitleInput.value = taskTitle(task);
    taskDescInput.value = taskDesc(task);

    const due = taskDueISO(task);
    if (due) {
      const dISO = zonedISODateFromUTC(due, state.tz);
      const tStr = fmtZonedTime(due, state.tz);
      taskDateInput.value = dISO;
      taskTimeInput.value = tStr || '';
    }

    taskPrioritySelect.value = taskPriority(task) || 'medium';
    taskRemindSelect.value = taskRemind(task) ? 'on' : 'off';

    openModal();
  }

  function payloadFromModal() {
    const title = taskTitleInput.value.trim();
    const description = taskDescInput.value.trim();
    const dateVal = taskDateInput.value;
    const timeVal = taskTimeInput.value;

    const priority = taskPrioritySelect.value || 'medium';
    const remind = taskRemindSelect.value === 'on';

    // Backend expects UTC ISO datetime maybe.
    // We'll interpret date+time as in selected TZ, then convert to UTC ISO.
    let due_at = null;
    if (dateVal) {
      const t = timeVal || '12:00';
      const [y,m,dd] = dateVal.split('-').map(Number);
      const [hh,mm] = t.split(':').map(Number);

      // Create a Date object for that local time in selected timezone by using Intl trick:
      // We'll build a UTC date based on components in TZ.
      // Approx approach: use Date.UTC then adjust offset by comparing formatted parts.
      const tentativeUTC = new Date(Date.UTC(y, m-1, dd, hh, mm, 0, 0));

      // Find what date/time that UTC looks like in TZ, and shift difference.
      const p = toZonedParts(tentativeUTC, state.tz);
      // difference (in minutes) between intended components and shown components
      const diffMin = (p.year - y) * 525600 + (p.month - m) * 43200 + (p.day - dd) * 1440 + (p.hour - hh) * 60 + (p.minute - mm);
      const corrected = new Date(tentativeUTC.getTime() - diffMin * 60 * 1000);

      due_at = corrected.toISOString();
    }

    const payload = {
      title,
      description,
      priority,
      remind,
      due_at,
    };

    // pass Telegram identity if backend supports
    if (state.user) {
      payload.tg_user_id = state.user.id;
      payload.tg_username = state.user.username || null;
      payload.tg_first_name = state.user.first_name || null;
      payload.tg_last_name = state.user.last_name || null;
    }

    return payload;
  }

  // ---- Actions ----
  async function onSync() {
    try {
      userSubtitle.textContent = 'Синхронизируем…';
      await loadTasks();
      userSubtitle.textContent = state.user ? menuUserName.textContent : 'Гость';
      refreshAll();
      showToast('Синхронизировано');
      haptic('notification', 'success');
    } catch (e) {
      userSubtitle.textContent = 'Нет связи с сервером';
      showToast('Ошибка синхронизации');
      haptic('notification', 'error');
      console.error(e);
    }
  }

  async function onSaveTask() {
    const payload = payloadFromModal();
    if (!payload.title) {
      showToast('Введите название');
      haptic('notification','error');
      return;
    }
    try {
      saveTaskBtn.disabled = true;
      saveTaskBtn.textContent = 'Сохраняем…';

      if (state.editingTaskId) {
        await updateTask(state.editingTaskId, payload);
      } else {
        await createTask(payload);
      }

      closeModal();
      await loadTasks();
      refreshAll();
      showToast('Сохранено');
      haptic('notification','success');
    } catch (e) {
      showToast('Не удалось сохранить');
      haptic('notification','error');
      console.error(e);
    } finally {
      saveTaskBtn.disabled = false;
      saveTaskBtn.textContent = 'Сохранить';
    }
  }

  async function onDelete(id) {
    try {
      await deleteTask(id);
      await loadTasks();
      refreshAll();
      showToast('Удалено');
    } catch (e) {
      showToast('Не удалось удалить');
      console.error(e);
    }
  }

  async function onToggleDone(id, done) {
    try {
      await toggleDone(id, done);
      await loadTasks();
      refreshAll();
      showToast(done ? 'Готово' : 'Возвращено');
    } catch (e) {
      showToast('Не удалось изменить');
      console.error(e);
    }
  }

  async function onExport() {
    try {
      const data = JSON.stringify(state.tasks, null, 2);
      await navigator.clipboard.writeText(data);
      showToast('JSON скопирован');
    } catch (e) {
      showToast('Не удалось скопировать');
    }
  }

  async function onClearDone() {
    // delete all done tasks
    const done = state.tasks.filter(t => taskDone(t));
    if (!done.length) {
      showToast('Нет выполненных');
      return;
    }
    try {
      for (const t of done) {
        const id = t.id ?? t.task_id ?? t.taskId;
        if (id != null) {
          await deleteTask(id);
        }
      }
      await loadTasks();
      refreshAll();
      showToast('Очищено');
    } catch (e) {
      showToast('Ошибка очистки');
      console.error(e);
    }
  }

  // ---- Navigation ----
  function showScreen(name) {
    state.screen = name;
    const screens = {
      tasks: screenTasks,
      calendar: screenCalendar,
      overdue: screenOverdue,
      menu: screenMenu,
    };
    for (const k of Object.keys(screens)) {
      screens[k].classList.toggle('show', k === name);
    }

    // bottom nav state
    for (const b of bottomNav.querySelectorAll('.navBtn')) {
      const s = b.dataset.screen;
      if (!s) continue;
      b.classList.toggle('isActive', s === name);
    }

    // segmented state aligns: calendar screen corresponds to seg calendar
    if (name === 'calendar') setSeg('calendar', true);
    if (name === 'tasks' && (state.seg === 'calendar')) setSeg('inbox', true);
    if (name === 'overdue') {
      // keep tasks segmented but show overdue screen
      setSeg('today', true); // doesn't matter; keep thumb stable
    }

    refreshAll();
  }

  function setSeg(segName, silent=false) {
    state.seg = segName;
    const btns = seg.querySelectorAll('.segBtn');
    btns.forEach((b, idx) => {
      const active = b.dataset.seg === segName;
      b.classList.toggle('isActive', active);
      if (active) {
        const dx = idx * 100;
        segThumb.style.transform = `translateX(${dx}%)`;
      }
    });

    if (!silent) haptic('selection');

    if (segName === 'calendar') {
      showScreen('calendar');
      return;
    }

    // map seg to filter
    if (segName === 'inbox') {
      state.filter = 'inbox';
      showScreen('tasks');
    }
    if (segName === 'today') {
      state.filter = 'today';
      showScreen('tasks');
    }

    // update chips selection accordingly
    for (const c of smartChips.querySelectorAll('.chip')) {
      c.classList.toggle('isActive', c.dataset.filter === state.filter);
    }
    refreshAll();
  }

  function refreshAll() {
    if (state.screen === 'tasks') renderTasksScreen();
    if (state.screen === 'calendar') renderCalendar();
    if (state.screen === 'overdue') renderOverdueScreen();
    // menu has no heavy render; only ensure counts/labels
  }

  // ---- Events ----
  function bindEvents() {
    syncBtn.addEventListener('click', onSync);
    topAddBtn.addEventListener('click', () => openAddModal(null));

    navAddBtn.addEventListener('click', () => openAddModal(null));
    fabAdd.addEventListener('click', () => openAddModal(null));

    seg.addEventListener('click', (e) => {
      const b = e.target.closest('.segBtn');
      if (!b) return;
      setSeg(b.dataset.seg);
    });

    // Chips
    smartChips.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      state.filter = b.dataset.filter;
      smartChips.querySelectorAll('.chip').forEach(x => x.classList.toggle('isActive', x===b));
      // keep segmented in sync: inbox/today only
      if (state.filter === 'today') setSeg('today', true);
      if (state.filter === 'inbox') setSeg('inbox', true);
      if (state.filter === 'overdue') showScreen('overdue');
      if (state.filter === 'done') showScreen('tasks');
      refreshAll();
      haptic('selection');
    });

    // Search
    searchInput.addEventListener('input', () => {
      state.search = searchInput.value || '';
      clearSearch.style.display = state.search ? 'block' : 'none';
      renderTasksScreen();
    });
    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      state.search = '';
      clearSearch.style.display = 'none';
      renderTasksScreen();
    });

    exportBtn.addEventListener('click', onExport);

    // Calendar nav
    calPrev.addEventListener('click', () => {
      const d = new Date(state.calCursor);
      d.setMonth(d.getMonth()-1);
      state.calCursor = d;
      haptic('selection');
      renderCalendar();
    });
    calNext.addEventListener('click', () => {
      const d = new Date(state.calCursor);
      d.setMonth(d.getMonth()+1);
      state.calCursor = d;
      haptic('selection');
      renderCalendar();
    });

    addTaskForDayBtn.addEventListener('click', () => {
      openAddModal(state.selectedDayISO || isoDate(new Date()));
    });

    // Bottom nav
    bottomNav.addEventListener('click', (e) => {
      const b = e.target.closest('.navBtn');
      if (!b) return;
      const s = b.dataset.screen;
      if (!s) return;
      if (s === 'tasks') showScreen('tasks');
      if (s === 'calendar') showScreen('calendar');
      if (s === 'overdue') showScreen('overdue');
      if (s === 'menu') showScreen('menu');
      haptic('selection');
    });

    // Menu
    menuSync.addEventListener('click', onSync);
    menuExport.addEventListener('click', onExport);
    menuClearDone.addEventListener('click', onClearDone);

    themeSelect.addEventListener('change', () => {
      setTheme(themeSelect.value);
      savePrefs();
      haptic('selection');
    });

    tzSelect.addEventListener('change', () => {
      state.tz = tzSelect.value;
      savePrefs();
      refreshAll();
      showToast('Часовой пояс обновлён');
      haptic('selection');
    });

    // Modal
    closeTaskModal.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    saveTaskBtn.addEventListener('click', onSaveTask);

    // ESC for desktop
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  // ---- Init ----
  async function init() {
    setupTelegram();
    loadPrefs();
    populateTimezones();
    bindEvents();

    // Place segmented thumb correctly on load
    requestAnimationFrame(() => setSeg('inbox', true));

    try {
      await loadTasks();
      userSubtitle.textContent = state.user ? menuUserName.textContent : 'Гость';
      refreshAll();
    } catch (e) {
      userSubtitle.textContent = 'Нет связи с сервером';
      console.error(e);
      // still render UI without data
      refreshAll();
    }
  }

  init();
})();
