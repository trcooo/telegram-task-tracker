import os
import requests
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
APP_BASE_URL = os.getenv("APP_BASE_URL", "").rstrip("/")

def tg_api(method: str) -> str:
    return f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"

def send_message(chat_id: int, text: str, reply_markup: dict | None = None):
    payload = {"chat_id": chat_id, "text": text}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    r = requests.post(tg_api("sendMessage"), json=payload, timeout=10)
    return r.json()

@router.post("/telegram/webhook")
async def telegram_webhook(req: Request):
    if not BOT_TOKEN:
        return JSONResponse({"ok": False, "error": "BOT_TOKEN not set"}, status_code=500)

    update = await req.json()
    message = update.get("message") or update.get("edited_message")
    if not message:
        return {"ok": True}

    text = (message.get("text") or "").strip()
    chat = message.get("chat") or {}
    chat_id = chat.get("id")

    if not chat_id:
        return {"ok": True}

    if text.startswith("/start"):
        if not APP_BASE_URL:
            send_message(
                chat_id,
                "Привет! Я готов, но мне нужно знать публичный URL приложения.\n"
                "Добавь переменную окружения APP_BASE_URL в Railway (без слеша в конце)."
            )
            return {"ok": True}

        webapp_url = f"{APP_BASE_URL}/"
        keyboard = {
            "inline_keyboard": [[
                {"text": "Открыть планировщик", "web_app": {"url": webapp_url}}
            ]]
        }
        send_message(
            chat_id,
            "👋 Привет! Открой планировщик дня (Mini App) по кнопке ниже.\n"
            "Совет: добавляй задачи в Inbox и перетаскивай их на расписание.",
            reply_markup=keyboard
        )
    return {"ok": True}
