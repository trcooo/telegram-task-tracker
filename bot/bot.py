from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo
import asyncio

TOKEN = "8330207021:AAHeHn635VSgmW9sKgQyHsoBAm1FNbKHHII"

bot = Bot(token=TOKEN)
dp = Dispatcher()

@dp.message(commands=["start"])
async def start(message: types.Message):
    keyboard = types.ReplyKeyboardMarkup(
        keyboard=[
            [
                types.KeyboardButton(
                    text="📋 Мои задачи",
                    web_app=WebAppInfo(url="https://telegram-task-tracker.up.railway.app/index.html")
                )
            ]
        ],
        resize_keyboard=True
    )

    await message.answer(
        "Привет! Это твой трекер задач 👇",
        reply_markup=keyboard
    )

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
