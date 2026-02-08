import httpx
from .settings import settings

async def send_message(chat_id: str, text: str):
    if not (settings.BOT_TOKEN or "").strip():
        raise RuntimeError("BOT_TOKEN is not set")

    url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage"
    payload: dict = {"chat_id": chat_id, "text": text, "disable_web_page_preview": True}

    if settings.APP_URL:
        payload["reply_markup"] = {"inline_keyboard": [[{"text": "Открыть планировщик", "web_app": {"url": settings.APP_URL}}]]}

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
