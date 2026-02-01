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

WEB_APP_URL = os.getenv("WEB_APP_URL", "https://telegram-task-tracker-production.up.railway.app")
WEBHOOK_HOST = os.getenv("WEBHOOK_HOST", WEB_APP_URL)
WEBHOOK_PATH = f"/webhook/{API_TOKEN}"
WEBHOOK_URL = f"{WEBHOOK_HOST}{WEBHOOK_PATH}"

PORT = int(os.environ.get("PORT", 8000))

# ----------------- Логирование -----------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ----------------- Бот и диспетчер -----------------
bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)

# ----------------- База данных -----------------
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///backend/tasks.db")
engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)


# ----------------- Клавиатура -----------------
def get_main_keyboard():
    web_app = WebAppInfo(url=WEB_APP_URL)
    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        InlineKeyboardButton("📱 Открыть Mini App", web_app=web_app),
        InlineKeyboardButton("📋 Мои задачи", callback_data="my_tasks"),
        InlineKeyboardButton("➕ Добавить задачу", callback_data="add_task"),
        InlineKeyboardButton("⚙️ Настройки", callback_data="settings")
    )
    return keyboard


# ----------------- Обработчики -----------------
@dp.message_handler(commands=["start"])
async def start_command(message: types.Message):
    welcome_text = (
        "👋 *Привет! Я твой Task Tracker Bot!*\n\n"
        "Я помогу тебе организовать задачи и напомню о важных делах.\n\n"
        "✨ *Что умею:*\n"
        "• 📱 Запуск удобного Mini App\n"
        "• 📋 Управление задачами\n"
        "• ⏰ Напоминания\n"
        "• 🔔 Уведомления\n\n"
        "Нажми кнопку ниже, чтобы открыть Task Tracker!"
    )

    await message.answer(
        welcome_text,
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown"
    )
    logger.info(f"User {message.from_user.id} started the bot")


@dp.message_handler(commands=["tasks", "list"])
async def tasks_command(message: types.Message):
    session = SessionLocal()
    try:
        tasks = session.query(Task).filter(
            Task.user_id == message.from_user.id,
            Task.completed == False
        ).order_by(Task.due_date).all()

        if not tasks:
            await message.answer(
                "🎉 У тебя нет активных задач!\n"
                "Нажми на кнопку ниже, чтобы добавить новую задачу.",
                reply_markup=get_main_keyboard()
            )
        else:
            text = "📋 *Твои активные задачи:*\n\n"
            for i, task in enumerate(tasks, 1):
                status = "✅" if task.completed else "⏳"
                due_date = f"\n   📅 {task.due_date.strftime('%d.%m.%Y %H:%M')}" if task.due_date else ""
                text += f"{i}. {status} *{task.title}*{due_date}\n"

            text += "\nИспользуй Mini App для удобного управления!"
            await message.answer(text, reply_markup=get_main_keyboard(), parse_mode="Markdown")
    finally:
        session.close()


@dp.message_handler(commands=["help"])
async def help_command(message: types.Message):
    help_text = (
        "ℹ️ *Помощь по командам:*\n\n"
        "*/start* - Начать работу с ботом\n"
        "*/tasks* - Показать активные задачи\n"
        "*/add* <задача> - Быстро добавить задачу\n"
        "*/help* - Показать это сообщение\n\n"
        "📱 *Основные возможности в Mini App:*\n"
        "• Создание задач с датой и временем\n"
        "• Категории и приоритеты\n"
        "• Напоминания\n"
        "• Статистика продуктивности"
    )
    await message.answer(help_text, parse_mode="Markdown")


@dp.message_handler(commands=["add"])
async def quick_add_task(message: types.Message):
    task_text = message.get_args()
    if not task_text:
        await message.answer(
            "Используй команду так: /add <текст задачи>\n"
            "Например: /add Позвонить клиенту завтра в 14:00"
        )
        return

    session = SessionLocal()
    try:
        task = Task(
            user_id=message.from_user.id,
            title=task_text[:100],  # Ограничение длины
            description=task_text[100:500] if len(task_text) > 100 else None,
            completed=False
        )
        session.add(task)
        session.commit()

        await message.answer(
            f"✅ Задача добавлена!\n\n"
            f"*{task.title[:50]}...*\n\n"
            f"Открой Mini App для добавления даты и времени.",
            reply_markup=get_main_keyboard(),
            parse_mode="Markdown"
        )
    except Exception as e:
        logger.error(f"Error adding task: {e}")
        await message.answer("❌ Ошибка при добавлении задачи")
    finally:
        session.close()


@dp.callback_query_handler(text="my_tasks")
async def callback_my_tasks(callback_query: types.CallbackQuery):
    await tasks_command(callback_query.message)
    await callback_query.answer()


@dp.callback_query_handler(text="add_task")
async def callback_add_task(callback_query: types.CallbackQuery):
    await callback_query.message.answer(
        "Чтобы быстро добавить задачу, используй команду:\n"
        "`/add <текст задачи>`\n\n"
        "Или открой Mini App для полного контроля.",
        parse_mode="Markdown"
    )
    await callback_query.answer()


# ----------------- Webhook -----------------
async def on_startup(app):
    webhook_info = await bot.get_webhook_info()
    logger.info(f"Current webhook: {webhook_info.url}")

    await bot.set_webhook(WEBHOOK_URL)
    logger.info(f"Webhook установлен: {WEBHOOK_URL}")

    # Отправим сообщение разработчику при запуске
    try:
        admin_id = os.getenv("ADMIN_ID")
        if admin_id:
            await bot.send_message(
                admin_id,
                f"🤖 Бот запущен!\n"
                f"Webhook URL: {WEBHOOK_URL}\n"
                f"Mini App URL: {WEB_APP_URL}"
            )
    except Exception as e:
        logger.error(f"Failed to notify admin: {e}")


async def on_shutdown(app):
    await bot.delete_webhook()
    logger.info("Webhook удалён")
    await bot.session.close()


# ----------------- Обработка обновлений -----------------
async def handle_webhook(request):
    url = str(request.url)
    update = await request.json()
    update = types.Update(**update)

    logger.debug(f"Received update: {update.update_id}")
    await dp.process_update(update)

    return web.Response()


# ----------------- aiohttp сервер -----------------
app = web.Application()
app.router.add_post(WEBHOOK_PATH, handle_webhook)

# Health check endpoint
app.router.add_get("/health", lambda _: web.Response(text="OK"))

if __name__ == "__main__":
    logger.info(f"Starting bot on port {PORT}")
    logger.info(f"Webhook URL: {WEBHOOK_URL}")
    logger.info(f"Mini App URL: {WEB_APP_URL}")

    start_webhook(
        dispatcher=dp,
        webhook_path=WEBHOOK_PATH,
        on_startup=on_startup,
        on_shutdown=on_shutdown,
        host="0.0.0.0",
        port=PORT,
    )