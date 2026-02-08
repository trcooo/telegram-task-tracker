import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
dayjs.extend(customParseFormat);
const timeRe = /(\b\d{1,2}):(\d{2})\b/;
const rangeRe = /(\b\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/;
const todayWords = /\b(today|сегодня)\b/i;
const tomorrowWords = /\b(tomorrow|завтра)\b/i;
function extractTags(text) {
    const tags = Array.from(text.matchAll(/#([\p{L}0-9_\-]+)/gu)).map(m => m[1]);
    const cleaned = text.replace(/#([\p{L}0-9_\-]+)/gu, "").replace(/\s+/g, " ").trim();
    return { tags, cleaned };
}
function extractListHint(text) {
    const m = text.match(/@([\p{L}0-9_\-]+)/u);
    if (!m)
        return { listHint: undefined, cleaned: text };
    const cleaned = text.replace(m[0], "").replace(/\s+/g, " ").trim();
    return { listHint: m[1], cleaned };
}
export function parseNaturalInput(raw) {
    let text = raw.trim();
    const out = { title: text };
    // focus flag "*"
    if (text.includes(" *") || text.startsWith("*")) {
        out.focusFlag = true;
        text = text.replace(/\*/g, "").trim();
    }
    // priority via !, !!, !!!
    const bangs = (text.match(/!+/g) || []).join("");
    if (bangs.length >= 3)
        out.priority = 3;
    else if (bangs.length === 2)
        out.priority = 2;
    else if (bangs.length === 1)
        out.priority = 1;
    text = text.replace(/!+/g, "").trim();
    // kind keywords
    if (/\b(meet|meeting|встреч)/i.test(text))
        out.kind = "meeting";
    else if (/\b(study|lesson|учеб|курс|лекц)/i.test(text))
        out.kind = "study";
    const t = extractTags(text);
    out.tags = t.tags.length ? t.tags : undefined;
    text = t.cleaned;
    const l = extractListHint(text);
    out.listHint = l.listHint;
    text = l.cleaned;
    // date words
    let day = dayjs();
    if (tomorrowWords.test(text)) {
        day = day.add(1, "day");
        text = text.replace(tomorrowWords, "").trim();
    }
    if (todayWords.test(text)) {
        day = dayjs();
        text = text.replace(todayWords, "").trim();
    }
    // explicit date dd.mm or dd/mm or yyyy-mm-dd
    const dm = text.match(/\b(\d{1,2})[\./-](\d{1,2})(?:[\./-](\d{2,4}))?\b/);
    if (dm) {
        const dd = Number(dm[1]);
        const mm = Number(dm[2]);
        const yy = dm[3] ? Number(dm[3].length === 2 ? "20" + dm[3] : dm[3]) : day.year();
        day = dayjs(`${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
        text = text.replace(dm[0], "").trim();
    }
    // time range
    const rm = text.match(rangeRe);
    if (rm) {
        const start = dayjs(`${day.format("YYYY-MM-DD")} ${rm[1]}`, "YYYY-MM-DD HH:mm");
        const end = dayjs(`${day.format("YYYY-MM-DD")} ${rm[2]}`, "YYYY-MM-DD HH:mm");
        out.startAt = start.toISOString();
        out.endAt = end.toISOString();
        out.date = day.format("YYYY-MM-DD");
        out.time = start.format("HH:mm");
        text = text.replace(rm[0], "").trim();
    }
    else {
        const tm = text.match(timeRe);
        if (tm) {
            const hh = Number(tm[1]);
            const mi = Number(tm[2]);
            const start = dayjs(`${day.format("YYYY-MM-DD")} ${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}`, "YYYY-MM-DD HH:mm");
            out.date = day.format("YYYY-MM-DD");
            out.time = start.format("HH:mm");
            out.startAt = start.toISOString();
            text = text.replace(tm[0], "").trim();
        }
    }
    out.title = text.trim() || raw.trim();
    return out;
}
