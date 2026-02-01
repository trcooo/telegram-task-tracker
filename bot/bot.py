import logging
from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils import executor

# ----------------- Настройки -----------------
API_TOKEN = "8330207021:AAHeHn635VSgmW9sKgQyHsoBAm1FNbKHHII"  # вставь токен своего бота
WEB_APP_URL = "https://telegram-task-tracker-production.up.railway.app"  # твой публичный URL с Railway

# Включаем логирование
logging.basicConfig(level=logging.INFO)

# Создаём объекты бота и диспетчера
bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)

# ----------------- Клавиатура с кнопкой Mini App -----------------
web_app = WebAppInfo(url=WEB_APP_URL)
keyboard = InlineKeyboardMarkup(row_width=1)
keyboard.add(InlineKeyboardButton("📋 Мои задачи", web_app=web_app))

# ----------------- Обработчики -----------------
@dp.message_handler(commands=["start"])
async def start(message: types.Message):
    await message.answer("Привет! Нажми на кнопку ниже, чтобы открыть трекер задач.", reply_markup=keyboard)

# Можно добавить обработчик любых текстовых сообщений
@dp.message_handler()
async def echo(message: types.Message):
    await message.answer("Нажми на кнопку 📋 Мои задачи, чтобы открыть Mini App.", reply_markup=keyboard)

# ----------------- Запуск бота -----------------
if __name__ == "__main__":
    executor.start_polling(dp, skip_updates=True)
