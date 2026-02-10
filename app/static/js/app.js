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

// UI state: pending swipe actions (for Undo)
const pendingHiddenTaskIds = new Set();
let undoToastTimer = null;
let undoToastCommit = null;
let undoToastUndo = null;


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



function uiAlert(msg){
  try{
    if(window.Telegram?.WebApp?.showAlert){
      window.Telegram.WebApp.showAlert(msg);
      return;
    }
  }catch(e){}
  try{ alert(msg); }catch(e){}
}

// ---------------- Voice input (Web Speech API) ----------------
function supportsSpeech(){
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function formatISODate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function addDaysISO(iso, n){
  const d = new Date(iso+"T00:00:00");
  d.setDate(d.getDate()+n);
  return formatISODate(d);
}
function nextWeekdayISO(baseIso, targetDow){
  // targetDow: 0=Sun..6=Sat
  const d = new Date(baseIso+"T00:00:00");
  const cur = d.getDay();
  let delta = (targetDow - cur + 7) % 7;
  if(delta === 0) delta = 7; // next occurrence
  d.setDate(d.getDate()+delta);
  return formatISODate(d);
}

function normalizeVoiceText(t){
  return (t||"")
    .toLowerCase()
    .replace(/[–—]/g,"-")
    // keep dots for dates like 10.02.2026 and times like 14.30
    .replace(/[,]/g," ")
    .replace(/[ ]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function timeToStr(h, m){
  const hh = String(h).padStart(2,"0");
  const mm = String(m).padStart(2,"0");
  return `${hh}:${mm}`;
}

function parseTimeToken(hh, mm){
  const h = Number(hh);
  const m = (mm==null || mm==="") ? 0 : Number(mm);
  if(Number.isNaN(h) || Number.isNaN(m)) return null;
  if(h<0 || h>23 || m<0 || m>59) return null;
  return timeToStr(h,m);
}

function parseDurationMin(txt){
  // examples: "на 30 минут", "на час", "на полтора часа", "на 2 часа"
  if(!txt) return null;
  if(/\bполчаса\b/.test(txt)) return 30;
  if(/\bполтора\b/.test(txt)) return 90;
  // "на час"
  if(/\bна\s+час\b/.test(txt)) return 60;

  let m = txt.match(/\bна\s+(\d+)\s*(мин|минута|минуты|минут)\b/);
  if(m) return Number(m[1]);

  let h = txt.match(/\bна\s+(\d+)\s*(час|часа|часов)\b/);
  if(h) return Number(h[1]) * 60;

  return null;
}

function nowPartsInTz(tz){
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false});
  const parts = fmt.formatToParts(d);
  const map = {};
  for(const p of parts){
    if(p.type !== "literal") map[p.type] = p.value;
  }
  return {
    dateISO: `${map.year}-${map.month}-${map.day}`,
    hh: Number(map.hour||"0"),
    mm: Number(map.minute||"0")
  };
}

function parseRelativeStart(txt, tz){
  // examples: "через 30 минут", "через 2 часа", "через полчаса", "через полтора часа"
  if(!txt) return null;
  const t = txt;
  let addMin = null;

  if(/\bчерез\s+полчаса\b/.test(t)) addMin = 30;
  if(/\bчерез\s+полтора\s+часа\b/.test(t)) addMin = 90;

  let m = t.match(/\bчерез\s+(\d+)\s*(мин|минута|минуты|минут)\b/);
  if(m) addMin = Number(m[1]);

  let h = t.match(/\bчерез\s+(\d+)\s*(час|часа|часов)\b/);
  if(h) addMin = Number(h[1]) * 60;

  if(addMin == null || !Number.isFinite(addMin) || addMin <= 0) return null;

  const target = new Date(Date.now() + addMin*60000);
  const fmtD = new Intl.DateTimeFormat("en-CA", {timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit"});
  const fmtT = new Intl.DateTimeFormat("en-CA", {timeZone: tz, hour:"2-digit", minute:"2-digit", hour12:false});
  const dateISO = fmtD.format(target);
  const time = fmtT.format(target);
  return {dateISO, startTime: time, addMin};
}


function parseDateISO(txt, baseIso){
  // Supports: today/tomorrow, weekdays, DD.MM.YYYY, DD.MM, DD/MM/YYYY, and "10 февраля 2026"
  // Returns: {dateISO, cleanedText, specified}
  let t = txt || "";
  let specified = false;

  // Normalize spoken year like "две тысячи 26-е" -> "2026"
  t = t.replace(/\bдве\s+тысячи\s+(\d{2})(?:-?е)?\b/g, (_m, yy)=>`202${yy}`);
  t = t.replace(/\bдве\s+тысячи\s+(\d{4})\b/g, (_m, y)=>String(y));

  // Absolute numeric date: 10.02.2026 / 10-02-2026 / 10/02/2026
  let m = t.match(/\b([0-3]?\d)[.\-\/]([01]?\d)(?:[.\-\/](\d{2,4}))\b/);
  if(m){
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if(yy < 100) yy = 2000 + yy; // heuristic
    if(dd>=1 && dd<=31 && mm>=1 && mm<=12 && yy>=1970 && yy<=2100){
      const dateISO = `${String(yy).padStart(4,"0")}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
      t = t.replace(m[0], " ");
      specified = true;
      return {dateISO, cleanedText: t, specified};
    }
  }

  // Numeric date without year: 10.02 / 10-02 / 10/02 -> take year from baseIso
  m = t.match(/\b([0-3]?\d)[.\-\/]([01]?\d)\b/);
  if(m){
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const baseYear = Number((baseIso||"").slice(0,4)) || (new Date()).getFullYear();
    if(dd>=1 && dd<=31 && mm>=1 && mm<=12){
      const dateISO = `${String(baseYear).padStart(4,"0")}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
      t = t.replace(m[0], " ");
      specified = true;
      return {dateISO, cleanedText: t, specified};
    }
  }

  // Month names (robust token scan): "11 февраля 2026", "11 фев", "11 февраля"
  const monthMap = {
    "янв":1,"январ":1,"январь":1,"января":1,
    "фев":2,"феврал":2,"февраль":2,"февраля":2,
    "мар":3,"март":3,"марта":3,
    "апр":4,"апрел":4,"апрель":4,"апреля":4,
    "май":5,"мая":5,
    "июн":6,"июнь":6,"июня":6,
    "июл":7,"июль":7,"июля":7,
    "авг":8,"август":8,"августа":8,
    "сен":9,"сентябр":9,"сентябрь":9,"сентября":9,
    "окт":10,"октябр":10,"октябрь":10,"октября":10,
    "ноя":11,"ноябр":11,"ноябрь":11,"ноября":11,
    "дек":12,"декабр":12,"декабрь":12,"декабря":12
  };
  const monthKeys = Object.keys(monthMap).sort((a,b)=>b.length-a.length);
  const monthFrom = (tok)=>{
    const w = (tok||"").toLowerCase().replace(/[^a-zа-яё]/gi,"");
    if(!w) return null;
    for(const k of monthKeys){
      if(w.startsWith(k)) return monthMap[k];
    }
    return null;
  };

  const parts = t.split(/\s+/).filter(Boolean);
  for(let i=0;i<parts.length;i++){
    const a = parts[i];
    if(!/^\d{1,2}$/.test(a)) continue;
    const dd = Number(a);
    if(dd<1 || dd>31) continue;
    const mm = monthFrom(parts[i+1]);
    if(!mm) continue;

    // optional year in next token
    let yy = null;
    const yTok = parts[i+2];
    if(yTok && /^\d{2,4}$/.test(yTok)){
      yy = Number(yTok);
      if(yy < 100) yy = 2000 + yy;
    }else{
      yy = Number((baseIso||"").slice(0,4)) || (new Date()).getFullYear();
    }
    if(yy>=1970 && yy<=2100){
      const dateISO = `${String(yy).padStart(4,"0")}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
      // Remove the used tokens from original text conservatively (replace just that sequence)
      const seq = yy && yTok && /^\d{2,4}$/.test(yTok) ? `${a} ${parts[i+1]} ${yTok}` : `${a} ${parts[i+1]}`;
      t = t.replace(new RegExp(seq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
      specified = true;
      return {dateISO, cleanedText: t, specified};
    }
  }

  // Relative keywords
  if(/\bсегодня\b/.test(t)){ specified = true; return {dateISO: baseIso, cleanedText: t.replace(/\bсегодня\b/g," "), specified}; }
  if(/\bпослезавтра\b/.test(t)){ specified = true; return {dateISO: addDaysISO(baseIso, 2), cleanedText: t.replace(/\bпослезавтра\b/g," "), specified}; }
  if(/\bзавтра\b/.test(t)){ specified = true; return {dateISO: addDaysISO(baseIso, 1), cleanedText: t.replace(/\bзавтра\b/g," "), specified}; }

  const wd = [
    {re:/\b(в\s+)?пн\b|\bпонедельник\b/, dow:1},
    {re:/\b(в\s+)?вт\b|\bвторник\b/, dow:2},
    {re:/\b(в\s+)?ср\b|\bсреда\b/, dow:3},
    {re:/\b(в\s+)?чт\b|\bчетверг\b/, dow:4},
    {re:/\b(в\s+)?пт\b|\bпятница\b/, dow:5},
    {re:/\b(в\s+)?сб\b|\bсуббота\b/, dow:6},
    {re:/\b(в\s+)?вс\b|\bвоскресенье\b/, dow:0},
  ];
  for(const w of wd){
    if(w.re.test(t)){
      specified = true;
      return {dateISO: nextWeekdayISO(baseIso, w.dow), cleanedText: t.replace(w.re," "), specified};
    }
  }

  return {dateISO: baseIso, cleanedText: t, specified: false};
}

function extractTimes(txt){
  // prefer explicit range "14:00-15:00" or "с 14 до 15" or "15:00 16:00"
  let start = null, end = null;

  // Range with hyphen: 8:00-14:00, 8-14, 8:00-14
  let r = txt.match(/\b([01]?\d|2[0-3])(?:[: ]([0-5]\d))?\s*-\s*([01]?\d|2[0-3])(?:[: ]([0-5]\d))?\b/);
  if(r){
    start = parseTimeToken(r[1], r[2]||"00");
    end = parseTimeToken(r[3], r[4]||"00");
    return {start, end};
  }

  // Range with "с ... до ..."
  r = txt.match(/\bс\s*([01]?\d|2[0-3])(?:[: ]([0-5]\d))?\s*(?:до)\s*([01]?\d|2[0-3])(?:[: ]([0-5]\d))?\b/);
  if(r){
    start = parseTimeToken(r[1], r[2]||"00");
    end = parseTimeToken(r[3], r[4]||"00");
    return {start, end};
  }

  // Two times рядом: "15:00 16:00"
  r = txt.match(/\b([01]?\d|2[0-3])[: ]([0-5]\d)\s+([01]?\d|2[0-3])[: ]([0-5]\d)\b/);
  if(r){
    start = parseTimeToken(r[1], r[2]);
    end = parseTimeToken(r[3], r[4]);
    return {start, end};
  }

  // Single time "в 14:30" or "в 14"
  r = txt.match(/\bв\s*([01]?\d|2[0-3])(?:[: ]([0-5]\d))?\b/);
  if(r){
    start = parseTimeToken(r[1], r[2]||"00");
  }else{
    // fallback any HH:MM in string
    r = txt.match(/\b([01]?\d|2[0-3])[: ]([0-5]\d)\b/);
    if(r) start = parseTimeToken(r[1], r[2]);
  }

  // End time with "до 15:00" if start already found
  if(start){
    const e = txt.match(/\bдо\s*([01]?\d|2[0-3])(?:[: ]([0-5]\d))?\b/);
    if(e) end = parseTimeToken(e[1], e[2]||"00");
  }

  return {start, end};
}

function cleanTitle(txt){
  let t = txt;
  t = t.replace(/\b(добавь|добавить|создай|создать|запланируй|запланировать|поставь|поставить|сделай|напомни|напоминание)\b/g, "");
  t = t.replace(/\b(сегодня|завтра|послезавтра)\b/g, "");
  t = t.replace(/\b(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)\b/g, "");
  t = t.replace(/\b(пн|вт|ср|чт|пт|сб|вс)\b/g, "");
  t = t.replace(/\b(с|до|в|на)\b/g, "");
  t = t.replace(/\b([01]?\d|2[0-3])[:. ]([0-5]\d)\b/g, "");
  t = t.replace(/\b([01]?\d|2[0-3])\b/g, "");
  t = t.replace(/\b(мин|минута|минуты|минут|час|часа|часов|полчаса|полтора)\b/g, "");
  t = t.replace(/[-]/g," ");
  t = t.replace(/\s+/g," ").trim();
  return t;
}

function parseVoiceCommand(rawText, baseIso, tz){
  const txt0 = normalizeVoiceText(rawText);

  // Relative "через N минут/часов"
  const rel = parseRelativeStart(txt0, tz);

  // Parse date first and remove it from text, so DD.MM doesn't become time like 10:02
  const dres = parseDateISO(txt0, baseIso);
  let dateISO = dres.dateISO;
  let dateSpecified = dres.specified;
  let cleaned = normalizeVoiceText(dres.cleanedText);

  // If relative start is present, override date & start
  let relStart = null;
  if(rel){
    relStart = rel.startTime;
    dateISO = rel.dateISO;
    dateSpecified = true;
    cleaned = cleaned.replace(/\bчерез\b[^\d]*(\d+|полчаса|полтора)\s*(мин|минута|минуты|минут|час|часа|часов)?\b/g, " ");
  }

  const {start, end} = extractTimes(cleaned);
  const dur = parseDurationMin(cleaned);

  const mentionDateLike = /\b([0-3]?\d)[.\-\/]([01]?\d)(?:[.\-\/]\d{2,4})?\b/.test(txt0) ||
    /\b(январ|янв|феврал|фев|март|мар|апрел|апр|май|мая|июн|июл|август|авг|сентябр|сен|октябр|окт|ноябр|ноя|декабр|дек)\b/.test(txt0) ||
    /\b(сегодня|завтра|послезавтра|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|пн|вт|ср|чт|пт|сб|вс)\b/.test(txt0);

  const mentionTimeLike = /\b([01]?\d|2[0-3])[:. ]([0-5]\d)\b/.test(txt0) ||
    /\b(с|в|до)\s+(один|одного|два|двух|три|трех|трёх|четыре|четырех|четырёх|пять|пяти|шесть|шести|семь|семи|восемь|восьми|девять|девяти|десять|десяти|одиннадцать|одиннадцати|двенадцать|двенадцати|тринадцать|тринадцати|четырнадцать|четырнадцати|пятнадцать|пятнадцати|шестнадцать|шестнадцати|семнадцать|семнадцати|восемнадцать|восемнадцати|девятнадцать|девятнадцати|двадцать|двадцати|полдень|полночь|час)\b/.test(txt0) ||
    /\b([01]?\d|2[0-3])\s*-\s*([01]?\d|2[0-3])\b/.test(txt0) ||
    /\bс\s*([01]?\d|2[0-3])\b/.test(txt0) ||
    /\bдо\s*([01]?\d|2[0-3])\b/.test(txt0) ||
    /\bчерез\s+/.test(txt0);

  let startTime = start || relStart || null;
  let endTime = end || null;

  // Determine intent: event vs task
  const eventKeywords = /\b(встреча|созвон|звонок|урок|школа|репетитор|занятие|тренировка|событие|вебинар|интервью|приём|прием)\b/;
  let kind = "task";

  if(startTime || endTime || relStart) kind = "event";
  else if(eventKeywords.test(cleaned) || dur) kind = "event";

  let title = cleanTitle(cleaned);
  if(!title) title = (kind==="event" ? "Событие" : "Задача");

  // missing detection
  let missingDate = false;
  let missingStart = false;
  let missingEnd = false;

  if(mentionDateLike && !dateSpecified) missingDate = true;

  if(kind==="event"){
    if(!startTime) missingStart = true;

    if(startTime){
      if(endTime){
        if(endTime <= startTime) endTime = "23:59";
      }else{
        // if duration provided — compute end, otherwise ask for it
        if(dur != null){
          endTime = addMinutesToTimeStr(startTime, dur);
          if(endTime < startTime) endTime = "23:59";
        }else{
          missingEnd = true;
        }
      }
    }
  }

  // If time-like tokens exist but we couldn't parse start, prompt time
  if(kind==="event" && mentionTimeLike && !startTime) missingStart = true;

  return {
    kind,
    title,
    dateISO,
    startTime,
    endTime,
    missingDate,
    missingStart,
    missingEnd,
    confidenceHint: txt0
  };
}

let modalBackHandler = null;

const voiceFlow = {
  mode: "idle", // idle | need_date | need_start | need_end
  draft: null
};

let voiceBackHandler = null;

function voiceSetStatus(text, tone="neutral"){
  const status = document.getElementById("voiceStatus");
  if(status) status.textContent = text;
  const sheet = document.querySelector(".voice-sheet");
  if(sheet){
    sheet.classList.remove("tone-neutral","tone-good","tone-warn","tone-bad","tone-listen");
    sheet.classList.add(
      tone==="good" ? "tone-good" :
      tone==="warn" ? "tone-warn" :
      tone==="bad" ? "tone-bad" :
      tone==="listen" ? "tone-listen" : "tone-neutral"
    );
  }
}

function voiceSetHint(text){
  const hint = document.getElementById("voiceHint");
  if(hint) hint.textContent = text;
}

function voiceResetFlow(){
  voiceFlow.mode = "idle";
  voiceFlow.draft = null;
}

function voicePromptNext(missing){
  // missing: "date" | "start" | "end"
  if(missing === "date"){
    voiceFlow.mode = "need_date";
    voiceSetStatus("На какую дату? 🎙️", "warn");
    voiceSetHint("Скажи: «10 февраля», «11.02.2026», «завтра» или «в пятницу».");
    try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("warning"); }catch(_){}
    return;
  }
  if(missing === "start"){
    voiceFlow.mode = "need_start";
    voiceSetStatus("Во сколько начать? 🎙️", "warn");
    voiceSetHint("Скажи: «в 14:00», «в 8», или «через 30 минут».");
    try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("warning"); }catch(_){}
    return;
  }
  if(missing === "end"){
    voiceFlow.mode = "need_end";
    voiceSetStatus("Во сколько закончить? 🎙️", "warn");
    voiceSetHint("Скажи: «до 15:00» или «на час» / «на 30 минут».");
    try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("warning"); }catch(_){}
    return;
  }
}

function voiceUpdatePreview(v){
  const prev = document.getElementById("voicePreview");
  const chips = document.getElementById("voiceChips");
  const tprev = document.getElementById("voiceTitlePrev");

  if(chips){
    const arr = [];
    arr.push(v.kind==="event" ? "Событие" : "Задача");
    if(v.dateISO) arr.push(v.dateISO);
    if(v.startTime) arr.push(v.startTime + (v.endTime ? "–"+v.endTime : ""));
    chips.innerHTML = arr.map(x=>`<span class="vchip">${escapeHtml(x)}</span>`).join("");
  }
  if(tprev) tprev.textContent = v.title;
  if(prev) prev.hidden = false;

  const add = document.getElementById("voiceAdd");
  const edit = document.getElementById("voiceEdit");

  const ready = !(v.missingDate || v.missingStart || v.missingEnd);
  if(ready){
    add?.removeAttribute("disabled");
    add?.removeAttribute("aria-disabled");
    add?.classList.remove("is-disabled");
  }else{
    add?.setAttribute("aria-disabled","true");
    add?.classList.add("is-disabled");
  }
  // edit is allowed once we have a draft
  edit?.removeAttribute("aria-disabled");
  edit?.classList.remove("is-disabled");
}
let voiceRec = null;
let voiceListening = false;
let voiceLast = null;

function openVoiceModal(autoStart=true){
  const modal = document.getElementById("voiceModal");
  modal?.setAttribute("aria-hidden","false");
  document.documentElement.classList.add("modal-open");
  voiceUIReset();
  voiceResetFlow();

  // Telegram back button closes voice modal
  voiceBackHandler = ()=> closeVoiceModal();
  tgBackShow(voiceBackHandler);

  try{ window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light"); }catch(e){}

  if(autoStart) startVoiceListening();
}

function closeVoiceModal(){
  stopVoiceListening();
  const modal = document.getElementById("voiceModal");
  if(!modal) return;
  modal.setAttribute("aria-hidden","true");
  document.documentElement.classList.remove("modal-open");
  if(voiceBackHandler){ tgBackHide(voiceBackHandler); voiceBackHandler = null; }
  voiceUIReset(true);
  voiceResetFlow();
}

function voiceUIReset(keepText=false){
  const mic = document.getElementById("voiceMicBtn");
  const wave = document.getElementById("voiceWave");
  const text = document.getElementById("voiceText");
  const prev = document.getElementById("voicePreview");
  const chips = document.getElementById("voiceChips");
  const tprev = document.getElementById("voiceTitlePrev");

  voiceSetStatus(supportsSpeech() ? "Скажи задачу или событие" : "Голосовой ввод недоступен на этом устройстве", "neutral");
  voiceSetHint("Пример: «встреча 14:00–15:00 завтра» или «купить продукты завтра».");

  mic?.classList.remove("listening");
  wave?.classList.remove("on");

  if(!keepText){
    if(text){ text.hidden = true; text.textContent = ""; }
    if(prev){ prev.hidden = true; }
    if(chips) chips.innerHTML = "";
    if(tprev) tprev.textContent = "";
    voiceLast = null;
  }

  const add = document.getElementById("voiceAdd");
  const edit = document.getElementById("voiceEdit");
  // disabled until we have a parsed draft
  add?.setAttribute("aria-disabled","true");
  add?.classList.add("is-disabled");
  edit?.setAttribute("aria-disabled","true");
  edit?.classList.add("is-disabled");
}

function ensureRecognizer(){
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Ctor) return null;
  const r = new Ctor();
  r.lang = "ru-RU";
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

function startVoiceListening(){
  if(voiceListening) return;
  if(!supportsSpeech()){
    alert("Голосовой ввод недоступен. Можно добавить текстом через «+».");
    return;
  }

  const status = document.getElementById("voiceStatus");
  const mic = document.getElementById("voiceMicBtn");
  const wave = document.getElementById("voiceWave");

  voiceRec = ensureRecognizer();
  if(!voiceRec){
    alert("Не удалось запустить распознавание речи.");
    return;
  }

  voiceListening = true;
  mic?.classList.add("listening");
  wave?.classList.add("on");
  voiceSetStatus("Слушаю…", "listen");

  let finalText = "";

  voiceRec.onresult = (ev)=>{
    let text = "";
    for(let i=ev.resultIndex; i<ev.results.length; i++){
      text += ev.results[i][0].transcript + " ";
      if(ev.results[i].isFinal) finalText = text.trim();
    }
    // show interim
    const tbox = document.getElementById("voiceText");
    if(tbox){
      tbox.hidden = false;
      tbox.textContent = (finalText || text).trim();
    }
  };

  voiceRec.onerror = (e)=>{
    voiceListening = false;
    mic?.classList.remove("listening");
    wave?.classList.remove("on");
    voiceSetStatus("Ошибка распознавания. Попробуй ещё раз.", "bad");
    try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error"); }catch(_){}
  };

  voiceRec.onend = ()=>{
    const mic = document.getElementById("voiceMicBtn");
    const wave = document.getElementById("voiceWave");
    mic?.classList.remove("listening");
    wave?.classList.remove("on");
    voiceListening = false;

    const text = (finalText || document.getElementById("voiceText")?.textContent || "").trim();
    if(!text){
      const status = document.getElementById("voiceStatus");
      voiceSetStatus("Не расслышал. Нажми «🎙️» и повтори.", "warn");
      return;
    }
    onVoiceRecognized(text);
  };

  try{
    voiceRec.start();
    try{ window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); }catch(_){}
  }catch(e){
    voiceListening = false;
    mic?.classList.remove("listening");
    wave?.classList.remove("on");
    alert("Не удалось начать запись. Разреши доступ к микрофону.");
  }
}

function stopVoiceListening(){
  if(!voiceRec) return;
  try{ voiceRec.abort(); }catch(e){}
  voiceListening = false;
  voiceRec = null;
  document.getElementById("voiceMicBtn")?.classList.remove("listening");
  document.getElementById("voiceWave")?.classList.remove("on");
}

function onVoiceRecognized(text){
  const baseIso = state.dateStr;
  const tz = state.timezone;

  // If we're in a clarification step, parse only the missing part and merge into draft
  if(voiceFlow.mode !== "idle" && voiceFlow.draft){
    const patch = parseVoiceCommand(text, baseIso, tz);

    // Merge heuristically
    const d = voiceFlow.draft;

    if(patch.missingDate === false && patch.dateISO) d.dateISO = patch.dateISO;
    if(patch.startTime) d.startTime = patch.startTime;
    if(patch.endTime) d.endTime = patch.endTime;

    // If user said duration but no endTime, compute
    const dur = parseDurationMin(normalizeVoiceText(text));
    if(d.startTime && !d.endTime && dur != null){
      d.endTime = addMinutesToTimeStr(d.startTime, dur);
      if(d.endTime < d.startTime) d.endTime = "23:59";
    }

    // Re-evaluate missing flags
    d.missingDate = false;
    d.missingStart = false;
    d.missingEnd = false;

    if(!d.dateISO) d.missingDate = true;
    if(d.kind==="event"){
      if(!d.startTime) d.missingStart = true;
      if(d.startTime && !d.endTime) d.missingEnd = true;
    }

    voiceLast = d;
    voiceUpdatePreview(d);

    if(d.missingDate){ voicePromptNext("date"); return; }
    if(d.missingStart){ voicePromptNext("start"); return; }
    if(d.missingEnd){ voicePromptNext("end"); return; }

    voiceFlow.mode = "idle";
    voiceSetStatus("Понял. Проверь и добавь ✅", "good");
    voiceSetHint("Можно нажать «Добавить» или «Редактировать».");
    try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); }catch(_){}
    return;
  }

  // Normal parse
  const parsed = parseVoiceCommand(text, baseIso, tz);
  voiceFlow.draft = parsed;
  voiceLast = parsed;

  // Show preview
  voiceUpdatePreview(parsed);

  // Decide if we need clarification
  if(parsed.missingDate){ voicePromptNext("date"); return; }
  if(parsed.missingStart){ voicePromptNext("start"); return; }
  if(parsed.missingEnd){ voicePromptNext("end"); return; }

  voiceSetStatus("Понял. Проверь и добавь ✅", "good");
  voiceSetHint("Можно нажать «Добавить» или «Редактировать».");
  try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); }catch(_){}
}

async function voiceAddNow(){
  const addBtn = document.getElementById("voiceAdd");
  const editBtn = document.getElementById("voiceEdit");

  if(!voiceLast){
    voiceSetStatus("Сначала продиктуй фразу 🎙️", "warn");
    try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("warning"); }catch(_){}
    startVoiceListening();
    return;
  }

  const v = voiceLast;

  if(v.missingDate){ voicePromptNext("date"); startVoiceListening(); return; }
  if(v.missingStart){ voicePromptNext("start"); startVoiceListening(); return; }
  if(v.missingEnd){ voicePromptNext("end"); startVoiceListening(); return; }

  // prevent double submit
  addBtn?.classList.add("is-loading");
  addBtn?.setAttribute("aria-busy","true");
  editBtn?.setAttribute("aria-disabled","true");
  editBtn?.classList.add("is-disabled");
  voiceSetStatus("Добавляю…", "listen");

  try{
    if(v.kind === "task"){
      await API.createTask({title: v.title, priority: 2, estimate_min: 30, project_id: null});
      await refreshAll();
      if(state.tab==="tasks") await refreshTasksScreen();
      voiceSetStatus("Готово ✅", "good");
      try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); }catch(_){}
      setTimeout(()=> closeVoiceModal(), 220);
      return;
    }

    // event
    const dateStr = v.dateISO || state.dateStr;
    const st = v.startTime || "09:00";
    const en = v.endTime || addMinutesToTimeStr(st, 60);
    const startISO = zonedTimeToUtcISO(dateStr, st, state.timezone);
    const endISO = zonedTimeToUtcISO(dateStr, en, state.timezone);

    await API.createEvent({title: v.title, start_dt: startISO, end_dt: endISO, color: "#6EA8FF", source:"voice"});
    await refreshAll();
    if(state.tab==="calendar") await refreshWeekScreen();
    voiceSetStatus("Готово ✅", "good");
    try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); }catch(_){}
    setTimeout(()=> closeVoiceModal(), 220);
  }catch(err){
    console.error(err);
    voiceSetStatus("Не удалось добавить. Попробуй ещё раз.", "bad");
    uiAlert(err?.message || String(err));
    try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error"); }catch(_){}
  }finally{
    addBtn?.classList.remove("is-loading");
    addBtn?.removeAttribute("aria-busy");
    editBtn?.classList.remove("is-disabled");
    editBtn?.removeAttribute("aria-disabled");
  }
}

function voiceEdit(){
  const v = voiceLast || voiceFlow.draft;
  if(!v) return;

  if(v.kind === "task"){
    setMode("task");
    document.getElementById("inpTitle").value = v.title;
    openModal();
  }else{
    setMode("event");
    document.getElementById("inpTitle").value = v.title;
    document.getElementById("inpDate").value = v.dateISO || state.dateStr;
    document.getElementById("inpTime").value = v.startTime || "09:00";
    document.getElementById("inpEndTime").value = v.endTime || addMinutesToTimeStr(document.getElementById("inpTime").value, 60);
    document.getElementById("inpColor").value = "#6EA8FF";
    openModal();
  }
  closeVoiceModal();
}
// --------------------------------------------------------------

function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}


function ensureUndoToast(){
  const t = document.getElementById("undoToast");
  if(!t) return null;
  return {
    el: t,
    msg: document.getElementById("undoToastMsg"),
    btn: document.getElementById("undoToastBtn")
  };
}

function hideUndoToast(){
  const ui = ensureUndoToast();
  if(!ui) return;
  ui.el.setAttribute("aria-hidden","true");
  if(undoToastTimer){ clearTimeout(undoToastTimer); undoToastTimer = null; }
  undoToastCommit = null;
  undoToastUndo = null;
}

function showUndoToast(message, onUndo, onCommit, ms=3600){
  const ui = ensureUndoToast();
  if(!ui) return;

  // If a toast is already active, commit it immediately to avoid losing action
  if(undoToastCommit){
    try{ undoToastCommit(); }catch(e){}
  }
  if(undoToastTimer){ clearTimeout(undoToastTimer); undoToastTimer = null; }

  undoToastUndo = onUndo || null;
  undoToastCommit = onCommit || null;

  ui.msg.textContent = message || "Готово";
  ui.btn.onclick = ()=>{
    try{
      if(undoToastUndo) undoToastUndo();
      try{ window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); }catch(_){}
    }finally{
      hideUndoToast();
    }
  };

  ui.el.setAttribute("aria-hidden","false");

  undoToastTimer = setTimeout(async ()=>{
    const commit = undoToastCommit;
    hideUndoToast();
    if(commit){
      try{ await commit(); }catch(e){}
    }
  }, ms);
}

async function recalcTasksDot(){
  try{
    const [inbox, today, upcoming] = await Promise.all([
      API.listTasks("inbox"),
      API.listTasks("today"),
      API.listTasks("upcoming")
    ]);
    const map = new Map();
    for(const t of [...inbox, ...today, ...upcoming]){
      if(!t || t.status==="done") continue;
      if(pendingHiddenTaskIds.has(t.id)) continue;
      map.set(t.id, t);
    }
    updateTasksDot(map.size);
  }catch(e){
    // fallback: use current inbox if available
    const approx = (state.tasks||[]).filter(t=>t.status!=="done" && !pendingHiddenTaskIds.has(t.id)).length;
    updateTasksDot(approx);
  }
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
// ---------------- Stability helpers ----------------
function hardResetScreens(){
  const content = document.querySelector(".content");
  if(content) content.style.height = "";

  const ids = ["screenSchedule","screenTasks","screenWeek"];
  for(const id of ids){
    const el = document.getElementById(id);
    if(!el) continue;
    try{
      el.getAnimations?.().forEach(a=>{ try{a.cancel();}catch(e){} });
    }catch(e){}
    el.classList.remove("swap");
    // clear any inline styles left from swipe/slide
    el.style.position = "";
    el.style.left = "";
    el.style.right = "";
    el.style.top = "";
    el.style.width = "";
    el.style.height = "";
    el.style.transform = "";
    el.style.opacity = "";
    el.style.display = "";
    el.style.pointerEvents = "";
  }
}

function enforceActiveScreen(){
  // Ensure no leftovers from interrupted transitions
  hardResetScreens();

  const sc = document.getElementById("screenSchedule");
  const ts = document.getElementById("screenTasks");
  const wk = document.getElementById("screenWeek");

  sc?.classList.toggle("active", state.tab==="schedule");
  ts?.classList.toggle("active", state.tab==="tasks");
  wk?.classList.toggle("active", state.tab==="calendar");
}
// ----------------------------------------------------


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
  const safetyTimeout = setTimeout(()=>{ try{cleanup();}catch(e){} }, 420);

  const a2 = toEl.animate(
    [{opacity:0, transform:`translateX(${inFrom}px)`},{opacity:1, transform:"translateX(0px)"}],
    {duration: 220, easing:"cubic-bezier(.2,.9,.2,1)", fill:"forwards"}
  );

  const cleanup = ()=>{
    try{ clearTimeout(safetyTimeout); }catch(e){}

    // Clear temporary styles
    content.style.height = "";
    fromEl.style.display = "";
    toEl.style.display = "";
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

    // final hard reset + active screen
    enforceActiveScreen();
  };

  a2.onfinish = cleanup;
  a2.oncancel = cleanup;
  a1.oncancel = cleanup;
  return true;
}


let pillX = null;

function tabButtonFor(tab){
  if(tab==="schedule") return document.getElementById("tabSchedule");
  if(tab==="tasks") return document.getElementById("tabTasks");
  return document.getElementById("tabWeek");
}

function tabPillMetrics(tab){
  const bar = document.querySelector(".bottom.bottom-v3");
  const btn = tabButtonFor(tab);
  if(!bar || !btn) return null;
  const b = bar.getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  const w = Math.max(96, Math.min(160, r.width * 0.88));
  const x = (r.left - b.left) + (r.width - w)/2;
  return {x, w};
}

function setPill(x, w){
  const pill = document.getElementById("tabPill");
  if(!pill) return;
  pill.style.width = w + "px";
  pill.style.transform = `translateX(${x}px)`;
}

function moveTabPill(immediate=false){
  const pill = document.getElementById("tabPill");
  if(!pill) return;
  const m = tabPillMetrics(state.tab);
  if(!m) return;

  // keep pill vertically centered inside bar
  const from = (typeof pillX === "number") ? pillX : m.x;
  pillX = m.x;

  if(immediate || prefersReducedMotion()){
    setPill(m.x, m.w);
    return;
  }

  const w0 = pill.getBoundingClientRect().width || m.w;
  const x0 = from;

  // spring x and ease width
  spring({
    from: x0,
    to: m.x,
    stiffness: 520,
    damping: 44,
    onUpdate: (x)=> {
      const t = Math.min(1, Math.max(0, Math.abs(x - x0) / Math.max(1, Math.abs(m.x - x0))));
      const w = w0 + (m.w - w0) * t;
      setPill(x, w);
    },
    onComplete: ()=> setPill(m.x, m.w)
  });
}

function moveTabIndicator(){
  const ind = document.getElementById("tabIndicator");
  if(!ind) return;
  // If hidden, do nothing
  const cs = getComputedStyle(ind);
  if(cs.display === "none") return;

  const active = document.querySelector(".bottom .tab.active");
  const bar = document.querySelector(".bottom");
  if(!active || !bar) return;

  const a = active.getBoundingClientRect();
  const b = bar.getBoundingClientRect();
  const w = Math.min(72, Math.max(54, a.width * 0.55));
  const x = (a.left - b.left) + (a.width - w)/2;

  ind.style.width = w + "px";
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

  // Voice support hint
  const mf = document.getElementById("micFab");
  const mt = document.getElementById("voiceTopBtn");
  if(mf){ mf.style.opacity = supportsSpeech() ? "1" : ".55"; }
  if(mt){ mt.style.opacity = supportsSpeech() ? "1" : ".55"; }
}

function setTab(tab, opts={}){
  const prevTab = state.tab;
  if(tab === prevTab) return;

  // prevent stacked screens when switching quickly
  hardResetScreens();

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

  // guarantee only one screen remains active
  enforceActiveScreen();

  document.querySelectorAll(".bottom .tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab===tab);
  });

  setHeaderForTab();
  updateFabForTab();
  moveTabIndicator();
  moveTabPill(true);
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
function attachSwipeToTaskSwipe(wrapperEl, handlers){
  const inner = wrapperEl.querySelector(".task-inner");
  if(!inner) return;

  const btnDel = wrapperEl.querySelector(".swipe-btn.del");
  const btnDone = wrapperEl.querySelector(".swipe-btn.done");

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let startX=0, curX=0, dragging=false, active=false;

  const reset = ()=>{
    wrapperEl.classList.remove("dragging-x");
    inner.style.transform = "";
    active = false;
  };

  inner.addEventListener("touchstart", (e)=>{
    if(e.touches.length !== 1) return;
    dragging = true;
    active = true;
    startX = e.touches[0].clientX;
    curX = startX;
  }, {passive:true});

  inner.addEventListener("touchmove", (e)=>{
    if(!dragging || !active) return;
    curX = e.touches[0].clientX;
    const dx = curX - startX;

    // if horizontal intent, prevent scroll
    if(Math.abs(dx) > 10) e.preventDefault();

    wrapperEl.classList.add("dragging-x");
    inner.style.transform = `translateX(${clamp(dx, -96, 96)}px)`;
  }, {passive:false});

  inner.addEventListener("touchend", ()=>{
    if(!dragging || !active) return;
    dragging = false;
    const dx = curX - startX;

    // Commit by swipe direction
    if(dx <= -70){
      // delete
      inner.style.transform = "translateX(-96px)";
      setTimeout(()=>{ reset(); handlers?.onDelete?.(); }, 60);
      return;
    }
    if(dx >= 70){
      // complete
      inner.style.transform = "translateX(96px)";
      setTimeout(()=>{ reset(); handlers?.onComplete?.(); }, 60);
      return;
    }
    reset();
  }, {passive:true});

  inner.addEventListener("touchcancel", reset, {passive:true});

  if(btnDel){
    btnDel.addEventListener("click", (e)=>{ e.stopPropagation(); reset(); handlers?.onDelete?.(); });
  }
  if(btnDone){
    btnDone.addEventListener("click", (e)=>{ e.stopPropagation(); reset(); handlers?.onComplete?.(); });
  }
}
document.addEventListener("touchstart", (e)=>{
  if(openSwipeEl && !openSwipeEl.contains(e.target)){
    openSwipeEl.classList.remove("open");
    openSwipeEl = null;
  }
}, {passive:true});


/* ---------------- Touch drag (mobile) - plan task ---------------- */
const touchDrag = {
  active:false,
  taskId:null,
  title:"",
  ghost:null,
  over:null,
  pointerId:null,
  pressTimer:null,
  startX:0,
  startY:0,
  started:false
};

function tdClearOver(){
  if(touchDrag.over){
    touchDrag.over.classList.remove("over");
    touchDrag.over = null;
  }
}

function tdStop(){
  try{ clearTimeout(touchDrag.pressTimer); }catch(e){}
  touchDrag.pressTimer = null;

  tdClearOver();
  document.body.classList.remove("dragging-task");
  if(touchDrag.ghost){
    touchDrag.ghost.remove();
    touchDrag.ghost = null;
  }
  touchDrag.active = false;
  touchDrag.taskId = null;
  touchDrag.title = "";
  touchDrag.pointerId = null;
  touchDrag.started = false;
}

function tdStart(pointerId, taskId, title, x, y){
  touchDrag.active = true;
  touchDrag.started = true;
  touchDrag.pointerId = pointerId;
  touchDrag.taskId = taskId;
  touchDrag.title = title;

  // Create ghost pill
  const g = document.createElement("div");
  g.className = "drag-ghost";
  g.textContent = title || "Задача";
  document.body.appendChild(g);
  touchDrag.ghost = g;

  document.body.classList.add("dragging-task");
  tdMove(x,y);

  try{ window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); }catch(_){}
}

function tdMove(x,y){
  if(!touchDrag.active || !touchDrag.ghost) return;

  touchDrag.ghost.style.left = x + "px";
  touchDrag.ghost.style.top  = y + "px";

  const el = document.elementFromPoint(x, y);
  const drop = el?.closest?.(".sdrop") || null;

  if(drop !== touchDrag.over){
    tdClearOver();
    if(drop){
      drop.classList.add("over");
      touchDrag.over = drop;
    }
  }
}

async function tdDrop(){
  if(!touchDrag.active) { tdStop(); return; }
  const over = touchDrag.over;
  const taskId = touchDrag.taskId;
  tdStop();

  if(!over || !taskId) return;

  const h = Number(over.dataset.hour || "0");
  const m = Number(over.dataset.min || "0");
  const startISO = zonedTimeToUtcISO(state.dateStr, `${pad2(h)}:${pad2(m)}`, state.timezone);

  try{
    await API.planTask(Number(taskId), startISO, 30);
    await refreshAll();
    if(state.tab==="calendar") await refreshWeekScreen();
    try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); }catch(_){}
  }catch(err){
    try{ window.Telegram?.WebApp?.showAlert?.("Не удалось запланировать: " + (err?.message||String(err))); }catch(_){
      alert("Не удалось запланировать: " + (err?.message||String(err)));
    }
  }
}

function attachTouchDragToTaskRow(row, task){
  // iOS/Telegram WebView: HTML5 drag/drop often doesn't work -> use long-press touch drag
  row.addEventListener("pointerdown", (e)=>{
    if(e.pointerType !== "touch" && e.pointerType !== "pen") return;
    if(task.status === "done") return;

    // don't start drag if user taps on buttons inside row
    if(e.target.closest("button")) return;

    touchDrag.startX = e.clientX;
    touchDrag.startY = e.clientY;
    touchDrag.started = false;
    touchDrag.taskId = task.id;
    touchDrag.title = task.title;

    // long-press to start drag (so scroll still works)
    touchDrag.pressTimer = setTimeout(()=>{
      tdStart(e.pointerId, task.id, task.title, e.clientX, e.clientY);
      try{ row.setPointerCapture(e.pointerId); }catch(_){}
    }, 180);
  }, {passive:true});

  row.addEventListener("pointermove", (e)=>{
    if(e.pointerType !== "touch" && e.pointerType !== "pen") return;
    if(!touchDrag.pressTimer && !touchDrag.active) return;

    const dx = Math.abs(e.clientX - touchDrag.startX);
    const dy = Math.abs(e.clientY - touchDrag.startY);

    // if user started scrolling before long-press, cancel
    if(!touchDrag.active && (dx > 10 || dy > 10)){
      try{ clearTimeout(touchDrag.pressTimer); }catch(_){}
      touchDrag.pressTimer = null;
      return;
    }

    if(touchDrag.active){
      e.preventDefault();
      tdMove(e.clientX, e.clientY);
    }
  }, {passive:false});

  row.addEventListener("pointerup", (e)=>{
    if(e.pointerType !== "touch" && e.pointerType !== "pen") return;
    try{ clearTimeout(touchDrag.pressTimer); }catch(_){}
    touchDrag.pressTimer = null;

    if(touchDrag.active){
      e.preventDefault();
      tdDrop();
    }
  }, {passive:false});

  row.addEventListener("pointercancel", (e)=>{
    if(e.pointerType !== "touch" && e.pointerType !== "pen") return;
    tdStop();
  }, {passive:true});
}
/* ---------------- End touch drag ---------------- */

/* ---------------- Tasks rendering ---------------- */
function renderTasksTo(listEl, tasks){
  listEl.innerHTML = "";

  for(const t of tasks){
    if(pendingHiddenTaskIds.has(t.id)) continue;
    const swipe = document.createElement("div");
    swipe.className = "swipe";

    const actionsL = document.createElement("div");
    actionsL.className = "swipe-actions left";
    actionsL.innerHTML = `<button class="swipe-btn done" type="button" title="Done">✓</button>`;

    const actionsR = document.createElement("div");
    actionsR.className = "swipe-actions right";
    actionsR.innerHTML = `<button class="swipe-btn del" type="button" title="Delete">🗑️</button>`;

    const row = document.createElement("div");
    row.className = "task task-inner" + (t.status==="done" ? " done":"");
    row.draggable = t.status !== "done";

    // Mobile touch drag (long-press)
    attachTouchDragToTaskRow(row, t);

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
    chk.onclick = (e) => {
      e.stopPropagation();
      if(t.status==="done") return;

      // optimistic hide + undo
      pendingHiddenTaskIds.add(t.id);
      renderTasksTo(listEl, tasks);

      showUndoToast("Задача выполнена", ()=>{
        pendingHiddenTaskIds.delete(t.id);
        renderTasksTo(listEl, tasks);
        recalcTasksDot();
      }, async ()=>{
        await API.completeTask(t.id);
        pendingHiddenTaskIds.delete(t.id);
        await refreshAll();
        await refreshTasksScreen();
        if(state.tab==="calendar") refreshWeekScreen();
      });
      recalcTasksDot();
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

    swipe.appendChild(actionsL);
    swipe.appendChild(actionsR);
    swipe.appendChild(row);

    attachSwipeToTaskSwipe(swipe, {
      onDelete: ()=>{
        pendingHiddenTaskIds.add(t.id);
        renderTasksTo(listEl, tasks);

        showUndoToast("Задача удалена", ()=>{
          pendingHiddenTaskIds.delete(t.id);
          renderTasksTo(listEl, tasks);
          recalcTasksDot();
        }, async ()=>{
          await API.deleteTask(t.id);
          pendingHiddenTaskIds.delete(t.id);
          await refreshAll();
          await refreshTasksScreen();
          if(state.tab==="calendar") refreshWeekScreen();
        });
        recalcTasksDot();
      },
      onComplete: ()=>{
        pendingHiddenTaskIds.add(t.id);
        renderTasksTo(listEl, tasks);

        showUndoToast("Задача выполнена", ()=>{
          pendingHiddenTaskIds.delete(t.id);
          renderTasksTo(listEl, tasks);
          recalcTasksDot();
        }, async ()=>{
          await API.completeTask(t.id);
          pendingHiddenTaskIds.delete(t.id);
          await refreshAll();
          await refreshTasksScreen();
          if(state.tab==="calendar") refreshWeekScreen();
        });
        recalcTasksDot();
      }
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

  // Update Tasks dot (undone across filters)
  await recalcTasksDot();

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
  await recalcTasksDot();
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

  const all = await API.scheduleRange(start, end);

  // Group by local dateStr in selected timezone
  const fmtISO = new Intl.DateTimeFormat("en-CA", {timeZone: state.timezone, year:"numeric", month:"2-digit", day:"2-digit"});
  const groups = {};
  for(const ev of all){
    const ds = fmtISO.format(new Date(ev.start_dt));
    (groups[ds] ||= []).push(ev);
  }

  const openDay = (ds)=>{
    state.dateStr = ds;
    setTab("schedule");
    refreshAll();
  };

  const openAddEventForDay = (ds)=>{
    setMode("event");
    openModal();
    document.getElementById("sheetTitle").textContent = "Добавить событие";
    document.getElementById("saveBtn").dataset.editEventId = "";

    document.getElementById("inpDate").value = ds;

    // default start time
    let st = "09:00";
    if(ds === state.dateStr){
      // nearest 30 min from now
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-CA", {timeZone: state.timezone, hour:"2-digit", minute:"2-digit", hour12:false}).formatToParts(now);
      const map = {};
      for(const p of parts){ if(p.type !== "literal") map[p.type]=p.value; }
      const hh = Number(map.hour||"9");
      const mm = Number(map.minute||"0");
      const rounded = Math.min(23*60+30, hh*60 + Math.ceil(mm/30)*30);
      st = `${pad2(Math.floor(rounded/60))}:${pad2(rounded%60)}`;
    }
    document.getElementById("inpTime").value = st;
    document.getElementById("inpEndTime").value = addMinutesToTimeStr(st, 60);
    document.getElementById("inpColor").value = "#6EA8FF";
    document.getElementById("inpTitle").value = "";
    try{ document.getElementById("inpTitle")?.focus({preventScroll:true}); }catch(err){}
  };

  const openEditEvent = (ev)=>{
    const sHM = zonedHourMin(ev.start_dt, state.timezone);
    const eHM = zonedHourMin(ev.end_dt, state.timezone);
    const ds = fmtISO.format(new Date(ev.start_dt));

    setMode("event");
    openModal();
    document.getElementById("inpTitle").value = ev.title;
    document.getElementById("inpDate").value = ds;
    document.getElementById("inpTime").value = `${pad2(sHM.h)}:${pad2(sHM.m)}`;
    document.getElementById("inpEndTime").value = `${pad2(eHM.h)}:${pad2(eHM.m)}`;
    document.getElementById("inpColor").value = ev.color || "#6EA8FF";
    document.getElementById("saveBtn").dataset.editEventId = String(ev.id);
    document.getElementById("sheetTitle").textContent = "Редактировать событие";
    try{ document.getElementById("inpTitle")?.focus({preventScroll:true}); }catch(err){}
  };

  for(let i=0;i<7;i++){
    const ds = addDays(start, i);
    const evs = (groups[ds] || []).slice().sort((a,b)=> new Date(a.start_dt) - new Date(b.start_dt));

    const day = document.createElement("div");
    day.className = "week-day";

    const head = document.createElement("div");
    head.className = "week-day-head";

    const headBtn = document.createElement("button");
    headBtn.type = "button";
    headBtn.className = "week-day-btn";
    const label = fmtDayPill(ds, state.timezone);
    headBtn.innerHTML = `<div style="min-width:0"><div class="wd-title">${label}</div><div class="wd-sub">${evs.length ? (evs.length + " событий") : "Нет событий"}</div></div>`;
    headBtn.onclick = ()=> openDay(ds);

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "week-plus";
    plus.textContent = "+";
    plus.onclick = (e)=>{ e.stopPropagation(); openAddEventForDay(ds); };

    head.appendChild(headBtn);
    head.appendChild(plus);

    day.appendChild(head);

    if(evs.length === 0){
      const empty = document.createElement("div");
      empty.className = "week-empty";
      empty.textContent = "Пусто. Нажми + чтобы добавить событие.";
      day.appendChild(empty);
    }else{
      const list = document.createElement("div");
      list.className = "week-events";
      for(const ev of evs){
        const s = fmtTime(ev.start_dt, state.timezone);
        const e = fmtTime(ev.end_dt, state.timezone);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "week-event";
        const color = ev.color || "#6EA8FF";
        btn.innerHTML = `
          <div class="we-bar" style="background:${color}"></div>
          <div class="we-main">
            <div class="we-time">${s}–${e}</div>
            <div class="we-title">${escapeHtml(ev.title)}</div>
            <div class="we-meta">${ev.source === "task" ? "Task block" : "Event"}</div>
          </div>
        `;
        btn.onclick = ()=> openEditEvent(ev);
        list.appendChild(btn);
      }
      day.appendChild(list);
    }

    box.appendChild(day);
  }

  animateList(box, ".week-day");
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
  document.documentElement.classList.add("modal-open");
  // Telegram back button closes modal
  modalBackHandler = ()=> closeModal();
  tgBackShow(modalBackHandler);

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
      document.documentElement.classList.remove("modal-open");
      if(modalBackHandler){ tgBackHide(modalBackHandler); modalBackHandler=null; }
      clearModal();
    };
    if(a2) a2.onfinish = done;
    else done();
  }else{
    modal.setAttribute("aria-hidden","true");
    document.documentElement.classList.remove("modal-open");
    if(modalBackHandler){ tgBackHide(modalBackHandler); modalBackHandler=null; }
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
  let pillFrom=null, pillTo=null;
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

    // kill any previous interrupted transitions
    hardResetScreens();

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

    // move pill with finger
    if(pillFrom && pillTo){
      const px = pillFrom.x + (pillTo.x - pillFrom.x) * t;
      const pw = pillFrom.w + (pillTo.w - pillFrom.w) * t;
      setPill(px, pw);
    }
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
      el.style.display = "";
    }

    // ensure only one active screen visible
    enforceActiveScreen();

    activeFrom = null;
    activeTo = null;
    pillFrom = null;
    pillTo = null;
    moveTabPill(true);
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
    pillFrom = null;
    pillTo = null;
    moveTabPill(true);
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
        pillFrom = tabPillMetrics(state.tab);
        pillTo = tabPillMetrics(next);
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

  // Quick add task
  const qi = document.getElementById("tasksQuickInput");
  const qb = document.getElementById("tasksQuickBtn");
  const submitQuick = async ()=>{
    const title = (qi?.value || "").trim();
    if(!title) return;
    qi.value = "";
    try{
      await API.createTask({title, priority: 2, estimate_min: 30, project_id: null});
      try{ window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); }catch(_){}
      await refreshAll();
      await refreshTasksScreen();
    }catch(e){
      try{ window.Telegram?.WebApp?.showAlert?.("Не удалось добавить задачу"); }catch(_){ alert("Не удалось добавить задачу"); }
    }
  };
  qb?.addEventListener("click", submitQuick);
  qi?.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      e.preventDefault();
      submitQuick();
    }
  });


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
  moveTabPill();
  initTabSwipe();

  window.addEventListener("resize", ()=> { updateLayoutVars();
  updateBottomPad(); moveTabIndicator();
  moveTabPill(); });
  window.addEventListener("orientationchange", ()=> { setTimeout(()=> { updateLayoutVars();
  updateBottomPad(); moveTabIndicator();
  moveTabPill(); }, 80); });
  if(window.visualViewport){
    window.visualViewport.addEventListener("resize", ()=> { updateLayoutVars();
  updateBottomPad(); moveTabIndicator();
  moveTabPill(); });
    window.visualViewport.addEventListener("scroll", ()=> { updateLayoutVars();
  updateBottomPad(); });
  }

  // Voice UI
  document.getElementById("micFab")?.addEventListener("click", ()=> openVoiceModal(true));
  document.getElementById("voiceClose")?.addEventListener("click", closeVoiceModal);
  document.getElementById("voiceBackdrop")?.addEventListener("click", closeVoiceModal);
  document.getElementById("voiceRetry")?.addEventListener("click", ()=> { voiceUIReset(); voiceResetFlow(); startVoiceListening(); });
  document.getElementById("voiceMicBtn")?.addEventListener("click", ()=> { if(voiceListening) stopVoiceListening(); else startVoiceListening(); });
  document.getElementById("voiceAdd")?.addEventListener("click", ()=> voiceAddNow().catch(err=>alert(err?.message||String(err))));
  document.getElementById("voiceEdit")?.addEventListener("click", voiceEdit);


  document.getElementById("voiceTopBtn")?.addEventListener("click", ()=> openVoiceModal(true));

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


// ===== VOICE_MODAL_V2_OVERRIDES =====
function tgBackShow(handler){
  const tg = window.Telegram?.WebApp;
  if(!tg || !tg.BackButton) return;
  try{
    tg.BackButton.show();
    tg.BackButton.onClick(handler);
  }catch(_){}
}
function tgBackHide(handler){
  const tg = window.Telegram?.WebApp;
  if(!tg || !tg.BackButton) return;
  try{
    tg.BackButton.offClick(handler);
    tg.BackButton.hide();
  }catch(_){}
}

(function(){
  let backHandler = null;

  // Override with stable close behavior
  window.openVoiceModal = function openVoiceModal(autoStart=true){
    const modal = document.getElementById("voiceModal");
    if(!modal) return;

    modal.setAttribute("aria-hidden","false");
    document.documentElement.classList.add("modal-open");

    backHandler = ()=> window.closeVoiceModal();
    tgBackShow(backHandler);

    if(typeof voiceUIReset === "function") voiceUIReset();
    try{ window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light"); }catch(_){}

    if(autoStart && typeof startVoiceListening === "function") startVoiceListening();
  };

  window.closeVoiceModal = function closeVoiceModal(){
    try{ if(typeof stopVoiceListening === "function") stopVoiceListening(); }catch(_){}
    const modal = document.getElementById("voiceModal");
    if(!modal) return;

    modal.setAttribute("aria-hidden","true");
    document.documentElement.classList.remove("modal-open");

    if(backHandler){
      tgBackHide(backHandler);
      backHandler = null;
    }

    try{ if(typeof voiceUIReset === "function") voiceUIReset(true); }catch(_){}
  };
})();

// Stability: if app was backgrounded during animation, reset screens
window.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){
    try{ enforceActiveScreen(); }catch(e){}
  }
});
window.addEventListener("orientationchange", ()=>{
  setTimeout(()=>{ try{ enforceActiveScreen(); }catch(e){} }, 50);
});
