const ICONS = {
  check: `<svg viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="white" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 4h16v10l-3 3H7l-3-3V4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 14h5l1 2h4l1-2h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" fill="none"><path d="M7 3v3M17 3v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 7h16v14H4V7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 11h16" stroke="currentColor" stroke-width="2"/></svg>`,
  time: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 15.5a3.5 3.5 0 1 0-3.5-3.5 3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a7.9 7.9 0 0 0 .1-2l2-1.2-2-3.4-2.3.7a7.3 7.3 0 0 0-1.7-1l-.3-2.4H9.8l-.3 2.4a7.3 7.3 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.9 7.9 0 0 0 .1 2l-2 1.2 2 3.4 2.3-.7a7.3 7.3 0 0 0 1.7 1l.3 2.4h5.4l.3-2.4a7.3 7.3 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const API = {
  async request(path, opts = {}) {
    const token = localStorage.getItem("tg_planner_token");
    const headers = Object.assign({ "content-type": "application/json" }, opts.headers || {});
    if (token) headers["authorization"] = `Bearer ${token}`;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || ("HTTP " + res.status));
    }
    if (res.status === 204) return null;
    return res.json();
  },
  login(initData) {
    return API.request("/api/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) });
  },
  me() { return API.request("/api/me"); },
  tasks(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== "") qs.set(k, String(v)); });
    const q = qs.toString();
    return API.request("/api/tasks" + (q ? "?" + q : ""));
  },
  createTask(payload) { return API.request("/api/tasks", { method:"POST", body: JSON.stringify(payload) }); },
  patchTask(id, payload) { return API.request(`/api/tasks/${id}`, { method:"PATCH", body: JSON.stringify(payload) }); },
  deleteTask(id) { return API.request(`/api/tasks/${id}`, { method:"DELETE" }); },

  reminders(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== "") qs.set(k, String(v)); });
    const q = qs.toString();
    return API.request("/api/reminders" + (q ? "?" + q : ""));
  },
  quickReminder(taskId) { return API.request(`/api/reminders/task/${taskId}/quick`, { method:"POST" }); },
  snooze(reminderId, minutes) {
    return API.request(`/api/reminders/${reminderId}/snooze`, { method:"POST", body: JSON.stringify({ minutes }) });
  },
  cancelReminder(reminderId) { return API.request(`/api/reminders/${reminderId}/cancel`, { method:"POST" }); },
};

function toast(title, sub, ms=2200){
  const root = $("#toastRoot");
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<div class="t-title"></div><div class="t-sub"></div>`;
  t.querySelector(".t-title").textContent = title;
  t.querySelector(".t-sub").textContent = sub || "";
  root.appendChild(t);
  setTimeout(()=>{ t.style.opacity="0"; t.style.transform="translateY(-6px)"; }, ms);
  setTimeout(()=>{ t.remove(); }, ms+250);
}

function setActiveTab(name){
  const map = { inbox:"Inbox", schedule:"Schedule", calendar:"Calendar", matrix:"Priority Matrix", reminders:"Reminders", settings:"Settings" };
  const t = document.querySelector("#pageTitle");
  if (t) t.textContent = map[name] || "Inbox";

  $$(".tab").forEach(a => a.classList.toggle("active", a.dataset.tab === name));
}

function isoFromLocal(dtLocal){
  if (!dtLocal) return null;
  const d = new Date(dtLocal);
  return d.toISOString();
}
function localFromIso(iso){
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2,"0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function yyyymmdd(d){
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function fmtTime(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"});
}
function fmtDateTime(iso){
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {day:"2-digit",month:"short", hour:"2-digit",minute:"2-digit"});
}

async function ensureAuth(){
  const token = localStorage.getItem("tg_planner_token");
  if (token) return { ok: true, reason: "HAS_TOKEN" };

  const wa = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  // If Telegram WebApp exists, call ready()/expand() early
  try{ wa?.ready?.(); }catch(_){}
  try{ wa?.expand?.(); }catch(_){}

  let initData = wa?.initData || "";

  // Some clients may populate initData slightly позже: retry a couple times
  if (!initData && wa){
    for (let i=0;i<3;i++){
      await new Promise(r=>setTimeout(r, 120));
      initData = wa?.initData || "";
      if (initData) break;
    }
  }

  if (!initData){
    // Telegram object exists but initData empty -> opened not as WebApp button (url link), or BotFather menu not set
    if (wa) return { ok: false, reason: "NO_INITDATA_TG" };
    return { ok: false, reason: "NO_INITDATA" };
  }

  try{
    const r = await API.login(initData);
    localStorage.setItem("tg_planner_token", r.token);
    return { ok: true, reason: "LOGGED_IN" };
  }catch(e){
    return { ok: false, reason: "LOGIN_FAILED", detail: String(e?.message || e) };
  }
}




async function loadTopUser(){
  try{
    const r = await API.me();
    const u = r.user;
    $("#userSub").textContent = u?.username ? ("@" + u.username) : ([u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Telegram Mini App");
    const av = $("#avatar");
    av.innerHTML = "";
    if (u?.photoUrl){
      const img = document.createElement("img");
      img.src = u.photoUrl;
      img.alt = "";
      av.appendChild(img);
    }
  }catch{}
}

const Sheet = {
  mode: "create",
  taskId: null,
  open(task){
    $("#sheet").classList.add("show");
    if (task && task.id){
      this.mode = "edit";
      this.taskId = task.id;
      $("#sheetTitle").textContent = "Редактировать";
      $("#sheetSub").textContent = "Обнови задачу и сохрани";
      $("#btnDelete").style.display = "inline-flex";

      $("#tTitle").value = task.title || "";
      $("#tDesc").value = task.description || "";
      $("#tStart").value = localFromIso(task.startAt);
      $("#tDue").value = localFromIso(task.dueAt);
      $("#tDur").value = String(task.durationMin || 45);
      $("#tPri").value = String(task.priority || 3);
      $("#tQuad").value = task.quadrant || "";
    }else{
      this.mode = "create";
      this.taskId = null;
      $("#sheetTitle").textContent = "Новая задача";
      $("#sheetSub").textContent = "Создай задачу за 10 секунд";
      $("#btnDelete").style.display = "none";

      $("#tTitle").value = task?.title || "";
      $("#tDesc").value = task?.description || "";
      $("#tStart").value = localFromIso(task?.startAt);
      $("#tDue").value = localFromIso(task?.dueAt);
      $("#tDur").value = String(task?.durationMin || 45);
      $("#tPri").value = String(task?.priority || 3);
      $("#tQuad").value = task?.quadrant || "";
    }
  },
  close(){ $("#sheet").classList.remove("show"); }
};

function wireSheet(){
  $$("#sheet [data-close='1']").forEach(x => x.addEventListener("click", ()=>Sheet.close()));
  $("#btnCancel").addEventListener("click", ()=>Sheet.close());

  $("#btnSave").addEventListener("click", async ()=>{
    const title = $("#tTitle").value.trim();
    if (!title){ toast("Название пустое", "Введи заголовок задачи"); return; }

    const payload = {
      title,
      description: ($("#tDesc").value || "").trim() || null,
      startAt: isoFromLocal($("#tStart").value),
      dueAt: isoFromLocal($("#tDue").value),
      durationMin: Number($("#tDur").value || "45"),
      priority: Number($("#tPri").value || "3"),
      quadrant: $("#tQuad").value || null
    };

    $("#btnSave").textContent = "…";
    try{
      if (Sheet.mode === "create"){
        await API.createTask(payload);
        toast("Готово", "Задача создана");
      }else{
        await API.patchTask(Sheet.taskId, payload);
        toast("Сохранено", "Задача обновлена");
      }
      Sheet.close();
      await renderRoute(true);
    }catch(e){
      toast("Ошибка", String(e.message || e));
    }finally{
      $("#btnSave").textContent = "Сохранить";
    }
  });

  $("#btnDelete").addEventListener("click", async ()=>{
    if (!Sheet.taskId) return;
    if (!confirm("Удалить задачу?")) return;
    $("#btnDelete").textContent = "…";
    try{
      await API.deleteTask(Sheet.taskId);
      toast("Удалено", "Задача удалена");
      Sheet.close();
      await renderRoute(true);
    }catch(e){
      toast("Ошибка", String(e.message || e));
    }finally{
      $("#btnDelete").textContent = "Удалить";
    }
  });
}

function renderSkeleton(root){
  root.innerHTML = "";
  for (let i=0;i<4;i++){
    const c = document.createElement("div");
    c.className = "card task";
    c.innerHTML = `
      <div class="skel skel-line big" style="width:60%"></div>
      <div class="skel skel-line" style="width:92%; margin-top:10px"></div>
      <div class="skel skel-line" style="width:70%; margin-top:8px"></div>
      <div class="row" style="margin-top:12px; gap:8px">
        <div class="skel skel-line" style="width:28%"></div>
        <div class="skel skel-line" style="width:28%"></div>
        <div class="skel skel-line" style="width:28%"></div>
      </div>`;
    root.appendChild(c);
  }
}

let inboxFilter = "today";
let inboxSearch = "";

function wireInboxToolbar(){
  const sbtn = document.querySelector('#btnSearchTop');
  if (sbtn) sbtn.addEventListener('click', ()=>{ const i=document.querySelector('#searchInput'); if(i){ i.focus(); i.scrollIntoView({behavior:'smooth', block:'center'}); } });

  $("#segInbox").addEventListener("click", (e)=>{
    const b = e.target.closest(".seg-btn");
    if (!b) return;
    $$("#segInbox .seg-btn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    inboxFilter = b.dataset.filter;
    renderRoute(true);
  });
  $("#searchInput").addEventListener("input", ()=>{
    inboxSearch = $("#searchInput").value.trim();
    clearTimeout(window.__qT);
    window.__qT = setTimeout(()=>renderRoute(true), 220);
  });
  $("#btnAddTop").addEventListener("click", ()=>Sheet.open(null));
}

function taskCard(t){
  const div = document.createElement("div");
  div.className = "cell";
  const isDone = t.status === "DONE";

  const meta = [];
  if (t.startAt) meta.push(`🕒 ${fmtTime(t.startAt)}`);
  if (t.dueAt) meta.push(`📅 ${fmtDateTime(t.dueAt)}`);
  if (t.nextReminderAt) meta.push(`🔔 ${fmtTime(t.nextReminderAt)}`);

  const pr = t.priority || 3;
  const prCls = pr===1?"red":pr===2?"orange":pr===4?"green":"blue";

  div.innerHTML = `
    <button class="check ${isDone?"done":""}" aria-label="Done">${ICONS.check}</button>
    <div class="cell-main">
      <div class="cell-title"></div>
      <div class="cell-meta"></div>
    </div>
    <div class="cell-right">
      <span class="pill ${prCls}">P${pr}</span>
      <button class="more" aria-label="More">⋯</button>
    </div>
  `;
  div.querySelector(".cell-title").textContent = t.title;
  div.querySelector(".cell-meta").textContent = meta.length ? meta.join(" · ") : (t.description || "");

  const btnCheck = div.querySelector(".check");
  btnCheck.addEventListener("click", async (e)=>{
    e.stopPropagation();
    try{
      await API.patchTask(t.id, { status: isDone ? "TODO" : "DONE" });
      toast("Ок", isDone ? "Вернул в TODO" : "Отмечено Done");
      renderRoute(true);
    }catch(err){
      toast("Ошибка", String(err.message||err));
    }
  });

  div.querySelector(".more").addEventListener("click", (e)=>{
    e.stopPropagation();
    Sheet.open(t);
  });

  div.addEventListener("click", ()=>Sheet.open(t));
  return div;
}



async function renderInbox(root, force){
  setActiveTab("inbox");
  if (!force) renderSkeleton(root);

  const today = new Date();
  const date = yyyymmdd(today);

  const params = {};
  if (inboxFilter === "done") params.status = "DONE";
  else params.status = "TODO";

  if (inboxFilter === "today") params.date = date;
  if (inboxSearch) params.q = inboxSearch;

  const r = await API.tasks(params);
  root.innerHTML = "";
  const items = r.items || [];

  if (items.length === 0){
    const empty = document.createElement("div");
    empty.className = "card p16";
    empty.innerHTML = `<div class="h2">Пусто</div><div class="sub">Добавь задачу через “＋”.</div>`;
    root.appendChild(empty);
    return;
  }
  items.forEach(t=>root.appendChild(taskCard(t)));
}

async function renderCalendar(root, force){
  setActiveTab("calendar");
  if (!force) renderSkeleton(root);

  const now = new Date();
  if (!window.__calMonth) window.__calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!window.__calSel) window.__calSel = new Date(now);

  const month = window.__calMonth;
  const selected = window.__calSel;

  root.innerHTML = "";

  const head = document.createElement("div");
  head.className = "card p16";
  head.innerHTML = `
    <div class="row">
      <div>
        <div class="h2">Calendar</div>
        <div class="sub">${month.toLocaleString("ru-RU",{month:"long",year:"numeric"})}</div>
      </div>
      <div class="row gap8" style="gap:8px">
        <button class="btn ghost icon" id="calPrev">←</button>
        <button class="btn ghost icon" id="calNext">→</button>
      </div>
    </div>
  `;
  root.appendChild(head);

  const start = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
  const end = endOfWeek(new Date(month.getFullYear(), month.getMonth()+1, 0));

  const r = await API.tasks({ status:"TODO", from: start.toISOString(), to: end.toISOString() });

  const byDay = {};
  (r.items||[]).forEach(t=>{
    const d = t.startAt || t.dueAt;
    if (!d) return;
    const key = d.slice(0,10);
    (byDay[key] = byDay[key] || []).push(t);
  });

  const cal = document.createElement("div");
  cal.className = "card p16";
  cal.innerHTML = `
    <div class="dow">
      <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
    </div>
    <div class="cal-grid" id="calGrid"></div>
  `;
  root.appendChild(cal);

  const grid = cal.querySelector("#calGrid");

  let d = new Date(start);
  while (d <= end){
    const key = d.toISOString().slice(0,10);
    const count = (byDay[key] || []).length;
    const inMonth = d.getMonth() === month.getMonth();
    const isSel = key === selected.toISOString().slice(0,10);

    const b = document.createElement("button");
    b.className = "cal-day" + (inMonth ? "" : " muted") + (isSel ? " selected" : "");
    b.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:center">
        <div style="font-weight:900">${d.getDate()}</div>
        ${count ? `<span class="pill count-pill">${count}</span>` : ``}
      </div>
      ${count ? `<div class="dot"></div>` : ``}
    `;
    b.addEventListener("click", ()=>{
      window.__calSel = new Date(d);
      renderCalendar(root, true);
    });

    grid.appendChild(b);
    d.setDate(d.getDate()+1);
  }

  const keySel = selected.toISOString().slice(0,10);
  const items = byDay[keySel] || [];

  const listCard = document.createElement("div");
  listCard.className = "card";
  const list = document.createElement("div");
  list.className = "list";
  listCard.appendChild(list);
  list.innerHTML = `
    <div class="card p16">
      <div class="row">
        <div>
          <div class="h2">${selected.toLocaleDateString("ru-RU",{weekday:"short", day:"2-digit", month:"short"})}</div>
          <div class="sub">${items.length} tasks</div>
        </div>
        <button class="btn primary" id="addForDay">＋</button>
      </div>
    </div>
  `;
  root.appendChild(listCard);

  $("#addForDay").addEventListener("click", ()=>{
    const dt = new Date(selected);
    dt.setHours(9,0,0,0);
    Sheet.open({ title:"", description:"", startAt: dt.toISOString(), dueAt:null, durationMin:45, priority:3, quadrant:null });
    Sheet.mode = "create";
    Sheet.taskId = null;
    $("#btnDelete").style.display = "none";
  });

  if (!items.length){
    const empty = document.createElement("div");
    empty.className = "card p16";
    empty.innerHTML = `<div class="sub">На этот день задач нет.</div>`;
    list.appendChild(empty);
  }else{
    items.forEach(t=>list.appendChild(taskCard(t)));
  }

  head.querySelector("#calPrev").addEventListener("click", ()=>{
    window.__calMonth = new Date(month.getFullYear(), month.getMonth()-1, 1);
    renderCalendar(root, true);
  });
  head.querySelector("#calNext").addEventListener("click", ()=>{
    window.__calMonth = new Date(month.getFullYear(), month.getMonth()+1, 1);
    renderCalendar(root, true);
  });
}

function startOfWeek(d){
  const x = new Date(d);
  const day = (x.getDay()+6)%7;
  x.setDate(x.getDate() - day);
  x.setHours(0,0,0,0);
  return x;
}
function endOfWeek(d){
  const x = new Date(d);
  const day = (x.getDay()+6)%7;
  x.setDate(x.getDate() + (6-day));
  x.setHours(23,59,59,999);
  return x;
}

async function renderSchedule(root, force){
  setActiveTab("schedule");
  if (!force) renderSkeleton(root);

  if (!window.__schDay) window.__schDay = new Date();
  const day = window.__schDay;

  root.innerHTML = "";

  const head = document.createElement("div");
  head.className = "card p16";
  head.innerHTML = `
    <div class="row">
      <div>
        <div class="h2">Schedule</div>
        <div class="sub">${day.toLocaleDateString("ru-RU",{weekday:"short", day:"2-digit", month:"short"})}</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn ghost icon" id="schPrev">←</button>
        <button class="btn ghost icon" id="schNext">→</button>
      </div>
    </div>
  `;
  root.appendChild(head);

  const date = yyyymmdd(day);
  const r = await API.tasks({ status:"TODO", date });
  const items = r.items || [];

  const scheduled = items.filter(t=>t.startAt);
  const unscheduled = items.filter(t=>!t.startAt);

  const card = document.createElement("div");
  card.className = "card p16";
  card.innerHTML = `<div class="h2">Timeline</div><div class="timeline" id="tl"></div>`;
  root.appendChild(card);

  const tl = card.querySelector("#tl");

  const START = 7, END = 22;
  const totalMinutes = (END-START)*60;
  const pxPerMin = 620/totalMinutes;

  for (let h=START; h<=END; h++){
    const row = document.createElement("div");
    row.className = "hour";
    row.innerHTML = `<div class="label-hour">${String(h).padStart(2,"0")}:00</div>`;
    tl.appendChild(row);
  }

  scheduled.forEach(t=>{
    const st = new Date(t.startAt);
    const topMin = Math.max(0, Math.min(totalMinutes, (st.getHours()*60 + st.getMinutes()) - START*60));
    const dur = Math.max(30, Math.min(180, t.durationMin || 45));

    const topPx = topMin*pxPerMin + 8;
    const heightPx = Math.max(54, dur*pxPerMin);

    const b = document.createElement("div");
    b.className = "block p" + String(t.priority||3);
    b.style.top = `${topPx}px`;
    b.style.height = `${heightPx}px`;
    b.innerHTML = `
      <div style="font-weight:900; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.title}</div>
      <div class="sub" style="margin-top:6px">${fmtTime(t.startAt)} • ${dur}m</div>
      <div class="row" style="margin-top:10px; gap:8px; justify-content:flex-start; flex-wrap:wrap">
        <button class="btn ghost" data-act="m15">-15m</button>
        <button class="btn ghost" data-act="p15">+15m</button>
        <button class="btn ghost" data-act="unpin">Unpin</button>
      </div>
    `;
    b.addEventListener("click", (e)=>{ if (e.target.closest("button")) return; Sheet.open(t); });
    b.querySelector("[data-act='m15']").addEventListener("click", async (e)=>{
      e.stopPropagation();
      const n = new Date(st); n.setMinutes(n.getMinutes()-15);
      await API.patchTask(t.id, { startAt: n.toISOString() });
      toast("Ок", "Сдвинул на -15м");
      renderSchedule(root, true);
    });
    b.querySelector("[data-act='p15']").addEventListener("click", async (e)=>{
      e.stopPropagation();
      const n = new Date(st); n.setMinutes(n.getMinutes()+15);
      await API.patchTask(t.id, { startAt: n.toISOString() });
      toast("Ок", "Сдвинул на +15м");
      renderSchedule(root, true);
    });
    b.querySelector("[data-act='unpin']").addEventListener("click", async (e)=>{
      e.stopPropagation();
      await API.patchTask(t.id, { startAt: null });
      toast("Ок", "Открепил");
      renderSchedule(root, true);
    });

    tl.appendChild(b);
  });

  const card2 = document.createElement("div");
  card2.className = "card p16";
  card2.innerHTML = `<div class="h2">Unscheduled</div><div class="sub">Прикрепи задачу к времени</div>`;
  root.appendChild(card2);

  if (!unscheduled.length){
    const ok = document.createElement("div");
    ok.className = "card p16";
    ok.innerHTML = `<div class="sub">Все задачи уже на таймлайне 🎉</div>`;
    root.appendChild(ok);
  }else{
    unscheduled.forEach(t=>{
      const row = document.createElement("div");
      row.className = "card p16";
      row.innerHTML = `
        <div class="row">
          <div style="min-width:0">
            <div style="font-weight:900; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.title}</div>
            <div class="sub">Set time</div>
          </div>
          <select class="select" style="max-width:150px">
            <option value="">Select</option>
            ${Array.from({length: END-START+1}).map((_,i)=>{
              const h = START+i;
              return `<option value="${h}">${String(h).padStart(2,"0")}:00</option>`;
            }).join("")}
          </select>
        </div>
      `;
      row.addEventListener("click",(e)=>{ if (e.target.tagName==="SELECT") return; Sheet.open(t); });
      const sel = row.querySelector("select");
      sel.addEventListener("change", async ()=>{
        const h = Number(sel.value);
        if (!h) return;
        const dt = new Date(day);
        dt.setHours(h,0,0,0);
        await API.patchTask(t.id, { startAt: dt.toISOString() });
        toast("Ок", "Прикрепил к времени");
        renderSchedule(root, true);
      });
      root.appendChild(row);
    });
  }

  head.querySelector("#schPrev").addEventListener("click", ()=>{ day.setDate(day.getDate()-1); renderSchedule(root, true); });
  head.querySelector("#schNext").addEventListener("click", ()=>{ day.setDate(day.getDate()+1); renderSchedule(root, true); });
}

const QUADS = [
  { key:"Q1_URGENT_IMPORTANT", title:"Urgent / Important", hint:"Сделать сейчас" },
  { key:"Q2_NOT_URGENT_IMPORTANT", title:"Not urgent / Important", hint:"Планировать" },
  { key:"Q3_URGENT_NOT_IMPORTANT", title:"Urgent / Not important", hint:"Делегировать" },
  { key:"Q4_NOT_URGENT_NOT_IMPORTANT", title:"Not urgent / Not important", hint:"Минимизировать" },
];

async function renderMatrix(root, force){
  setActiveTab("matrix");
  if (!force) renderSkeleton(root);

  const r = await API.tasks({ status:"TODO" });
  const items = r.items || [];
  items.forEach(t=>{ if (!t.quadrant) t.quadrant = "Q2_NOT_URGENT_IMPORTANT"; });

  const by = {};
  QUADS.forEach(q=>by[q.key]=[]);
  items.forEach(t=>{ (by[t.quadrant] = by[t.quadrant] || []).push(t); });

  root.innerHTML = "";

  const head = document.createElement("div");
  head.className = "card p16";
  head.innerHTML = `<div class="row"><div><div class="h2">Priority Matrix</div><div class="sub">Drag & drop задачи между квадрантами</div></div><div class="pill">default: Q2</div></div>`;
  root.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "grid2";
  root.appendChild(grid);

  function makeItem(t){
    const it = document.createElement("div");
    it.className = "card p16";
    it.style.padding = "12px";
    it.draggable = true;
    it.innerHTML = `
      <div style="font-weight:900; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.title}</div>
      ${t.description ? `<div class="sub" style="margin-top:6px">${t.description}</div>` : ``}
      <div class="row" style="margin-top:10px; gap:8px; justify-content:flex-start; flex-wrap:wrap">
        <span class="pill">P${t.priority||3}</span>
      </div>
    `;
    it.addEventListener("click",(e)=>{ if (e.target.closest("button")) return; Sheet.open(t); });
    it.addEventListener("dragstart",(e)=>{
      it.classList.add("dragging");
      e.dataTransfer.setData("text/taskId", t.id);
      e.dataTransfer.effectAllowed = "move";
    });
    it.addEventListener("dragend",()=>it.classList.remove("dragging"));
    return it;
  }

  function makeZone(q, list){
    const z = document.createElement("div");
    z.className = "card p16 zone " + (q.key.startsWith("Q1")?"q1":q.key.startsWith("Q2")?"q2":q.key.startsWith("Q3")?"q3":"q4");
    z.dataset.q = q.key;
    z.innerHTML = `
      <div class="row">
        <div>
          <div class="h2">${q.title}</div>
          <div class="sub">${q.hint}</div>
        </div>
        <div class="pill">${list.length}</div>
      </div>
      <div class="list" style="margin-top:10px"></div>
    `;
    const l = z.querySelector(".list");
    if (!list.length){
      const e = document.createElement("div");
      e.className = "card p16";
      e.innerHTML = `<div class="sub">Перетащи сюда задачи</div>`;
      l.appendChild(e);
    }else{
      list.forEach(t=>l.appendChild(makeItem(t)));
    }

    z.addEventListener("dragover",(e)=>{ e.preventDefault(); });
    z.addEventListener("drop", async (e)=>{
      e.preventDefault();
      const id = e.dataTransfer.getData("text/taskId");
      if (!id) return;
      await API.patchTask(id, { quadrant: q.key });
      toast("Ок", "Переместил");
      renderMatrix(root, true);
    });
    return z;
  }

  QUADS.forEach(q=>grid.appendChild(makeZone(q, by[q.key]||[])));

  const foot = document.createElement("div");
  foot.className = "card p16";
  foot.innerHTML = `<div class="sub">Чтобы сделать “Без квадранта” — в задаче выбери Quadrant = Auto.</div>`;
  root.appendChild(foot);
}

async function renderReminders(root, force){
  setActiveTab("reminders");
  if (!force) renderSkeleton(root);

  const r = await API.reminders({ status:"PENDING" });
  const items = r.items || [];

  root.innerHTML = "";

  const head = document.createElement("div");
  head.className = "card p16";
  head.innerHTML = `
    <div class="row">
      <div>
        <div class="h2">Reminders</div>
        <div class="sub">${items.length} active</div>
      </div>
      <div class="pill">Snooze</div>
    </div>
  `;
  root.appendChild(head);

  if (!items.length){
    const empty = document.createElement("div");
    empty.className = "card p16";
    empty.innerHTML = `<div class="sub">Активных напоминаний нет. В Inbox нажми “Snooze”.</div>`;
    root.appendChild(empty);
    return;
  }

  items.forEach(x=>{
    const c = document.createElement("div");
    c.className = "card p16";
    c.innerHTML = `
      <div class="row">
        <div style="min-width:0">
          <div style="font-weight:900; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${x.taskTitle}</div>
          <div class="sub">⏰ ${new Date(x.remindAt).toLocaleString("ru-RU")}</div>
        </div>
        <button class="btn ghost" data-act="cancel">Cancel</button>
      </div>
      <div class="row" style="margin-top:12px; gap:8px">
        <button class="btn primary" data-act="m10" style="flex:1">+10m</button>
        <button class="btn" data-act="h1" style="flex:1">+1h</button>
      </div>
    `;
    c.querySelector("[data-act='cancel']").addEventListener("click", async ()=>{
      await API.cancelReminder(x.id);
      toast("Ок", "Отменил");
      renderReminders(root, true);
    });
    c.querySelector("[data-act='m10']").addEventListener("click", async ()=>{
      await API.snooze(x.id, 10);
      toast("Ок", "Snooze +10m");
      renderReminders(root, true);
    });
    c.querySelector("[data-act='h1']").addEventListener("click", async ()=>{
      await API.snooze(x.id, 60);
      toast("Ок", "Snooze +1h");
      renderReminders(root, true);
    });
    root.appendChild(c);
  });

  clearInterval(window.__remT);
  window.__remT = setInterval(()=>renderReminders(root, true), 15000);
}

async function renderSettings(root, force){
  setActiveTab("settings");
  if (!force) renderSkeleton(root);

  const u = await API.me().then(r=>r.user).catch(()=>null);

  root.innerHTML = "";

  const profile = document.createElement("div");
  profile.className = "card p16";
  profile.innerHTML = `
    <div class="row">
      <div>
        <div class="h2">Settings</div>
        <div class="sub">Профиль и управление</div>
      </div>
      <div class="avatar" id="setAvatar"></div>
    </div>
    <div style="margin-top:12px; font-weight:900">${u ? ((u.firstName||"") + " " + (u.lastName||"")).trim() || (u.username ? "@"+u.username : "User") : "User"}</div>
    <div class="sub">${u?.username ? "@"+u.username : ("tgId: " + (u?.tgId || "-"))}</div>
    <div class="row" style="margin-top:12px; gap:8px">
      <button class="btn" id="btnExpand" style="flex:1">Expand</button>
      <button class="btn" id="btnClose" style="flex:1">Close</button>
    </div>
    <div class="row" style="margin-top:10px; gap:8px">
      <button class="btn danger" id="btnLogout" style="flex:1">Logout</button>
    </div>
    <div class="sub" style="margin-top:10px">
      Напоминания работают, если пользователь нажал <b>/start</b> у бота.
    </div>
  `;
  root.appendChild(profile);

  if (u?.photoUrl){
    const img = document.createElement("img");
    img.src = u.photoUrl;
    img.alt = "";
    $("#setAvatar").appendChild(img);
  }

  $("#btnExpand").addEventListener("click", ()=>window.Telegram?.WebApp?.expand?.());
  $("#btnClose").addEventListener("click", ()=>window.Telegram?.WebApp?.close?.());
  $("#btnLogout").addEventListener("click", ()=>{
    localStorage.removeItem("tg_planner_token");
    toast("Ок", "Токен удалён");
    location.reload();
  });

  const tips = document.createElement("div");
  tips.className = "card p16";
  tips.innerHTML = `
    <div class="h2">Tips</div>
    <div class="sub" style="margin-top:8px; line-height:1.5">
      • Inbox → Snooze создаёт reminder на +10 минут<br/>
      • Schedule → Set time прикрепляет задачу к времени<br/>
      • Matrix → перетаскивай задачи по квадрантам
    </div>
  `;
  root.appendChild(tips);
}

window.addEventListener("error", (e)=>{ try{ toast("JS error", String(e?.message||e)); }catch{} });
window.addEventListener("unhandledrejection", (e)=>{ try{ toast("Promise error", String(e?.reason?.message||e?.reason||e)); }catch{} });

async function renderRoute(force=false){
  const root = $("#app");
  const hash = (location.hash || "#/inbox").replace("#","");
  const route = hash.split("?")[0];

  try{
    if (route === "/inbox") return renderInbox(root, force);
    if (route === "/calendar") return renderCalendar(root, force);
    if (route === "/schedule") return renderSchedule(root, force);
    if (route === "/matrix") return renderMatrix(root, force);
    if (route === "/reminders") return renderReminders(root, force);
    if (route === "/settings") return renderSettings(root, force);
    location.hash = "#/inbox";
  }catch(e){
    root.innerHTML = "";
    const c = document.createElement("div");
    c.className = "card p16";
    c.innerHTML = `<div class="h2">Ошибка</div><div class="sub"></div>`;
    c.querySelector(".sub").textContent = String(e.message || e);
    root.appendChild(c);
  }
}

function decorateTabs(){
  document.querySelectorAll(".tab[data-icon]").forEach(a=>{
    const key = a.getAttribute("data-icon");
    const label = a.textContent.trim();
    a.innerHTML = `${ICONS[key]||""}<span>${label}</span>`;
  });
}

(async function boot(){
  // Telegram Mini App integration (делает WebApp API доступным и “оживляет” UI)
  const wa = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try{
    if (wa){
      wa.ready();
      wa.expand();
      wa.setHeaderColor && wa.setHeaderColor("#E9EEF8");
      wa.setBackgroundColor && wa.setBackgroundColor("#E9EEF8");
      // Telegram disables selection by default; ok.
    }
  }catch{}

  wireSheet();
  wireInboxToolbar();

  
decorateTabs();

const auth = await ensureAuth();
if (!auth.ok){
  const root = $("#app");
  root.innerHTML = "";
  const c = document.createElement("div");
  c.className = "card p16";

  if (auth.reason === "NO_INITDATA" || auth.reason === "NO_INITDATA_TG"){
    c.innerHTML = (auth.reason === "NO_INITDATA_TG") ? `
        <div class="h2">Telegram открыт, но initData пустой</div>
        <div class="sub" style="line-height:1.5; margin-top:10px">
          Это значит, что страница открылась <b>как обычная ссылка</b>, а не как <b>WebApp-кнопка</b>.
          В таком режиме Telegram не передаёт подпись <b>initData</b>, и мы не можем залогинить пользователя.<br/><br/>
          ✅ Исправление (BotFather):<br/>
          • <b>/setmenubutton</b> → выбери бота → <b>Web App</b> → вставь URL: <b>${location.origin}/</b><br/>
          • Потом открой бота и нажми кнопку меню / “Open App” (а не ссылку).<br/><br/>
          Также, если ты используешь inline-кнопку — она должна быть <b>web_app</b>, а не <b>url</b>.
        </div>
        <div class="row" style="margin-top:12px; gap:10px">
          <button class="btn primary" id="btnReload" style="flex:1">Обновить</button>
          <button class="btn ghost" id="btnDiag" style="flex:1">Диагностика</button>
        </div>
      ` : `
        <div class="h2">Открой из Telegram</div>
        <div class="sub" style="line-height:1.5; margin-top:10px">
          Сейчас <b>initData пустой</b>. Это бывает если:
          <br/>• открыли ссылку в браузере, а не Mini App
          <br/>• в BotFather WebApp URL не равен твоему Railway домену
          <br/>• WebApp открыт не через бота/меню
          <br/><br/>
          ✅ Открой бота → нажми кнопку меню / WebApp.<br/>
          ✅ Проверь WebApp URL в BotFather.<br/><br/>
          Нажми “Диагностика”, чтобы увидеть статус.
        </div>
        <div class="row" style="margin-top:12px; gap:10px">
          <button class="btn primary" id="btnReload" style="flex:1">Обновить</button>
          <button class="btn ghost" id="btnDiag" style="flex:1">Диагностика</button>
        </div>
      `;
    } else {
    c.innerHTML = `
      <div class="h2">Авторизация упала</div>
      <div class="sub" style="line-height:1.5; margin-top:10px">
        Mini App открылся, но сервер не смог залогинить пользователя.<br/><br/>
        Обычно причина: <b>PostgreSQL не подключён</b> к этому Railway проекту или <b>DATABASE_URL</b> неверный
        (в логе будет “Name or service not known”).<br/><br/>
        Ошибка: <b>${(auth.detail||"").replaceAll("<","&lt;").replaceAll(">","&gt;")}</b><br/><br/>
        ✅ Railway → добавь PostgreSQL в этом же проекте и сделай Reference переменной DATABASE_URL.<br/>
        ✅ Проверь BOT_TOKEN и JWT_SECRET.<br/><br/>
        Нажми “Диагностика” — покажет db_ok и db_host.
      </div>
      <div class="row" style="margin-top:12px; gap:10px">
        <button class="btn primary" id="btnRetry" style="flex:1">Повторить</button>
        <button class="btn ghost" id="btnDiag" style="flex:1">Диагностика</button>
      </div>
    `;
  }

  root.appendChild(c);

  const diag = async ()=>{
    try{
      const wa = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        const extra = {
          hasTelegram: !!wa,
          platform: wa?.platform,
          version: wa?.version,
          initDataLen: (wa?.initData||"").length,
          url: location.href
        };
        const info = await fetch("/health/info").then(r=>r.json());
        info.__client = extra;
      toast("health/info", JSON.stringify(info));
    }catch(e){
      toast("Diag error", String(e?.message||e));
    }
  };

  const btnDiag = document.querySelector("#btnDiag");
  if (btnDiag) btnDiag.addEventListener("click", diag);

  const btnReload = document.querySelector("#btnReload");
  if (btnReload) btnReload.addEventListener("click", ()=>location.reload());

  const btnRetry = document.querySelector("#btnRetry");
  if (btnRetry) btnRetry.addEventListener("click", ()=>location.reload());

  return;
}

  await loadTopUser();
  window.addEventListener("hashchange", ()=>renderRoute(true));
  await renderRoute(false);

  toast("Привет 👋", "Планировщик готов");
})();
