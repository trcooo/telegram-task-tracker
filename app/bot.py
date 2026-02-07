import os
import logging
import asyncio
from datetime import datetime, timedelta

from aiogram import Bot, Dispatcher, types
from aiogram.contrib.middlewares.logging import LoggingMiddleware
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.utils import executor

from .database import SessionLocal
from .models import Task

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("taskflow-bot")

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set in env")

WEB_APP_URL = os.getenv("WEB_APP_URL", "").strip()
# fallback: open same host (works when Mini App hosted on same domain)
if not WEB_APP_URL:
    WEB_APP_URL = "https://example.com"

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(bot)
dp.middleware.setup(LoggingMiddleware())

def main_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(InlineKeyboardButton("📱 Открыть TaskFlow", web_app=WebAppInfo(url=WEB_APP_URL)))
    return kb

@dp.message_handler(commands=["start"])
async def cmd_start(message: types.Message):
    u = message.from_user
    await message.answer(
        f"👋 Привет, {u.first_name or 'друг'}!\n\n"
        f"Открой Mini App, чтобы управлять задачами.\n"
        f"Я напомню за 15 минут до срока ⏰",
        reply_markup=main_kb()
    )

@dp.message_handler(commands=["help"])
async def cmd_help(message: types.Message):
    await message.answer(
        "Команды:\n"
        "/start — открыть Mini App\n"
        "/help — помощь\n\n"
        "Напоминания приходят за 15 минут до срока.",
        reply_markup=main_kb()
    )

async def reminders_loop():
    while True:
        try:
            now = datetime.utcnow()
            frm = now + timedelta(minutes=15)
            to = now + timedelta(minutes=16)

            db = SessionLocal()
            try:
                tasks = (
                    db.query(Task)
                    .filter(Task.completed == False)
                    .filter(Task.due_at.isnot(None))
                    .filter(Task.reminder_sent == False)
                    .filter(Task.due_at >= frm)
                    .filter(Task.due_at < to)
                    .all()
                )

                for t in tasks:
                    try:
                        await bot.send_message(
                            t.user_id,
                            f"⏰ Через 15 минут задача:\n\n<b>{t.title}</b>",
                            parse_mode="HTML",
                            reply_markup=main_kb()
                        )
                        t.reminder_sent = True
                    except Exception as e:
                        logger.error(f"Send reminder failed to {t.user_id}: {e}")

                db.commit()
            finally:
                db.close()

        except Exception as e:
            logger.error(f"reminders_loop error: {e}")

        await asyncio.sleep(30)

async def on_startup(_dp):
    logger.info("Bot started")
    asyncio.create_task(reminders_loop())

if __name__ == "__main__":
    executor.start_polling(dp, skip_updates=True, on_startup=on_startup)
