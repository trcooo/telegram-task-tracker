import os
import asyncio
import logging
from datetime import datetime, timedelta

from aiogram import Bot, Dispatcher, types
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from aiogram.utils import executor

from .database import SessionLocal
from .models import Task

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("taskflow-bot")

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")

WEB_APP_URL = os.getenv("WEB_APP_URL", "").strip()

bot = Bot(token=BOT_TOKEN, parse_mode="HTML")
dp = Dispatcher(bot)

def kb_open():
    if WEB_APP_URL:
        return InlineKeyboardMarkup().add(
            InlineKeyboardButton("📱 Открыть TaskFlow", web_app=WebAppInfo(url=WEB_APP_URL))
        )
    # fallback
    return InlineKeyboardMarkup().add(
        InlineKeyboardButton("🌐 Открыть сайт", url="https://telegram.org")
    )

@dp.message_handler(commands=["start"])
async def cmd_start(message: types.Message):
    u = message.from_user
    await message.answer(
        f"Привет, <b>{u.first_name or 'друг'}</b>!\n\n"
        "✅ Я напомню за <b>15 минут</b> до дедлайна.\n"
        "Открой Mini App кнопкой ниже 👇",
        reply_markup=kb_open()
    )

@dp.message_handler(commands=["help"])
async def cmd_help(message: types.Message):
    await message.answer(
        "Команды:\n"
        "/start — открыть приложение\n"
        "/help — помощь",
        reply_markup=kb_open()
    )

async def reminders_loop():
    """Каждые 30 секунд проверяем задачи, у которых дедлайн через 15 минут."""
    while True:
        try:
            now = datetime.utcnow()
            frm = now + timedelta(minutes=15)
            to = now + timedelta(minutes=16)

            db = SessionLocal()
            try:
                tasks = (
                    db.query(Task)
                    .filter(Task.completed == False)  # noqa
                    .filter(Task.reminder_enabled == True)  # noqa
                    .filter(Task.reminder_sent == False)  # noqa
                    .filter(Task.due_at.isnot(None))
                    .filter(Task.due_at >= frm)
                    .filter(Task.due_at < to)
                    .all()
                )
                for t in tasks:
                    try:
                        due_txt = t.due_at.strftime("%d.%m %H:%M") if t.due_at else ""
                        await bot.send_message(
                            t.user_id,
                            f"⏰ <b>Напоминание</b> (15 минут)\n"
                            f"📝 <b>{t.title}</b>\n"
                            f"🕒 {due_txt}",
                            reply_markup=kb_open()
                        )
                        t.reminder_sent = True
                    except Exception as e:
                        logger.error(f"Send failed to {t.user_id}: {e}")
                db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"reminders_loop error: {e}")

        await asyncio.sleep(30)

async def on_startup(_):
    asyncio.create_task(reminders_loop())
    logger.info("✅ Bot started + reminders loop running")

def main():
    executor.start_polling(dp, skip_updates=True, on_startup=on_startup)

if __name__ == "__main__":
    main()
