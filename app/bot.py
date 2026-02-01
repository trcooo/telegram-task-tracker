import os
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils import executor

# Настройки
API_TOKEN = os.getenv("BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://your-project.railway.app")

if not API_TOKEN:
    raise ValueError("❌ BOT_TOKEN не найден!")

# Логирование
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Бот и диспетчер
bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)


# Клавиатура с Mini App
def get_main_keyboard():
    web_app = WebAppInfo(url=WEB_APP_URL)
    keyboard = InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        InlineKeyboardButton("📱 Открыть Task Tracker", web_app=web_app),
        InlineKeyboardButton("📋 Мои задачи", callback_data="tasks"),
        InlineKeyboardButton("❓ Помощь", callback_data="help")
    )
    return keyboard


# Обработчики
@dp.message_handler(commands=["start", "help"])
async def start_command(message: types.Message):
    logger.info(f"👤 Пользователь {message.from_user.id} начал бота")

    welcome_text = (
        "👋 *Добро пожаловать в Task Tracker Bot!*\n\n"
        "✨ *Возможности:*\n"
        "• 📱 Удобный Mini App для управления задачами\n"
        "• 📋 Создание, редактирование, удаление задач\n"
        "• ⏰ Напоминания о сроках\n"
        "• 📊 Статистика продуктивности\n\n"
        "Нажми кнопку ниже, чтобы открыть Task Tracker 👇"
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


# Callback обработчики
@dp.callback_query_handler(text="tasks")
async def callback_tasks(callback_query: types.CallbackQuery):
    await tasks_command(callback_query.message)
    await callback_query.answer()


@dp.callback_query_handler(text="help")
async def callback_help(callback_query: types.CallbackQuery):
    await start_command(callback_query.message)
    await callback_query.answer()


# Запуск бота
if __name__ == "__main__":
    logger.info("🤖 Запуск Telegram бота...")
    executor.start_polling(dp, skip_updates=True)