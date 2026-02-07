(() => {
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  const API = window.location.origin;

  const el = {
    subtitle: document.getElementById('subtitle'),
    cards: document.getElementById('cards'),
    empty: document.getElementById('empty'),
    listTitle: document.getElementById('listTitle'),
    listCounter: document.getElementById('listCounter'),
    kpiActive: document.getElementById('kpiActive'),
    kpiToday: document.getElementById('kpiToday'),
    kpiOverdue: document.getElementById('kpiOverdue'),
    searchInput: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearch'),
    syncBtn: document.getElementById('syncBtn'),
    exportBtn: document.getElementById('exportBtn'),
    addBtn: document.getElementById('addBtn'),
    fab: document.getElementById('fab'),
    menuBtn: document.getElementById('menuBtn'),
    toast: document.getElementById('toast'),

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

  // ---------- Utils ----------
  function toast(msg, tone='') {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.className = `toast show ${tone}`.trim();
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.toast.className = 'toast';
    }, 1600);
  }

  function setVh() {
    const h = (tg?.viewportStableHeight || tg?.viewportHeight) ? (tg.viewportStableHeight || tg.viewportHeight) : window.innerHeight;
    document.documentElement.style.setProperty('--tg-vh', `${h}px`);
  }

  function fmtDue(due_at) {
    if (!due_at) return 'Без срока';
    const d = new Date(due_at);
    const date = d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' });
    const time = d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
    return `${date} ${time}`;
  }

  function isOverdue(t) {
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

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (m) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[m]));
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

  // ---------- State / Render ----------
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
    if (el.kpiActive) el.kpiActive.textContent = String(active);
    if (el.kpiToday) el.kpiToday.textContent = String(today);
    if (el.kpiOverdue) el.kpiOverdue.textContent = String(overdue);
  }

  function setListTitle() {
    const map = {
      active: 'Активные',
      today: 'Сегодня',
      overdue: 'Просрочено',
      upcoming: 'Скоро',
      done: 'Готово'
    };
    el.listTitle.textContent = map[filter] || 'Задачи';
  }

  function cardHTML(t) {
    const overdue = isOverdue(t);
    const dueTag = t.due_at ? (overdue ? `<span class="tag bad">Просрочено • ${escapeHtml(fmtDue(t.due_at))}</span>` : `<span class="tag accent">${escapeHtml(fmtDue(t.due_at))}</span>`) : `<span class="tag">Без срока</span>`;
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

  function render() {
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

  // ---------- Modal ----------
  function openModal(mode, task=null) {
    editingId = task ? task.id : null;
    el.modalTitle.textContent = task ? 'Редактирование' : 'Новая задача';
    el.deleteBtn.style.display = task ? 'inline-flex' : 'none';

    el.fTitle.value = task?.title || '';
    el.fDesc.value = task?.description || '';
    el.fPriority.value = task?.priority || 'medium';
    el.fReminder.value = (task?.reminder_enabled === false) ? 'off' : 'on';

    if (task?.due_at) {
      const d = new Date(task.due_at);
      el.fDate.value = d.toISOString().slice(0,10);
      el.fTime.value = d.toTimeString().slice(0,5);
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
      await refresh();
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
      await refresh();
    } catch (e) {
      toast('Ошибка удаления', 'bad');
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
    render();
  }

  // ---------- Events ----------
  function bind() {
    // filters
    document.querySelectorAll('.seg').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filter = btn.dataset.filter;
        render();
      });
    });

    // bottom nav shortcuts
    document.querySelectorAll('.navBtn[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.nav;
        if (nav === 'menu') {
          toast('Меню: скоро добавим настройки 🙂');
          return;
        }
        // map nav to filter
        const map = { active:'active', done:'done', overdue:'overdue' };
        if (map[nav]) {
          filter = map[nav];
          document.querySelectorAll('.seg').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
          document.querySelectorAll('.navBtn[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === nav));
          render();
        }
      });
    });

    // search
    el.searchInput.addEventListener('input', () => {
      search = el.searchInput.value;
      render();
    });
    el.clearSearch.addEventListener('click', () => {
      el.searchInput.value = '';
      search = '';
      render();
    });

    // buttons
    el.syncBtn.addEventListener('click', () => refresh());
    el.exportBtn.addEventListener('click', async () => {
      try {
        const data = JSON.stringify(tasks, null, 2);
        await navigator.clipboard.writeText(data);
        toast('Экспорт: JSON в буфер', 'good');
      } catch {
        toast('Не удалось скопировать', 'warn');
      }
    });

    el.addBtn.addEventListener('click', () => openModal('create'));
    el.fab.addEventListener('click', () => openModal('create'));
    el.backdrop.addEventListener('click', closeModal);
    el.closeModal.addEventListener('click', closeModal);

    el.saveBtn.addEventListener('click', saveModal);
    el.deleteBtn.addEventListener('click', deleteModal);

    // card actions (delegation)
    el.cards.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-action]');
      if (!btn) return;
      const card = ev.target.closest('.card');
      if (!card) return;
      const id = Number(card.dataset.id);
      const t = tasks.find(x => x.id === id);
      const action = btn.dataset.action;

      try {
        if (action === 'edit') {
          openModal('edit', t);
          return;
        }
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
    });
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
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initTelegram();
    bind();
    await refresh(true);
  });
})();
