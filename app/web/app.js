/* TaskFlow — TickTick iOS inspired (Telegram Mini App) */
/* Build: 1770554238 */

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
  const screenMatrix = el('screenMatrix');
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

  const matrixCount = el('matrixCount');
  const mUI = el('mUI');
  const mUN = el('mUN');
  const mNI = el('mNI');
  const mNN = el('mNN');

  const calTitle = el('calTitle');
  const calPrev = el('calPrev');
  const calNext = el('calNext');
  const calGrid = el('calGrid');

  const daySheet = el('daySheet');
  const dayTitle = el('dayTitle');
  const dayTaskList = el('dayTaskList');
  const dayTimeline = el('dayTimeline');
  const dayEmpty = el('dayEmpty');
  const addTaskForDayBtn = el('addTaskForDayBtn');

  const menuSync = el('menuSync');
  const menuExport = el('menuExport');
  const menuClearDone = el('menuClearDone');
  const newListBtn = el('newListBtn');
  const menuListsHost = el('menuLists');
  const themeSelect = el('themeSelect');
  const tzSelect = el('tzSelect');

  const modalOverlay = el('taskModalOverlay');
  const closeTaskModal = el('closeTaskModal');
  const taskModalTitle = el('taskModalTitle');
  const taskTitleInput = el('taskTitleInput');
  const taskDescInput = el('taskDescInput');
  const taskDateInput = el('taskDateInput');
  const taskTimeInput = el('taskTimeInput');
  const taskEndTimeInput = el('taskEndTimeInput');
  const taskDurationInput = el('taskDurationInput');
  const taskKindSelect = el('taskKindSelect');
  const taskListSelect = el('taskListSelect');
  const taskTagsInput = el('taskTagsInput');
  const taskLocationInput = el('taskLocationInput');
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
    screen: 'tasks',            // tasks | calendar | matrix | menu
    seg: 'inbox',               // inbox | today | calendar
    filter: 'smart:today',      // smart:today | smart:next7 | smart:all | smart:overdue | smart:done | list:<id> | tag:<name>
    search: '',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',

    lists: [],                  // from API (includes Inbox id=0)
    folders: [],                // client-side only: [{id,name,listIds:[]}]
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

  function taskStartISO(task) {
    return task.start_at || task.startAt || task.start || task.scheduled_at || taskDueISO(task);
  }

  function taskEndISO(task) {
    return task.end_at || task.endAt || task.end || null;
  }

  function taskTags(task) {
    return Array.isArray(task.tags) ? task.tags : [];
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
    return !!(task.reminder_enabled ?? task.remind ?? task.reminder ?? task.remind_enabled);
  }

  function isOverdue(task) {
    const due = taskStartISO(task);
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

    // --- Auth / identity ---
    // FastAPI backend expects either:
    //  - X-Tg-Init-Data (Telegram initData) OR
    //  - X-User-Key (guest/dev)
    // We always send initData when running inside Telegram.
    try {
      if (TG && TG.initData) headers['X-Tg-Init-Data'] = TG.initData;
    } catch (_) {}

    // Guest/dev key for non-Telegram usage (or local testing)
    if (!headers['X-Tg-Init-Data']) {
      const kLS = 'tf_user_key';
      let k = localStorage.getItem(kLS);
      if (!k) {
        k = 'guest:' + Math.random().toString(16).slice(2) + Date.now().toString(16);
        localStorage.setItem(kLS, k);
      }
      headers['X-User-Key'] = k;
      headers['X-User-Name'] = (state.user && (state.user.first_name || state.user.username)) ? (state.user.first_name || ('@'+state.user.username)) : 'Гость';
    }
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

  
  async function loadMe() {
    try {
      const me = await apiFetch('/api/me', { method:'GET' });
      state.user = me || null;
      if (menuUserName) menuUserName.textContent = me && me.name ? me.name : 'Гость';
      return me;
    } catch (_) {
      state.user = null;
      if (menuUserName) menuUserName.textContent = 'Гость';
      return null;
    }
  }

  async function loadLists() {
    try {
      const data = await apiFetch('/api/lists', { method:'GET' });
      if (Array.isArray(data)) {
        state.lists = data;
      } else {
        state.lists = [{id:0,name:'Входящие',color:'#4A90E2'}];
      }
      refreshListSelectOptions();
      refreshMenuLists();
      return state.lists;
    } catch (e) {
      // fallback
      state.lists = [{id:0,name:'Входящие',color:'#4A90E2'}];
      refreshListSelectOptions();
      refreshMenuLists();
      return state.lists;
    }
  }

  function refreshListSelectOptions() {
    if (!taskListSelect) return;
    const cur = taskListSelect.value || '0';
    taskListSelect.innerHTML = '';
    for (const l of (state.lists || [])) {
      const opt = document.createElement('option');
      opt.value = String(l.id);
      opt.textContent = l.name;
      taskListSelect.appendChild(opt);
    }
    // restore
    if ([...taskListSelect.options].some(o => o.value === cur)) taskListSelect.value = cur;
  }

  function refreshMenuLists() {
    // Menu screen is already present; we will populate its list section if it exists.
    const host = document.getElementById('menuLists');
    if (!host) return;
    host.innerHTML = '';

    // Smart lists
    const smart = [
      { id:'smart:today', name:'Сегодня', icon:'📅' },
      { id:'smart:next7', name:'Следующие 7 дней', icon:'🗓️' },
      { id:'smart:overdue', name:'Просрочено', icon:'⏰' },
      { id:'smart:all', name:'Все', icon:'🗂️' },
      { id:'smart:done', name:'Готово', icon:'✅' },
    ];

    const addSection = (title, items, isList=false) => {
      const h = document.createElement('div');
      h.className = 'menuSectionTitle';
      h.textContent = title;
      host.appendChild(h);
      for (const it of items) {
        const b = document.createElement('button');
        b.className = 'menuItem';
        b.setAttribute('type','button');
        b.dataset.filter = it.id;
        b.innerHTML = `<span class="menuIcon">${it.icon || '•'}</span><span class="menuName">${escapeHtml(it.name)}</span>` + (isList ? `<span class="menuDot" style="background:${it.color || '#4A90E2'}"></span>` : '');
        b.addEventListener('click', () => {
          state.filter = it.id;
          setScreen('tasks');
          refreshAll();
          haptic('selection');
        });
        host.appendChild(b);
      }
    };

    addSection('Умные списки', smart, false);
    addSection('Списки', (state.lists || []).filter(l => l.id !== 0).map(l => ({ id:`list:${l.id}`, name:l.name, icon:'', color:l.color })), true);

    // Tags section (from tasks)
    const tagSet = new Set();
    for (const t of (state.tasks || [])) {
      const tags = Array.isArray(t.tags) ? t.tags : [];
      tags.forEach(x => tagSet.add(x));
    }
    const tags = [...tagSet].sort((a,b)=>a.localeCompare(b,'ru'));
    if (tags.length) {
      addSection('Теги', tags.map(t => ({ id:`tag:${t}`, name:'#'+t, icon:'#' })), false);
    }
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

  async function createList(payload) {
    const data = await apiFetch('/api/lists', { method:'POST', body: JSON.stringify(payload) });
    return data;
  }

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

    let list = state.tasks.slice();

    if (q) {
      list = list.filter(t =>
        (taskTitle(t).toLowerCase().includes(q)) ||
        (taskDesc(t).toLowerCase().includes(q)) ||
        (taskTags(t).join(' ').toLowerCase().includes(q))
      );
    }

    const todayISO = zonedISODateFromUTC(new Date().toISOString(), tz);

    const isInNextDays = (iso, days) => {
      if (!iso) return false;
      const dISO = zonedISODateFromUTC(iso, tz);
      if (dISO < todayISO) return false;
      const d0 = parseISODate(todayISO);
      const d1 = parseISODate(dISO);
      const diffDays = Math.floor((d1 - d0) / (24*60*60*1000));
      return diffDays >= 0 && diffDays <= days;
    };

    // ---- Filter routing ----
    if (filter.startsWith('list:')) {
      const id = parseInt(filter.split(':')[1] || '0', 10);
      list = list.filter(t => (t.list_id || 0) === id);
      list = list.filter(t => !taskDone(t));
    } else if (filter.startsWith('tag:')) {
      const tag = filter.slice(4);
      list = list.filter(t => !taskDone(t) && taskTags(t).includes(tag));
    } else if (filter === 'smart:done') {
      list = list.filter(t => taskDone(t));
    } else if (filter === 'smart:overdue') {
      list = list.filter(t => !taskDone(t) && isOverdue(t));
    } else if (filter === 'smart:today') {
      list = list.filter(t => {
        const s = taskStartISO(t);
        if (!s) return false;
        return zonedISODateFromUTC(s, tz) === todayISO && !taskDone(t);
      });
    } else if (filter === 'smart:next7') {
      list = list.filter(t => !taskDone(t) && isInNextDays(taskStartISO(t), 7));
    } else if (filter === 'smart:all') {
      list = list.filter(t => !taskDone(t));
    } else {
      // fallback: inbox/list 0
      list = list.filter(t => (t.list_id || 0) === 0 && !taskDone(t));
    }

    // sort: by start time (null last) then priority
    const prioRank = (p) => (p === 'high' ? 0 : p === 'medium' ? 1 : 2);
    list.sort((a,b) => {
      const as = taskStartISO(a);
      const bs = taskStartISO(b);
      if (as && bs) return new Date(as) - new Date(bs);
      if (as && !bs) return -1;
      if (!as && bs) return 1;
      return prioRank(taskPriority(a)) - prioRank(taskPriority(b));
    });

    return list;
  }

  function updateTitles() {
    const f = state.filter || 'smart:today';
    if (f.startsWith('list:')) {
      const id = parseInt(f.split(':')[1] || '0', 10);
      const l = (state.lists || []).find(x => x.id === id);
      listTitle.textContent = l ? l.name : 'Список';
      return;
    }
    if (f.startsWith('tag:')) {
      listTitle.textContent = '#' + f.slice(4);
      return;
    }
    const map = {
      'smart:today': 'Сегодня',
      'smart:next7': 'Следующие 7 дней',
      'smart:overdue': 'Просрочено',
      'smart:all': 'Все',
      'smart:done': 'Готово',
    };
    listTitle.textContent = map[f] || 'План';
  }

  function renderChips() {
    if (!smartChips) return;
    const f = state.filter || 'smart:today';

    const chips = [
      { id:'smart:today', label:'Сегодня' },
      { id:'smart:next7', label:'7 дней' },
      { id:'smart:overdue', label:'Просрочено' },
      { id:'smart:all', label:'Все' },
      { id:'smart:done', label:'Готово' },
    ];

    // If selected list/tag, show it as first chip
    if (f.startsWith('list:')) {
      const id = parseInt(f.split(':')[1] || '0', 10);
      const l = (state.lists || []).find(x => x.id === id);
      chips.unshift({ id:f, label: l ? l.name : 'Список' });
    } else if (f.startsWith('tag:')) {
      chips.unshift({ id:f, label: '#' + f.slice(4) });
    }

    smartChips.innerHTML = '';
    for (const c of chips) {
      const b = document.createElement('button');
      b.className = 'chip' + (c.id === f ? ' isActive' : '');
      b.dataset.filter = c.id;
      b.textContent = c.label;
      smartChips.appendChild(b);
    }
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
    renderChips();
    updateTitles();
    const list = getFilteredTasks(state.filter, state.search);
    taskCount.textContent = String(list.length);
    renderTaskList(taskList, list);
    emptyState.style.display = list.length ? 'none' : 'block';
  }

  function renderMatrixScreen() {
    // Eisenhower-ish: Urgent = overdue or due within 24h. Important = high priority.
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const active = state.tasks.filter(t => !taskDone(t));

    const buckets = { UI: [], UN: [], NI: [], NN: [] };
    for (const t of active) {
      const due = taskDueISO(t);
      const urgent = !!due && (new Date(due).getTime() < now || new Date(due).getTime() < (now + day));
      const important = taskPriority(t) === 'high';

      if (urgent && important) buckets.UI.push(t);
      else if (!urgent && important) buckets.UN.push(t);
      else if (urgent && !important) buckets.NI.push(t);
      else buckets.NN.push(t);
    }

    matrixCount.textContent = String(active.length);
    renderTaskList(mUI, buckets.UI, { compact:true });
    renderTaskList(mUN, buckets.UN, { compact:true });
    renderTaskList(mNI, buckets.NI, { compact:true });
    renderTaskList(mNN, buckets.NN, { compact:true });
  }

  function renderDaySheet() {
    const iso = state.selectedDayISO || isoDate(new Date());
    dayTitle.textContent = fmtDayTitle(iso);

    const list = state.tasks.filter(t => {
      const s = taskStartISO(t);
      if (!s) return false;
      return zonedISODateFromUTC(s, state.tz) === iso && !taskDone(t);
    }).sort((a,b) => new Date(taskStartISO(a)) - new Date(taskStartISO(b)));

    renderTimeline(dayTimeline, list, iso);
    dayEmpty.style.display = list.length ? 'none' : 'block';
  }

  function renderTimeline(container, list, iso) {
    if (!container) return;
    container.innerHTML = '';

    // Timeline range
    const startHour = 6;
    const endHour = 22;
    const totalMin = (endHour - startHour) * 60;

    // Build rows
    for (let h = startHour; h <= endHour; h++) {
      const row = document.createElement('div');
      row.className = 'tlRow';
      row.innerHTML = `<div class="tlTime">${pad2(h)}:00</div><div class="tlLine"></div>`;
      container.appendChild(row);
    }

    // Add blocks
    for (const t of list) {
      const sISO = taskStartISO(t);
      if (!sISO) continue;

      const s = new Date(sISO);
      const parts = toZonedParts(s, state.tz);
      const minutesFromStart = (parts.hour - startHour) * 60 + parts.minute;

      // determine duration
      let dur = t.duration_minutes ?? t.durationMinutes ?? null;
      if (!dur) {
        const eISO = taskEndISO(t);
        if (eISO) {
          try { dur = Math.max(10, Math.round((new Date(eISO) - new Date(sISO)) / 60000)); } catch (_) {}
        }
      }
      if (!dur) dur = (t.kind === 'meeting' ? 60 : 30);

      const topPct = Math.max(0, Math.min(1, minutesFromStart / totalMin));
      const hPct = Math.max(10/ (totalMin), Math.min(1, dur / totalMin));

      const block = document.createElement('div');
      block.className = 'tlBlock tlKind-' + (t.kind || 'task');
      block.style.top = `calc(${topPct*100}% + 8px)`;
      block.style.height = `calc(${hPct*100}% - 4px)`;

      const timeLabel = fmtZonedTime(sISO, state.tz) + (taskEndISO(t) ? `–${fmtZonedTime(taskEndISO(t), state.tz)}` : '');
      const tagLabel = taskTags(t).slice(0,3).map(x => '#' + x).join(' ');

      block.innerHTML = `
        <div class="tlBlockTime">${escapeHtml(timeLabel)}</div>
        <div class="tlBlockTitle">${escapeHtml(taskTitle(t))}</div>
        <div class="tlBlockMeta">${escapeHtml(tagLabel || (t.location || ''))}</div>
      `;

      block.addEventListener('click', () => openEditModal(t));
      container.appendChild(block);
    }
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
    if (taskEndTimeInput) taskEndTimeInput.value = '';
    if (taskDurationInput) taskDurationInput.value = '';
    if (taskKindSelect) taskKindSelect.value = 'task';
    if (taskLocationInput) taskLocationInput.value = '';
    if (taskTagsInput) taskTagsInput.value = '';
    if (taskListSelect) taskListSelect.value = '0';

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

    taskModalTitle.textContent = 'Изменить';
    taskTitleInput.value = taskTitle(task);
    taskDescInput.value = taskDesc(task);

    // Prefer schedule start/end, fallback to due_at
    const startISO = task.start_at || task.startAt || taskDueISO(task);
    const endISO = task.end_at || task.endAt || null;

    if (startISO) {
      const dISO = zonedISODateFromUTC(startISO, state.tz);
      const tStr = fmtZonedTime(startISO, state.tz);
      taskDateInput.value = dISO;
      taskTimeInput.value = tStr || '';
    }
    if (endISO && taskEndTimeInput) {
      taskEndTimeInput.value = fmtZonedTime(endISO, state.tz) || '';
    }
    if (taskDurationInput) {
      const dur = task.duration_minutes ?? task.durationMinutes ?? null;
      taskDurationInput.value = dur ? String(dur) : '';
    }

    if (taskKindSelect) taskKindSelect.value = (task.kind || 'task');
    if (taskLocationInput) taskLocationInput.value = (task.location || '');

    if (taskTagsInput) {
      const tags = Array.isArray(task.tags) ? task.tags : [];
      taskTagsInput.value = tags.length ? tags.map(t => '#' + t).join(' ') : '';
    }

    if (taskListSelect) {
      const lid = task.list_id ?? task.listId ?? 0;
      taskListSelect.value = String(lid || 0);
    }

    taskPrioritySelect.value = taskPriority(task) || 'medium';
    taskRemindSelect.value = task.reminder_enabled ? 'on' : (taskRemind(task) ? 'on' : 'off');

    openModal();
  }

  function payloadFromModal() {
    const title = taskTitleInput.value.trim();
    const description = taskDescInput.value.trim();

    const dateVal = taskDateInput.value;
    const startTimeVal = taskTimeInput.value;
    const endTimeVal = taskEndTimeInput ? taskEndTimeInput.value : '';
    const durVal = taskDurationInput ? taskDurationInput.value : '';

    const priority = taskPrioritySelect.value || 'medium';
    const remind = taskRemindSelect.value === 'on';

    const kind = (taskKindSelect && taskKindSelect.value) ? taskKindSelect.value : 'task';
    const location = (taskLocationInput && taskLocationInput.value) ? taskLocationInput.value.trim() : '';

    const listIdRaw = taskListSelect ? taskListSelect.value : '0';
    const list_id = listIdRaw ? parseInt(listIdRaw, 10) : 0;

    // tags input: "#work #спорт, #учёба"
    let tags = [];
    if (taskTagsInput && taskTagsInput.value.trim()) {
      tags = taskTagsInput.value
        .replace(/[,;]/g, ' ')
        .split(/\s+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => s.startsWith('#') ? s.slice(1) : s)
        .filter(Boolean);
    }

    function zonedISO(dateStr, timeStr) {
      if (!dateStr) return null;
      const t = timeStr || '12:00';
      const [y,m,dd] = dateStr.split('-').map(Number);
      const [hh,mm] = t.split(':').map(Number);
      const tentativeUTC = new Date(Date.UTC(y, m-1, dd, hh, mm, 0, 0));
      const p = toZonedParts(tentativeUTC, state.tz);
      const diffMin = (p.year - y) * 525600 + (p.month - m) * 43200 + (p.day - dd) * 1440 + (p.hour - hh) * 60 + (p.minute - mm);
      const corrected = new Date(tentativeUTC.getTime() - diffMin * 60 * 1000);
      return corrected.toISOString();
    }

    let start_at = null;
    let end_at = null;
    let duration_minutes = null;

    if (dateVal) {
      if (startTimeVal) start_at = zonedISO(dateVal, startTimeVal);

      if (endTimeVal) {
        end_at = zonedISO(dateVal, endTimeVal);
      }

      if (durVal) {
        const n = parseInt(durVal, 10);
        if (!Number.isNaN(n) && n > 0) duration_minutes = n;
      }

      // if we have start + duration but no end -> backend will compute end_at
      // if we have start but no end/duration -> default duration in UI views
    }

    // For compatibility: keep due_at as schedule start (TickTick-like "scheduled time")
    const due_at = start_at;

    const payload = {
      title,
      description,
      priority,
      kind,
      location,
      tags,
      list_id: (list_id && list_id > 0) ? list_id : null,
      start_at,
      end_at,
      duration_minutes,
      reminder_enabled: remind,
      remind,
      due_at,
    };

    return payload;
  }

  // ---- Actions ----
  async function onSync() {
    try {
      userSubtitle.textContent = 'Синхронизируем…';
      await loadMe();
      await loadLists();
      await loadTasks();
      refreshMenuLists();
      userSubtitle.textContent = state.user ? (menuUserName ? menuUserName.textContent : (state.user.name || '')) : 'Гость';
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
      matrix: screenMatrix,
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
    if (name === 'matrix') setSeg('today', true);

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
    if (state.screen === 'matrix') renderMatrixScreen();
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

    // Chips (smart lists / lists / tags)
    smartChips.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      state.filter = b.dataset.filter;
      renderChips();
      refreshAll();
      haptic('selection');
    });

    // overdue is a filter inside Tasks screen
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
      if (s === 'matrix') showScreen('matrix');
      if (s === 'menu') showScreen('menu');
      haptic('selection');
    });

    // Menu
    menuSync.addEventListener('click', onSync);
    menuExport.addEventListener('click', onExport);
    menuClearDone.addEventListener('click', onClearDone);
    if (newListBtn) newListBtn.addEventListener('click', async () => {
      const name = prompt('Название списка');
      if (!name) return;
      try {
        await createList({ name, color: '#4A90E2' });
        await loadLists();
        showToast('Список создан');
      } catch (e) {
        showToast('Не удалось создать список');
        console.error(e);
      }
    });

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
      await loadMe();
      await loadLists();
      await loadTasks();
      refreshMenuLists();
      userSubtitle.textContent = state.user ? (menuUserName ? menuUserName.textContent : (state.user.name || '')) : 'Гость';
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
