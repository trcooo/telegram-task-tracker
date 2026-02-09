# Telegram Planner MVP (Mini App + Bot + Postgres + Railway)

Это готовый MVP:
- Telegram Bot реагирует на `/start` и присылает кнопку открытия Mini App
- Mini App: Schedule (таймлайн дня) + Inbox (задачи)
- Drag&Drop: перетаскивай задачу в слот времени → создаётся time-block
- CRUD задач, CRUD событий, проекты с цветами (минимально)
- Backend: FastAPI + SQLAlchemy
- DB: PostgreSQL (Railway)

## 1) Локальный запуск

### Установи зависимости
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Создай `.env` (можно из `.env.example`)
```bash
cp .env.example .env
```

### Запусти
```bash
uvicorn app.main:app --reload
```

Открой `http://localhost:8000` (но авторизация WebApp работает только внутри Telegram).

## 2) Создание бота и Mini App в Telegram

1. Открой @BotFather → `/newbot` → получи **BOT_TOKEN**
2. В настройках бота:
   - включи **Bot Menu Button / Web App** (или просто используй кнопку из `/start`)
   - Web App URL позже будет URL Railway (например `https://xxx.up.railway.app/`)

## 3) Railway + Postgres (пошагово)

### A) Создай проект
1. Зайди в Railway → New Project → **Deploy from GitHub** (или Upload)
2. Добавь репозиторий с этим проектом

### B) Подключи Postgres
1. В Railway → Add → **Database → PostgreSQL**
2. Railway автоматически создаст переменную `DATABASE_URL` (или даст её в разделе Variables)

### C) Переменные окружения
В сервисе приложения добавь:
- `BOT_TOKEN` — токен бота
- `APP_BASE_URL` — публичный URL Railway сервиса (без слеша в конце)
- `JWT_SECRET` — длинная случайная строка (можно сгенерировать)
- `JWT_EXPIRES_MIN` — можно оставить `43200`

> `DATABASE_URL` обычно уже есть от Postgres-плагина.

### D) Старт команда
Railway часто сам определит. Если нужно — укажи:
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Также есть `Procfile`:
`web: uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`

## 4) Webhook для Telegram

После деплоя на Railway:
1. У тебя будет URL вида `https://your-app.up.railway.app`
2. Установи webhook (в браузере):
```bash
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://your-app.up.railway.app/telegram/webhook
```
3. Проверить:
```bash
https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
```

Теперь `/start` будет работать.

## 5) Как пользоваться MVP
- Напиши боту `/start` → нажми кнопку “Открыть планировщик”
- Добавь задачу через `+` (по умолчанию создаётся task в Inbox)
- Перетащи задачу на нужное время в таймлайне → появится блок
- События добавляются через `+` → вкладка “Событие” в модалке

## 6) Примечания
- Таблицы создаются автоматически при старте (MVP). Для продакшена лучше Alembic миграции.
- Сейчас week/month экран — заглушка (таб-навигация есть), ядро MVP — Schedule + Inbox.


## Ошибка libpq.so.5 на Railway (Python 3.13)
Если видишь `ImportError: libpq.so.5`, значит `psycopg2` поставился из исходников и не нашёл системный libpq.
В этом фикс-пакете используется `psycopg[binary]` (psycopg v3), а `DATABASE_URL` автоматически переводится в `postgresql+psycopg://`.


## Ошибка `integer out of range` при входе через Telegram
Telegram `user.id` может быть больше 2^31-1. Поэтому в БД нужно хранить `users.telegram_id` как BIGINT.
В этом пакете модель уже исправлена и при старте приложение пытается выполнить миграцию:
`ALTER TABLE users ALTER COLUMN telegram_id TYPE BIGINT`.
Если миграция не прошла, можно сбросить таблицы (см. ниже).
