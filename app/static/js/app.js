const state = {
  date: new Date(),
  projects: [],
  tasks: [],
  events: [],
  mode: "task", // task | event
  tab: "schedule",
  tasksFilter: "inbox",
};

function pad2(n){ return String(n).padStart(2,'0'); }
function toISODate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function toTimeLabel(h,m){ return `${pad2(h)}:${pad2(m)}`; }

function startOfDay(d){
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
}

function addMinutes(d, mins){
  return new Date(d.getTime() + mins*60000);
}

function fmtDayPill(d){
  const opts = {weekday:"short", month:"short", day:"numeric"};
  return d.toLocaleDateString("ru-RU", opts);
}

function weekdayShort(d){
  return d.toLocaleDateString("ru-RU", {weekday:"short"}).slice(0,2);
}

function buildWeekStrip(){
  const weekEl = document.getElementById("week");
  weekEl.innerHTML = "";

  const today = new Date();
  const base = startOfDay(state.date);
  // show 7 days centered around selected date
  for(let i=-3;i<=3;i++){
    const d = new Date(base.getTime() + i*86400000);
    const chip = document.createElement("button");
    chip.className = "daychip" + (toISODate(d)===toISODate(state.date) ? " active":"");
    chip.innerHTML = `<div class="dname">${weekdayShort(d)}</div><div class="dnum">${d.getDate()}</div>`;
    chip.onclick = () => { state.date = d; refreshAll(); };
    weekEl.appendChild(chip);
  }

  document.getElementById("selectedDatePill").textContent = fmtDayPill(state.date);
}

function buildDayGrid(){
  const grid = document.getElementById("dayGrid");
  grid.innerHTML = "";

  // 07:00 - 23:00 every 30 minutes (editable in code)
  const startH = 7;
  const endH = 23;
  const step = 30;

  for(let h=startH; h<=endH; h++){
    for(let m=0; m<60; m+=step){
      if(h===endH && m>0) continue;
      const slot = document.createElement("div");
      slot.className = "slot";
      const label = document.createElement("div");
      label.className = "stime";
      label.textContent = toTimeLabel(h,m);

      const drop = document.createElement("div");
      drop.className = "sdrop";
      drop.dataset.hour = String(h);
      drop.dataset.min = String(m);

      drop.addEventListener("dragover", (e) => {
        e.preventDefault();
        drop.classList.add("over");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", async (e) => {
        e.preventDefault();
        drop.classList.remove("over");
        const taskId = e.dataTransfer.getData("text/taskId");
        if(!taskId) return;

        const dur = 30;
        const d0 = startOfDay(state.date);
        const start = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), h, m, 0, 0);
        try{
          await API.planTask(Number(taskId), start.toISOString(), dur);
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

function overlaps(aStart, aEnd, bStart, bEnd){
  return aStart < bEnd && bStart < aEnd;
}

function renderEventsOnGrid(){
  const grid = document.getElementById("dayGrid");
  // clear drops
  const drops = grid.querySelectorAll(".sdrop");
  drops.forEach(d => d.innerHTML = "");

  const evs = state.events.slice().sort((a,b)=> new Date(a.start_dt) - new Date(b.start_dt));
  const day0 = startOfDay(state.date);

  for(const ev of evs){
    const s = new Date(ev.start_dt);
    const e = new Date(ev.end_dt);

    // Find nearest slot matching the start time (snap to 30 min)
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
    btnDel.textContent = "🗑️";
    btnDel.onclick = async () => {
      if(!confirm("Удалить блок?")) return;
      await API.deleteEvent(ev.id);
      await refreshAll();
    };

    actions.appendChild(btnDel);

    card.appendChild(bar);
    card.appendChild(body);
    card.appendChild(actions);

    drop.appendChild(card);
  }
}

function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}


function renderTasksTo(listEl, tasks){
  listEl.innerHTML = "";
  for(const t of tasks){
    const row = document.createElement("div");
    row.className = "task" + (t.status==="done" ? " done":"");
    row.draggable = t.status !== "done";
    row.addEventListener("dragstart", (e) => {
      row.classList.add("dragging");
      e.dataTransfer.setData("text/taskId", String(t.id));
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));

    const chk = document.createElement("button");
    chk.className = "chk";
    chk.textContent = t.status==="done" ? "✓" : "";
    chk.onclick = async () => {
      if(t.status==="done") return;
      await API.completeTask(t.id);
      await refreshAll();
      await refreshTasksScreen(); // keep tasks screen in sync
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
    more.textContent = "⋯";
    more.onclick = () => openEditTask(t);

    row.appendChild(chk);
    row.appendChild(info);
    row.appendChild(badge);
    row.appendChild(more);
    listEl.appendChild(row);
  }
}

function renderTasks(){
  const list = document.getElementById("taskList");
  renderTasksTo(list, state.tasks);
}

async function refreshAll(){
  buildWeekStrip();
  buildDayGrid();

  // load schedule & tasks
  const dateStr = toISODate(state.date);
  state.events = await API.scheduleDay(dateStr);
  state.tasks = await API.listTasks("inbox");

  renderEventsOnGrid();
  renderTasks();
}

function openModal(){
  document.getElementById("modal").setAttribute("aria-hidden","false");
}
function closeModal(){
  document.getElementById("modal").setAttribute("aria-hidden","true");
  clearModal();
}
function clearModal(){
  document.getElementById("inpTitle").value = "";
  document.getElementById("inpTime").value = "";
  document.getElementById("inpColor").value = "#6EA8FF";
  document.getElementById("selDuration").value = "30";
  document.getElementById("selPriority").value = "2";
  document.getElementById("selEstimate").value = "30";
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
    return;
  }

  // event
  const duration = Number(document.getElementById("selDuration").value);
  const color = document.getElementById("inpColor").value || "#6EA8FF";
  const end = addMinutes(start, duration);
  await API.createEvent({title, start_dt: start.toISOString(), end_dt: end.toISOString(), color, source:"manual"});
  closeModal();
  await refreshAll();
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

async function boot(){
  // Telegram init
  let initData = "";
  if(window.Telegram?.WebApp){
    const tg = window.Telegram.WebApp;
    tg.ready();
    initData = tg.initData || "";
  }

  if(!initData){
    // Allow browser dev (no telegram): create a dev tokenless mode? We'll show message.
    document.getElementById("subtitle").textContent = "Open inside Telegram";
    alert("Открой Mini App внутри Telegram (через кнопку из бота), чтобы авторизация работала.");
    return;
  }

  // Auth
  await API.authTelegram(initData);
  state.projects = await API.getProjects();
  fillProjects();

  // init date inputs
  document.getElementById("inpDate").value = toISODate(state.date);
  document.getElementById("selectedDatePill").textContent = fmtDayPill(state.date);

  await refreshAll();
}

document.getElementById("fab").onclick = () => { setMode("task"); openModal(); };
document.getElementById("closeModal").onclick = closeModal;
document.getElementById("backdrop").onclick = closeModal;
document.getElementById("segTask").onclick = () => setMode("task");
document.getElementById("segEvent").onclick = () => setMode("event");
document.getElementById("saveBtn").onclick = saveFromModal;

document.getElementById("btnToday").onclick = () => { state.date = new Date(); refreshAll(); };
document.getElementById("btnRefresh").onclick = refreshAll;

boot().catch(err => {
  console.error(err);
  alert("Ошибка: " + (err?.message || err));
});


async function refreshTasksScreen(){
  const listEl = document.getElementById("taskListAll");
  const tasks = await API.listTasks(state.tasksFilter);
  renderTasksTo(listEl, tasks);
}

async function refreshWeekScreen(){
  const box = document.getElementById("weekList");
  box.innerHTML = "";
  const base = startOfDay(new Date());
  // next 7 days
  for(let i=0;i<7;i++){
    const d = new Date(base.getTime() + i*86400000);
    const dateStr = toISODate(d);
    let evs = [];
    try{
      evs = await API.scheduleDay(dateStr);
    }catch(e){
      evs = [];
    }
    const btn = document.createElement("button");
    btn.className = "week-item";
    const label = d.toLocaleDateString("ru-RU", {weekday:"short", month:"short", day:"numeric"});
    btn.innerHTML = `<div><div class="wdate">${label}</div><div class="wmeta">${i===0 ? "Сегодня" : ""}</div></div><div class="wcount">${evs.length}</div>`;
    btn.onclick = () => {
      state.date = d;
      setTab("schedule");
      refreshAll();
    };
    box.appendChild(btn);
  }
}

function setTab(tab){
  state.tab = tab;
  document.getElementById("screenSchedule").style.display = (tab==="schedule") ? "block" : "none";
  document.getElementById("screenTasks").style.display = (tab==="tasks") ? "block" : "none";
  document.getElementById("screenWeek").style.display = (tab==="calendar") ? "block" : "none";

  document.querySelectorAll(".bottom .tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab===tab);
  });

  // Optional: haptic
  if(window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback?.selectionChanged();

  if(tab==="tasks"){
    refreshTasksScreen();
  }
  if(tab==="calendar"){
    refreshWeekScreen();
  }
}
