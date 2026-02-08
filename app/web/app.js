/* TaskFlow v36 - Tick-inspired rewrite (no bot) */
(() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const state = {
    me: { name: "Гость", key: null, is_guest: true, initData: null },
    theme: localStorage.getItem("tf_theme") || "auto",
    tz: localStorage.getItem("tf_tz") || "auto",
    view: "tasks",           // tasks | calendar | overdue | settings
    smart: "inbox",          // inbox today upcoming overdue done
    filter: "active",        // active | all
    listId: 0,               // 0 inbox, >0 custom list
    search: "",
    tasks: [],
    lists: [],
    cal: {
      ym: null,
      selected: todayDateStr(),
    },
    editingId: null,
  };

  function uuidv4() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  function getTelegramUser() {
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (!u) return null;
      const name = (u.first_name || "") + (u.last_name ? (" " + u.last_name) : "");
      return {
        id: u.id,
        username: u.username ? ("@" + u.username) : null,
        name: name.trim() || (u.username ? ("@" + u.username) : "Telegram"),
      };
    } catch (_) { return null; }
  }

  function ensureIdentity() {
    const tgUser = getTelegramUser();
    try{
      const tg = window.Telegram && window.Telegram.WebApp;
      state.me.initData = (tg && tg.initData) ? tg.initData : null;
    }catch(_){ state.me.initData = null; }
    if (tgUser && tgUser.id) {
      state.me.key = `tg:${tgUser.id}`;
      state.me.name = (tgUser.username || tgUser.name || "Telegram");
      state.me.is_guest = false;
      return;
    }
    let gid = localStorage.getItem("tf_guest_id");
    if (!gid) {
      gid = uuidv4();
      localStorage.setItem("tf_guest_id", gid);
    }
    state.me.key = `guest:${gid}`;
    state.me.name = "Гость";
    state.me.is_guest = true;
  }

  function applyTheme() {
    const root = $("#app");
    let t = state.theme;
    if (t === "auto") {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    root.setAttribute("data-theme", t);
    $("#themeSelect").value = state.theme;
    $("#tzSelect").value = state.tz;
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  async function api(path, opts={}) {
    const headers = Object.assign({}, opts.headers || {}, {
      "Content-Type": "application/json",
      "X-User-Key": state.me.key,
      "X-User-Name": state.me.name,
      ...(state.me.initData ? {"X-Telegram-Init-Data": state.me.initData} : {}),
    });
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j.detail || j.error || JSON.stringify(j); } catch(_) {}
      throw new Error(`${res.status} ${detail}`.trim());
    }
    return res.headers.get("content-type")?.includes("application/json") ? res.json() : res.text();
  }

  function todayDateStr() {
    const d = new Date();
    return dateToStr(d);
  }

  function dateToStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }

  function strToDate(s) {
    const [y,m,d] = s.split("-").map(n => parseInt(n,10));
    return new Date(y, m-1, d);
  }

  function fmtDateTime(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    const tz = state.tz;
    const optDate = { year:"numeric", month:"short", day:"2-digit" };
    const optTime = { hour:"2-digit", minute:"2-digit" };
    const dateFmt = new Intl.DateTimeFormat("ru-RU", Object.assign({}, optDate, tz==="auto"?{}:{timeZone:tz}));
    const timeFmt = new Intl.DateTimeFormat("ru-RU", Object.assign({}, optTime, tz==="auto"?{}:{timeZone:tz}));
    return `${dateFmt.format(d)} • ${timeFmt.format(d)}`;
  }

  function isOverdue(t) {
    if (!t.due_at || t.completed) return false;
    return new Date(t.due_at).getTime() < Date.now();
  }

  function isToday(t) {
    if (!t.due_at) return false;
    const d = new Date(t.due_at);
    const now = new Date();
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
  }

  function isUpcoming(t) {
    if (!t.due_at || t.completed) return false;
    const d = new Date(t.due_at);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
    const diff = d.getTime() - start.getTime();
    return diff > 0 && diff <= 1000*60*60*24*14; // next 14 days
  }

  function belongsToSelection(t) {
    // list selection first (inbox vs list)
    if (state.listId === 0) {
      if (t.list_id !== null && t.list_id !== undefined) return false;
    } else {
      if (t.list_id !== state.listId) return false;
    }

    // smart filter
    switch(state.smart) {
      case "list": return true;
      case "inbox": return !t.completed && !t.due_at;
      case "today": return !t.completed && isToday(t);
      case "upcoming": return !t.completed && (isUpcoming(t) || (t.due_at && new Date(t.due_at) > new Date()));
      case "overdue": return isOverdue(t);
      case "done": return !!t.completed;
      default: return true;
    }
  }

  function matchesSearch(t) {
    const q = state.search.trim().toLowerCase();
    if (!q) return true;
    return (t.title||"").toLowerCase().includes(q) || (t.description||"").toLowerCase().includes(q);
  }

  function filteredTasks() {
    let items = state.tasks.slice();
    if (state.smart === "inbox" || state.smart === "today" || state.smart === "upcoming" || state.smart === "overdue" || state.smart === "done") {
      items = items.filter(belongsToSelection);
    } else {
      // if no smart, still apply list selection
      items = items.filter(t => (state.listId===0 ? (t.list_id==null) : (t.list_id===state.listId)));
    }
    if (state.filter === "active") items = items.filter(t => !t.completed);
    items = items.filter(matchesSearch);
    // sort: incomplete first, then due, then id desc
    items.sort((a,b)=>{
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return b.id - a.id;
    });
    return items;
  }

  function listMeta(listId) {
    const l = state.lists.find(x => x.id === listId);
    return l || { id: 0, name: "Входящие", color: "#4A90E2" };
  }

  // -------------------- rendering --------------------
  function setView(view) {
    state.view = view;
    $$(".view").forEach(v => v.classList.remove("view--active"));
    $("#viewTasks").classList.toggle("view--active", view==="tasks");
    $("#viewCalendar").classList.toggle("view--active", view==="calendar");
    $("#viewOverdue").classList.toggle("view--active", view==="overdue");
    $("#viewSettings").classList.toggle("view--active", view==="settings");

    $$(".bnav").forEach(b => b.classList.remove("bnav--active"));
    const btn = $(`.bnav[data-nav="${view}"]`);
    if (btn) btn.classList.add("bnav--active");

    // title
    if (view==="tasks") {
      const l = listMeta(state.listId);
      $("#pageTitle").textContent = smartTitle();
      $("#pageSubtitle").textContent = l.id===0 ? "Входящие" : l.name;
    } else if (view==="calendar") {
      $("#pageTitle").textContent = "Календарь";
      $("#pageSubtitle").textContent = "Месяц и задачи";
    } else if (view==="overdue") {
      $("#pageTitle").textContent = "Просрочено";
      $("#pageSubtitle").textContent = "Требуют внимания";
    } else {
      $("#pageTitle").textContent = "Меню";
      $("#pageSubtitle").textContent = state.me.is_guest ? "Гость" : state.me.name;
    }

    if (view==="calendar") renderCalendar();
    if (view==="overdue") renderOverdue();
  }

  function smartTitle() {
    switch(state.smart){
      case "inbox": return "Входящие";
      case "today": return "Сегодня";
      case "upcoming": return "Предстоящие";
      case "overdue": return "Просрочено";
      case "done": return "Завершено";
      case "list": return listMeta(state.listId).name;
      default: return "Задачи";
    }
  }

  function renderDrawer() {
    $("#userName").textContent = state.me.name || "Гость";
    $("#userSub").textContent = state.me.is_guest ? "Режим браузера" : "Telegram WebApp";

    // smart items
    $$(".navitem").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.smart === state.smart && state.view==="tasks");
    });

    // lists
    const wrap = $("#listsWrap");
    wrap.innerHTML = "";
    state.lists.filter(l => l.id !== 0).forEach(l => {
      const btn = document.createElement("button");
      btn.className = "listitem" + (state.listId===l.id ? " active" : "");
      btn.innerHTML = `
        <div class="listitem__left">
          <span class="dot" style="background:${l.color}"></span>
          <span class="listname">${escapeHtml(l.name)}</span>
        </div>
        <span class="count">${countList(l.id)}</span>
      `;
      btn.onclick = () => {
        state.listId = l.id;
        state.smart = "list"; // custom list view
        setView("tasks");
        closeDrawer();
        renderAll();
      };
      wrap.appendChild(btn);
    });
  }

  function countList(listId) {
    return state.tasks.filter(t => !t.completed && (listId===0 ? (t.list_id==null) : (t.list_id===listId))).length;
  }

  function renderTasks() {
    const list = $("#tasksList");
    const items = filteredTasks();
    list.innerHTML = "";
    $("#emptyState").classList.toggle("hidden", items.length>0);

    items.forEach(t => {
      const l = listMeta(t.list_id || 0);
      const el = document.createElement("div");
      el.className = "task";
      const due = fmtDateTime(t.due_at);
      const overdue = isOverdue(t);
      const done = !!t.completed;

      el.innerHTML = `
        <div class="cb ${done ? "done" : ""}" data-id="${t.id}"></div>
        <div class="task__main">
          <div class="task__title ${done ? "done" : ""}">${escapeHtml(t.title)}</div>
          ${t.description ? `<div class="task__desc">${escapeHtml(t.description)}</div>` : ""}
          <div class="task__meta">
            ${due ? `<span class="pill ${overdue ? "warn" : "accent"}">${escapeHtml(due)}</span>` : ""}
            <span class="pill listtag"><span class="tagdot" style="background:${l.color}"></span>${escapeHtml(l.name)}</span>
            ${t.priority==="high" ? `<span class="pill warn">Высокий</span>` : (t.priority==="low" ? `<span class="pill">Низкий</span>` : "")}
          </div>
        </div>
      `;
      el.querySelector(".cb").onclick = async (e) => {
        e.stopPropagation();
        await toggleDone(t);
      };
      el.onclick = () => openEdit(t.id);
      list.appendChild(el);
    });
  }

  function renderOverdue() {
    const items = state.tasks.filter(t => isOverdue(t)).sort((a,b)=> new Date(a.due_at)-new Date(b.due_at));
    const list = $("#overdueList");
    list.innerHTML = "";
    $("#overdueEmpty").classList.toggle("hidden", items.length>0);
    items.forEach(t => {
      const l = listMeta(t.list_id || 0);
      const el = document.createElement("div");
      el.className = "task";
      const due = fmtDateTime(t.due_at);
      el.innerHTML = `
        <div class="cb" data-id="${t.id}"></div>
        <div class="task__main">
          <div class="task__title">${escapeHtml(t.title)}</div>
          <div class="task__meta">
            <span class="pill warn">${escapeHtml(due || "Срок")}</span>
            <span class="pill listtag"><span class="tagdot" style="background:${l.color}"></span>${escapeHtml(l.name)}</span>
          </div>
        </div>
      `;
      el.querySelector(".cb").onclick = async (e) => { e.stopPropagation(); await toggleDone(t); };
      el.onclick = () => openEdit(t.id);
      list.appendChild(el);
    });
  }

  function renderFilterChips() {
    $$("#filterChips .chip").forEach(ch => {
      ch.classList.toggle("chip--active", ch.dataset.filter === state.filter);
    });
  }

  function renderTaskListSelect() {
    const sel = $("#taskListSelect");
    sel.innerHTML = "";
    state.lists.forEach(l => {
      const opt = document.createElement("option");
      opt.value = String(l.id);
      opt.textContent = l.name;
      sel.appendChild(opt);
    });
  }

  function renderCalendar() {
    // set month based on selection if not set
    if (!state.cal.ym) {
      const d = strToDate(state.cal.selected);
      state.cal.ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    }
    const [yy,mm] = state.cal.ym.split("-").map(n=>parseInt(n,10));
    const first = new Date(yy, mm-1, 1);
    const startDow = (first.getDay()+6)%7; // Mon=0
    const daysInMonth = new Date(yy, mm, 0).getDate();

    // title
    const monthName = new Intl.DateTimeFormat("ru-RU", { month:"long", year:"numeric" }).format(first);
    $("#calTitle").textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const grid = $("#calGrid");
    grid.innerHTML = "";

    // previous month trailing days
    const prevDays = new Date(yy, mm-1, 0).getDate();
    for (let i=0; i<startDow; i++){
      const dayNum = prevDays - startDow + i + 1;
      const d = new Date(yy, mm-2, dayNum);
      grid.appendChild(dayCell(d, true));
    }
    // current month
    for (let day=1; day<=daysInMonth; day++){
      const d = new Date(yy, mm-1, day);
      grid.appendChild(dayCell(d, false));
    }
    // next month leading days to fill 6 rows
    const totalCells = startDow + daysInMonth;
    const nextFill = (totalCells <= 35) ? (42 - totalCells) : (49 - totalCells);
    for (let i=1; i<=nextFill; i++){
      const d = new Date(yy, mm, i);
      grid.appendChild(dayCell(d, true));
    }

    renderAgenda();
  }

  function dayCell(dateObj, muted) {
    const s = dateToStr(dateObj);
    const el = document.createElement("div");
    el.className = "day" + (muted ? " muted" : "") + (s===state.cal.selected ? " sel" : "");
    const dots = dayDots(s);
    el.innerHTML = `
      <div class="daynum">${dateObj.getDate()}</div>
      <div class="dots">${dots}</div>
    `;
    el.onclick = () => {
      state.cal.selected = s;
      renderCalendar();
    };
    return el;
  }

  function tasksOnDate(dateStr) {
    return state.tasks.filter(t => {
      if (!t.due_at) return false;
      const d = new Date(t.due_at);
      const s = dateToStr(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      return s === dateStr;
    });
  }

  function dayDots(dateStr) {
    const items = tasksOnDate(dateStr);
    if (!items.length) return "";
    const hasOver = items.some(isOverdue);
    const hasDone = items.some(t => t.completed);
    const hasAct = items.some(t => !t.completed);
    const dots = [];
    if (hasOver) dots.push('<span class="warn"></span>');
    if (hasAct) dots.push('<span class="accent"></span>');
    if (hasDone) dots.push('<span class="good"></span>');
    return dots.slice(0,3).join("");
  }

  function renderAgenda() {
    const d = strToDate(state.cal.selected);
    const title = new Intl.DateTimeFormat("ru-RU", { weekday:"long", day:"numeric", month:"long" }).format(d);
    $("#agendaTitle").textContent = title.charAt(0).toUpperCase() + title.slice(1);

    const list = $("#agendaList");
    const items = tasksOnDate(state.cal.selected).sort((a,b)=> (new Date(a.due_at||0)) - (new Date(b.due_at||0)));
    list.innerHTML = "";
    $("#agendaEmpty").classList.toggle("hidden", items.length>0);

    items.forEach(t => {
      const l = listMeta(t.list_id || 0);
      const el = document.createElement("div");
      el.className = "task";
      const due = fmtDateTime(t.due_at);
      const overdue = isOverdue(t);
      el.innerHTML = `
        <div class="cb ${t.completed ? "done" : ""}"></div>
        <div class="task__main">
          <div class="task__title ${t.completed ? "done" : ""}">${escapeHtml(t.title)}</div>
          <div class="task__meta">
            ${due ? `<span class="pill ${overdue ? "warn" : "accent"}">${escapeHtml(due)}</span>` : ""}
            <span class="pill listtag"><span class="tagdot" style="background:${l.color}"></span>${escapeHtml(l.name)}</span>
          </div>
        </div>
      `;
      el.querySelector(".cb").onclick = async (e)=>{ e.stopPropagation(); await toggleDone(t); };
      el.onclick = ()=> openEdit(t.id);
      list.appendChild(el);
    });
  }

  function renderAll(){
    renderDrawer();
    renderFilterChips();
    renderTasks();
    if (state.view==="calendar") renderCalendar();
    if (state.view==="overdue") renderOverdue();
    $("#menuUser").textContent = state.me.name + (state.me.is_guest ? " (гость)" : "");
  }

  function escapeHtml(s){
    return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // -------------------- data ops --------------------
  async function loadAll() {
    $("#syncBtn").disabled = true;
    try {
      const me = await api("/api/me");
      state.me.name = me.name || state.me.name;
      state.me.is_guest = !!me.is_guest;

      state.lists = await api("/api/lists");
      state.tasks = await api("/api/tasks");
      renderTaskListSelect();
      renderAll();
    } catch (e) {
      console.error(e);
      toast("Нет связи с сервером");
    } finally {
      $("#syncBtn").disabled = false;
    }
  }

  async function toggleDone(task) {
    try {
      const path = task.completed ? `/api/tasks/${task.id}/undone` : `/api/tasks/${task.id}/done`;
      const updated = await api(path, { method:"POST" });
      const idx = state.tasks.findIndex(x=>x.id===updated.id);
      if (idx>=0) state.tasks[idx] = updated;
      renderAll();
    } catch(e){
      console.error(e);
      toast("Не удалось обновить задачу");
    }
  }

  function openAdd(prefill={}) {
    state.editingId = null;
    $("#sheetTitle").textContent = "Новая задача";
    $("#editActions").classList.add("hidden");

    $("#taskTitleInput").value = prefill.title || "";
    $("#taskDescInput").value = prefill.description || "";

    // date/time
    $("#taskDateInput").value = prefill.date || "";
    $("#taskTimeInput").value = prefill.time || "";

    // list
    renderTaskListSelect();
    $("#taskListSelect").value = String(prefill.listId ?? state.listId ?? 0);

    $("#taskPrioSelect").value = prefill.priority || "medium";

    openSheet();
  }

  function openEdit(id) {
    const t = state.tasks.find(x=>x.id===id);
    if (!t) return;
    state.editingId = id;
    $("#sheetTitle").textContent = "Редактирование";
    $("#editActions").classList.remove("hidden");

    $("#taskTitleInput").value = t.title || "";
    $("#taskDescInput").value = t.description || "";
    $("#taskPrioSelect").value = t.priority || "medium";

    renderTaskListSelect();
    $("#taskListSelect").value = String(t.list_id ?? 0);

    if (t.due_at) {
      const d = new Date(t.due_at);
      $("#taskDateInput").value = dateToStr(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      const hh = String(d.getHours()).padStart(2,"0");
      const mm = String(d.getMinutes()).padStart(2,"0");
      $("#taskTimeInput").value = `${hh}:${mm}`;
    } else {
      $("#taskDateInput").value = "";
      $("#taskTimeInput").value = "";
    }

    $("#toggleDoneBtn").textContent = t.completed ? "Сделать активной" : "Завершить";
    openSheet();
  }

  async function saveTask() {
    const title = $("#taskTitleInput").value.trim();
    const description = $("#taskDescInput").value.trim();
    const priority = $("#taskPrioSelect").value;
    const listId = parseInt($("#taskListSelect").value,10);

    if (!title) { toast("Название обязательно"); return; }

    // build due_at
    const ds = $("#taskDateInput").value;
    const ts = $("#taskTimeInput").value;
    let due_at = null;
    if (ds) {
      const [y,m,d] = ds.split("-").map(n=>parseInt(n,10));
      let hh = 0, mm = 0;
      if (ts) { [hh,mm] = ts.split(":").map(n=>parseInt(n,10)); }
      const local = new Date(y, m-1, d, hh, mm, 0, 0);
      due_at = local.toISOString(); // send UTC Z
    }

    const payload = { title, description, priority, due_at, list_id: listId };

    $("#saveTaskBtn").disabled = true;
    try {
      if (state.editingId) {
        const updated = await api(`/api/tasks/${state.editingId}`, { method:"PUT", body: JSON.stringify(payload) });
        const idx = state.tasks.findIndex(x=>x.id===updated.id);
        if (idx>=0) state.tasks[idx] = updated;
        toast("Сохранено");
      } else {
        const created = await api("/api/tasks", { method:"POST", body: JSON.stringify(payload) });
        state.tasks.unshift(created);
        toast("Добавлено");
      }
      closeSheet();
      renderAll();
    } catch(e){
      console.error(e);
      toast(`Не удалось сохранить: ${e.message || ""}`.trim());
    } finally {
      $("#saveTaskBtn").disabled = false;
    }
  }

  async function deleteTask() {
    if (!state.editingId) return;
    const id = state.editingId;
    try {
      await api(`/api/tasks/${id}`, { method:"DELETE" });
      state.tasks = state.tasks.filter(t=>t.id!==id);
      toast("Удалено");
      closeSheet();
      renderAll();
    } catch(e){
      console.error(e);
      toast("Не удалось удалить");
    }
  }

  async function toggleDoneFromSheet() {
    if (!state.editingId) return;
    const t = state.tasks.find(x=>x.id===state.editingId);
    if (!t) return;
    await toggleDone(t);
    closeSheet();
  }

  // -------------------- drawer/sheet modal --------------------
  function openDrawer(){
    const dr = $("#drawer");
    dr.classList.add("open");
    dr.setAttribute("aria-hidden", "false");
  }
  function closeDrawer(){
    const dr = $("#drawer");
    dr.classList.remove("open");
    dr.setAttribute("aria-hidden", "true");
  }

  function openSheet(){
    $("#sheetBackdrop").classList.remove("hidden");
    $("#taskSheet").classList.remove("hidden");
    setTimeout(()=>$("#taskTitleInput").focus(), 80);
  }
  function closeSheet(){
    $("#sheetBackdrop").classList.add("hidden");
    $("#taskSheet").classList.add("hidden");
  }

  function openListModal(){
    $("#listModalBackdrop").classList.remove("hidden");
    $("#listModal").classList.remove("hidden");
    $("#listNameInput").value = "";
    $("#listColorInput").value = "#2ECC71";
    setTimeout(()=>$("#listNameInput").focus(), 80);
  }
  function closeListModal(){
    $("#listModalBackdrop").classList.add("hidden");
    $("#listModal").classList.add("hidden");
  }

  async function createList(){
    const name = $("#listNameInput").value.trim();
    const color = $("#listColorInput").value;
    if (!name) { toast("Название списка обязательно"); return; }
    $("#createListBtn").disabled = true;
    try{
      const created = await api("/api/lists", { method:"POST", body: JSON.stringify({ name, color }) });
      // reload full lists to include virtual inbox
      state.lists = await api("/api/lists");
      renderTaskListSelect();
      closeListModal();
      toast("Список создан");
      renderAll();
    } catch(e){
      console.error(e);
      toast("Не удалось создать список");
    } finally {
      $("#createListBtn").disabled = false;
    }
  }

  function exportJson(){
    const data = { exported_at: new Date().toISOString(), me: state.me, lists: state.lists, tasks: state.tasks };
    const str = JSON.stringify(data, null, 2);
    navigator.clipboard?.writeText(str).then(()=>toast("Экспорт скопирован")).catch(()=>{
      // fallback download
      const blob = new Blob([str], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "taskflow_export.json";
      a.click();
      toast("Экспорт скачан");
    });
  }

  // -------------------- events --------------------
  function bindEvents(){
    $("#openDrawerBtn").onclick = openDrawer;
    $("#closeDrawerBtn").onclick = closeDrawer;
    $("#openDrawerFromMenu").onclick = openDrawer;

    // smart nav
    $$(".navitem").forEach(btn => {
      btn.onclick = () => {
        state.smart = btn.dataset.smart;
        state.listId = 0; // smart lists are inbox-based
        setView(state.smart === "overdue" ? "overdue" : "tasks");
        closeDrawer();
        renderAll();
      };
    });

    // bottom nav
    $$(".bnav[data-nav]").forEach(btn=>{
      btn.onclick = () => {
        const v = btn.dataset.nav;
        if (v==="tasks") { state.smart = "inbox"; state.listId = 0; }
        setView(v);
        renderAll();
      };
    });
    $("#navAdd").onclick = () => openAdd({ listId: state.listId });

    $("#syncBtn").onclick = loadAll;
    $("#quickAddBtn").onclick = () => openAdd({ listId: state.listId });
    $("#addFromCalendarBtn").onclick = () => openAdd({ date: state.cal.selected, listId: state.listId });

    $("#searchInput").oninput = (e)=>{ state.search = e.target.value; renderTasks(); };
    $("#clearSearchBtn").onclick = ()=>{ state.search=""; $("#searchInput").value=""; renderTasks(); };

    $$("#filterChips .chip").forEach(ch=>{
      ch.onclick = ()=>{ state.filter = ch.dataset.filter; renderFilterChips(); renderTasks(); };
    });

    $("#sheetBackdrop").onclick = closeSheet;
    $("#closeSheetBtn").onclick = closeSheet;
    $("#saveTaskBtn").onclick = saveTask;
    $("#deleteTaskBtn").onclick = deleteTask;
    $("#toggleDoneBtn").onclick = toggleDoneFromSheet;
    $("#clearDueBtn").onclick = ()=>{ $("#taskDateInput").value=""; $("#taskTimeInput").value=""; toast("Срок очищен"); };

    // list modal
    $("#newListBtn").onclick = openListModal;
    $("#listModalBackdrop").onclick = closeListModal;
    $("#closeListModalBtn").onclick = closeListModal;
    $("#createListBtn").onclick = createList;

    // calendar nav
    $("#calPrev").onclick = ()=> shiftMonth(-1);
    $("#calNext").onclick = ()=> shiftMonth(1);

    // settings
    $("#themeSelect").onchange = (e)=>{
      state.theme = e.target.value;
      localStorage.setItem("tf_theme", state.theme);
      applyTheme();
      toast("Тема обновлена");
    };
    $("#tzSelect").onchange = (e)=>{
      state.tz = e.target.value;
      localStorage.setItem("tf_tz", state.tz);
      toast("Часовой пояс сохранён");
      renderAll();
    };

    $("#exportBtn").onclick = exportJson;

    // close drawer on escape
    document.addEventListener("keydown", (e)=>{
      if (e.key==="Escape"){
        closeDrawer();
        closeSheet();
        closeListModal();
      }
    });
  }

  function shiftMonth(delta){
    const [yy,mm] = state.cal.ym.split("-").map(n=>parseInt(n,10));
    const d = new Date(yy, mm-1 + delta, 1);
    state.cal.ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    renderCalendar();
  }

  
  // -------------------- Telegram helpers --------------------
  function applyTelegramParams(){
    try{
      const tg = window.Telegram && window.Telegram.WebApp;
      if (!tg) return;

      // viewport
      const setVh = () => {
        const h = tg.viewportStableHeight || window.innerHeight;
        document.documentElement.style.setProperty("--tg-vh", `${h}px`);
        const inset = tg.safeAreaInset || {};
        const b = (inset.bottom ?? 0);
        const t = (inset.top ?? 0);
        document.documentElement.style.setProperty("--safe-bottom", `${b}px`);
        document.documentElement.style.setProperty("--safe-top", `${t}px`);
      };
      setVh();
      tg.onEvent?.("viewportChanged", setVh);

      // theme params -> CSS variables
      const setTheme = () => {
        const p = tg.themeParams || {};
        const root = document.documentElement.style;
        if (p.bg_color) root.setProperty("--tg-bg", p.bg_color);
        if (p.text_color) root.setProperty("--tg-text", p.text_color);
        if (p.hint_color) root.setProperty("--tg-hint", p.hint_color);
        if (p.secondary_bg_color) root.setProperty("--tg-secondary", p.secondary_bg_color);
        if (p.button_color) root.setProperty("--tg-button", p.button_color);
        if (p.button_text_color) root.setProperty("--tg-button-text", p.button_text_color);
      };
      setTheme();
      tg.onEvent?.("themeChanged", setTheme);

      tg.ready?.();
      tg.expand?.();
    }catch(_){}
  }

// -------------------- boot --------------------
  function boot(){
    ensureIdentity();
    applyTelegramParams();
    applyTheme();

    // telegram polish
    try{
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg) {
        tg.expand();
        tg.setHeaderColor?.("secondary_bg_color");
        tg.setBackgroundColor?.("secondary_bg_color");
      }
    } catch(_){}

    bindEvents();
    $("#userName").textContent = state.me.name;

    // init calendar month
    const td = strToDate(state.cal.selected);
    state.cal.ym = `${td.getFullYear()}-${String(td.getMonth()+1).padStart(2,"0")}`;

    loadAll();
    setView("tasks");
  }

  boot();
})();
