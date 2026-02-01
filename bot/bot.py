import os
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.executor import start_webhook
from aiohttp import web

# ----------------- Настройки -----------------
API_TOKEN = os.getenv("BOT_TOKEN")  # токен бота через переменную окружения
if not API_TOKEN:
    raise ValueError("BOT_TOKEN не найден в переменных окружения!")

WEB_APP_URL = "https://telegram-task-tracker-production.up.railway.app"  # твой публичный URL

WEBHOOK_HOST = "https://telegram-task-tracker-production.up.railway.app"  # Railway домен
WEBHOOK_PATH = f"/webhook/{API_TOKEN}"
WEBHOOK_URL = f"{WEBHOOK_HOST}{WEBHOOK_PATH}"

# ----------------- Логирование -----------------
logging.basicConfig(level=logging.INFO)

# ----------------- Бот и диспетчер -----------------
bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)

# ----------------- Клавиатура с Mini App -----------------
web_app = WebAppInfo(url=WEB_APP_URL)
keyboard = InlineKeyboardMarkup(row_width=1)
keyboard.add(InlineKeyboardButton("📋 Мои задачи", web_app=web_app))

# ----------------- Обработчики -----------------
@dp.message_handler(commands=["start"])
async def start_command(message: types.Message):
    await message.answer("Привет! Нажми на кнопку ниже, чтобы открыть трекер задач.", reply_markup=keyboard)

@dp.message_handler()
async def default_message(message: types.Message):
    await message.answer("Нажми на кнопку 📋 Мои задачи, чтобы открыть Mini App.", reply_markup=keyboard)

# ----------------- Запуск Webhook -----------------
async def on_startup(app):
    # Устанавливаем Webhook
    await bot.set_webhook(WEBHOOK_URL)
    logging.info(f"Webhook установлен: {WEBHOOK_URL}")

async def on_shutdown(app):
    # Удаляем Webhook при выключении
    await bot.delete_webhook()
    logging.info("Webhook удалён")

# ----------------- Настройка веб-сервера aiohttp -----------------
app = web.Application()
app.router.add_post(WEBHOOK_PATH, dp)

if __name__ == "__main__":
    start_webhook(
        dispatcher=dp,
        webhook_path=WEBHOOK_PATH,
        on_startup=on_startup,
        on_shutdown=on_shutdown,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        web_app=app,
    )
