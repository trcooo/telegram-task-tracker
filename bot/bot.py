import os
import logging
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.executor import start_webhook
from aiogram.contrib.middlewares.logging import LoggingMiddleware
from aiohttp import web
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from backend.models import Base, Task
import sys

# ----------------- Настройки -----------------
API_TOKEN = os.getenv("BOT_TOKEN")
if not API_TOKEN:
    print("❌ ОШИБКА: BOT_TOKEN не найден в переменных окружения!")
    print("Доступные переменные окружения:", list(os.environ.keys()))
    sys.exit(1)

WEB_APP_URL = os.getenv("WEB_APP_URL", "https://telegram-task-tracker-production.up.railway.app")
WEBHOOK_HOST = os.getenv("WEBHOOK_HOST", WEB_APP_URL)
WEBHOOK_PATH = f"/webhook/{API_TOKEN}"
WEBHOOK_URL = f"{WEBHOOK_HOST}{WEBHOOK_PATH}"

PORT = int(os.environ.get("PORT", 8000))

# ----------------- Логирование -----------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# ----------------- Бот и диспетчер -----------------
bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)
dp.middleware.setup(LoggingMiddleware())

# ----------------- База данных -----------------
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///backend/tasks.db")
logger.info(f"Используется БД: {DATABASE_URL}")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)


# ----------------- Клавиатура -----------------
def get_main_keyboard():
    web_app = WebAppInfo(url=WEB_APP_URL)
    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        InlineKeyboardButton("📱 Открыть Task Tracker", web_app=web_app),
        InlineKeyboardButton("📋 Мои задачи", callback_data="my_tasks")
    )
    keyboard.add(
        InlineKeyboardButton("➕ Быстрая задача", callback_data="quick_task"),
        InlineKeyboardButton("❓ Помощь", callback_data="help")
    )
    return keyboard


def get_back_keyboard():
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="back_to_main"))
    return keyboard


# ----------------- Обработчики -----------------
@dp.message_handler(commands=["start", "help"])
async def start_command(message: types.Message):
    logger.info(f"User {message.from_user.id} ({message.from_user.username}) started the bot")

    welcome_text = (
        "👋 *Добро пожаловать в Task Tracker Bot!*\n\n"
        "Я помогу тебе управлять задачами прямо в Telegram.\n\n"
        "✨ *Основные возможности:*\n"
        "• 📱 Удобный интерфейс Mini App\n"
        "• 📋 Создание и управление задачами\n"
        "• ⏰ Напоминания о дедлайнах\n"
        "• 📊 Статистика продуктивности\n\n"
        "*Команды:*\n"
        "/tasks - Показать активные задачи\n"
        "/add - Быстро добавить задачу\n"
        "/start - Показать это сообщение\n\n"
        "Нажми кнопку ниже, чтобы открыть Task Tracker 👇"
    )

    await message.answer(
        welcome_text,
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown",
        disable_web_page_preview=True
    )


@dp.message_handler(commands=["tasks", "list"])
async def tasks_command(message: types.Message):
    logger.info(f"User {message.from_user.id} requested tasks list")

    session = SessionLocal()
    try:
        tasks = session.query(Task).filter(
            Task.user_id == message.from_user.id,
            Task.completed == False
        ).order_by(Task.due_date).limit(10).all()

        if not tasks:
            response_text = (
                "🎉 *Поздравляю!*\n\n"
                "У тебя нет активных задач.\n"
                "Отличный момент добавить новые цели!\n\n"
                "Нажми на кнопку ниже, чтобы начать ⬇️"
            )
            reply_markup = get_main_keyboard()
        else:
            response_text = "📋 *Твои активные задачи:*\n\n"
            for i, task in enumerate(tasks, 1):
                status = "✅" if task.completed else "⏳"
                due_text = ""
                if task.due_date:
                    from datetime import datetime
                    now = datetime.utcnow()
                    if task.due_date > now:
                        from datetime import timedelta
                        diff = task.due_date - now
                        if diff.days > 0:
                            due_text = f" ({diff.days}д осталось)"
                        elif diff.seconds > 3600:
                            due_text = f" ({diff.seconds // 3600}ч осталось)"
                        else:
                            due_text = " (Меньше часа!)"

                response_text += f"{i}. {status} *{task.title}*{due_text}\n"
                if task.description:
                    response_text += f"   _{task.description[:50]}..._\n"

            response_text += "\n📱 *Открой Mini App для полного контроля!*"
            reply_markup = get_main_keyboard()

    except Exception as e:
        logger.error(f"Error fetching tasks: {e}")
        response_text = "❌ Произошла ошибка при загрузке задач. Попробуйте позже."
        reply_markup = get_main_keyboard()
    finally:
        session.close()

    await message.answer(response_text, reply_markup=reply_markup, parse_mode="Markdown")


@dp.message_handler(commands=["add"])
async def quick_add_task(message: types.Message):
    task_text = message.get_args()
    if not task_text:
        await message.answer(
            "📝 *Быстрое добавление задачи*\n\n"
            "Используй команду так:\n"
            "`/add Название задачи`\n\n"
            "*Пример:*\n"
            "`/add Позвонить клиенту завтра`\n\n"
            "Для добавления деталей используй Mini App 👇",
            reply_markup=get_main_keyboard(),
            parse_mode="Markdown"
        )
        return

    session = SessionLocal()
    try:
        task = Task(
            user_id=message.from_user.id,
            title=task_text[:100],
            description=task_text[100:300] if len(task_text) > 100 else None,
            completed=False
        )
        session.add(task)
        session.commit()

        logger.info(f"Task added for user {message.from_user.id}: {task.title[:50]}...")

        await message.answer(
            f"✅ *Задача добавлена!*\n\n"
            f"*{task.title[:50]}...*\n\n"
            "📱 Открой Mini App, чтобы:\n"
            "• Добавить дату и время\n"
            "• Установить приоритет\n"
            "• Добавить описание\n"
            "• Получить напоминания",
            reply_markup=get_main_keyboard(),
            parse_mode="Markdown"
        )
    except Exception as e:
        logger.error(f"Error adding task: {e}")
        await message.answer(
            "❌ Не удалось добавить задачу.\n"
            "Попробуйте еще раз или используйте Mini App.",
            reply_markup=get_main_keyboard()
        )
    finally:
        session.close()


@dp.callback_query_handler(text="my_tasks")
async def callback_my_tasks(callback_query: types.CallbackQuery):
    await tasks_command(callback_query.message)
    await callback_query.answer()


@dp.callback_query_handler(text="quick_task")
async def callback_quick_task(callback_query: types.CallbackQuery):
    await callback_query.message.answer(
        "💡 *Быстрое добавление задачи*\n\n"
        "Просто отправь мне текст задачи, и я ее добавлю!\n\n"
        "*Пример:*\n"
        "Сделать презентацию к пятнице\n"
        "Купить продукты после работы\n"
        "Записаться к врачу\n\n"
        "Или используй команду:\n"
        "`/add <текст задачи>`",
        parse_mode="Markdown",
        reply_markup=get_back_keyboard()
    )
    await callback_query.answer()


@dp.callback_query_handler(text="help")
async def callback_help(callback_query: types.CallbackQuery):
    await start_command(callback_query.message)
    await callback_query.answer()


@dp.callback_query_handler(text="back_to_main")
async def callback_back(callback_query: types.CallbackQuery):
    await start_command(callback_query.message)
    await callback_query.answer()


@dp.message_handler(content_types=types.ContentType.TEXT)
async def handle_text(message: types.Message):
    if message.text.startswith('/'):
        return

    # Если сообщение не команда, предлагаем добавить как задачу
    if len(message.text) > 3:
        await message.answer(
            f"💡 Хочешь добавить это как задачу?\n\n"
            f"*{message.text[:50]}...*\n\n"
            f"Используй команду:\n"
            f"`/add {message.text[:30]}`\n\n"
            f"Или открой Mini App для полного контроля 👇",
            parse_mode="Markdown",
            reply_markup=get_main_keyboard()
        )


# ----------------- Webhook -----------------
async def on_startup(dp):
    logger.info("Бот запускается...")

    # Удаляем старый вебхук
    await bot.delete_webhook()
    await asyncio.sleep(1)

    # Устанавливаем новый вебхук
    webhook_info = await bot.get_webhook_info()
    logger.info(f"Текущий вебхук: {webhook_info.url}")

    await bot.set_webhook(
        url=WEBHOOK_URL,
        certificate=None,
        max_connections=100,
        allowed_updates=["message", "callback_query"]
    )

    logger.info(f"✅ Вебхук установлен: {WEBHOOK_URL}")
    logger.info(f"🌐 Mini App URL: {WEB_APP_URL}")
    logger.info(f"🚀 Бот запущен на порту {PORT}")

    # Уведомление администратору
    try:
        admin_id = os.getenv("ADMIN_ID")
        if admin_id:
            await bot.send_message(
                admin_id,
                f"🤖 Бот запущен!\n"
                f"Время: {asyncio.get_event_loop().time()}\n"
                f"Webhook: {WEBHOOK_URL}\n"
                f"Mini App: {WEB_APP_URL}"
            )
    except Exception as e:
        logger.warning(f"Не удалось уведомить администратора: {e}")


async def on_shutdown(dp):
    logger.info("Бот останавливается...")

    # Удаляем вебхук
    await bot.delete_webhook()
    logger.info("Вебхук удален")

    # Закрываем сессию бота
    await bot.session.close()
    logger.info("Сессия бота закрыта")


# ----------------- FastAPI для Mini App -----------------
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import json

# Создаем FastAPI приложение
fastapi_app = FastAPI(title="Task Tracker API")

# CORS для Mini App
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Монтируем статические файлы
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
if os.path.exists(WEB_DIR):
    fastapi_app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@fastapi_app.get("/")
async def serve_index():
    if os.path.exists(WEB_DIR):
        return FileResponse(os.path.join(WEB_DIR, "index.html"))
    return {"message": "Task Tracker API is running"}


@fastapi_app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "task-tracker"}


# API endpoints
@fastapi_app.get("/api/tasks/{user_id}")
async def get_tasks_api(user_id: int):
    session = SessionLocal()
    try:
        tasks = session.query(Task).filter(Task.user_id == user_id).all()
        return {
            "success": True,
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "description": t.description,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "completed": t.completed,
                    "created_at": t.created_at.isoformat() if t.created_at else None
                }
                for t in tasks
            ]
        }
    except Exception as e:
        logger.error(f"API Error getting tasks: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        session.close()


@fastapi_app.post("/api/tasks")
async def create_task_api(request: Request):
    try:
        data = await request.json()
        session = SessionLocal()

        task = Task(
            user_id=data.get("user_id"),
            title=data.get("title", ""),
            description=data.get("description"),
            completed=False
        )

        session.add(task)
        session.commit()
        session.refresh(task)

        return {
            "success": True,
            "task": {
                "id": task.id,
                "title": task.title
            }
        }
    except Exception as e:
        logger.error(f"API Error creating task: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        session.close()


# ----------------- Запуск приложения -----------------
async def start_bot():
    from aiogram import executor

    # Запускаем бота с вебхуками
    await executor.start_webhook(
        dispatcher=dp,
        webhook_path=WEBHOOK_PATH,
        on_startup=on_startup,
        on_shutdown=on_shutdown,
        skip_updates=True,
        host="0.0.0.0",
        port=PORT,
    )


if __name__ == "__main__":
    # Проверяем наличие всех необходимых переменных
    required_vars = ["BOT_TOKEN"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]

    if missing_vars:
        print(f"❌ Отсутствуют переменные окружения: {', '.join(missing_vars)}")
        sys.exit(1)

    print("=" * 50)
    print("🚀 Запуск Task Tracker Bot")
    print(f"📱 Mini App URL: {WEB_APP_URL}")
    print(f"🌐 Webhook URL: {WEBHOOK_URL}")
    print(f"⚙️ PORT: {PORT}")
    print("=" * 50)

    # Запускаем event loop
    asyncio.run(start_bot())