const state = {
  dateStr: null,          // "YYYY-MM-DD" (civil date in выбранном TZ)
  timezone: "UTC",        // IANA
  projects: [],
  tasks: [],
  events: [],
  mode: "task",           // task | event
  tab: "schedule",        // schedule | tasks | calendar
  tasksFilter: "inbox",
  tasksSearch: "",
};

let openSwipeEl = null;
let isBooted = false;

function pad2(n){ return String(n).padStart(2,"0"); }
function parseISODate(dateStr){
  const [y,m,d] = dateStr.split("-").map(Number);
  return {y, m, d};
}
function dateStrMidUTC(dateStr){
  const {y,m,d} = parseISODate(dateStr);
  return new Date(Date.UTC(y, m-1, d, 12, 0, 0));
}
function addDays(dateStr, delta){
  const {y,m,d} = parseISODate(dateStr);
  const dt = new Date(Date.UTC(y, m-1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth()+1)}-${pad2(dt.getUTCDate())}`;
}

function hexToRgb(hex){
  if(!hex) return {r:110,g:168,b:255};
  const h = hex.replace("#","").trim();
  if(h.length === 3){
    const r = parseInt(h[0]+h[0],16);
    const g = parseInt(h[1]+h[1],16);
    const b = parseInt(h[2]+h[2],16);
    return {r,g,b};
  }
  if(h.length >= 6){
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);
    return {r,g,b};
  }
  return {r:110,g:168,b:255};
}
function rgba({r,g,b}, a){
  return `rgba(${r},${g},${b},${a})`;
}

function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
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

/* ---------------- Timezone helpers ---------------- */
function deviceTimezone(){
  try{
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }catch(e){
    return "UTC";
  }
}
function tzButtonLabel(tz){
  const now = new Date();
  const offMin = getTimeZoneOffsetMinutes(tz, now);
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const hh = pad2(Math.floor(abs/60));
  const mm = pad2(abs%60);
  const off = mm==="00" ? `${sign}${hh}` : `${sign}${hh}:${mm}`;
  const short = tz === "UTC" ? "" : tz.split("/").pop();
  return short ? `${off} • ${short}` : `${off}`;
}

function tzOptionLabel(tz){
  // No "UTC" text in UI
  const now = new Date();
  const offMin = getTimeZoneOffsetMinutes(tz, now);
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const hh = pad2(Math.floor(abs/60));
  const mm = pad2(abs%60);
  const off = mm==="00" ? `${sign}${hh}` : `${sign}${hh}:${mm}`;
  const short = tz === "UTC" ? "" : tz.replace("_", " ").split("/").pop();
  return short ? `${off} • ${short}` : `${off}`;
}

// Get TZ offset (minutes) for tz at given Date instant
function getTimeZoneOffsetMinutes(tz, date){
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit",
    hour12:false
  });
  const parts = fmt.formatToParts(date);
  const map = {};
  for(const p of parts){
    if(p.type !== "literal") map[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(map.year), Number(map.month)-1, Number(map.day),
    Number(map.hour), Number(map.minute), Number(map.second)
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

// Convert civil time in tz (dateStr + HH:MM) into UTC ISO string with Z
function zonedTimeToUtcISO(dateStr, timeStr, tz){
  const {y,m,d} = parseISODate(dateStr);
  const [hh, mm] = (timeStr || "09:00").split(":").map(Number);
  const guess = new Date(Date.UTC(y, m-1, d, hh, mm, 0));
  const offset = getTimeZoneOffsetMinutes(tz, guess);
  const utc = new Date(guess.getTime() - offset*60000);
  return utc.toISOString();
}

// Extract hour/min for a UTC ISO, displayed in tz
function zonedHourMin(iso, tz){
  const dt = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-US", {timeZone: tz, hour:"2-digit", minute:"2-digit", hour12:false});
  const parts = fmt.formatToParts(dt);
  let hh="00", mm="00";
  for(const p of parts){
    if(p.type==="hour") hh = p.value;
    if(p.type==="minute") mm = p.value;
  }
  return {h: Number(hh), m: Number(mm)};
}
function fmtTime(iso, tz){
  const dt = new Date(iso);
  const fmt = new Intl.DateTimeFormat("ru-RU", {timeZone: tz, hour:"2-digit", minute:"2-digit", hour12:false});
  return fmt.format(dt);
}
function fmtDayPill(dateStr, tz){
  const dt = dateStrMidUTC(dateStr);
  const fmt = new Intl.DateTimeFormat("ru-RU", {timeZone: tz, weekday:"short", month:"short", day:"numeric"});
  return fmt.format(dt);
}
function weekdayShort(dateStr, tz){
  const dt = dateStrMidUTC(dateStr);
  const fmt = new Intl.DateTimeFormat("ru-RU", {timeZone: tz, weekday:"short"});
  return fmt.format(dt).slice(0,2);
}

/* ---------------- UI: header + tabs ---------------- */


function spring({from, to, onUpdate, onComplete, stiffness=420, damping=34, mass=1, threshold=0.35}){
  let x = from;
  let v = 0;
  let last = performance.now();

  function step(now){
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;

    const Fspring = -stiffness * (x - to);
    const Fdamp = -damping * v;
    const a = (Fspring + Fdamp) / mass;

    v += a * dt;
    x += v * dt;

    onUpdate?.(x);

    if(Math.abs(v) < threshold && Math.abs(x - to) < 0.7){
      onUpdate?.(to);
      onComplete?.();
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

const TAB_ORDER = ["schedule","tasks","calendar"];
function tabIndex(tab){ return TAB_ORDER.indexOf(tab); }
function tabByDelta(delta){
  const i = tabIndex(state.tab);
  const ni = i + delta;
  if(ni < 0 || ni >= TAB_ORDER.length) return null;
  return TAB_ORDER[ni];
}
function getScreenEl(tab){
  if(tab==="schedule") return document.getElementById("screenSchedule");
  if(tab==="tasks") return document.getElementById("screenTasks");
  return document.getElementById("screenWeek");
}

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


function slideSwap(fromTab, toTab, dir){
  const content = document.querySelector(".content");
  const fromEl = getScreenEl(fromTab);
  const toEl = getScreenEl(toTab);
  if(!content || !fromEl || !toEl || prefersReducedMotion()){
    return false;
  }

  // Ensure both visible
  fromEl.classList.add("swap");
  toEl.classList.add("swap");
  fromEl.style.display = "block";
  toEl.style.display = "block";

  // Lock container height to avoid jump
  const h1 = fromEl.getBoundingClientRect().height;
  const h2 = toEl.getBoundingClientRect().height;
  content.style.height = Math.max(h1, h2) + "px";

  // Absolute overlay
  const common = "position:absolute;left:0;right:0;top:0;width:100%;";
  fromEl.style.cssText += ";" + common;
  toEl.style.cssText += ";" + common;

  const w = content.getBoundingClientRect().width || window.innerWidth;
  const offset = Math.max(44, Math.min(90, w * 0.18));
  const inFrom = dir > 0 ? -offset : offset;   // where new screen comes from
  const outTo = dir > 0 ? offset : -offset;    // where old screen goes

  // Set start positions
  toEl.style.opacity = "0";
  toEl.style.transform = `translateX(${inFrom}px)`;
  fromEl.style.opacity = "1";
  fromEl.style.transform = "translateX(0px)";

  const a1 = fromEl.animate(
    [{opacity:1, transform:"translateX(0px)"},{opacity:0, transform:`translateX(${outTo}px)`}],
    {duration: 200, easing:"cubic-bezier(.2,.9,.2,1)", fill:"forwards"}
  );
  const a2 = toEl.animate(
    [{opacity:0, transform:`translateX(${inFrom}px)`},{opacity:1, transform:"translateX(0px)"}],
    {duration: 220, easing:"cubic-bezier(.2,.9,.2,1)", fill:"forwards"}
  );

  const cleanup = ()=>{
    // Clear temporary styles
    content.style.height = "";
    fromEl.classList.remove("swap");
    toEl.classList.remove("swap");
    fromEl.style.position = "";
    fromEl.style.left = "";
    fromEl.style.right = "";
    fromEl.style.top = "";
    fromEl.style.width = "";
    fromEl.style.transform = "";
    fromEl.style.opacity = "";
    toEl.style.position = "";
    toEl.style.left = "";
    toEl.style.right = "";
    toEl.style.top = "";
    toEl.style.width = "";
    toEl.style.transform = "";
    toEl.style.opacity = "";
  };

  a2.onfinish = cleanup;
  return true;
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



function updateBottomPad(){
  const content = document.querySelector(".content");
  if(!content) return;

  // Default: enable padding for schedule/week (grid + lists)
  if(state.tab !== "tasks"){
    content.classList.add("pad-bottom");
    return;
  }

  // For Tasks tab: add bottom pad only when there are tasks to scroll
  const hasTasks = (state.tasks && state.tasks.filter(t=>t.status!=="done").length > 0);
  content.classList.toggle("pad-bottom", !!hasTasks);
}

function updateLayoutVars(){
  // VisualViewport extra height (when WebView chrome hides/shows)
  try{
    const layoutH = window.innerHeight || document.documentElement.clientHeight;
    const visualH = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
    const extra = Math.max(0, Math.round(visualH - layoutH));
    document.documentElement.style.setProperty("--vv-extra", extra + "px");
  }catch(e){}

  // Freeze safe-area inset so borders don't "float" when WebView UI changes
  try{
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom, 0px);visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
    const safe = Math.round(parseFloat(getComputedStyle(probe).paddingBottom) || 0);
    probe.remove();
    document.documentElement.style.setProperty("--safe-bot", safe + "px");
  }catch(e){}

  // Measure bottom bar height and use it for frame/FAB positioning
  const bottom = document.querySelector(".bottom");
  if(bottom){
    const h = Math.round(bottom.getBoundingClientRect().height);
    if(h > 0) document.documentElement.style.setProperty("--bottom-h", h + "px");
  }
}

function setTab(tab, opts={}){
  const prevTab = state.tab;
  if(tab === prevTab) return;

  const transition = opts.transition || "fade"; // none | fade | slide
  const dir = (typeof opts.dir === "number") ? opts.dir : 0;

  // If slide requested, show the new screen before swapping classes, then animate
  if(transition === "slide"){
    const did = slideSwap(prevTab, tab, dir || (tabIndex(tab) > tabIndex(prevTab) ? -1 : 1));
    // classes will be set below (after we make both visible)
  }

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
  updateBottomPad();

  if(window.Telegram?.WebApp){
    const h = window.Telegram.WebApp.HapticFeedback;
    try{ h?.selectionChanged(); }catch(e){}
    try{ h?.impactOccurred?.('light'); }catch(e){}
  }

  if(transition === "fade"){
    const screen = (tab==="schedule") ? sc : (tab==="tasks") ? ts : wk;
    animateIn(screen, {y: 6, duration: 200});
  }

  // lazy refresh
  if(tab==="tasks") refreshTasksScreen();
  if(tab==="calendar") refreshWeekScreen();
  if(tab==="schedule") updateNowLine();
}





function updateFabForTab(){
  const fab = document.getElementById("fab");
  if(!fab) return;
  fab.style.display = "block";
  fab.title = (state.tab === "calendar") ? "Add event" : "Add task";
}


function updateTasksDot(count){
  const tab = document.getElementById("tabTasks");
  if(!tab) return;
  tab.classList.toggle("has-dot", (count||0) > 0);
}

/* ---------------- Schedule UI ---------------- */
function buildWeekStrip(){
  const weekEl = document.getElementById("week");
  if(!weekEl) return;
  weekEl.innerHTML = "";

  for(let i=-3;i<=3;i++){
    const ds = addDays(state.dateStr, i);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "daychip" + (ds===state.dateStr ? " active":"");
    chip.innerHTML = `<div class="dname">${weekdayShort(ds, state.timezone)}</div><div class="dnum">${Number(ds.split("-")[2])}</div>`;
    chip.onclick = () => { state.dateStr = ds; refreshAll(); };
    weekEl.appendChild(chip);
  }

  const pill = document.getElementById("selectedDatePill");
  if(pill) pill.textContent = fmtDayPill(state.dateStr, state.timezone);
}

function rectRel(el, rel){
  const r1 = el.getBoundingClientRect();
  const r2 = rel.getBoundingClientRect();
  return {left: r1.left - r2.left, top: r1.top - r2.top, width: r1.width, height: r1.height};
}

function buildDayGrid(){
  const grid = document.getElementById("dayGrid");
  if(!grid) return;
  grid.innerHTML = "";

  const content = document.createElement("div");
  content.className = "grid-content";
  content.id = "gridContent";
  grid.appendChild(content);

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

      // click empty slot -> add event
      drop.addEventListener("click", (e)=>{
        // clicking on an existing block should be handled by the block itself
        if(e.target.closest(".eventblock")) return;
        e.preventDefault();
        e.stopPropagation();

        setMode("event");
        openModal();

        document.getElementById("saveBtn").dataset.editEventId = "";
        document.getElementById("sheetTitle").textContent = "Добавить событие";

        document.getElementById("inpDate").value = state.dateStr;
        const st = `${pad2(h)}:${pad2(m)}`;
        document.getElementById("inpTime").value = st;
        document.getElementById("inpEndTime").value = addMinutesToTimeStr(st, 30);

        try{ document.getElementById("inpTitle")?.focus({preventScroll:true}); }catch(err){}
      });

      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", async (e) => {
        e.preventDefault();
        drop.classList.remove("over");
        const taskId = e.dataTransfer.getData("text/taskId");
        if(!taskId) return;

        const startISO = zonedTimeToUtcISO(state.dateStr, `${pad2(h)}:${pad2(m)}`, state.timezone);

        try{
          await API.planTask(Number(taskId), startISO, 30);
          await refreshAll();
          if(state.tab==="calendar") await refreshWeekScreen();
          if(window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback?.notificationOccurred("success");
        }catch(err){
          alert("Не удалось запланировать: " + err);
        }
      });

      slot.appendChild(label);
      slot.appendChild(drop);
      content.appendChild(slot);
    }
  }

  const nowLayer = document.createElement("div");
  nowLayer.id = "nowLayer";
  nowLayer.className = "now-layer";
  nowLayer.innerHTML = `<div class="nowline" id="nowLine"><span class="nowdot"></span></div>`;
  content.appendChild(nowLayer);

  const layer = document.createElement("div");
  layer.id = "eventsLayer";
  layer.className = "events-layer";
  content.appendChild(layer);
}

function renderEventsOnGrid(){
  const grid = document.getElementById("dayGrid");
  const content = document.getElementById("gridContent");
  const layer = document.getElementById("eventsLayer");
  if(!grid || !content || !layer) return;

  layer.innerHTML = "";

  const startH = 7;
  const step = 30;

  const drop0 = content.querySelector(`.sdrop[data-hour="${startH}"][data-min="0"]`);
  const drop1 = content.querySelector(`.sdrop[data-hour="${startH}"][data-min="${step}"]`);
  if(!drop0 || !drop1) return;

  const r0 = rectRel(drop0, content);
  const r1 = rectRel(drop1, content);
  const pxPerMin = Math.max(1.2, (r1.top - r0.top) / step);
  const baseTop = r0.top;
  const baseLeft = r0.left;
  const baseWidth = r0.width;

  // Prepare events in local minutes
  const evs = state.events
    .map(ev=>{
      const sHM = zonedHourMin(ev.start_dt, state.timezone);
      const eHM = zonedHourMin(ev.end_dt, state.timezone);
      const startMin = sHM.h*60 + sHM.m;
      const endMin = eHM.h*60 + eHM.m;
      return {ev, sHM, eHM, startMin, endMin};
    })
    .filter(x => x.endMin > x.startMin)
    .sort((a,b)=> a.startMin - b.startMin);

  // Greedy lane assignment for overlaps
  const laneEnds = []; // minutes
  let maxLanes = 1;
  for(const item of evs){
    let lane = -1;
    for(let i=0;i<laneEnds.length;i++){
      if(laneEnds[i] <= item.startMin){
        lane = i;
        break;
      }
    }
    if(lane === -1){
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    }else{
      laneEnds[lane] = item.endMin;
    }
    item.lane = lane;
    maxLanes = Math.max(maxLanes, laneEnds.length);
  }

  const gap = 6;
  const laneW = (baseWidth - gap*(maxLanes-1)) / maxLanes;

  for(const item of evs){
    const {ev, sHM, eHM, startMin, endMin} = item;
    const top = baseTop + (startMin - startH*60) * pxPerMin;
    const height = Math.max(44, (endMin - startMin) * pxPerMin);
    const left = baseLeft + item.lane * (laneW + gap);
    const width = Math.max(60, laneW);

    const block = document.createElement("div");
    block.className = "eventblock";

    // tint based on event color
    const rgb = hexToRgb(ev.color || "#6EA8FF");
    block.style.borderColor = rgba(rgb, 0.22);
    block.style.boxShadow = `0 14px 30px rgba(16,22,42,.14), 0 10px 24px ${rgba(rgb,0.14)}`;
    block.style.background = `linear-gradient(180deg, rgba(255,255,255,.94), rgba(255,255,255,.74)), radial-gradient(circle at 20% 10%, ${rgba(rgb,0.16)}, transparent 58%)`;
    block.style.top = `${top}px`;
    block.style.left = `${left}px`;
    block.style.width = `${width}px`;
    block.style.height = `${height}px`;

    block.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      setMode("event");
      openModal();
      document.getElementById("inpTitle").value = ev.title;
      document.getElementById("inpDate").value = state.dateStr;
      document.getElementById("inpTime").value = `${pad2(sHM.h)}:${pad2(sHM.m)}`;
      document.getElementById("inpEndTime").value = `${pad2(eHM.h)}:${pad2(eHM.m)}`;
      document.getElementById("inpColor").value = ev.color || "#6EA8FF";
      document.getElementById("saveBtn").dataset.editEventId = String(ev.id);
      document.getElementById("sheetTitle").textContent = "Редактировать событие";
      try{ document.getElementById("inpTitle")?.focus({preventScroll:true}); }catch(err){}
    });

    const bar = document.createElement("div");
    bar.className = "ebar";
    bar.style.background = ev.color || "#6EA8FF";
    bar.style.height = "100%";

    const body = document.createElement("div");
    body.className = "ebody";
    const t1 = `${pad2(sHM.h)}:${pad2(sHM.m)}–${pad2(eHM.h)}:${pad2(eHM.m)}`;
    body.innerHTML = `
      <div class="etime">${t1}</div>
      <div class="etitle">${escapeHtml(ev.title)}</div>
      <div class="emeta">${ev.source === "task" ? "Task block" : "Event"}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "eactions";
    const btnDel = document.createElement("button");
    btnDel.className = "iconbtn";
    btnDel.type = "button";
    btnDel.textContent = "🗑️";
    btnDel.onclick = async (e)=>{
      e.stopPropagation();
      if(!confirm("Удалить событие?")) return;
      await API.deleteEvent(ev.id);
      await refreshAll();
      if(state.tab==="calendar") refreshWeekScreen();
    };
    actions.appendChild(btnDel);

    block.appendChild(bar);
    block.appendChild(body);
    block.appendChild(actions);

    layer.appendChild(block);
  }

  animateList(layer, ".eventblock");
}


let nowTicker = null;

function isTodaySelected(){
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: state.timezone, year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(now);
  const map = {};
  for(const p of parts){ if(p.type !== "literal") map[p.type] = p.value; }
  const todayStr = `${map.year}-${map.month}-${map.day}`;
  return todayStr === state.dateStr;
}

function updateNowLine(){
  const content = document.getElementById("gridContent");
  const nowLine = document.getElementById("nowLine");
  if(!content || !nowLine) return;

  if(state.tab !== "schedule" || !isTodaySelected()){
    nowLine.style.display = "none";
    return;
  }

  const startH = 7, endH = 23, step = 30;

  const drop0 = content.querySelector(`.sdrop[data-hour="${startH}"][data-min="0"]`);
  const drop1 = content.querySelector(`.sdrop[data-hour="${startH}"][data-min="${step}"]`);
  if(!drop0 || !drop1){
    nowLine.style.display = "none";
    return;
  }

  const r0 = rectRel(drop0, content);
  const r1 = rectRel(drop1, content);
  const pxPerMin = Math.max(1.2, (r1.top - r0.top) / step);
  const baseTop = r0.top;

  const parts = new Intl.DateTimeFormat("en-US", {timeZone: state.timezone, hour:"2-digit", minute:"2-digit", hour12:false}).formatToParts(new Date());
  let hh=0, mm=0;
  for(const p of parts){
    if(p.type==="hour") hh = Number(p.value);
    if(p.type==="minute") mm = Number(p.value);
  }
  const minOfDay = hh*60 + mm;

  if(minOfDay < startH*60 || minOfDay > endH*60){
    nowLine.style.display = "none";
    return;
  }

  const top = baseTop + (minOfDay - startH*60) * pxPerMin;

  const left = r0.left;
  const width = Math.max(60, content.getBoundingClientRect().width - left);

  nowLine.style.display = "block";
  nowLine.style.transform = `translateY(${top}px)`;
  nowLine.style.left = `${left}px`;
  nowLine.style.width = `${width}px`;
}

function startNowTicker(){
  if(nowTicker) clearInterval(nowTicker);
  nowTicker = setInterval(()=> updateNowLine(), 30_000);
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

/* ---------------- Screens refresh ---------------- */
async function refreshAll(){
  buildWeekStrip();
  buildDayGrid();

  state.events = await API.scheduleDay(state.dateStr);
  state.tasks = await API.listTasks("inbox");

  // Update Tasks dot (undone count)
  try{
    const r = await API.tasksUndoneCount();
    updateTasksDot(r.count || 0);
  }catch(e){
    // fallback: count inbox as approximation
    const approx = (state.tasks||[]).filter(t=>t.status!=="done").length;
    updateTasksDot(approx);
  }

  renderEventsOnGrid();
  updateNowLine();
  updateBottomPad();
  renderTasksTo(document.getElementById("taskList"), state.tasks);

  const pill = document.getElementById("selectedDatePill");
  if(pill) pill.textContent = fmtDayPill(state.dateStr, state.timezone);

  animateList(document.getElementById("taskList"), ".swipe");
}

async function refreshTasksScreen(){
  const listEl = document.getElementById("taskListAll");
  if(!listEl) return;

  const raw = await API.listTasks(state.tasksFilter);
  // refresh dot too
  try{ const r = await API.tasksUndoneCount(); updateTasksDot(r.count||0); }catch(e){}
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

  animateList(listEl, ".swipe");
}

async function refreshWeekScreen(){
  const box = document.getElementById("weekList");
  if(!box) return;
  box.innerHTML = "";

  const start = state.dateStr;
  const end = addDays(start, 6);

  // One request for the whole week
  const all = await API.scheduleRange(start, end);

  // Group by local dateStr in selected timezone
  const fmt = new Intl.DateTimeFormat("en-CA", {timeZone: state.timezone, year:"numeric", month:"2-digit", day:"2-digit"});
  const groups = {};
  for(const ev of all){
    const ds = fmt.format(new Date(ev.start_dt));
    (groups[ds] ||= []).push(ev);
  }

  for(let i=0;i<7;i++){
    const ds = addDays(start, i);
    const evs = (groups[ds] || []).slice().sort((a,b)=> new Date(a.start_dt) - new Date(b.start_dt));

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "week-item";

    const label = fmtDayPill(ds, state.timezone);
    const left = document.createElement("div");
    left.style.minWidth = "0";
    left.innerHTML = `<div class="wdate">${label}</div><div class="wmeta">${ds===state.dateStr ? "Выбранный день" : ""}</div>`;

    const preview = document.createElement("div");
    preview.className = "week-preview";
    const top = evs.slice(0,2);
    if(top.length === 0){
      preview.innerHTML = `<div class="ev"><span class="dot"></span><span class="n">Нет событий</span></div>`;
    }else{
      preview.innerHTML = top.map(ev=>{
        return `<div class="ev"><span class="dot" style="background:${ev.color || 'rgba(16,22,42,.25)'}"></span><span class="t">${fmtTime(ev.start_dt, state.timezone)}</span><span class="n">${escapeHtml(ev.title)}</span></div>`;
      }).join("");
    }
    left.appendChild(preview);

    const count = document.createElement("div");
    count.className = "wcount";
    count.textContent = String(evs.length);

    btn.appendChild(left);
    btn.appendChild(count);

    btn.onclick = () => {
      state.dateStr = ds;
      setTab("schedule");
      refreshAll();
    };

    box.appendChild(btn);
  }

  animateList(box, ".week-item");
}

/* ---------------- Modal ---------------- */
function addMinutesToTimeStr(timeStr, mins){
  const [hh, mm] = (timeStr||"09:00").split(":").map(Number);
  const total = hh*60 + mm + mins;
  const nh = Math.floor((total % (24*60)) / 60);
  const nm = total % 60;
  return `${pad2(nh)}:${pad2(nm)}`;
}

function openModal(){
  document.getElementById("inpDate").value = state.dateStr;
  const modal = document.getElementById("modal");
  modal.setAttribute("aria-hidden","false");

  if(!prefersReducedMotion()){
    const sheet = modal.querySelector(".sheet");
    const backdrop = modal.querySelector(".backdrop");
    backdrop?.animate([{opacity:0},{opacity:1}], {duration: 180, easing:"ease", fill:"both"});
    sheet?.animate(
      [{transform:"translateY(18px)", opacity:0},{transform:"translateY(0px)", opacity:1}],
      {duration: 220, easing:"cubic-bezier(.2,.9,.2,1)", fill:"both"}
    );
  }

  try{ document.getElementById("inpTitle")?.focus({preventScroll:true}); }catch(e){}
}

function closeModal(){
  const modal = document.getElementById("modal");
  if(!modal) return;

  if(!prefersReducedMotion()){
    const sheet = modal.querySelector(".sheet");
    const backdrop = modal.querySelector(".backdrop");
    const a2 = sheet?.animate(
      [{transform:"translateY(0px)", opacity:1},{transform:"translateY(18px)", opacity:0}],
      {duration: 180, easing:"cubic-bezier(.2,.9,.2,1)", fill:"both"}
    );
    backdrop?.animate([{opacity:1},{opacity:0}], {duration: 160, easing:"ease", fill:"both"});
    const done = () => {
      modal.setAttribute("aria-hidden","true");
      clearModal();
    };
    if(a2) a2.onfinish = done;
    else done();
  }else{
    modal.setAttribute("aria-hidden","true");
    clearModal();
  }
}

function clearModal(){
  document.getElementById("inpTitle").value = "";
  document.getElementById("inpTime").value = "";
  document.getElementById("inpEndTime").value = "";
  document.getElementById("inpColor").value = "#6EA8FF";
  document.getElementById("selPriority").value = "2";
  document.getElementById("selEstimate").value = "30";
  document.getElementById("inpDate").value = state.dateStr;
  document.getElementById("sheetTitle").textContent = state.mode==="task" ? "Добавить задачу" : "Добавить событие";
  document.getElementById("saveBtn").dataset.editTaskId = "";
  document.getElementById("saveBtn").dataset.editEventId = "";
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

async function saveFromModal(keepOpen=false){
  const title = document.getElementById("inpTitle").value.trim();
  if(!title){ alert("Введите название"); return; }

  const dateStr = document.getElementById("inpDate").value || state.dateStr;
  const timeStr = document.getElementById("inpTime").value || "09:00";

  if(state.mode === "task"){
    const projectIdRaw = document.getElementById("selProject").value;
    const project_id = projectIdRaw ? Number(projectIdRaw) : null;
    const editId = document.getElementById("saveBtn").dataset.editTaskId;
    const priority = Number(document.getElementById("selPriority").value);
    const estimate_min = Number(document.getElementById("selEstimate").value);

    if(editId){
      await API.updateTask(Number(editId), {title, priority, estimate_min, project_id});
      keepOpen = false; // editing task: just save & close
    }else{
      await API.createTask({title, priority, estimate_min, project_id});
    }

    await refreshAll();
    if(state.tab==="tasks") await refreshTasksScreen();
    if(state.tab==="calendar") await refreshWeekScreen();

    if(keepOpen){
      // prepare next task
      document.getElementById("inpTitle").value = "";
      document.getElementById("saveBtn").dataset.editTaskId = "";
      document.getElementById("sheetTitle").textContent = "Добавить задачу";
      try{ document.getElementById("inpTitle")?.focus({preventScroll:true}); }catch(e){}
    }else{
      closeModal();
    }
    return;
  }

  const endTime = document.getElementById("inpEndTime").value;
  if(!endTime){
    alert("Укажите время окончания");
    return;
  }
  if(endTime <= timeStr){
    alert("Конец должен быть позже начала");
    return;
  }

  const color = document.getElementById("inpColor").value || "#6EA8FF";
  const startISO = zonedTimeToUtcISO(dateStr, timeStr, state.timezone);
  const endISO = zonedTimeToUtcISO(dateStr, endTime, state.timezone);

  const editEventId = document.getElementById("saveBtn").dataset.editEventId;
  if(editEventId){
    await API.updateEvent(Number(editEventId), {title, start_dt: startISO, end_dt: endISO, color});
    keepOpen = false; // editing event: just save & close
  }else{
    await API.createEvent({title, start_dt: startISO, end_dt: endISO, color, source:"manual"});
  }

  await refreshAll();
  if(state.tab==="calendar") await refreshWeekScreen();

  if(keepOpen){
    // next event: start at previous end
    document.getElementById("inpTitle").value = "";
    document.getElementById("saveBtn").dataset.editEventId = "";
    document.getElementById("sheetTitle").textContent = "Добавить событие";
    document.getElementById("inpTime").value = endTime;
    document.getElementById("inpEndTime").value = addMinutesToTimeStr(endTime, 30);
    try{ document.getElementById("inpTitle")?.focus({preventScroll:true}); }catch(e){}
  }else{
    closeModal();
  }
}



/* ---------------- Tasks edit ---------------- */
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

/* ---------------- Timezone modal ---------------- */
const TZ_LIST = [
  "UTC",
  "Europe/London","Europe/Paris","Europe/Berlin","Europe/Warsaw","Europe/Kyiv","Europe/Moscow",
  "Asia/Tbilisi","Asia/Yerevan","Asia/Baku","Asia/Almaty","Asia/Tashkent","Asia/Dubai",
  "Asia/Kolkata","Asia/Bangkok","Asia/Singapore","Asia/Shanghai","Asia/Tokyo","Asia/Seoul",
  "Australia/Sydney",
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
];

function openTZModal(){
  const m = document.getElementById("tzModal");
  m.setAttribute("aria-hidden","false");
  if(!prefersReducedMotion()){
    const sheet = m.querySelector(".sheet");
    const backdrop = m.querySelector(".backdrop");
    backdrop?.animate([{opacity:0},{opacity:1}], {duration: 180, easing:"ease", fill:"both"});
    sheet?.animate([{transform:"translateY(18px)", opacity:0},{transform:"translateY(0px)", opacity:1}],
      {duration: 220, easing:"cubic-bezier(.2,.9,.2,1)", fill:"both"});
  }
}
function closeTZModal(){
  const m = document.getElementById("tzModal");
  if(!m) return;
  m.setAttribute("aria-hidden","true");
}
function fillTZSelect(){
  const sel = document.getElementById("tzSelect");
  sel.innerHTML = "";
  // add device tz at top if not in list
  const dev = deviceTimezone();
  const list = Array.from(new Set([dev, ...TZ_LIST]));
  for(const tz of list){
    const opt = document.createElement("option");
    opt.value = tz;
    opt.textContent = tzOptionLabel(tz);
    sel.appendChild(opt);
  }
  sel.value = state.timezone;
}
async function applyTimezone(tz){
  state.timezone = tz;
  localStorage.setItem("planner_tz", tz);

  const btn = document.getElementById("btnTZ");
  if(btn) btn.textContent = tzButtonLabel(tz);

  // sync to server (ignore errors quietly)
  try{ await API.setTimezone(tz); }catch(e){}

  // refresh screens
  buildWeekStrip();
  await refreshAll();
  if(state.tab==="calendar") await refreshWeekScreen();
}

/* ---------------- Boot ---------------- */

function springAnimate({from, to, onUpdate, onDone, stiffness=0.14, damping=0.82, maxFrames=420}){
  let x = from;
  let v = 0;
  let frames = 0;

  function step(){
    frames += 1;
    const f = (to - x) * stiffness;
    v = (v + f) * damping;
    x = x + v;

    onUpdate(x);

    if(frames > maxFrames || (Math.abs(to - x) < 0.6 && Math.abs(v) < 0.4)){
      onUpdate(to);
      onDone?.();
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function initTabSwipe(){
  const root = document.querySelector(".content");
  if(!root) return;

  let sx=0, sy=0, st=0;
  let tracking=false;
  let activeFrom=null, activeTo=null;
  let width=0;
  let dx=0;
  let horizontal=false;

  const shouldIgnore = (target) => {
    if(!target) return true;
    const openModal = document.querySelector('.modal[aria-hidden="false"]');
    if(openModal) return true;
    if(target.closest("input,textarea,select,button")) return true;
    if(target.closest(".swipe")) return true;
    return false;
  };

  function prep(toTab, dir){
    const content = document.querySelector(".content");
    const fromEl = getScreenEl(state.tab);
    const toEl = getScreenEl(toTab);
    if(!content || !fromEl || !toEl) return false;

    width = content.getBoundingClientRect().width || window.innerWidth;

    // show both
    fromEl.classList.add("swap");
    toEl.classList.add("swap");
    fromEl.style.display = "block";
    toEl.style.display = "block";

    // lock height
    const h1 = fromEl.getBoundingClientRect().height;
    const h2 = toEl.getBoundingClientRect().height;
    content.style.height = Math.max(h1, h2) + "px";

    const common = "position:absolute;left:0;right:0;top:0;width:100%;";
    fromEl.style.cssText += ";" + common;
    toEl.style.cssText += ";" + common;

    // initial positions
    const startX = dir < 0 ? width : -width;
    toEl.style.transform = `translateX(${startX}px)`;
    toEl.style.opacity = "1";
    fromEl.style.transform = "translateX(0px)";
    fromEl.style.opacity = "1";

    activeFrom = fromEl;
    activeTo = toEl;
    return true;
  }

  function applyDrag(dx){
    if(!activeFrom || !activeTo) return;
    const dir = dx < 0 ? -1 : 1;
    const abs = Math.min(width, Math.abs(dx));
    const t = abs / width;

    activeFrom.style.transform = `translateX(${dx}px)`;
    activeFrom.style.opacity = String(1 - t*0.10);

    const toBase = dir < 0 ? width : -width;
    activeTo.style.transform = `translateX(${toBase + dx}px)`;
    activeTo.style.opacity = String(0.92 + t*0.08);
  }

  function cleanup(){
    const content = document.querySelector(".content");
    if(content) content.style.height = "";

    for(const el of [activeFrom, activeTo]){
      if(!el) continue;
      el.classList.remove("swap");
      el.style.position = "";
      el.style.left = "";
      el.style.right = "";
      el.style.top = "";
      el.style.width = "";
      el.style.transform = "";
      el.style.opacity = "";
    }

    // ensure only active screen visible
    document.getElementById("screenSchedule")?.classList.toggle("active", state.tab==="schedule");
    document.getElementById("screenTasks")?.classList.toggle("active", state.tab==="tasks");
    document.getElementById("screenWeek")?.classList.toggle("active", state.tab==="calendar");

    activeFrom = null;
    activeTo = null;
  }

  root.addEventListener("touchstart", (e)=>{
    if(e.touches.length !== 1) return;
    if(shouldIgnore(e.target)) return;

    tracking = true;
    horizontal = false;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    st = Date.now();
    dx = 0;
    activeFrom = null;
    activeTo = null;
    width = 0;
  }, {passive:true});

  root.addEventListener("touchmove", (e)=>{
    if(!tracking) return;
    const mx = e.touches[0].clientX;
    const my = e.touches[0].clientY;
    dx = mx - sx;
    const dy = my - sy;

    if(!horizontal){
      if(Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)*1.2){
        horizontal = true;

        // determine next tab
        const delta = dx < 0 ? +1 : -1;
        const next = tabByDelta(delta);
        if(!next){
          tracking = false;
          return;
        }
        // dir: dx<0 -> swipe left -> next appears from right (dir=-1)
        const dir = dx < 0 ? -1 : 1;
        if(!prep(next, dir)){
          tracking = false;
          return;
        }
        activeTo.dataset._targetTab = next;
        // prevent scroll
        e.preventDefault();
      }else{
        return; // keep waiting for intent
      }
    }

    // horizontal drag
    e.preventDefault();
    // friction near edges
    const lim = width * 0.98;
    const dd = Math.max(-lim, Math.min(lim, dx));
    applyDrag(dd);
  }, {passive:false});

  root.addEventListener("touchend", ()=>{
    if(!tracking) return;
    tracking = false;

    if(!horizontal || !activeTo){
      cleanup();
      return;
    }

    const toTab = activeTo.dataset._targetTab;
    const absDx = Math.abs(dx);
    const dt = Math.max(1, Date.now() - st);
    const vel = absDx / dt; // px/ms
    const commit = absDx > width*0.28 || vel > 0.75;

    const dir = dx < 0 ? -1 : 1;
    const targetDx = commit ? (dir < 0 ? -width : width) : 0;
    const startDx = dx;

    spring({
      from: startDx,
      to: targetDx,
      stiffness: 520,
      damping: 44,
      onUpdate: (x)=> applyDrag(x),
      onComplete: ()=>{
        if(commit){
          // finalize state
          setTab(toTab, {transition:"none"});
        }
        cleanup();
        // haptic for success
        if(commit && window.Telegram?.WebApp){
          try{ window.Telegram.WebApp.HapticFeedback?.notificationOccurred?.("success"); }catch(e){}
        }
      }
    });
  }, {passive:true});

  root.addEventListener("touchcancel", ()=>{
    tracking = false;
    cleanup();
  }, {passive:true});
}





function bindUI(){
  // Bottom tabs
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
  document.getElementById("btnToday")?.addEventListener("click", ()=>{
    // set to "today" in selected TZ
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {timeZone: state.timezone, year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(now);
    const map = {};
    for(const p of parts){ if(p.type !== "literal") map[p.type] = p.value; }
    state.dateStr = `${map.year}-${map.month}-${map.day}`;
    refreshAll();
  });
  document.getElementById("btnRefresh")?.addEventListener("click", refreshAll);
  document.getElementById("btnTasksRefresh")?.addEventListener("click", refreshTasksScreen);
  document.getElementById("btnWeekRefresh")?.addEventListener("click", refreshWeekScreen);

  // Modal controls
  document.getElementById("fab")?.addEventListener("click", ()=>{
    if(state.tab === "calendar") setMode("event");
    else setMode("task");
    openModal();
    if(state.mode === "event"){
      // default times
      if(!document.getElementById("inpTime").value) document.getElementById("inpTime").value = "09:00";
      if(!document.getElementById("inpEndTime").value) document.getElementById("inpEndTime").value = "09:30";
    }
  });
  document.getElementById("closeModal")?.addEventListener("click", closeModal);
  document.getElementById("backdrop")?.addEventListener("click", closeModal);
  document.getElementById("segTask")?.addEventListener("click", ()=>setMode("task"));
  document.getElementById("segEvent")?.addEventListener("click", ()=>setMode("event"));
  document.getElementById("saveBtn")?.addEventListener("click", ()=> saveFromModal(false));
  document.getElementById("saveNextBtn")?.addEventListener("click", ()=> saveFromModal(true));

  // start time change -> adjust end time if needed
  document.getElementById("inpTime")?.addEventListener("change", ()=>{
    if(state.mode !== "event") return;
    const st = document.getElementById("inpTime").value || "09:00";
    const end = document.getElementById("inpEndTime").value || "";
    if(!end || end <= st){
      document.getElementById("inpEndTime").value = addMinutesToTimeStr(st, 30);
    }
  });

  // Timezone UI
  document.getElementById("btnTZ")?.addEventListener("click", ()=>{
    fillTZSelect();
    openTZModal();
  });
  document.getElementById("tzBackdrop")?.addEventListener("click", closeTZModal);
  document.getElementById("tzClose")?.addEventListener("click", closeTZModal);
  document.getElementById("tzAutoBtn")?.addEventListener("click", async ()=>{
    const dev = deviceTimezone();
    document.getElementById("tzSelect").value = dev;
  });
  document.getElementById("tzSaveBtn")?.addEventListener("click", async ()=>{
    const tz = document.getElementById("tzSelect").value;
    await applyTimezone(tz);
    closeTZModal();
  });

  setHeaderForTab();
  updateFabForTab();
  moveTabIndicator();
  initTabSwipe();

  window.addEventListener("resize", ()=> { updateLayoutVars();
  updateBottomPad(); moveTabIndicator(); });
  window.addEventListener("orientationchange", ()=> { setTimeout(()=> { updateLayoutVars();
  updateBottomPad(); moveTabIndicator(); }, 80); });
  if(window.visualViewport){
    window.visualViewport.addEventListener("resize", ()=> { updateLayoutVars();
  updateBottomPad(); moveTabIndicator(); });
    window.visualViewport.addEventListener("scroll", ()=> { updateLayoutVars();
  updateBottomPad(); });
  }
}

async function boot(){
  bindUI();

  // layout variables
  updateLayoutVars();
  updateBottomPad();

  // timezone init
  const savedTZ = localStorage.getItem("planner_tz");
  state.timezone = savedTZ || deviceTimezone();

  const btn = document.getElementById("btnTZ");
  if(btn) btn.textContent = tzButtonLabel(state.timezone);

  // default dateStr = "today" in tz
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: state.timezone, year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(now);
  const map = {};
  for(const p of parts){ if(p.type !== "literal") map[p.type] = p.value; }
  state.dateStr = `${map.year}-${map.month}-${map.day}`;

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

  startNowTicker();

  // sync timezone to backend
  try{ await API.setTimezone(state.timezone); }catch(e){}

  state.projects = await API.getProjects();
  fillProjects();

  document.getElementById("inpDate").value = state.dateStr;

  setTab("schedule");
  requestAnimationFrame(()=> moveTabIndicator());
  await refreshAll();
}

boot().catch(err=>{
  console.error(err);
  alert("Ошибка: " + (err?.message || err));
});
