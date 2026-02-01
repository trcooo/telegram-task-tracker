import os
import logging
from aiogram import Bot, Dispatcher, types
from aiohttp import web
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup

# ----------------- Настройки -----------------
API_TOKEN = os.getenv("BOT_TOKEN")
if not API_TOKEN:
    raise ValueError("BOT_TOKEN не найден в переменных окружения!")

WEB_APP_URL = "https://telegram-task-tracker-production.up.railway.app"

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
    await message.answer(
        "Привет! Нажми на кнопку ниже, чтобы открыть трекер задач.",
        reply_markup=keyboard
    )

# ----------------- API для Mini App -----------------
async def create_task(request):
    """Эндпоинт для получения задач из Mini App"""
    data = await request.json()
    chat_id = data.get("chat_id")
    task_text = data.get("task_text")
    task_time = data.get("task_time")

    if not chat_id or not task_text:
        return web.json_response({"status": "error", "message": "Нет chat_id или task_text"}, status=400)

    msg = f"Новая задача:\n- {task_text}"
    if task_time:
        msg += f"\n⏰ Время: {task_time}"

    await bot.send_message(chat_id=int(chat_id), text=msg)
    return web.json_response({"status": "ok"})

# ----------------- Настройка веб-сервера -----------------
app = web.Application()
app.router.add_post("/api/task", create_task)  # сюда Mini App будет отправлять задачи

if __name__ == "__main__":
    from aiogram.utils.executor import start_webhook
    WEBHOOK_PATH = f"/webhook/{API_TOKEN}"
    WEBHOOK_URL = f"{WEB_APP_URL}{WEBHOOK_PATH}"

    async def on_startup(app):
        await bot.set_webhook(WEBHOOK_URL)
        logging.info(f"Webhook установлен: {WEBHOOK_URL}")

    async def on_shutdown(app):
        await bot.delete_webhook()
        logging.info("Webhook удалён")

    start_webhook(
        dispatcher=dp,
        webhook_path=WEBHOOK_PATH,
        on_startup=on_startup,
        on_shutdown=on_shutdown,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        web_app=app,
    )
