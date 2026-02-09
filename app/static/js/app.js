const state = {
  date: new Date(),
  projects: [],
  tasks: [],
  events: [],
  mode: "task",     // task | event
  tab: "schedule",  // schedule | tasks | calendar
  tasksFilter: "inbox",
  tasksSearch: "",
  weekSelected: null, // Date
};

let openSwipeEl = null;


function prefersReducedMotion(){
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animateIn(el, {y=8, duration=200, delay=0} = {}){
  if(!el || prefersReducedMotion()) return;
  try{
    el.animate(
      [
        {opacity: 0, transform: `translateY(${y}px) scale(0.985)`},
        {opacity: 1, transform: "translateY(0px) scale(1)"}
      ],
      {duration, delay, easing: "cubic-bezier(.2,.9,.2,1)", fill: "both"}
    );
  }catch(e){}
}

function animateList(container, selector){
  if(!container || prefersReducedMotion()) return;
  const items = Array.from(container.querySelectorAll(selector));
  items.forEach((el, i)=> animateIn(el, {y: 10, duration: 220, delay: Math.min(i*18, 160)}));
}

function moveTabIndicator(){
  const ind = document.getElementById("tabIndicator");
  const active = document.querySelector(".bottom .tab.active");
  if(!ind || !active) return;
  const r1 = active.getBoundingClientRect();
  const r2 = ind.parentElement.getBoundingClientRect();
  const w = Math.max(64, Math.min(96, r1.width - 22));
  const x = (r1.left - r2.left) + (r1.width - w)/2;
  ind.style.width = `${w}px`;
  ind.style.transform = `translateX(${x}px)`;
}


function pad2(n){ return String(n).padStart(2,'0'); }
function toISODate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0); }
function addMinutes(d, mins){ return new Date(d.getTime() + mins*60000); }
function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function fmtDayPill(d){
  const opts = {weekday:"short", month:"short", day:"numeric"};
  return d.toLocaleDateString("ru-RU", opts);
}
function weekdayShort(d){
  return d.toLocaleDateString("ru-RU", {weekday:"short"}).slice(0,2);
}

/* ---------------- UI: screens & header ---------------- */
function setHeaderForTab(){
  const titleEl = document.querySelector(".title");
  const subEl = document.getElementById("subtitle");
  if(!titleEl || !subEl) return;

  if(state.tab === "schedule"){
    titleEl.textContent = "Schedule";
    subEl.textContent = "План дня и тайм-блоки";
  }else if(state.tab === "tasks"){
    titleEl.textContent = "Tasks";
    subEl.textContent = "Список задач и фильтры";
  }else{
    titleEl.textContent = "Week";
    subEl.textContent = "Обзор недели";
  }
}

function setTab(tab){
  state.tab = tab;

  const sc = document.getElementById("screenSchedule");
  const ts = document.getElementById("screenTasks");
  const wk = document.getElementById("screenWeek");

  sc?.classList.toggle("active", tab==="schedule");
  ts?.classList.toggle("active", tab==="tasks");
  wk?.classList.toggle("active", tab==="calendar");

  document.querySelectorAll(".bottom .tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab===tab);
  });

  setHeaderForTab();
  updateFabForTab();
  moveTabIndicator();
  moveTabIndicator();

  if(window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback?.selectionChanged();

  // Animate screen entrance (JS-based)
  const screen = (tab==="schedule") ? sc : (tab==="tasks") ? ts : wk;
  animateIn(screen, {y: 6, duration: 200});

  // lazy refresh
  if(tab==="tasks") refreshTasksScreen();
  if(tab==="calendar") refreshWeekScreen();
}


function updateFabForTab(){
  const fab = document.getElementById("fab");
  if(!fab) return;
  fab.style.display = "block";
  fab.title = (state.tab === "calendar") ? "Add event" : "Add task";
}

/* ---------------- Schedule UI ---------------- */
function buildWeekStrip(){
  const weekEl = document.getElementById("week");
  if(!weekEl) return;
  weekEl.innerHTML = "";

  const base = startOfDay(state.date);
  for(let i=-3;i<=3;i++){
    const d = new Date(base.getTime() + i*86400000);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "daychip" + (toISODate(d)===toISODate(state.date) ? " active":"");
    chip.innerHTML = `<div class="dname">${weekdayShort(d)}</div><div class="dnum">${d.getDate()}</div>`;
    chip.onclick = () => { state.date = d; refreshAll(); };
    weekEl.appendChild(chip);
  }

  const pill = document.getElementById("selectedDatePill");
  if(pill) pill.textContent = fmtDayPill(state.date);
}

function buildDayGrid(){
  const grid = document.getElementById("dayGrid");
  if(!grid) return;
  grid.innerHTML = "";

  const startH = 7, endH = 23, step = 30;

  for(let h=startH; h<=endH; h++){
    for(let m=0; m<60; m+=step){
      if(h===endH && m>0) continue;

      const slot = document.createElement("div");
      slot.className = "slot";

      const label = document.createElement("div");
      label.className = "stime";
      label.textContent = `${pad2(h)}:${pad2(m)}`;

      const drop = document.createElement("div");
      drop.className = "sdrop";
      drop.dataset.hour = String(h);
      drop.dataset.min = String(m);

      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", async (e) => {
        e.preventDefault();
        drop.classList.remove("over");
        const taskId = e.dataTransfer.getData("text/taskId");
        if(!taskId) return;

        const d0 = startOfDay(state.date);
        const start = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), h, m, 0, 0);

        try{
          await API.planTask(Number(taskId), start.toISOString(), 30);
          await refreshAll();
          if(window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback?.notificationOccurred("success");
        }catch(err){
          alert("Не удалось запланировать: " + err);
        }
      });

      slot.appendChild(label);
      slot.appendChild(drop);
      grid.appendChild(slot);
    }
  }
}

function renderEventsOnGrid(){
  const grid = document.getElementById("dayGrid");
  if(!grid) return;
  const drops = grid.querySelectorAll(".sdrop");
  drops.forEach(d => d.innerHTML = "");

  const evs = state.events.slice().sort((a,b)=> new Date(a.start_dt) - new Date(b.start_dt));

  for(const ev of evs){
    const s = new Date(ev.start_dt);
    const e = new Date(ev.end_dt);

    const h = s.getHours();
    const m = s.getMinutes();
    const snappedM = (m<15)?0:(m<45)?30:0;
    const snappedH = (m<45)?h:h+1;

    const drop = grid.querySelector(`.sdrop[data-hour="${snappedH}"][data-min="${snappedM}"]`);
    if(!drop) continue;

    const card = document.createElement("div");
    card.className = "card";

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.background = ev.color || "#6EA8FF";

    const body = document.createElement("div");
    body.className = "cbody";
    const t1 = `${pad2(s.getHours())}:${pad2(s.getMinutes())}–${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
    body.innerHTML = `
      <div class="ctime">${t1}</div>
      <div class="ctitle">${escapeHtml(ev.title)}</div>
      <div class="cmeta">${ev.source === "task" ? "Task block" : "Event"}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "cactions";
    const btnDel = document.createElement("button");
    btnDel.className = "iconbtn";
    btnDel.type = "button";
    btnDel.textContent = "🗑️";
    btnDel.onclick = async () => {
      if(!confirm("Удалить блок?")) return;
      await API.deleteEvent(ev.id);
      await refreshAll();
      if(state.tab==="calendar") refreshWeekScreen();
    };
    actions.appendChild(btnDel);

    card.appendChild(bar);
    card.appendChild(body);
    card.appendChild(actions);
    drop.appendChild(card);
  }
}

/* ---------------- Swipe to delete ---------------- */
function attachSwipeToDelete(wrapperEl, onDelete){
  const inner = wrapperEl.querySelector(".task-inner");
  if(!inner) return;

  let startX=0, curX=0, dragging=false;

  const close = () => wrapperEl.classList.remove("open");
  const open = () => {
    if(openSwipeEl && openSwipeEl !== wrapperEl){
      openSwipeEl.classList.remove("open");
    }
    wrapperEl.classList.add("open");
    openSwipeEl = wrapperEl;
  };

  inner.addEventListener("touchstart", (e)=>{
    if(e.touches.length !== 1) return;
    dragging = true;
    startX = e.touches[0].clientX;
    curX = startX;
  }, {passive:true});

  inner.addEventListener("touchmove", (e)=>{
    if(!dragging) return;
    curX = e.touches[0].clientX;
    const dx = curX - startX;
    if(dx < -10) e.preventDefault();
  }, {passive:false});

  inner.addEventListener("touchend", ()=>{
    if(!dragging) return;
    dragging = false;
    const dx = curX - startX;
    if(dx < -40) open();
    else if(dx > 30) close();
    else if(wrapperEl.classList.contains("open")) close();
  }, {passive:true});

  const delBtn = wrapperEl.querySelector(".swipe-btn.del");
  if(delBtn){
    delBtn.addEventListener("click", async (e)=>{
      e.stopPropagation();
      await onDelete();
      close();
    });
  }
}

document.addEventListener("touchstart", (e)=>{
  if(openSwipeEl && !openSwipeEl.contains(e.target)){
    openSwipeEl.classList.remove("open");
    openSwipeEl = null;
  }
}, {passive:true});

/* ---------------- Tasks rendering ---------------- */
function renderTasksTo(listEl, tasks){
  listEl.innerHTML = "";

  for(const t of tasks){
    const swipe = document.createElement("div");
    swipe.className = "swipe";

    const actions = document.createElement("div");
    actions.className = "swipe-actions";
    actions.innerHTML = `<button class="swipe-btn del" type="button" title="Delete">🗑️</button>`;

    const row = document.createElement("div");
    row.className = "task task-inner" + (t.status==="done" ? " done":"");
    row.draggable = t.status !== "done";

    row.addEventListener("dragstart", (e) => {
      row.classList.add("dragging");
      e.dataTransfer.setData("text/taskId", String(t.id));
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));

    const chk = document.createElement("button");
    chk.className = "chk";
    chk.type = "button";
    chk.textContent = t.status==="done" ? "✓" : "";
    chk.onclick = async (e) => {
      e.stopPropagation();
      if(t.status==="done") return;
      await API.completeTask(t.id);
      await refreshAll();
      await refreshTasksScreen();
      if(state.tab==="calendar") refreshWeekScreen();
    };

    const info = document.createElement("div");
    info.className = "tinfo";
    const proj = t.project ? t.project.name : "No project";
    info.innerHTML = `<div class="tt">${escapeHtml(t.title)}</div><div class="tsub">${proj} • ${t.estimate_min}m • P${t.priority}</div>`;

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = t.status;

    const more = document.createElement("button");
    more.className = "iconbtn";
    more.type = "button";
    more.textContent = "⋯";
    more.onclick = (e) => { e.stopPropagation(); openEditTask(t); };

    row.appendChild(chk);
    row.appendChild(info);
    row.appendChild(badge);
    row.appendChild(more);

    swipe.appendChild(actions);
    swipe.appendChild(row);

    attachSwipeToDelete(swipe, async ()=>{
      if(!confirm("Удалить задачу?")) return;
      await API.deleteTask(t.id);
      await refreshAll();
      await refreshTasksScreen();
      if(state.tab==="calendar") refreshWeekScreen();
      if(window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback?.notificationOccurred("success");
    });

    listEl.appendChild(swipe);
  }
}

function renderInboxTasks(){
  const list = document.getElementById("taskList");
  if(!list) return;
  renderTasksTo(list, state.tasks);
}

/* ---------------- Screens refresh ---------------- */
async function refreshAll(){
  buildWeekStrip();
  buildDayGrid();

  const dateStr = toISODate(state.date);
  state.events = await API.scheduleDay(dateStr);
  state.tasks = await API.listTasks("inbox");

  renderEventsOnGrid();
  renderInboxTasks();

  // keep title pill fresh
  const pill = document.getElementById("selectedDatePill");
  if(pill) pill.textContent = fmtDayPill(state.date);


  // Stagger animation
  animateList(document.getElementById("dayGrid"), ".card");
  animateList(document.getElementById("taskList"), ".swipe");
}

async function refreshTasksScreen(){
  const listEl = document.getElementById("taskListAll");
  if(!listEl) return;

  const raw = await API.listTasks(state.tasksFilter);

  const q = (state.tasksSearch||"").trim().toLowerCase();
  const tasks = q ? raw.filter(t => (t.title||"").toLowerCase().includes(q)) : raw;

  renderTasksTo(listEl, tasks);

  if(tasks.length === 0){
    const msg = document.createElement("div");
    msg.className = "hint";
    msg.style.padding = "12px";
    msg.textContent = "Пока пусто. Нажми + чтобы добавить задачу.";
    listEl.appendChild(msg);
  }


  // Stagger animation
  animateList(document.getElementById("taskListAll"), ".swipe");
}

async function refreshWeekScreen(){
  const box = document.getElementById("weekList");
  if(!box) return;
  box.innerHTML = "";

  const baseD = startOfDay(new Date());
  const days = [];
  for(let i=0;i<7;i++) days.push(new Date(baseD.getTime() + i*86400000));

  const results = await Promise.all(days.map(async (d)=>{
    const dateStr = toISODate(d);
    try{
      const evs = await API.scheduleDay(dateStr);
      return {d, evs};
    }catch(e){
      return {d, evs: []};
    }
  }));

  for(const {d, evs} of results){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "week-item";

    const label = d.toLocaleDateString("ru-RU", {weekday:"short", month:"short", day:"numeric"});
    const left = document.createElement("div");
    left.style.minWidth = "0";
    left.innerHTML = `<div class="wdate">${label}</div><div class="wmeta">${toISODate(d)===toISODate(new Date()) ? "Сегодня" : ""}</div>`;

    const preview = document.createElement("div");
    preview.className = "week-preview";
    const sorted = evs.slice().sort((a,b)=> new Date(a.start_dt) - new Date(b.start_dt));
    const top = sorted.slice(0,2);

    if(top.length === 0){
      preview.innerHTML = `<div class="ev"><span class="dot"></span><span class="n">Нет событий</span></div>`;
    }else{
      preview.innerHTML = top.map(ev=>{
        const s = new Date(ev.start_dt);
        const t = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
        return `<div class="ev"><span class="dot" style="background:${ev.color || 'rgba(16,22,42,.25)'}"></span><span class="t">${t}</span><span class="n">${escapeHtml(ev.title)}</span></div>`;
      }).join("");
    }
    left.appendChild(preview);

    const count = document.createElement("div");
    count.className = "wcount";
    count.textContent = String(evs.length);

    btn.appendChild(left);
    btn.appendChild(count);

    btn.onclick = () => {
      state.weekSelected = d;
      state.date = d;
      setTab("schedule");
      refreshAll();
    };

    box.appendChild(btn);
  }


  // Stagger animation
  animateList(document.getElementById("weekList"), ".week-item");
}

/* ---------------- Modal ---------------- */
function openModal(){
  // Prefill date with current selection
  document.getElementById("inpDate").value = toISODate(state.date);
  const modal = document.getElementById("modal");
  modal.setAttribute("aria-hidden","false");

  // JS animation (extra polish)
  if(!prefersReducedMotion()){
    const sheet = modal.querySelector(".sheet");
    const backdrop = modal.querySelector(".backdrop");
    backdrop?.animate([{opacity:0},{opacity:1}], {duration: 180, easing:"ease", fill:"both"});
    sheet?.animate(
      [{transform:"translateY(18px)", opacity:0},{transform:"translateY(0px)", opacity:1}],
      {duration: 220, easing:"cubic-bezier(.2,.9,.2,1)", fill:"both"}
    );
  }

  setTimeout(()=> document.getElementById("inpTitle")?.focus(), 40);
}

function closeModal(){
  const modal = document.getElementById("modal");
  if(!modal) return;

  if(!prefersReducedMotion()){
    const sheet = modal.querySelector(".sheet");
    const backdrop = modal.querySelector(".backdrop");
    const a1 = backdrop?.animate([{opacity:1},{opacity:0}], {duration: 160, easing:"ease", fill:"both"});
    const a2 = sheet?.animate(
      [{transform:"translateY(0px)", opacity:1},{transform:"translateY(18px)", opacity:0}],
      {duration: 180, easing:"cubic-bezier(.2,.9,.2,1)", fill:"both"}
    );
    const done = () => {
      modal.setAttribute("aria-hidden","true");
      clearModal();
    };
    if(a2){
      a2.onfinish = done;
    }else{
      done();
    }
  }else{
    modal.setAttribute("aria-hidden","true");
    clearModal();
  }
}

function clearModal(){
  document.getElementById("inpTitle").value = "";
  document.getElementById("inpTime").value = "";
  document.getElementById("inpColor").value = "#6EA8FF";
  document.getElementById("selDuration").value = "30";
  document.getElementById("selPriority").value = "2";
  document.getElementById("selEstimate").value = "30";
  document.getElementById("inpDate").value = toISODate(state.date);
  document.getElementById("sheetTitle").textContent = state.mode==="task" ? "Добавить задачу" : "Добавить событие";
  document.getElementById("saveBtn").dataset.editTaskId = "";
}

function setMode(mode){
  state.mode = mode;
  document.getElementById("segTask").classList.toggle("active", mode==="task");
  document.getElementById("segEvent").classList.toggle("active", mode==="event");
  document.getElementById("eventFields").style.display = (mode==="event") ? "grid" : "none";
  document.getElementById("taskFields").style.display = (mode==="task") ? "grid" : "none";
  document.getElementById("sheetTitle").textContent = mode==="task" ? "Добавить задачу" : "Добавить событие";
}

function fillProjects(){
  const sel = document.getElementById("selProject");
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "—";
  sel.appendChild(opt0);

  for(const p of state.projects){
    const o = document.createElement("option");
    o.value = String(p.id);
    o.textContent = p.name;
    sel.appendChild(o);
  }
}

async function saveFromModal(){
  const title = document.getElementById("inpTitle").value.trim();
  if(!title){ alert("Введите название"); return; }

  const dateStr = document.getElementById("inpDate").value || toISODate(state.date);
  const timeStr = document.getElementById("inpTime").value || "09:00";
  const [hh, mm] = timeStr.split(":").map(Number);
  const d = new Date(dateStr + "T00:00:00");
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);

  const projectIdRaw = document.getElementById("selProject").value;
  const project_id = projectIdRaw ? Number(projectIdRaw) : null;

  if(state.mode === "task"){
    const editId = document.getElementById("saveBtn").dataset.editTaskId;
    const priority = Number(document.getElementById("selPriority").value);
    const estimate_min = Number(document.getElementById("selEstimate").value);

    if(editId){
      await API.updateTask(Number(editId), {title, priority, estimate_min, project_id});
    }else{
      await API.createTask({title, priority, estimate_min, project_id});
    }
    closeModal();
    await refreshAll();
    if(state.tab==="tasks") await refreshTasksScreen();
    if(state.tab==="calendar") await refreshWeekScreen();
    return;
  }

  const duration = Number(document.getElementById("selDuration").value);
  const color = document.getElementById("inpColor").value || "#6EA8FF";
  const end = addMinutes(start, duration);
  await API.createEvent({title, start_dt: start.toISOString(), end_dt: end.toISOString(), color, source:"manual"});
  closeModal();
  await refreshAll();
  if(state.tab==="calendar") await refreshWeekScreen();
}

function openEditTask(t){
  setMode("task");
  openModal();
  document.getElementById("inpTitle").value = t.title;
  document.getElementById("selPriority").value = String(t.priority);
  document.getElementById("selEstimate").value = String(t.estimate_min);
  document.getElementById("selProject").value = t.project ? String(t.project.id) : "";
  document.getElementById("saveBtn").dataset.editTaskId = String(t.id);
  document.getElementById("sheetTitle").textContent = "Редактировать задачу";
}

/* ---------------- Boot ---------------- */
async function boot(){
  // Bind UI no matter what (so tabs respond even if auth fails)
  bindUI();

  let initData = "";
  if(window.Telegram?.WebApp){
    const tg = window.Telegram.WebApp;
    tg.ready();
    initData = tg.initData || "";
  }

  if(!initData){
    document.getElementById("subtitle").textContent = "Open inside Telegram";
    alert("Открой Mini App внутри Telegram (через кнопку из бота), чтобы авторизация работала.");
    return;
  }

  await API.authTelegram(initData);
  state.projects = await API.getProjects();
  fillProjects();

  document.getElementById("inpDate").value = toISODate(state.date);

  setTab("schedule");
  requestAnimationFrame(()=> moveTabIndicator());
  await refreshAll();
}

function bindUI(){
  // Bottom tabs: click + touchend (Telegram webview can be picky)
  const map = [
    ["tabSchedule","schedule"],
    ["tabTasks","tasks"],
    ["tabWeek","calendar"],
  ];
  for(const [id, tab] of map){
    const el = document.getElementById(id);
    if(!el) continue;
    const handler = (e)=>{ e.preventDefault(); setTab(tab); };
    el.addEventListener("click", handler, {passive:false});
    el.addEventListener("touchend", handler, {passive:false});
  }

  // Chips
  document.querySelectorAll(".chip").forEach(ch=>{
    ch.addEventListener("click", async ()=>{
      document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
      ch.classList.add("active");
      state.tasksFilter = ch.dataset.filter;
      await refreshTasksScreen();
    });
  });

  // Search
  const s = document.getElementById("tasksSearch");
  if(s){
    s.addEventListener("input", async ()=>{
      state.tasksSearch = s.value || "";
      await refreshTasksScreen();
    });
  }

  // Buttons
  document.getElementById("btnToday")?.addEventListener("click", ()=>{ state.date = new Date(); refreshAll(); });
  document.getElementById("btnRefresh")?.addEventListener("click", refreshAll);
  document.getElementById("btnTasksRefresh")?.addEventListener("click", refreshTasksScreen);
  document.getElementById("btnWeekRefresh")?.addEventListener("click", refreshWeekScreen);

  // Modal controls
  document.getElementById("fab")?.addEventListener("click", ()=>{
    if(state.tab === "calendar") setMode("event");
    else setMode("task");
    openModal();
  });
  document.getElementById("closeModal")?.addEventListener("click", closeModal);
  document.getElementById("backdrop")?.addEventListener("click", closeModal);
  document.getElementById("segTask")?.addEventListener("click", ()=>setMode("task"));
  document.getElementById("segEvent")?.addEventListener("click", ()=>setMode("event"));
  document.getElementById("saveBtn")?.addEventListener("click", saveFromModal);

  setHeaderForTab();
  updateFabForTab();
  moveTabIndicator();
}

window.addEventListener("resize", ()=> moveTabIndicator());

boot().catch(err=>{
  console.error(err);
  alert("Ошибка: " + (err?.message || err));
});
