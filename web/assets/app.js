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

// Lightweight mobile drag (HTML5 drag&drop is unreliable inside Telegram WebView)
const dragState = {
  active: false,
  taskId: null,
  origin: null,
  ghost: null,
  offsetX: 0,
  offsetY: 0,
};

function startMobileDrag(taskId, origin, ev){
  dragState.active = true;
  dragState.taskId = taskId;
  dragState.origin = origin;

  const rect = ev.currentTarget.getBoundingClientRect();
  dragState.offsetX = ev.clientX - rect.left;
  dragState.offsetY = ev.clientY - rect.top;

  const ghost = document.createElement("div");
  ghost.className = "task";
  ghost.style.position = "fixed";
  ghost.style.left = `${ev.clientX - dragState.offsetX}px`;
  ghost.style.top = `${ev.clientY - dragState.offsetY}px`;
  ghost.style.width = `${Math.min(320, rect.width)}px`;
  ghost.style.zIndex = "9999";
  ghost.style.pointerEvents = "none";
  ghost.style.opacity = "0.92";
  ghost.style.transform = "scale(1.02)";
  ghost.innerHTML = `<div class="task__dot"></div><div class="task__body"><div class="task__title">Moving…</div><div class="task__meta"><span class="pill">Drop</span></div></div>`;
  document.body.appendChild(ghost);
  dragState.ghost = ghost;
  haptic("selection");
}

function moveMobileDrag(ev){
  if (!dragState.active || !dragState.ghost) return;
  dragState.ghost.style.left = `${ev.clientX - dragState.offsetX}px`;
  dragState.ghost.style.top = `${ev.clientY - dragState.offsetY}px`;
}

async function endMobileDrag(ev){
  if (!dragState.active) return;
  const taskId = dragState.taskId;
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const zone = el?.closest?.("[data-dropzone]");

  // cleanup
  dragState.active = false;
  dragState.taskId = null;
  dragState.origin = null;
  if (dragState.ghost) {
    dragState.ghost.remove();
    dragState.ghost = null;
  }

  if (!zone || !taskId) return;

  const type = zone.getAttribute("data-dropzone");
  if (type === "day") {
    const dateStr = zone.getAttribute("data-date");
    if (dateStr) {
      await updateTask(Number(taskId), { date: dateStr });
      haptic("medium");
    }
    return;
  }

  if (type === "schedule") {
    const dateStr = zone.getAttribute("data-date");
    const bounds = zone.getBoundingClientRect();
    const y = Math.max(0, Math.min(bounds.height, ev.clientY - bounds.top));
    // 06:00 is 0, 1px = 1 minute (see CSS)
    const minutesFrom6 = Math.round(y);
    const total = 6*60 + minutesFrom6;
    const hh = String(Math.floor(total/60)).padStart(2,"0");
    const mm = String(total%60).padStart(2,"0");
    const start = `${hh}:${mm}`;
    const endTotal = total + 30;
    const eh = String(Math.floor(endTotal/60)).padStart(2,"0");
    const em = String(endTotal%60).padStart(2,"0");
    const end = `${eh}:${em}`;
    await updateTask(Number(taskId), { date: dateStr || fmtDate(state.selectedDate), time: start, all_day: false });
    // store start/end as ISO for timeline positioning
    await updateTask(Number(taskId), { start_at: `${(dateStr||fmtDate(state.selectedDate))}T${start}:00`, end_at: `${(dateStr||fmtDate(state.selectedDate))}T${end}:00` });
    haptic("medium");
    return;
  }

  if (type === "quadrant") {
    const q = zone.getAttribute("data-q");
    if (q) {
      await updateTask(Number(taskId), { matrix_quadrant: q });
      haptic("medium");
    }
  }
}

window.addEventListener("pointermove", moveMobileDrag, {passive:true});
window.addEventListener("pointerup", endMobileDrag);

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
  row.draggable = true; // desktop fallback
  row.innerHTML = `
    <div class="task__dot"></div>
    <div class="drag" title="Drag">⋮⋮</div>
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

  // Desktop drag
  row.addEventListener("dragstart", (e)=>{
    try {
      e.dataTransfer.setData("text/taskId", String(t.id));
      e.dataTransfer.setData("text/from", "inbox");
      e.dataTransfer.effectAllowed = "move";
    } catch {}
  });

  // Mobile drag via handle
  const handle = row.querySelector(".drag");
  handle.addEventListener("pointerdown", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    startMobileDrag(String(t.id), "task", e);
  });

  // Desktop drag
  row.addEventListener("dragstart", (e)=>{
    try {
      e.dataTransfer.setData("text/taskId", String(t.id));
      e.dataTransfer.setData("text/from", "inbox");
    } catch {}
  });

  // Mobile drag handle
  const dragHandle = row.querySelector(".drag");
  if (dragHandle){
    dragHandle.addEventListener("pointerdown", (e)=>{
      // prevent swipe handling
      e.stopPropagation();
      e.preventDefault();
      startMobileDrag(String(t.id), "inbox", e);
    });
  }

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

function taskDetailsSheet(task){
  const wrap = document.createElement("div");
  wrap.className = "list";
  const head = document.createElement("div");
  head.className = "hint";
  head.textContent = "Quick actions";
  wrap.appendChild(head);

  const actions = [
    {label:"Set Q1", patch:{matrix_quadrant:"Q1"}},
    {label:"Set Q2", patch:{matrix_quadrant:"Q2"}},
    {label:"Set Q3", patch:{matrix_quadrant:"Q3"}},
    {label:"Set Q4", patch:{matrix_quadrant:"Q4"}},
    {label:"Clear quadrant", patch:{matrix_quadrant:null}},
  ];
  actions.forEach(a=>{
    const b = document.createElement("button");
    b.className = "chip";
    b.style.textAlign = "left";
    b.textContent = a.label;
    b.addEventListener("click", async ()=>{
      await updateTask(task.id, a.patch);
      closeSheet();
    });
    wrap.appendChild(b);
  });
  const del = document.createElement("button");
  del.className = "chip";
  del.style.textAlign="left";
  del.style.borderColor="rgba(239,68,68,0.25)";
  del.textContent = "Delete";
  del.addEventListener("click", async ()=>{ await deleteTask(task.id); closeSheet(); });
  wrap.appendChild(del);
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
    cell.setAttribute("data-dropzone","day");
    cell.setAttribute("data-date", dateStr);
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
      pill.addEventListener("pointerdown", (e)=>{
        // quick mobile drag
        startMobileDrag(String(t.id), "calendar", e);
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
      <small>06:00–22:00</small>
    </div>
    <div class="hint">Drag from Inbox/Calendar into the timeline. Resize by dragging the handle at the bottom of a block.</div>

    <div class="section-title" style="margin-top:10px;">
      <div>Unscheduled <small>today</small></div>
      <small>drop into time</small>
    </div>
    <div class="list" id="unscheduled"></div>

    <div style="height:10px"></div>
    <div class="timeline" id="timeline">
      <div class="timeline__inner">
        <div class="time-gutter" id="gutter"></div>
        <div class="timeline-lane" id="lane" data-dropzone="schedule" data-date="${dateStr}"></div>
      </div>
    </div>
  `;
  elMain.innerHTML="";
  elMain.appendChild(card);

  // Unscheduled list (date==selected and no start_at)
  const uns = card.querySelector("#unscheduled");
  const todayUn = state.tasks
    .filter(t=>t.date===dateStr && !t.done && !t.start_at && !t.time)
    .sort((a,b)=> (b.priority||0)-(a.priority||0));
  if (todayUn.length===0){
    const e = document.createElement("div");
    e.className="task";
    e.innerHTML = `<div class="task__body"><div class="task__title">Nothing here</div><div class="task__meta">Add a task or drop from Calendar</div></div>`;
    uns.appendChild(e);
  } else {
    todayUn.forEach(t=>uns.appendChild(taskRow(t)));
  }

  // Timeline hour labels
  const gutter = card.querySelector("#gutter");
  for (let h=6; h<=22; h++){
    const y = (h-6)*60;
    const lab = document.createElement("div");
    lab.className = "time-label";
    lab.style.top = `${y}px`;
    lab.textContent = `${String(h).padStart(2,"0")}:00`;
    gutter.appendChild(lab);
  }

  // Blocks
  const lane = card.querySelector("#lane");
  const dayTasks = state.tasks.filter(t=>t.date===dateStr && !t.done);

  function taskToBlockTimes(t){
    // Prefer start_at/end_at. Else use time + default 30min.
    let start = t.start_at ? new Date(t.start_at) : null;
    let end = t.end_at ? new Date(t.end_at) : null;
    if (!start && t.time){
      start = new Date(`${dateStr}T${t.time}:00`);
      end = new Date(start.getTime() + 30*60*1000);
    }
    if (!start) return null;
    if (!end) end = new Date(start.getTime() + 30*60*1000);
    return {start, end};
  }

  dayTasks.forEach(t=>{
    const times = taskToBlockTimes(t);
    if (!times) return;
    const sMin = times.start.getHours()*60 + times.start.getMinutes();
    const eMin = times.end.getHours()*60 + times.end.getMinutes();
    const top = Math.max(0, sMin - 6*60);
    const height = Math.max(24, (eMin - sMin));

    const block = document.createElement("div");
    block.className = "block";
    block.draggable = true;
    block.dataset.id = t.id;
    block.dataset.kind = t.kind || "task";
    block.style.top = `${top}px`;
    block.style.height = `${height}px`;
    const rangeLabel = `${String(times.start.getHours()).padStart(2,"0")}:${String(times.start.getMinutes()).padStart(2,"0")}–${String(times.end.getHours()).padStart(2,"0")}:${String(times.end.getMinutes()).padStart(2,"0")}`;
    block.innerHTML = `
      <div class="block__title">${escapeHtml(t.title)}</div>
      <div class="block__meta"><span class="pill pill--time">${rangeLabel}</span>${t.priority?`<span class="pill">P${t.priority}</span>`:""}</div>
      <div class="resize-handle" title="Resize"></div>
    `;

    // desktop drag
    block.addEventListener("dragstart", (e)=>{
      try {
        e.dataTransfer.setData("text/taskId", String(t.id));
        e.dataTransfer.setData("text/from", "schedule");
      } catch {}
    });
    // mobile drag
    block.addEventListener("pointerdown", (e)=>{
      // allow scroll unless user drags a bit
      if (e.target?.classList?.contains("resize-handle")) return;
      if (e.pointerType === "touch") {
        startMobileDrag(String(t.id), "schedule", e);
      }
    });

    // Resize (mobile + desktop)
    const handle = block.querySelector(".resize-handle");
    let resizing = false;
    let startY = 0;
    let startHeight = 0;
    handle.addEventListener("pointerdown", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      startY = e.clientY;
      startHeight = height;
      handle.setPointerCapture(e.pointerId);
      haptic("selection");
    });
    handle.addEventListener("pointermove", (e)=>{
      if (!resizing) return;
      const dy = e.clientY - startY;
      const newH = Math.max(24, Math.round((startHeight + dy) / 15) * 15);
      block.style.height = `${newH}px`;
    });
    handle.addEventListener("pointerup", async (e)=>{
      if (!resizing) return;
      resizing = false;
      const newH = parseInt(block.style.height,10);
      const newEndMinutes = (sMin + newH);
      const eh = String(Math.floor(newEndMinutes/60)).padStart(2,"0");
      const em = String(newEndMinutes%60).padStart(2,"0");
      await updateTask(t.id, { end_at: `${dateStr}T${eh}:${em}:00` });
      haptic("medium");
    });

    lane.appendChild(block);
  });

  // Drop support (desktop)
  lane.addEventListener("dragover", (e)=> e.preventDefault());
  lane.addEventListener("drop", async (e)=>{
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/taskId"));
    if (!id) return;
    const bounds = lane.getBoundingClientRect();
    const y = Math.max(0, Math.min(bounds.height, e.clientY - bounds.top));
    const minutesFrom6 = Math.round(y/15)*15;
    const total = 6*60 + minutesFrom6;
    const hh = String(Math.floor(total/60)).padStart(2,"0");
    const mm = String(total%60).padStart(2,"0");
    const start = `${hh}:${mm}`;
    const endTotal = total + 30;
    const eh = String(Math.floor(endTotal/60)).padStart(2,"0");
    const em = String(endTotal%60).padStart(2,"0");
    const end = `${eh}:${em}`;
    await updateTask(id, { date: dateStr, time: start, start_at: `${dateStr}T${start}:00`, end_at: `${dateStr}T${end}:00` });
    haptic("medium");
  });
}

function renderMatrix(){
  const card = document.createElement("div");
  card.className="card";
  card.innerHTML = `
    <div class="section-title"><div>Priority Matrix <small>Eisenhower</small></div><small>drag tasks</small></div>
    <div class="hint">Drag tasks into quadrants. Works on phone (custom drag) + desktop (HTML5 DnD).</div>
    <div class="matrix" id="matrix">
      <div class="quad" data-dropzone="quadrant" data-q="Q1">
        <div class="quad__title">Urgent + Important <span class="quad__hint">Q1</span></div>
        <div class="quad__list" id="q1"></div>
      </div>
      <div class="quad" data-dropzone="quadrant" data-q="Q2">
        <div class="quad__title">Not urgent + Important <span class="quad__hint">Q2</span></div>
        <div class="quad__list" id="q2"></div>
      </div>
      <div class="quad" data-dropzone="quadrant" data-q="Q3">
        <div class="quad__title">Urgent + Not important <span class="quad__hint">Q3</span></div>
        <div class="quad__list" id="q3"></div>
      </div>
      <div class="quad" data-dropzone="quadrant" data-q="Q4">
        <div class="quad__title">Not urgent + Not important <span class="quad__hint">Q4</span></div>
        <div class="quad__list" id="q4"></div>
      </div>
    </div>
  `;
  elMain.innerHTML="";
  elMain.appendChild(card);

  const items = state.tasks.filter(t=>!t.done);
  const byQ = {
    Q1: items.filter(t=>t.matrix_quadrant === "Q1"),
    Q2: items.filter(t=>t.matrix_quadrant === "Q2"),
    Q3: items.filter(t=>t.matrix_quadrant === "Q3"),
    Q4: items.filter(t=>t.matrix_quadrant === "Q4"),
    NONE: items.filter(t=>!t.matrix_quadrant),
  };

  const mount = (qid, arr)=>{
    const box = card.querySelector(`#${qid}`);
    box.innerHTML = "";
    arr.slice(0,6).forEach(t=>{
      const m = document.createElement("div");
      m.className = "mini";
      m.textContent = t.title;
      m.draggable = true;
      m.addEventListener("dragstart", (e)=>{
        try { e.dataTransfer.setData("text/taskId", String(t.id)); } catch {}
      });
      m.addEventListener("pointerdown", (e)=>{
        startMobileDrag(String(t.id), "matrix", e);
      });
      m.addEventListener("click", ()=> openSheet("Task", taskDetailsSheet(t)));
      box.appendChild(m);
    });
  };
  mount("q1", byQ.Q1);
  mount("q2", byQ.Q2);
  mount("q3", byQ.Q3);
  mount("q4", byQ.Q4);

  // desktop drop handling
  card.querySelectorAll(".quad").forEach(q=>{
    q.addEventListener("dragover", (e)=> e.preventDefault());
    q.addEventListener("drop", async (e)=>{
      e.preventDefault();
      const id = Number(e.dataTransfer.getData("text/taskId"));
      const quad = q.getAttribute("data-q");
      if (!id || !quad) return;
      await updateTask(id, { matrix_quadrant: quad });
      haptic("medium");
    });
  });
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
