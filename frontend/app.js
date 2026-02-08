/* global Telegram */
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
  createTask(payload) {
    return API.request("/api/tasks", { method:"POST", body: JSON.stringify(payload) });
  },
  patchTask(id, payload) {
    return API.request(`/api/tasks/${id}`, { method:"PATCH", body: JSON.stringify(payload) });
  },
  deleteTask(id) {
    return API.request(`/api/tasks/${id}`, { method:"DELETE" });
  },
  reminders(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== "") qs.set(k, String(v)); });
    const q = qs.toString();
    return API.request("/api/reminders" + (q ? "?" + q : ""));
  },
  quickReminder(taskId) {
    return API.request(`/api/reminders/task/${taskId}/quick`, { method:"POST" });
  },
  snooze(reminderId, minutes) {
    return API.request(`/api/reminders/${reminderId}/snooze`, { method:"POST", body: JSON.stringify({ minutes }) });
  },
  cancelReminder(reminderId) {
    return API.request(`/api/reminders/${reminderId}/cancel`, { method:"POST" });
  }
};

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === "class") e.className = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  });
  children.forEach(c => e.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return e;
}

function fmtDate(d) {
  return new Date(d).toLocaleString("ru-RU", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
}

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach(a => {
    a.classList.toggle("active", a.dataset.tab === name);
  });
}

async function ensureAuth() {
  const token = localStorage.getItem("tg_planner_token");
  if (token) return true;

  const wa = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (!wa || !wa.initData) return false;

  wa.ready();
  wa.expand();

  const r = await API.login(wa.initData);
  localStorage.setItem("tg_planner_token", r.token);
  return true;
}

async function loadTopUser() {
  try {
    const r = await API.me();
    const u = r.user || null;
    const sub = document.getElementById("userSub");
    const av = document.getElementById("avatar");
    if (sub) sub.textContent = u?.username ? ("@" + u.username) : ([u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Telegram Mini App");
    if (av) {
      av.innerHTML = "";
      if (u?.photoUrl) av.appendChild(el("img", { src: u.photoUrl, alt:"" }));
    }
  } catch {}
}

/* Pages */
function pageWrapper(titleRight) {
  return el("div", {}, [
    el("div", { class:"row" }, [
      el("div", { class:"h1" }, [titleRight || ""]),
      el("div", { class:"mini" }, [])
    ])
  ]);
}

async function renderInbox(root) {
  setActiveTab("inbox");
  root.innerHTML = "";

  const header = el("div", { class:"row" }, [
    el("div", { class:"h2" }, ["Inbox"]),
    el("button", { class:"btn primary", onclick: () => openTaskModal() }, ["+ Add"])
  ]);

  const filters = el("div", { class:"card p16" }, [
    el("div", { class:"row gap8" }, [
      el("button", { class:"btn", id:"fToday" }, ["Today"]),
      el("button", { class:"btn", id:"fUpcoming" }, ["Upcoming"]),
      el("button", { class:"btn", id:"fDone" }, ["Done"]),
    ])
  ]);

  const list = el("div", { class:"list", id:"taskList" }, []);
  root.appendChild(header);
  root.appendChild(filters);
  root.appendChild(list);

  let filter = "Today";
  function updateButtons() {
    ["Today","Upcoming","Done"].forEach(f => {
      const id = f === "Today" ? "fToday" : f==="Upcoming" ? "fUpcoming" : "fDone";
      const b = document.getElementById(id);
      if (!b) return;
      b.classList.toggle("primary", filter === f);
      b.classList.toggle("btn", true);
      b.classList.toggle("primary", filter === f);
      b.className = "btn " + (filter === f ? "primary" : "");
    });
  }

  async function load() {
    updateButtons();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,"0");
    const dd = String(today.getDate()).padStart(2,"0");
    const date = `${yyyy}-${mm}-${dd}`;

    const params = filter === "Done"
      ? { status:"DONE" }
      : filter === "Upcoming"
        ? { status:"TODO" }
        : { status:"TODO", date };

    const r = await API.tasks(params);
    list.innerHTML = "";
    if (!r.items || r.items.length === 0) {
      list.appendChild(el("div", { class:"card p16" }, [el("div",{class:"sub"},["Пока пусто. Добавь задачу."])]));
      return;
    }
    r.items.forEach(t => list.appendChild(taskCard(t, { allowDone:true })));
  }

  document.getElementById("fToday").onclick = () => { filter="Today"; load(); };
  document.getElementById("fUpcoming").onclick = () => { filter="Upcoming"; load(); };
  document.getElementById("fDone").onclick = () => { filter="Done"; load(); };

  await load();

  // modal
  function openTaskModal() {
    const modal = ensureModal();
    modal.querySelector(".h2").textContent = "Новая задача";
    modal.querySelector("#tTitle").value = "";
    modal.querySelector("#tDesc").value = "";
    modal.querySelector("#saveBtn").onclick = async () => {
      const title = modal.querySelector("#tTitle").value.trim();
      const description = modal.querySelector("#tDesc").value.trim();
      if (!title) return;
      modal.querySelector("#saveBtn").textContent = "...";
      try {
        await API.createTask({ title, description: description || undefined });
        closeModal();
        await load();
      } finally {
        modal.querySelector("#saveBtn").textContent = "Сохранить";
      }
    };
    showModal();
  }
}

function taskCard(t, opts = {}) {
  const pills = el("div", { class:"row wrap gap8" }, [
    el("span", { class:"badge" + (t.status==="DONE" ? " done" : "") }, [t.status==="DONE" ? "Done" : "Todo"]),
  ]);
  if (t.startAt) pills.appendChild(el("span", { class:"pill" }, ["Start " + new Date(t.startAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})]));
  if (t.dueAt) pills.appendChild(el("span", { class:"pill" }, ["Due " + fmtDate(t.dueAt)]));
  if (t.nextReminderAt) pills.appendChild(el("span", { class:"pill" }, ["🔔 " + new Date(t.nextReminderAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})]));

  const actions = el("div", { class:"row gap8", style:"margin-top:10px" }, [
    el("button", { class:"btn", onclick: async () => {
      await API.patchTask(t.id, { status: t.status==="DONE" ? "TODO" : "DONE" });
      location.reload();
    }}, [t.status==="DONE" ? "Undo" : "Done"]),
    el("button", { class:"btn", onclick: async () => { await API.quickReminder(t.id); alert("Напоминание через 10 минут"); } }, ["Snooze"]),
    el("button", { class:"btn danger", onclick: async () => {
      if (!confirm("Удалить задачу?")) return;
      await API.deleteTask(t.id);
      location.reload();
    } }, ["Delete"])
  ]);

  return el("div", { class:"card task" }, [
    el("p", { class:"task-title" }, [t.title]),
    t.description ? el("div",{class:"task-desc"},[t.description]) : el("div"),
    el("div",{style:"margin-top:10px"},[pills]),
    actions
  ]);
}

async function renderCalendar(root) {
  setActiveTab("calendar");
  root.innerHTML = "";

  const now = new Date();
  let month = new Date(now.getFullYear(), now.getMonth(), 1);
  let selected = new Date(now);

  const header = el("div", { class:"row" }, [
    el("div", { class:"h2" }, ["Calendar"]),
    el("div", { class:"row gap8" }, [
      el("button",{class:"btn", onclick:()=>{ month = new Date(month.getFullYear(), month.getMonth()-1, 1); render(); }},["←"]),
      el("div",{class:"card p16", style:"padding:10px 12px"},[month.toLocaleString("ru-RU",{month:"long",year:"numeric"})]),
      el("button",{class:"btn", onclick:()=>{ month = new Date(month.getFullYear(), month.getMonth()+1, 1); render(); }},["→"]),
    ])
  ]);

  const grid = el("div", { class:"card p16", id:"calGrid" }, []);
  const list = el("div", { class:"list", id:"calList" }, []);

  root.appendChild(header);
  root.appendChild(grid);
  root.appendChild(list);

  function startOfWeek(d) {
    const x = new Date(d);
    const day = (x.getDay()+6)%7; // mon=0
    x.setDate(x.getDate() - day);
    x.setHours(0,0,0,0);
    return x;
  }

  async function render() {
    grid.innerHTML = "";
    list.innerHTML = "";

    const start = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
    const end = new Date(month.getFullYear(), month.getMonth()+1, 0);
    const endW = new Date(end);
    endW.setDate(endW.getDate() + (7-((endW.getDay()+6)%7)-1));
    endW.setHours(23,59,59,999);

    const r = await API.tasks({ status:"TODO", from: start.toISOString(), to: endW.toISOString() });

    const byDay = {};
    (r.items || []).forEach(t => {
      const d = t.startAt || t.dueAt;
      if (!d) return;
      const key = d.slice(0,10);
      byDay[key] = byDay[key] || [];
      byDay[key].push(t);
    });

    const dow = el("div",{class:"row", style:"justify-content:space-between; font-size:11px; color:var(--muted); margin-bottom:8px"},[
      el("div",{},["Mon"]), el("div",{},["Tue"]), el("div",{},["Wed"]), el("div",{},["Thu"]), el("div",{},["Fri"]), el("div",{},["Sat"]), el("div",{},["Sun"])
    ]);
    grid.appendChild(dow);

    const table = el("div", { style:"display:grid; grid-template-columns: repeat(7, 1fr); gap:8px;" }, []);
    grid.appendChild(table);

    let d = new Date(start);
    while (d <= endW) {
      const key = d.toISOString().slice(0,10);
      const count = (byDay[key] || []).length;
      const inMonth = d.getMonth() === month.getMonth();
      const isSel = key === selected.toISOString().slice(0,10);

      const cell = el("button", {
        class: "btn",
        style: `
          text-align:left; width:100%;
          padding:10px 10px;
          border-radius:16px;
          background:${isSel ? "#0F172A" : "rgba(255,255,255,0.6)"};
          color:${isSel ? "#fff" : "var(--text)"};
          opacity:${inMonth ? 1 : 0.55};
        `,
        onclick: ()=>{ selected = new Date(d); renderSelected(byDay); }
      }, [
        el("div",{style:"display:flex; justify-content:space-between; align-items:center;"},[
          el("div",{style:"font-weight:800;"},[String(d.getDate())]),
          count ? el("div",{class:"pill", style:`background:${isSel ? "rgba(255,255,255,0.15)" : "rgba(15,23,42,0.08)"}; border:none; color:${isSel ? "#fff":"var(--muted)"}`},[String(count)]) : el("span")
        ]),
        count ? el("div",{style:`margin-top:8px; height:6px; border-radius:999px; background:${isSel ? "rgba(255,255,255,0.35)" : "rgba(15,23,42,0.10)"}`}) : el("span")
      ]);

      table.appendChild(cell);
      d.setDate(d.getDate()+1);
    }

    renderSelected(byDay);
  }

  function renderSelected(byDay) {
    list.innerHTML = "";
    const key = selected.toISOString().slice(0,10);
    const items = byDay[key] || [];

    list.appendChild(el("div",{class:"row"},[
      el("div",{class:"h2"},[selected.toLocaleDateString("ru-RU",{weekday:"short", day:"2-digit", month:"short"})]),
      el("div",{class:"mini"},[items.length + " tasks"])
    ]));

    if (items.length === 0) {
      list.appendChild(el("div",{class:"card p16"},[el("div",{class:"sub"},["На этот день задач нет."])]));
      return;
    }
    items.forEach(t => list.appendChild(taskCard(t)));
  }

  await render();
}

async function renderSchedule(root) {
  setActiveTab("schedule");
  root.innerHTML = "";

  let day = new Date();

  const header = el("div", { class:"row" }, [
    el("div", { class:"h2" }, ["Schedule"]),
    el("div", { class:"row gap8" }, [
      el("button",{class:"btn", onclick:()=>{ day.setDate(day.getDate()-1); render(); }},["←"]),
      el("div",{class:"card p16", style:"padding:10px 12px"},[day.toLocaleDateString("ru-RU",{weekday:"short", day:"2-digit", month:"short"})]),
      el("button",{class:"btn", onclick:()=>{ day.setDate(day.getDate()+1); render(); }},["→"]),
    ])
  ]);

  const card = el("div",{class:"card p16"},[]);
  root.appendChild(header);
  root.appendChild(card);

  const START = 7;
  const END = 22;

  function yyyymmdd(d){
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function minutesFromMidnight(dt){
    return dt.getHours()*60 + dt.getMinutes();
  }

  async function render() {
    card.innerHTML = "";
    const date = yyyymmdd(day);
    const r = await API.tasks({ status:"TODO", date });

    const scheduled = (r.items||[]).filter(t => t.startAt);
    const unscheduled = (r.items||[]).filter(t => !t.startAt);

    card.appendChild(el("div",{class:"h2"},["Timeline"]));
    const timeline = el("div",{class:"timeline", style:"margin-top:10px"},[]);
    card.appendChild(timeline);

    const totalMinutes = (END-START)*60;
    const pxPerMin = 600/totalMinutes;

    for (let h=START; h<=END; h++){
      const row = el("div",{class:"hour"},[
        el("div",{class:"label"},[String(h).padStart(2,"0")+":00"])
      ]);
      timeline.appendChild(row);
    }

    // Blocks
    scheduled.forEach(t => {
      const st = new Date(t.startAt);
      const topMin = Math.max(0, Math.min(totalMinutes, minutesFromMidnight(st) - START*60));
      const dur = Math.max(15, Math.min(240, t.durationMin || 45));
      const topPx = topMin*pxPerMin + 8;
      const heightPx = Math.max(46, dur*pxPerMin);

      const block = el("div", { class:"block", style:`top:${topPx}px; height:${heightPx}px;` }, [
        el("div",{style:"font-weight:800; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"},[t.title]),
        el("div",{class:"mini", style:"margin-top:6px"},["Start " + st.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})]),
        el("div",{class:"row gap8", style:"margin-top:10px"},[
          el("button",{class:"btn", onclick: async ()=>{ 
            const n = new Date(st); n.setMinutes(n.getMinutes()-15);
            await API.patchTask(t.id, { startAt: n.toISOString() });
            render();
          }},["-15m"]),
          el("button",{class:"btn", onclick: async ()=>{ 
            const n = new Date(st); n.setMinutes(n.getMinutes()+15);
            await API.patchTask(t.id, { startAt: n.toISOString() });
            render();
          }},["+15m"]),
          el("button",{class:"btn", onclick: async ()=>{ await API.patchTask(t.id, { startAt: null }); render(); }},["Unpin"]),
        ])
      ]);
      timeline.appendChild(block);
    });

    // Unscheduled
    card.appendChild(el("div",{class:"h2", style:"margin-top:14px"},["Unscheduled"]));
    if (unscheduled.length === 0) {
      card.appendChild(el("div",{class:"sub"},["Все задачи уже на таймлайне 🎉"]));
      return;
    }

    unscheduled.forEach(t => {
      const row = el("div",{class:"card p16"},[
        el("div",{class:"row"},[
          el("div",{},[
            el("div",{style:"font-weight:800"},[t.title]),
            el("div",{class:"mini"},["Прикрепи к времени"])
          ]),
          el("select",{class:"select", style:"max-width:140px"},[
            el("option",{value:""},["Set time"]),
            ...Array.from({length: END-START+1}).map((_,i)=>{
              const h = START+i;
              const txt = String(h).padStart(2,"0")+":00";
              return el("option",{value:String(h)},[txt]);
            })
          ])
        ])
      ]);

      const sel = row.querySelector("select");
      sel.onchange = async () => {
        const h = Number(sel.value);
        if (!h) return;
        const dt = new Date(day);
        dt.setHours(h,0,0,0);
        await API.patchTask(t.id, { startAt: dt.toISOString() });
        render();
      };

      card.appendChild(row);
    });
  }

  await render();
}

async function renderMatrix(root) {
  setActiveTab("matrix");
  root.innerHTML = "";

  const header = el("div", { class:"row" }, [
    el("div", { class:"h2" }, ["Priority Matrix"]),
    el("div", { class:"mini" }, ["Drag & drop"])
  ]);

  const grid = el("div", { class:"grid2" }, []);
  root.appendChild(header);
  root.appendChild(grid);

  const QUADS = [
    { key:"Q1_URGENT_IMPORTANT", title:"Urgent / Important", hint:"Сделать сейчас" },
    { key:"Q2_NOT_URGENT_IMPORTANT", title:"Not urgent / Important", hint:"Планировать" },
    { key:"Q3_URGENT_NOT_IMPORTANT", title:"Urgent / Not important", hint:"Делегировать" },
    { key:"Q4_NOT_URGENT_NOT_IMPORTANT", title:"Not urgent / Not important", hint:"Минимизировать" },
  ];

  function makeDropZone(q, items) {
    const box = el("div", { class:"card p16", "data-q": q.key }, [
      el("div",{class:"row"},[
        el("div",{},[
          el("div",{style:"font-weight:900"},[q.title]),
          el("div",{class:"mini", style:"margin-top:6px"},[q.hint]),
        ]),
        el("div",{class:"mini"},[String(items.length)]),
      ]),
      el("div",{class:"list", style:"margin-top:10px"}, items.length ? items.map(t => matrixItem(t)) : [
        el("div",{class:"sub"},["Перетащи сюда задачи"])
      ])
    ]);

    box.ondragover = (e) => { e.preventDefault(); };
    box.ondrop = async (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/taskId");
      if (!id) return;
      await API.patchTask(id, { quadrant: q.key });
      render();
    };

    return box;
  }

  function matrixItem(t) {
    const item = el("div", { class:"card p16", draggable:"true", style:"padding:12px; cursor:grab;" }, [
      el("div",{style:"font-weight:900; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"},[t.title]),
      t.description ? el("div",{class:"mini", style:"margin-top:6px"},[t.description]) : el("div"),
      el("div",{class:"row gap8", style:"margin-top:8px"},[
        el("span",{class:"pill"},["P"+t.priority]),
        t.startAt ? el("span",{class:"pill"},["🕒"]) : el("span"),
        t.dueAt ? el("span",{class:"pill"},["📅"]) : el("span"),
      ])
    ]);

    item.ondragstart = (e) => {
      e.dataTransfer.setData("text/taskId", t.id);
      e.dataTransfer.effectAllowed = "move";
    };
    return item;
  }

  async function render() {
    grid.innerHTML = "";
    const r = await API.tasks({ status:"TODO" });
    const items = r.items || [];

    const by = {};
    QUADS.forEach(q => by[q.key] = []);
    items.forEach(t => {
      const key = t.quadrant || "Q2_NOT_URGENT_IMPORTANT";
      (by[key] = by[key] || []).push(t);
    });

    QUADS.forEach(q => grid.appendChild(makeDropZone(q, by[q.key] || [])));
  }

  await render();
  root.appendChild(el("div",{class:"card p16 mini"},["Если у задачи нет квадранта — она считается “Not urgent / Important”."]));
}

async function renderReminders(root) {
  setActiveTab("reminders");
  root.innerHTML = "";

  const header = el("div", { class:"row" }, [
    el("div", { class:"h2" }, ["Reminder Center"]),
    el("div", { class:"mini", id:"remCnt" }, [""])
  ]);
  root.appendChild(header);

  const list = el("div", { class:"list", id:"remList" }, []);
  root.appendChild(list);

  async function load() {
    const r = await API.reminders({ status:"PENDING" });
    const items = r.items || [];
    document.getElementById("remCnt").textContent = items.length + " active";
    list.innerHTML = "";

    if (items.length === 0) {
      list.appendChild(el("div",{class:"card p16"},[
        el("div",{class:"sub"},["Активных напоминаний нет. В Inbox нажми “Snooze” на задаче, чтобы создать напоминание на 10 минут."])
      ]));
      return;
    }

    items.forEach(x => {
      const when = new Date(x.remindAt);
      list.appendChild(el("div",{class:"card p16"},[
        el("div",{class:"row"},[
          el("div",{},[
            el("div",{style:"font-weight:900"},[x.taskTitle]),
            el("div",{class:"mini", style:"margin-top:6px"},["⏰ " + when.toLocaleString("ru-RU")])
          ]),
          el("button",{class:"btn", onclick: async ()=>{ await API.cancelReminder(x.id); load(); }},["Cancel"])
        ]),
        el("div",{class:"row gap8", style:"margin-top:12px"},[
          el("button",{class:"btn primary", style:"flex:1", onclick: async ()=>{ await API.snooze(x.id, 10); load(); }},["+10 min"]),
          el("button",{class:"btn", style:"flex:1", onclick: async ()=>{ await API.snooze(x.id, 60); load(); }},["+1 hour"]),
        ])
      ]));
    });
  }

  await load();
  setInterval(load, 15000);
}

async function renderSettings(root) {
  setActiveTab("settings");
  root.innerHTML = "";

  const u = await API.me().then(r => r.user).catch(()=>null);

  const name = u ? ((u.firstName || "") + " " + (u.lastName || "")).trim() || (u.username ? "@"+u.username : "User") : "User";
  const tgId = u ? u.tgId : "-";

  root.appendChild(el("div",{class:"card p16"},[
    el("div",{class:"row"},[
      el("div",{},[
        el("div",{class:"h2"},["Settings"]),
        el("div",{class:"sub"},["Профиль и управление mini app"])
      ]),
      el("div",{class:"avatar", id:"setAvatar"},[])
    ])
  ]));

  if (u?.photoUrl) {
    const av = document.getElementById("setAvatar");
    av.appendChild(el("img",{src:u.photoUrl, alt:""}));
  }

  root.appendChild(el("div",{class:"card p16"},[
    el("div",{class:"h2"},[name]),
    el("div",{class:"sub"},[u?.username ? "@"+u.username : ("tgId: " + tgId)]),
    el("div",{class:"kv"},[
      el("div",{},["initDataUnsafe"]),
      el("div",{},[(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) ? "available" : "no"])
    ]),
    el("div",{class:"row gap8", style:"margin-top:12px"},[
      el("button",{class:"btn", style:"flex:1", onclick: ()=> window.Telegram?.WebApp?.close?.() },["Close mini app"]),
      el("button",{class:"btn primary", style:"flex:1", onclick: ()=> window.Telegram?.WebApp?.expand?.() },["Expand"])
    ])
  ]));

  root.appendChild(el("div",{class:"card p16"},[
    el("div",{class:"h2"},["Account"]),
    el("div",{class:"row gap8", style:"margin-top:10px"},[
      el("button",{class:"btn", style:"flex:1", onclick: ()=> { localStorage.removeItem("tg_planner_token"); location.reload(); }},["Logout"])
    ]),
    el("div",{class:"sub"},["Logout удаляет локальный токен. При следующем открытии mini app снова пройдёт Telegram login."])
  ]));

  root.appendChild(el("div",{class:"card p16"},[
    el("div",{class:"h2"},["Tips"]),
    el("ul",{class:"mini", style:"margin:10px 0 0 18px; line-height:1.5"},[
      el("li",{},["Чтобы напоминания приходили, пользователь должен хотя бы раз нажать /start у бота."]),
      el("li",{},["Inbox → “Snooze” создаёт reminder на +10 минут."]),
      el("li",{},["Schedule — закрепляй задачи по времени через “Set time”."]),
      el("li",{},["Matrix — перетаскивай задачи по квадрантам."]),
    ])
  ]));
}

/* Simple modal */
function ensureModal() {
  let m = document.getElementById("modal");
  if (m) return m;
  m = el("div",{id:"modal", class:"modal"},[
    el("div",{class:"card p16 sheet"},[
      el("div",{class:"h2"},["Новая задача"]),
      el("div",{class:"sub"},["Название"]),
      el("input",{id:"tTitle", class:"input", placeholder:"Например: Купить продукты"}),
      el("div",{class:"sub", style:"margin-top:10px"},["Описание"]),
      el("textarea",{id:"tDesc", class:"textarea", placeholder:"Необязательно"}),
      el("div",{class:"row gap8", style:"margin-top:12px"},[
        el("button",{class:"btn", style:"flex:1", onclick: closeModal},["Отмена"]),
        el("button",{class:"btn primary", id:"saveBtn", style:"flex:1"},["Сохранить"])
      ])
    ])
  ]);
  document.body.appendChild(m);
  m.addEventListener("click", (e)=>{ if (e.target === m) closeModal(); });
  return m;
}
function showModal(){ ensureModal().classList.add("show"); }
function closeModal(){ const m = ensureModal(); m.classList.remove("show"); }

/* Router */
async function renderRoute() {
  const root = document.getElementById("app");
  const hash = (location.hash || "#/inbox").replace("#", "");
  const route = hash.split("?")[0];

  try {
    if (route === "/inbox") return renderInbox(root);
    if (route === "/calendar") return renderCalendar(root);
    if (route === "/schedule") return renderSchedule(root);
    if (route === "/matrix") return renderMatrix(root);
    if (route === "/reminders") return renderReminders(root);
    if (route === "/settings") return renderSettings(root);
    location.hash = "#/inbox";
  } catch (e) {
    root.innerHTML = "";
    root.appendChild(el("div",{class:"card p16"},[
      el("div",{class:"h2"},["Ошибка"]),
      el("div",{class:"sub"},[String(e && e.message ? e.message : e)])
    ]));
  }
}

(async function boot(){
  const ok = await ensureAuth();
  if (!ok) {
    const root = document.getElementById("app");
    root.innerHTML = "";
    root.appendChild(el("div",{class:"card p16"},[
      el("div",{class:"h2"},["Нет Telegram initData"]),
      el("div",{class:"sub"},["Открой mini app из Telegram. Если тестируешь локально — добавь WebApp в бота и открой через него."])
    ]));
    return;
  }

  await loadTopUser();

  window.addEventListener("hashchange", renderRoute);
  await renderRoute();
})();
