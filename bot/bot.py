import os
import logging
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.executor import start_webhook
from aiohttp import web
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from backend.models import Base, Task

# ----------------- Настройки -----------------
API_TOKEN = os.getenv("BOT_TOKEN")
if not API_TOKEN:
    raise ValueError("BOT_TOKEN не найден!")

WEB_APP_URL = "https://telegram-task-tracker-production.up.railway.app"
WEBHOOK_HOST = WEB_APP_URL
WEBHOOK_PATH = f"/webhook/{API_TOKEN}"
WEBHOOK_URL = f"{WEBHOOK_HOST}{WEBHOOK_PATH}"

PORT = int(os.environ.get("PORT", 8000))

# ----------------- Логирование -----------------
logging.basicConfig(level=logging.INFO)

# ----------------- Бот и диспетчер -----------------
bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)

# ----------------- База данных -----------------
engine = create_engine("sqlite:///backend/tasks.db")
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)

# ----------------- Клавиатура -----------------
web_app = WebAppInfo(url=WEB_APP_URL)
keyboard = InlineKeyboardMarkup(row_width=1)
keyboard.add(InlineKeyboardButton("📋 Мои задачи", web_app=web_app))

# ----------------- Обработчики -----------------
@dp.message_handler(commands=["start"])
async def start_command(message: types.Message):
    await message.answer(
        "Привет! Я твой Task Tracker Bot. Нажми на кнопку ниже, чтобы открыть Mini App.",
        reply_markup=keyboard
    )

@dp.message_handler(commands=["tasks"])
async def tasks_command(message: types.Message):
    session = SessionLocal()
    tasks = session.query(Task).filter(Task.user_id==message.from_user.id).all()
    if not tasks:
        await message.answer("У тебя нет активных задач.", reply_markup=keyboard)
    else:
        text = "\n".join([f"{t.title} - {t.date} {t.time}" for t in tasks])
        await message.answer(f"Твои задачи:\n{text}", reply_markup=keyboard)
    session.close()

# ----------------- Webhook -----------------
async def on_startup(app):
    await bot.set_webhook(WEBHOOK_URL)
    logging.info(f"Webhook установлен: {WEBHOOK_URL}")

async def on_shutdown(app):
    await bot.delete_webhook()
    logging.info("Webhook удалён")

# ----------------- FastAPI / aiohttp сервер -----------------
app = web.Application()
app.router.add_post(WEBHOOK_PATH, dp)

if __name__ == "__main__":
    start_webhook(
        dispatcher=dp,
        webhook_path=WEBHOOK_PATH,
        on_startup=on_startup,
        on_shutdown=on_shutdown,
        host="0.0.0.0",
        port=PORT,
        web_app=app
    )
