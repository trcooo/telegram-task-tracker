(() => {
  const tg = window.Telegram?.WebApp;
  const API = window.location.origin;

  // --- viewport fix
  function applyTelegramViewportFix() {
    const setVh = () => {
      const h = (tg?.viewportStableHeight || tg?.viewportHeight) ? (tg.viewportStableHeight || tg.viewportHeight) : window.innerHeight;
      document.documentElement.style.setProperty('--tg-vh', `${h}px`);
    };
    setVh();
    tg?.onEvent?.('viewportChanged', setVh);
    window.addEventListener('resize', setVh);
  }

  const el = {
    subtitle: document.getElementById('subtitle'),
    statsPill: document.getElementById('statsPill'),
    avatar: document.getElementById('avatar'),
    cards: document.getElementById('cards'),
    toast: document.getElementById('toast'),
    search: document.getElementById('searchInput'),
    filters: document.getElementById('filters'),
    sectionTitle: document.getElementById('sectionTitleText'),
    sectionCounter: document.getElementById('sectionCounter'),
    quickAdd: document.getElementById('quickAddBtn'),
    navItems: document.querySelectorAll('.navItem'),

    backdrop: document.getElementById('backdrop'),
    modal: document.getElementById('modal'),
    closeModal: document.getElementById('closeModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalHint: document.getElementById('modalHint'),
    fTitle: document.getElementById('fTitle'),
    fDesc: document.getElementById('fDesc'),
    fDate: document.getElementById('fDate'),
    fTime: document.getElementById('fTime'),
    fPriority: document.getElementById('fPriority'),
    fReminder: document.getElementById('fReminder'),
    saveBtn: document.getElementById('saveBtn'),
  };

  let userId = 1;
  let tasks = [];
  let filter = 'active';
  let searchQuery = '';
  let editingId = null;


  const kpiActive = document.getElementById('kpiActive');
  const kpiToday = document.getElementById('kpiToday');
  const kpiOverdue = document.getElementById('kpiOverdue');
  const syncBtn = document.getElementById('syncBtn');
  const exportBtn = document.getElementById('exportBtn');

  function updateKPIs() {
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(0,0,0,0);
    const endToday = new Date(now); endToday.setHours(23,59,59,999);
    const active = tasks.filter(t => !t.completed).length;
    const today = tasks.filter(t => !t.completed && t.due_at && (new Date(t.due_at) >= startToday && new Date(t.due_at) <= endToday)).length;
    const overdue = tasks.filter(t => !t.completed && t.due_at && (new Date(t.due_at) < now)).length;
    if (kpiActive) kpiActive.textContent = String(active);
    if (kpiToday) kpiToday.textContent = String(today);
    if (kpiOverdue) kpiOverdue.textContent = String(overdue);
  }


  function toast(msg, type='info') {
    el.toast.textContent = msg;
    el.toast.className = `toast ${type} show`;
    setTimeout(() => el.toast.classList.remove('show'), 2200);
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  function dueMeta(t) {
    if (!t.due_at) return { label: 'Без срока', overdue: false, soon: false, today: false };
    const d = new Date(t.due_at);
    const now = new Date();
    const overdue = !t.completed && d < now;

    const startToday = new Date(now); startToday.setHours(0,0,0,0);
    const endToday = new Date(now); endToday.setHours(23,59,59,999);
    const today = d >= startToday && d <= endToday;

    const soon = !overdue && !t.completed && (d.getTime() - now.getTime()) <= 48*60*60*1000;

    const date = d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit' });
    const time = d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
    return { label: `${date} • ${time}`, overdue, soon, today };
  }

  async function apiGetTasks() {
    const r = await fetch(`${API}/api/tasks/${userId}`);
    if (!r.ok) throw new Error('get tasks failed');
    return await r.json();
  }
  async function apiCreate(payload) {
    const r = await fetch(`${API}/api/tasks`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('create failed');
    return await r.json();
  }
  async function apiUpdate(id, payload) {
    const r = await fetch(`${API}/api/tasks/${id}`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('update failed');
    return await r.json();
  }
  async function apiDelete(id) {
    const r = await fetch(`${API}/api/tasks/${id}`, {method:'DELETE'});
    if (!r.ok) throw new Error('delete failed');
    return await r.json();
  }
  async function apiToggle(id, done) {
    const ep = done ? 'done' : 'undone';
    const r = await fetch(`${API}/api/tasks/${id}/${ep}`, {method:'POST'});
    if (!r.ok) throw new Error('toggle failed');
    return await r.json();
  }

  function openModal(mode='create', task=null) {
    editingId = mode === 'edit' ? task.id : null;
    el.modalTitle.textContent = mode === 'edit' ? 'Редактировать' : 'Новая задача';
    el.modalHint.textContent = mode === 'edit' ? 'Изменения сохранятся без дублей. Напоминание пересчитается.' : 'Укажи дату/время — бот напомнит за 15 минут.';
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
  }
  function closeModal() {
    el.backdrop.classList.remove('show');
    el.modal.classList.remove('show');
  }

  function isoFromInputs(dateStr, timeStr) {
    if (!dateStr) return null;
    let dt;
    if (timeStr) dt = new Date(`${dateStr}T${timeStr}`);
    else {
      dt = new Date(dateStr);
      dt.setHours(23, 59, 0, 0);
    }
    return dt.toISOString();
  }

  function filteredTasks() {
    const q = searchQuery.trim().toLowerCase();
    let list = [...tasks];

    if (q) {
      list = list.filter(t =>
        (t.title||'').toLowerCase().includes(q) ||
        (t.description||'').toLowerCase().includes(q)
      );
    }

    if (filter === 'active') list = list.filter(t => !t.completed);
    if (filter === 'done') list = list.filter(t => t.completed);
    if (filter === 'overdue') list = list.filter(t => dueMeta(t).overdue);
    if (filter === 'today') list = list.filter(t => dueMeta(t).today && !t.completed);
    if (filter === 'upcoming') list = list.filter(t => dueMeta(t).soon && !t.completed);

    // priority first, then due_at
    const pr = {high:0, medium:1, low:2};
    list.sort((a,b) => (pr[a.priority]??1)-(pr[b.priority]??1) || ((a.due_at?Date.parse(a.due_at):9e15)-(b.due_at?Date.parse(b.due_at):9e15)));
    return list;
  }

  function render() {
    const activeCount = tasks.filter(t => !t.completed).length;
    el.statsPill.textContent = `${activeCount} активных`;
    updateKPIs();

    const list = filteredTasks();
    el.sectionTitle.textContent = ({
      active:'Активные', today:'Сегодня', overdue:'Просрочено', upcoming:'Скоро', done:'Готово'
    }[filter] || 'Задачи');
    el.sectionCounter.textContent = String(list.length);

    if (list.length === 0) {
      el.cards.innerHTML = `<div class="card"><div class="title">Пусто</div><div class="desc">Добавь задачу кнопкой “＋”.</div></div>`;
      return;
    }

    el.cards.innerHTML = list.map(t => {
      const m = dueMeta(t);
      const tags = [];
      if (m.overdue) tags.push(`<span class="tag bad">Просрочено</span>`);
      else if (m.today) tags.push(`<span class="tag brand">Сегодня</span>`);
      else if (m.soon) tags.push(`<span class="tag brand">Скоро</span>`);
      tags.push(`<span class="tag">${m.label}</span>`);
      if (t.priority === 'high') tags.push(`<span class="tag brand">Высокий</span>`);
      if (t.priority === 'low') tags.push(`<span class="tag">Низкий</span>`);
      if (t.completed) tags.push(`<span class="tag ok">Готово</span>`);

      return `
        <div class="card" data-id="${t.id}">
          <div class="row">
            <div class="check ${t.completed ? 'on' : ''}" data-act="toggle">${t.completed ? '✓' : ''}</div>
            <div style="flex:1">
              <div class="title">${escapeHtml(t.title)}</div>
              ${t.description ? `<div class="desc">${escapeHtml(t.description)}</div>` : ``}
              <div class="meta">${tags.join('')}</div>
              <div class="actions">
                <button class="iconBtn" data-act="edit">Редактировать</button>
                <button class="iconBtn danger" data-act="del">Удалить</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async function refresh() {
    try {
      tasks = await apiGetTasks();
      localStorage.setItem('tasks_cache', JSON.stringify(tasks));
    } catch (e) {
      const cached = localStorage.getItem('tasks_cache');
      tasks = cached ? JSON.parse(cached) : [];
      toast('Нет связи с сервером, показан кэш', 'warning');
    }
    render();
    updateKPIs();
  }

  function initTelegram() {
    applyTelegramViewportFix();
    if (!tg) {
      el.subtitle.textContent = 'Открыто в браузере';
      return;
    }

    tg.expand();
    tg.setHeaderColor('#0B0F14');
    tg.setBackgroundColor('#0B0F14');

    const user = tg.initDataUnsafe?.user;
    if (user?.id) userId = user.id;

    const hour = new Date().getHours();
    let g = 'Привет';
    if (hour >= 5 && hour < 12) g = 'Доброе утро';
    else if (hour >= 12 && hour < 18) g = 'Добрый день';
    else if (hour >= 18 && hour < 23) g = 'Добрый вечер';

    el.subtitle.textContent = `${g}, ${user?.first_name || 'друг'}!`;

    if (user?.photo_url) {
      el.avatar.innerHTML = `<img src="${user.photo_url}" style="width:100%;height:100%;object-fit:cover" />`;
    } else {
      el.avatar.textContent = '👤';
    }
  }

  // --- events
  el.search.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
  });

  el.filters.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter || 'active';
    render();
  });

  el.quickAdd.addEventListener('click', () => openModal('create'));

  if (syncBtn) syncBtn.addEventListener('click', async () => { toast('Синхронизация…', 'info'); await refresh(); });
  if (exportBtn) exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(tasks, null, 2);
    try {
      navigator.clipboard.writeText(data);
      toast('Экспорт: JSON скопирован в буфер', 'success');
    } catch (e) {
      toast('Не удалось скопировать. Открой консоль.', 'warning');
      console.log(data);
    }
  });

  el.closeModal.addEventListener('click', closeModal);
  el.backdrop.addEventListener('click', closeModal);

  el.saveBtn.addEventListener('click', async () => {
    const title = el.fTitle.value.trim();
    if (!title) return toast('Введите название', 'warning');

    const payload = {
      user_id: userId,
      title,
      description: el.fDesc.value.trim(),
      priority: el.fPriority.value,
      due_at: isoFromInputs(el.fDate.value, el.fTime.value),
      reminder_enabled: (el.fReminder.value !== 'off')
    };

    try {
      if (editingId) {
        await apiUpdate(editingId, {
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          due_at: payload.due_at,
          reminder_enabled: payload.reminder_enabled
        });
        toast('Задача обновлена (без дублей)', 'success');
      } else {
        await apiCreate(payload);
        toast('Задача добавлена', 'success');
      }
      closeModal();
      await refresh();
    } catch (e) {
      toast('Ошибка сохранения', 'danger');
    }
  });

  el.cards.addEventListener('click', async (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = Number(card.dataset.id);
    const act = e.target.closest('[data-act]')?.dataset?.act;
    if (!act) return;

    const task = tasks.find(t => t.id === id);
    if (!task) return;

    try {
      if (act === 'edit') openModal('edit', task);
      if (act === 'del') {
        if (!confirm('Удалить задачу?')) return;
        await apiDelete(id);
        toast('Удалено', 'info');
        await refresh();
      }
      if (act === 'toggle') {
        await apiToggle(id, !task.completed);
        await refresh();
        if (navigator.vibrate) navigator.vibrate(20);
      }
    } catch (e) {
      toast('Ошибка операции', 'danger');
    }
  });

  // bottom nav quick actions
  document.querySelectorAll('.navItem').forEach(n => {
    n.addEventListener('click', () => {
      document.querySelectorAll('.navItem').forEach(x => x.classList.remove('active'));
      n.classList.add('active');
      const tab = n.dataset.tab;
      if (tab === 'add') return openModal('create');
      if (tab === 'done') {
        // switch to done filter
        document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'done'));
        filter = 'done';
        render();
        return;
      }
      if (tab === 'tasks') {
        document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'active'));
        filter = 'active';
        render();
        return;
      }
      if (tab === 'menu') {
        toast('Меню: скоро добавим экспорт/очистку/настройки', 'info');
      }
    });
  });

  // init
  document.addEventListener('DOMContentLoaded', async () => {
    initTelegram();
    await refresh();
  });
})();
