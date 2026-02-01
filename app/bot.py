import os
import logging
import sys

# Добавляем путь для импортов
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.contrib.middlewares.logging import LoggingMiddleware

# Настройки
BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    print("❌ ОШИБКА: BOT_TOKEN не найден!")
    sys.exit(1)

WEB_APP_URL = os.getenv("WEB_APP_URL", "https://linkotracker.up.railway.app/")

# Логирование
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Бот и диспетчер
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(bot)
dp.middleware.setup(LoggingMiddleware())


# Клавиатура с Mini App
def get_main_keyboard():
    web_app = WebAppInfo(url=WEB_APP_URL)
    keyboard = InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        InlineKeyboardButton("📱 Открыть Task Tracker", web_app=web_app),
        InlineKeyboardButton("📋 Мои задачи", callback_data="my_tasks"),
        InlineKeyboardButton("❓ Помощь", callback_data="help")
    )
    return keyboard


# Обработчики
@dp.message_handler(commands=["start", "help"])
async def start_command(message: types.Message):
    logger.info(f"User {message.from_user.id} started bot")

    welcome_text = (
        "👋 *Добро пожаловать в Task Tracker Bot!*\n\n"
        "Я помогу тебе управлять задачами прямо в Telegram.\n\n"
        "✨ *Возможности:*\n"
        "• 📱 Удобный интерфейс Mini App\n"
        "• 📋 Создание и управление задачами\n"
        "• ⏰ Напоминания о дедлайнах\n\n"
        "Нажми кнопку ниже, чтобы начать 👇"
    )

    await message.answer(
        welcome_text,
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown"
    )


@dp.message_handler(commands=["tasks"])
async def tasks_command(message: types.Message):
    await message.answer(
        "📋 *Твои задачи*\n\n"
        "Открой Mini App для просмотра и управления задачами.",
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown"
    )


@dp.callback_query_handler(text="my_tasks")
async def callback_my_tasks(callback_query: types.CallbackQuery):
    await tasks_command(callback_query.message)
    await callback_query.answer()


@dp.callback_query_handler(text="help")
async def callback_help(callback_query: types.CallbackQuery):
    await start_command(callback_query.message)
    await callback_query.answer()


# Простой обработчик всех текстовых сообщений
@dp.message_handler(content_types=types.ContentType.TEXT)
async def handle_text(message: types.Message):
    if not message.text.startswith('/'):
        await message.answer(
            "💡 Хочешь добавить это как задачу?\n"
            "Используй Mini App для удобного управления задачами!",
            reply_markup=get_main_keyboard()
        )


if __name__ == "__main__":
    from aiogram import executor

    logger.info("Запуск Telegram бота...")
    executor.start_polling(dp, skip_updates=True)