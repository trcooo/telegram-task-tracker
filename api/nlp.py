import re
import dayjs_like
from datetime import datetime, timedelta, date

WEEKDAYS = {
    "mon": 0, "monday": 0,
    "tue": 1, "tues": 1, "tuesday": 1,
    "wed": 2, "wednesday": 2,
    "thu": 3, "thursday": 3,
    "fri": 4, "friday": 4,
    "sat": 5, "saturday": 5,
    "sun": 6, "sunday": 6,
}

def parse_quick_input(text: str):
    """
    Very small rule-based parser:
    - @List
    - #tag
    - today / tomorrow / mon..sun
    - 14:00-15:00 / 14:00
    - p1/p2/p3 or !/!!/!!!
    - focus / *focus
    """
    raw = text.strip()

    tags = re.findall(r"#([A-Za-z0-9_\\-]+)", raw)
    list_m = re.search(r"@([A-Za-z0-9_\\-]+)", raw)
    list_title = list_m.group(1) if list_m else None

    priority = 0
    if re.search(r"\bp3\b", raw) or "!!!" in raw:
        priority = 3
    elif re.search(r"\bp2\b", raw) or "!!" in raw:
        priority = 2
    elif re.search(r"\bp1\b", raw) or "!" in raw:
        priority = 1

    focus_flag = bool(re.search(r"\bfocus\b", raw, re.I) or re.search(r"\*", raw))

    kind = "task"
    if re.search(r"\bmeet(ing)?\b", raw, re.I):
        kind = "meeting"
    if re.search(r"\bstudy\b|\bclass\b|\blecture\b", raw, re.I):
        kind = "study"

    # date
    today = date.today()
    d = None
    if re.search(r"\btoday\b", raw, re.I):
        d = today
    elif re.search(r"\btomorrow\b", raw, re.I):
        d = today + timedelta(days=1)
    else:
        for k in WEEKDAYS:
            if re.search(rf"\b{k}\b", raw, re.I):
                target = WEEKDAYS[k]
                delta = (target - today.weekday()) % 7
                if delta == 0:
                    delta = 7
                d = today + timedelta(days=delta)
                break

    date_str = d.isoformat() if d else None

    # time or range
    time_str = None
    time_range = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)\b", raw)
    single_time = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", raw)
    if time_range:
        time_str = f"{int(time_range.group(1)):02d}:{int(time_range.group(2)):02d}"
    elif single_time:
        time_str = f"{int(single_time.group(1)):02d}:{int(single_time.group(2)):02d}"

    # title cleanup (remove tokens)
    title = re.sub(r"[@#][A-Za-z0-9_\\-]+", "", raw)
    title = re.sub(r"\b(today|tomorrow|mon|tue|tues|wed|thu|fri|sat|sun|p1|p2|p3|focus)\b", "", title, flags=re.I)
    title = re.sub(r"\b([01]?\d|2[0-3]):([0-5]\d)(\s*-\s*([01]?\d|2[0-3]):([0-5]\d))?\b", "", title)
    title = re.sub(r"[!]{1,3}", "", title)
    title = title.strip()
    if not title:
        title = raw.strip()

    return {
        "title": title,
        "tags": tags,
        "list_title": list_title,
        "date": date_str,
        "time": time_str,
        "priority": priority,
        "focus_flag": focus_flag,
        "kind": kind,
    }
