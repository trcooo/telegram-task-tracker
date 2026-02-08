from datetime import datetime, timedelta, timezone

def to_iso(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00","Z")

def day_range(date_yyyy_mm_dd: str):
    start = datetime.fromisoformat(date_yyyy_mm_dd + "T00:00:00").replace(tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start, end

def parse_iso_to_naive(iso: str | None):
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z","+00:00")).replace(tzinfo=None)
