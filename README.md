# Telegram Mini App: Планировщик дня (Python + Vanilla JS)

Ты просил переписать на: **py, js, html, css, json** — тут:
- Backend: **Python (FastAPI)** + SQLAlchemy + JWT + Telegram WebApp auth
- Frontend: **HTML + CSS + JS** (без Vite/React/Node build)
- Конфиг: `frontend/config.json`

## 1) Env (Railway / локально)
Скопируй `.env.example` → `.env` и заполни:
- `DATABASE_URL` (Postgres в Railway)
- `BOT_TOKEN` (бот)
- `JWT_SECRET` (строка 32+ символов)
- (опционально) `APP_URL` или `WEBAPP_DEEPLINK`

## 2) Локальный запуск
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3000
```
Открой: http://localhost:3000

## 3) Railway
- `railway.toml` уже настроен: Nixpacks + `uvicorn ...`
- Добавь переменные окружения из `.env.example`
- Убедись, что подключён Postgres и его URL прописан в `DATABASE_URL`

## Важно про напоминания
Для того чтобы бот мог писать пользователю, пользователь должен хотя бы раз нажать `/start` у бота.
Напоминания отправляются фоном каждые 60 секунд (APScheduler).

## Почему у тебя падал билд в Node
Ошибка была из-за `postcss.config.js` при `"type":"module"`.
В этой версии Node build вообще не нужен.


## Railway: если healthcheck не проходит
- Dockerfile запускает uvicorn на `${PORT:-3000}` (Railway требует слушать именно PORT)
- `/health` не зависит от базы данных (для DB проверки есть `/health/db`)
- `DATABASE_URL` формата `postgresql://...` автоматически нормализуется под psycopg3


## Railway: если healthcheck всё равно падает
1) Открой **Logs** у сервиса — если приложение не стартует, там будет traceback.
2) Проверь переменные окружения (Variables):
- `DATABASE_URL` (Postgres plugin)
- `BOT_TOKEN`
- `JWT_SECRET`
3) Для быстрой диагностики можно дернуть:
- `/health` (должен отвечать всегда)
- `/health/info` (показывает, какие env заданы)

В этой версии приложение НЕ падает при отсутствии env (чтобы пройти healthcheck), но без `BOT_TOKEN` и `DATABASE_URL` функционал будет ограничен.
