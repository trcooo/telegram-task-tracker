import os
import logging
import asyncio
from datetime import datetime, timedelta
from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton
from aiogram.utils import executor
from aiogram.contrib.middlewares.logging import LoggingMiddleware
from aiogram.dispatcher.filters import Command
import sys

# Добавляем путь для импортов
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Импорт БД для напоминаний
from database import SessionLocal
from models import Task

# Настройки
API_TOKEN = os.getenv("BOT_TOKEN")
if not API_TOKEN:
    print("❌ ОШИБКА: BOT_TOKEN не найден в переменных окружения!")
    print("Доступные переменные:", list(os.environ.keys()))
    sys.exit(1)

WEB_APP_URL = os.getenv("WEB_APP_URL", "https://your-project.railway.app")
ADMIN_ID = os.getenv("ADMIN_ID")

# Логирование
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Бот и диспетчер
bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)
dp.middleware.setup(LoggingMiddleware())


# ==================== КЛАВИАТУРЫ ====================
def get_main_keyboard():
    """Главная клавиатура с Mini App"""
    web_app = WebAppInfo(url=WEB_APP_URL)

    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        InlineKeyboardButton("📱 Открыть Task Tracker", web_app=web_app),
        InlineKeyboardButton("📋 Мои задачи", callback_data="my_tasks")
    )
    keyboard.add(
        InlineKeyboardButton("➕ Быстрая задача", callback_data="quick_task"),
        InlineKeyboardButton("📊 Статистика", callback_data="stats")
    )
    keyboard.add(
        InlineKeyboardButton("⚙️ Настройки", callback_data="settings"),
        InlineKeyboardButton("❓ Помощь", callback_data="help")
    )

    return keyboard


def get_tasks_keyboard():
    """Клавиатура для управления задачами"""
    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        InlineKeyboardButton("📅 На сегодня", callback_data="tasks_today"),
        InlineKeyboardButton("⏰ Срочные", callback_data="tasks_urgent")
    )
    keyboard.add(
        InlineKeyboardButton("✅ Завершенные", callback_data="tasks_completed"),
        InlineKeyboardButton("➕ Добавить", callback_data="add_task")
    )
    keyboard.add(
        InlineKeyboardButton("🔙 Назад", callback_data="back_to_main")
    )

    return keyboard


def get_quick_task_keyboard():
    """Быстрое добавление задач"""
    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        InlineKeyboardButton("🛒 Купить продукты", callback_data="quick_groceries"),
        InlineKeyboardButton("📞 Позвонить", callback_data="quick_call")
    )
    keyboard.add(
        InlineKeyboardButton("💼 Работа", callback_data="quick_work"),
        InlineKeyboardButton("🏠 Дом", callback_data="quick_home")
    )
    keyboard.add(
        InlineKeyboardButton("✏️ Своя задача", callback_data="custom_task"),
        InlineKeyboardButton("🔙 Назад", callback_data="back_to_main")
    )

    return keyboard


# ==================== ОБРАБОТЧИКИ КОМАНД ====================
@dp.message_handler(commands=["start"])
async def start_command(message: types.Message):
    """Обработчик команды /start"""
    user = message.from_user
    logger.info(f"👤 Пользователь {user.id} ({user.username}) начал бота")

    welcome_text = f"""
👋 *Привет, {user.first_name or 'друг'}!*

Я — *TaskFlow Tracker*, твой помощник в управлении задачами.

✨ *Что я умею:*
• 📱 *Удобный Mini App* — полный контроль над задачами
• 📋 *Быстрое добавление* — создавай задачи в один клик
• ⏰ *Напоминания* — не пропусти дедлайн
• 📊 *Статистика* — следи за прогрессом

🎯 *Основные команды:*
`/tasks` — показать задачи
`/add` — быстро добавить задачу
`/today` — задачи на сегодня
`/stats` — статистика

Нажми кнопку ниже, чтобы открыть Task Tracker 👇
    """

    await message.answer(
        welcome_text,
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown",
        disable_web_page_preview=True
    )

    # Отправляем приветственное сообщение в Mini App стиле
    await message.answer(
        "🚀 *Готов к работе!*\n\n"
        "Используй кнопки ниже для быстрого доступа:",
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown"
    )


@dp.message_handler(commands=["help", "помощь"])
async def help_command(message: types.Message):
    """Обработчик команды /help"""
    help_text = """
ℹ️ *Помощь по командам TaskFlow Tracker*

*Основные команды:*
`/start` — начать работу с ботом
`/tasks` — показать активные задачи
`/today` — задачи на сегодня
`/add` — быстро добавить задачу
`/stats` — статистика продуктивности
`/help` — эта справка

*Быстрые действия:*
📱 *Открыть Task Tracker* — полный интерфейс
📋 *Мои задачи* — список активных задач
➕ *Быстрая задача* — шаблоны задач
📊 *Статистика* — ваша продуктивность

*Советы:*
• Используй Mini App для полного контроля
• Добавляй даты к важным задачам
• Отмечай выполненные задачи для статистики

Есть вопросы? Пиши @ваш_username
    """

    await message.answer(
        help_text,
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown",
        disable_web_page_preview=True
    )


@dp.message_handler(commands=["tasks", "задачи"])
async def tasks_command(message: types.Message):
    """Обработчик команды /tasks"""
    user = message.from_user
    logger.info(f"👤 Пользователь {user.id} запросил задачи")

    # Временный ответ (позже подключим БД)
    tasks_text = """
📋 *Твои активные задачи:*

1. 🛒 *Купить продукты* — сегодня 18:00
2. 📞 *Позвонить клиенту* — завтра 11:00
3. 💼 *Сделать отчет* — 2 дня осталось
4. 🏋️ *Сходить в зал* — регулярно

*Всего задач:* 4
*Выполнено:* 0
*Активных:* 4

📱 Открой *Mini App* для полного управления задачами!
    """

    await message.answer(
        tasks_text,
        reply_markup=get_tasks_keyboard(),
        parse_mode="Markdown"
    )


@dp.message_handler(commands=["today", "сегодня"])
async def today_command(message: types.Message):
    """Обработчик команды /today"""
    today_text = """
📅 *Задачи на сегодня:*

1. 🛒 *Купить продукты* — 18:00
   _Молоко, хлеб, фрукты_

2. 💼 *Совещание в 14:00*
   _Подготовить презентацию_

3. 🏋️ *Тренировка* — 19:00
   _Спина и бицепс_

⏰ *Напоминание:* Начинай с самых важных задач!
    """

    await message.answer(
        today_text,
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown"
    )


@dp.message_handler(commands=["add", "добавить"])
async def add_command(message: types.Message):
    """Обработчик команды /add"""
    args = message.get_args()

    if args:
        # Если есть текст задачи
        task_text = f"""
✅ *Задача добавлена!*

*"{args}"*

Теперь эта задача в твоем списке.
Открой Mini App чтобы:
• Добавить дату и время
• Установить приоритет
• Добавить описание
        """

        await message.answer(
            task_text,
            reply_markup=get_main_keyboard(),
            parse_mode="Markdown"
        )
    else:
        # Если нет текста, показываем клавиатуру
        await message.answer(
            "➕ *Быстрое добавление задачи*\n\n"
            "Выбери категорию или введи свою задачу:",
            reply_markup=get_quick_task_keyboard(),
            parse_mode="Markdown"
        )


@dp.message_handler(commands=["stats", "статистика"])
async def stats_command(message: types.Message):
    """Обработчик команды /stats"""
    stats_text = """
📊 *Твоя статистика:*

*За все время:*
• 📋 Всего задач: 15
• ✅ Выполнено: 8 (53%)
• ⏳ В работе: 7

*За неделю:*
• 🎯 Добавлено: 5 задач
• 🏆 Выполнено: 3 задачи
• 📈 Продуктивность: 60%

*Рекорды:*
• 🚀 Максимум за день: 5 задач
• 📅 Самый продуктивный день: Пятница

🎯 *Цель на неделю:* 10 выполненных задач
    """

    await message.answer(
        stats_text,
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown"
    )


# ==================== ОБРАБОТЧИКИ CALLBACK ====================
@dp.callback_query_handler(text="my_tasks")
async def callback_my_tasks(callback_query: types.CallbackQuery):
    """Callback для кнопки 'Мои задачи'"""
    await tasks_command(callback_query.message)
    await callback_query.answer()


@dp.callback_query_handler(text="quick_task")
async def callback_quick_task(callback_query: types.CallbackQuery):
    """Callback для кнопки 'Быстрая задача'"""
    await callback_query.message.answer(
        "➕ *Быстрое добавление задачи*\n\n"
        "Выбери категорию или напиши свою задачу:",
        reply_markup=get_quick_task_keyboard(),
        parse_mode="Markdown"
    )
    await callback_query.answer()


@dp.callback_query_handler(text="stats")
async def callback_stats(callback_query: types.CallbackQuery):
    """Callback для кнопки 'Статистика'"""
    await stats_command(callback_query.message)
    await callback_query.answer()


@dp.callback_query_handler(text="settings")
async def callback_settings(callback_query: types.CallbackQuery):
    """Callback для кнопки 'Настройки'"""
    await callback_query.message.answer(
        "⚙️ *Настройки TaskFlow Tracker*\n\n"
        "*Уведомления:* 🔔 Вкл\n"
        "*Темная тема:* 🌙 Выкл\n"
        "*Язык:* 🇷🇺 Русский\n"
        "*Часовой пояс:* UTC+3\n\n"
        "Изменить настройки можно в Mini App 📱",
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown"
    )
    await callback_query.answer()


@dp.callback_query_handler(text="help")
async def callback_help(callback_query: types.CallbackQuery):
    """Callback для кнопки 'Помощь'"""
    await help_command(callback_query.message)
    await callback_query.answer()


@dp.callback_query_handler(text="back_to_main")
async def callback_back(callback_query: types.CallbackQuery):
    """Callback для кнопки 'Назад'"""
    await start_command(callback_query.message)
    await callback_query.answer()


# Быстрые задачи
@dp.callback_query_handler(text="quick_groceries")
async def callback_quick_groceries(callback_query: types.CallbackQuery):
    """Быстрая задача: Купить продукты"""
    await callback_query.message.answer(
        "✅ *Задача добавлена!*\n\n"
        "🛒 *Купить продукты*\n\n"
        "Открой Mini App чтобы добавить список покупок и время!",
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown"
    )
    await callback_query.answer("Задача 'Купить продукты' добавлена!")


@dp.callback_query_handler(text="quick_call")
async def callback_quick_call(callback_query: types.CallbackQuery):
    """Быстрая задача: Позвонить"""
    await callback_query.message.answer(
        "✅ *Задача добавлена!*\n\n"
        "📞 *Позвонить*\n\n"
        "Кому нужно позвонить? Добавь детали в Mini App!",
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown"
    )
    await callback_query.answer("Задача 'Позвонить' добавлена!")


@dp.callback_query_handler(text="custom_task")
async def callback_custom_task(callback_query: types.CallbackQuery):
    """Пользовательская задача"""
    await callback_query.message.answer(
        "✏️ *Своя задача*\n\n"
        "Напиши мне текст задачи, и я её добавлю!\n\n"
        "*Пример:*\n"
        "Записаться к врачу на следующей неделе\n"
        "Сделать презентацию к пятнице\n"
        "Купить подарок на день рождения\n\n"
        "Или используй команду:\n"
        "`/add <текст задачи>`",
        parse_mode="Markdown",
        reply_markup=get_main_keyboard()
    )
    await callback_query.answer()


# ==================== ОБРАБОТЧИКИ ТЕКСТА ====================
@dp.message_handler(content_types=types.ContentType.TEXT)
async def handle_text(message: types.Message):
    """Обработчик текстовых сообщений"""
    text = message.text.strip()

    # Игнорируем команды
    if text.startswith('/'):
        return

    # Если сообщение похоже на задачу
    if len(text) > 3 and len(text) < 200:
        await message.answer(
            f"💡 *Хочешь добавить это как задачу?*\n\n"
            f"*{text}*\n\n"
            f"Используй команду:\n"
            f"`/add {text}`\n\n"
            f"Или открой *Mini App* для полного контроля 👇",
            parse_mode="Markdown",
            reply_markup=get_main_keyboard()
        )
    else:
        # Общий ответ
        await message.answer(
            "🤖 *TaskFlow Tracker*\n\n"
            "Используй команды или кнопки для управления задачами.\n\n"
            "📝 *Доступные команды:*\n"
            "`/start` — начать работу\n"
            "`/tasks` — мои задачи\n"
            "`/add` — добавить задачу\n"
            "`/help` — помощь",
            parse_mode="Markdown",
            reply_markup=get_main_keyboard()
        )


# 
# ==================== НАПОМИНАНИЯ ====================
async def reminders_loop():
    """Каждые 30 секунд проверяет задачи, которым осталось ~15 минут, и шлёт уведомление."""
    while True:
        try:
            now = datetime.utcnow()
            frm = now + timedelta(minutes=15)
            to = now + timedelta(minutes=16)

            db = SessionLocal()
            try:
                tasks_to_remind = (
                    db.query(Task)
                    .filter(Task.completed == False)
                    .filter(Task.due_at.isnot(None))
                    .filter(Task.reminder_sent == False)
                    .filter(Task.due_at >= frm)
                    .filter(Task.due_at < to)
                    .all()
                )

                for t in tasks_to_remind:
                    try:
                        await bot.send_message(
                            t.user_id,
                            f"⏰ Напоминание: через 15 минут задача:\n\n*{t.title}*",
                            parse_mode="Markdown",
                            reply_markup=get_main_keyboard()
                        )
                        t.reminder_sent = True
                    except Exception as e:
                        logger.error(f"❌ Не удалось отправить напоминание пользователю {t.user_id}: {e}")

                db.commit()
            finally:
                db.close()

        except Exception as e:
            logger.error(f"❌ Ошибка reminders_loop: {e}")

        await asyncio.sleep(30)

==================== ЗАПУСК БОТА ====================
async def on_startup(dp):
    """Действия при запуске бота"""
    logger.info("🤖 Запуск Telegram бота...")

    # Запускаем цикл напоминаний
    asyncio.create_task(reminders_loop())

    # Отправляем сообщение администратору
    if ADMIN_ID:
        try:
            await bot.send_message(
                ADMIN_ID,
                f"✅ *Бот запущен!*\n\n"
                f"Время: {asyncio.get_event_loop().time()}\n"
                f"Mini App: {WEB_APP_URL}\n"
                f"Бот готов к работе!",
                parse_mode="Markdown"
            )
            logger.info(f"✅ Уведомление отправлено администратору {ADMIN_ID}")
        except Exception as e:
            logger.error(f"❌ Не удалось отправить уведомление: {e}")

    logger.info("✅ Бот успешно запущен!")


async def on_shutdown(dp):
    """Действия при остановке бота"""
    logger.info("🛑 Остановка Telegram бота...")
    await bot.session.close()
    logger.info("✅ Бот остановлен")


if __name__ == "__main__":
    # Запуск бота
    logger.info(f"🌐 Mini App URL: {WEB_APP_URL}")
    logger.info(f"🤖 Запуск бота с токеном: {API_TOKEN[:10]}...")

    executor.start_polling(
        dp,
        skip_updates=True,
        on_startup=on_startup,
        on_shutdown=on_shutdown
    )