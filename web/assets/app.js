/* Mobile-first Telegram Mini App (vanilla JS)
   Tabs: inbox, calendar, schedule, matrix, reminders
   Smart quick input: chips + inline parsing (rule-based)
*/
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  tab: "inbox",
  token: localStorage.getItem("pp_jwt") || "",
  lists: [],
  tasks: [],
  selectedDate: new Date(),
  tags: [],
};

const elMain = document.getElementById("main");
const elQuick = document.getElementById("quickInput");
const elAdd = document.getElementById("addBtn");
const elHint = document.getElementById("hint");
const elChips = document.getElementById("chips");
const elSheet = document.getElementById("sheet");
const elSheetTitle = document.getElementById("sheetTitle");
const elSheetContent = document.getElementById("sheetContent");
document.getElementById("sheetBackdrop").addEventListener("click", closeSheet);

function haptic(type="selection") {
  try {
    if (!tg?.HapticFeedback) return;
    if (type === "selection") tg.HapticFeedback.selectionChanged();
    if (type === "light") tg.HapticFeedback.impactOccurred("light");
    if (type === "medium") tg.HapticFeedback.impactOccurred("medium");
    if (type === "heavy") tg.HapticFeedback.impactOccurred("heavy");
  } catch {}
}

function initData() {
  return tg?.initData || "";
}

async function ensureAuth() {
  if (state.token) return state.token;
  const init = initData();
  if (!init) {
    // dev mode
    const key = localStorage.getItem("pp_dev_key") || crypto.randomUUID();
    localStorage.setItem("pp_dev_key", key);
    // ask server to mint JWT lazily via any endpoint; easiest: create list fetch
    state.token = "DEV";
    return state.token;
  }
  const res = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: {"X-Tg-Init-Data": init},
  });
  if (!res.ok) throw new Error("auth failed");
  const data = await res.json();
  state.token = data.token;
  localStorage.setItem("pp_jwt", state.token);
  return state.token;
}

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  const init = initData();
  if (init) headers["X-Tg-Init-Data"] = init;

  // If we have JWT, attach it. If invalid -> retry with fresh auth.
  if (state.token && state.token !== "DEV") headers["Authorization"] = `Bearer ${state.token}`;
  if (!init) {
    // dev fallback
    const key = localStorage.getItem("pp_dev_key") || crypto.randomUUID();
    localStorage.setItem("pp_dev_key", key);
    headers["X-User-Key"] = key;
  }

  const res = await fetch(path, {...opts, headers});
  if (res.status === 401) {
    localStorage.removeItem("pp_jwt");
    state.token = "";
    await ensureAuth();
    if (state.token && state.token !== "DEV") headers["Authorization"] = `Bearer ${state.token}`;
    const res2 = await fetch(path, {...opts, headers});
    return res2;
  }
  return res;
}

function fmtDate(d){
  return d.toISOString().slice(0,10);
}
function startOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth()+1, 0);
}
function weekdayMon0(d){
  // Monday=0..Sunday=6
  const w = d.getDay();
  return (w + 6) % 7;
}

function parseInline(text){
  const t = text.trim();
  const out = {date:null,time:null,range:null,list:null,tags:[],priority:0,focus:false};
  // date words
  const low = t.toLowerCase();
  const today = new Date();
  const dayNames = {mon:1,tue:2,tues:2,wed:3,thu:4,fri:5,sat:6,sun:0};

  if (/\btoday\b/.test(low)) out.date = fmtDate(today);
  if (/\btomorrow\b/.test(low)) {
    const d = new Date(today); d.setDate(d.getDate()+1);
    out.date = fmtDate(d);
  }
  const wd = low.match(/\b(mon|tue|tues|wed|thu|fri|sat|sun)\b/);
  if (wd){
    const target = dayNames[wd[1]];
    const d = new Date(today);
    let diff = (target - d.getDay() + 7) % 7;
    if (diff===0) diff=7;
    d.setDate(d.getDate()+diff);
    out.date = fmtDate(d);
  }
  // time range
  const range = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (range){
    out.time = `${String(range[1]).padStart(2,"0")}:${range[2]}`;
    out.range = `${String(range[3]).padStart(2,"0")}:${range[4]}`;
  } else {
    const tm = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (tm) out.time = `${String(tm[1]).padStart(2,"0")}:${tm[2]}`;
  }
  // list
  const l = t.match(/@([A-Za-z0-9_\-]+)/);
  if (l) out.list = l[1];
  // tags
  const tags = [...t.matchAll(/#([A-Za-z0-9_\-]+)/g)].map(m=>m[1]);
  out.tags = tags;
  // priority
  if (/\bp3\b/.test(low) || /!!!/.test(t)) out.priority = 3;
  else if (/\bp2\b/.test(low) || /!!/.test(t)) out.priority = 2;
  else if (/\bp1\b/.test(low) || /!/.test(t)) out.priority = 1;
  // focus
  out.focus = /\bfocus\b/i.test(t) || /\*/.test(t);
  return out;
}

function setChips(parsed){
  const chips = [];
  if (parsed.date){
    chips.push({label: parsed.date === fmtDate(new Date()) ? "Today" : parsed.date, insert: parsed.date});
  } else {
    chips.push({label:"Today", insert:"today"});
    chips.push({label:"Tomorrow", insert:"tomorrow"});
  }
  chips.push({label:"9:00", insert:"09:00"});
  chips.push({label:"@Work", insert:"@Work"});
  chips.push({label:"#tag", insert:"#tag"});
  if (parsed.time && parsed.range){
    chips.unshift({label:`${parsed.time}-${parsed.range}`, insert:`${parsed.time}-${parsed.range}`});
  } else if (parsed.time){
    chips.unshift({label: parsed.time, insert: parsed.time});
  }

  elChips.innerHTML = "";
  chips.forEach(c=>{
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = c.label;
    b.addEventListener("click", ()=>{
      const cur = elQuick.value.trim();
      elQuick.value = (cur ? cur + " " : "") + c.insert;
      elQuick.dispatchEvent(new Event("input"));
      haptic("selection");
    });
    elChips.appendChild(b);
  });
}

function render(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.tab === state.tab);
  });
  if (state.tab === "inbox") renderInbox();
  if (state.tab === "calendar") renderCalendar();
  if (state.tab === "schedule") renderSchedule();
  if (state.tab === "matrix") renderMatrix();
  if (state.tab === "reminders") renderReminders();
}

function renderInbox(){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="section-title">
      <div>Inbox <small>Today</small></div>
      <small>${state.tasks.filter(t=>!t.done).length} items</small>
    </div>
    <div class="list" id="taskList"></div>
  `;
  elMain.innerHTML = "";
  elMain.appendChild(card);

  const list = card.querySelector("#taskList");
  state.tasks.forEach(t=> list.appendChild(taskRow(t)));
}

function taskRow(t){
  const row = document.createElement("div");
  row.className = "task";
  row.dataset.id = t.id;
  row.innerHTML = `
    <div class="task__dot"></div>
    <div class="task__body">
      <div class="task__title">${escapeHtml(t.title)}</div>
      <div class="task__meta">
        ${t.time ? `<span class="pill pill--time">${t.time}</span>` : ""}
        ${t.date ? `<span class="pill">${t.date}</span>` : ""}
        ${t.list_id ? `<span class="pill pill--list">List</span>` : ""}
        ${Array.isArray(t.tags) ? t.tags.slice(0,2).map(tag=>`<span class="pill pill--tag">#${escapeHtml(tag)}</span>`).join("") : ""}
      </div>
    </div>
  `;

  // Swipe actions (mobile)
  let startX = 0, curX = 0, dragging = false;
  row.addEventListener("pointerdown", (e)=>{
    startX = e.clientX;
    dragging = true;
    row.setPointerCapture(e.pointerId);
  });
  row.addEventListener("pointermove", (e)=>{
    if (!dragging) return;
    curX = e.clientX - startX;
    // resistance
    const x = Math.max(-140, Math.min(140, curX));
    row.style.transform = `translateX(${x}px)`;
    row.style.transition = "none";
    if (x > 90) haptic("light");
    if (x < -90) haptic("light");
  });
  row.addEventListener("pointerup", async ()=>{
    if (!dragging) return;
    dragging = false;
    const x = curX;
    row.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1)";
    row.style.transform = "translateX(0)";
    curX = 0;

    if (x > 95) {
      haptic("medium");
      await markDone(t.id, true);
    } else if (x < -120) {
      haptic("heavy");
      await deleteTask(t.id);
    } else if (x < -80) {
      haptic("selection");
      openSheet("Schedule task", scheduleSheetContent(t));
    }
  });

  return row;
}

function scheduleSheetContent(task){
  const wrap = document.createElement("div");
  wrap.className = "list";
  const presets = [
    {label:"Today 09:00", at:"09:00"},
    {label:"Today 13:00", at:"13:00"},
    {label:"Today 18:00", at:"18:00"},
    {label:"Tomorrow 09:00", at:"tomorrow 09:00"},
  ];
  presets.forEach(p=>{
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.style.textAlign="left";
    btn.textContent = p.label;
    btn.addEventListener("click", async ()=>{
      await updateTask(task.id, { raw: `${task.title} ${p.at}`});
      closeSheet();
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

function renderCalendar(){
  const d = state.selectedDate;
  const start = startOfMonth(d);
  const end = endOfMonth(d);
  const pad = weekdayMon0(start);
  const days = [];
  for (let i=0; i<pad; i++) days.push(null);
  for (let day=1; day<=end.getDate(); day++){
    days.push(new Date(d.getFullYear(), d.getMonth(), day));
  }

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="section-title">
      <div>Calendar <small>${d.toLocaleString("en", {month:"long"})} ${d.getFullYear()}</small></div>
      <small>tap day</small>
    </div>
    <div class="grid" id="grid"></div>
  `;
  elMain.innerHTML = "";
  elMain.appendChild(card);

  const grid = card.querySelector("#grid");
  days.forEach(day=>{
    const cell = document.createElement("div");
    cell.className = "day";
    if (!day){ cell.style.opacity="0.35"; grid.appendChild(cell); return; }
    const dateStr = fmtDate(day);
    const items = state.tasks.filter(t=>t.date === dateStr && !t.done);
    cell.innerHTML = `<div class="day__num">${day.getDate()}</div>`;
    items.slice(0,2).forEach(t=>{
      const pill = document.createElement("div");
      pill.className="day__pill";
      pill.textContent=t.title;
      pill.draggable = true;
      pill.addEventListener("dragstart", (e)=>{
        e.dataTransfer.setData("text/taskId", String(t.id));
        e.dataTransfer.setData("text/from", "calendar");
      });
      cell.appendChild(pill);
    });
    if (items.length > 2){
      const more = document.createElement("div");
      more.className="more";
      more.textContent=`+${items.length-2} more`;
      more.addEventListener("click", ()=> openDaySheet(dateStr, items));
      cell.appendChild(more);
    }

    // drop to move task to this day
    cell.addEventListener("dragover", (e)=> e.preventDefault());
    cell.addEventListener("drop", async (e)=>{
      e.preventDefault();
      const id = Number(e.dataTransfer.getData("text/taskId"));
      if (!id) return;
      await updateTask(id, { date: dateStr });
      haptic("selection");
    });

    cell.addEventListener("click", ()=>{
      state.selectedDate = day;
      haptic("selection");
    });

    grid.appendChild(cell);
  });
}

function openDaySheet(dateStr, items){
  const wrap = document.createElement("div");
  wrap.className="list";
  items.forEach(t=> wrap.appendChild(taskRow(t)));
  openSheet(`Tasks on ${dateStr}`, wrap);
}

function renderSchedule(){
  const card = document.createElement("div");
  card.className="card";
  const dateStr = fmtDate(state.selectedDate);
  card.innerHTML = `
    <div class="section-title">
      <div>Schedule <small>${dateStr}</small></div>
      <small>drag from Calendar</small>
    </div>
    <div class="hint">Tip: drop tasks here to auto-schedule at 09:00</div>
    <div class="list" id="plan"></div>
  `;
  elMain.innerHTML="";
  elMain.appendChild(card);

  const plan = card.querySelector("#plan");
  const dayTasks = state.tasks.filter(t=>t.date===dateStr && !t.done).sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));
  if (dayTasks.length===0){
    const empty = document.createElement("div");
    empty.className="task";
    empty.innerHTML = `<div class="task__body"><div class="task__title">Drop from Calendar or add via input</div><div class="task__meta">No tasks scheduled</div></div>`;
    plan.appendChild(empty);
  } else {
    dayTasks.forEach(t=>plan.appendChild(taskRow(t)));
  }
}

function renderMatrix(){
  const card = document.createElement("div");
  card.className="card";
  card.innerHTML = `
    <div class="section-title"><div>Priority Matrix <small>Eisenhower</small></div><small>tap to set</small></div>
    <div class="hint">MVP: tap a task in Inbox → open sheet → set quadrant</div>
  `;
  elMain.innerHTML="";
  elMain.appendChild(card);
}

async function renderReminders(){
  const card = document.createElement("div");
  card.className="card";
  card.innerHTML = `<div class="section-title"><div>Reminder Center</div><small>upcoming</small></div><div class="list" id="remList"></div>`;
  elMain.innerHTML="";
  elMain.appendChild(card);

  const res = await api("/api/reminders");
  if (!res.ok) {
    card.querySelector("#remList").innerHTML = `<div class="hint">Reminders not available yet.</div>`;
    return;
  }
  const data = await res.json();
  const list = card.querySelector("#remList");
  data.forEach(r=>{
    const row = document.createElement("div");
    row.className="task";
    row.innerHTML = `<div class="task__dot"></div><div class="task__body"><div class="task__title">Reminder #${r.id}</div><div class="task__meta"><span class="pill pill--time">${new Date(r.at).toLocaleString()}</span><span class="pill">${r.status}</span></div></div>`;
    list.appendChild(row);
  });
}

async function loadData(){
  try { await ensureAuth(); } catch (e){}
  const listsRes = await api("/api/lists");
  if (listsRes.ok) state.lists = await listsRes.json();
  await loadTasks();
}

async function loadTasks(){
  const res = await api("/api/tasks");
  if (res.ok) {
    state.tasks = await res.json();
    state.tags = Array.from(new Set(state.tasks.flatMap(t=>Array.isArray(t.tags)?t.tags:[]))).slice(0,20);
  }
  render();
}

async function addTaskFromInput(){
  const raw = elQuick.value.trim();
  if (!raw) return;
  const parsed = parseInline(raw);
  setChips(parsed);
  elHint.textContent = "Добавляю…";
  const body = { raw };
  const res = await api("/api/tasks", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
  if (!res.ok){
    const txt = await res.text();
    elHint.textContent = `Error: ${txt}`;
    haptic("heavy");
    return;
  }
  elQuick.value = "";
  elHint.textContent = "Добавлено";
  haptic("medium");
  await loadTasks();
}

async function updateTask(id, patch){
  const res = await api(`/api/tasks/${id}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(patch)});
  if (!res.ok) return;
  await loadTasks();
}

async function deleteTask(id){
  await api(`/api/tasks/${id}`, {method:"DELETE"});
  await loadTasks();
}

async function markDone(id, done){
  await updateTask(id, {done});
}

function openSheet(title, contentEl){
  elSheetTitle.textContent = title;
  elSheetContent.innerHTML="";
  elSheetContent.appendChild(contentEl);
  elSheet.setAttribute("aria-hidden","false");
}

function closeSheet(){
  elSheet.setAttribute("aria-hidden","true");
  elSheetContent.innerHTML="";
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

// tabs
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    state.tab = btn.dataset.tab;
    haptic("selection");
    render();
  });
});

// quick input events
elQuick.addEventListener("input", ()=>{
  const parsed = parseInline(elQuick.value);
  setChips(parsed);
  const bits = [];
  if (parsed.date) bits.push(`📅 ${parsed.date}`);
  if (parsed.time) bits.push(`🕘 ${parsed.time}${parsed.range?`-${parsed.range}`:""}`);
  if (parsed.list) bits.push(`@${parsed.list}`);
  if (parsed.tags.length) bits.push(`#${parsed.tags.join(" #")}`);
  if (parsed.priority) bits.push(`P${parsed.priority}`);
  if (parsed.focus) bits.push("Focus");
  elHint.textContent = bits.length ? bits.join(" · ") : "Подсказки: today, tomorrow, 14:00-15:00, @Work, #tag";
});

elAdd.addEventListener("click", addTaskFromInput);
elQuick.addEventListener("keydown", (e)=>{
  if (e.key === "Enter"){
    e.preventDefault();
    addTaskFromInput();
  }
});

// init
loadData().catch(()=>render());
