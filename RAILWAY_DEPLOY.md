# Railway: деплой и что исправлено

## Что было сломано
1) **Добавление задач не работало**: фронтенд не отправлял заголовки идентификации пользователя, а backend требовал `X-Tg-Init-Data` или `X-User-Key`, поэтому `POST /api/tasks` отвечал 401.
2) **Напоминания не включались**: UI отправлял поле `remind`, но backend не сохранял его в `reminder_enabled`.
3) **Матрица приоритетов** отсутствовала как экран (вместо неё был Overdue-экран).

## Что сделано в этой версии
- Frontend:
  - Автоматически добавляет `X-Tg-Init-Data: Telegram.WebApp.initData` во все запросы, когда приложение открыто из Telegram.
  - Для локального/браузерного режима (не Telegram) генерирует и хранит `X-User-Key` в `localStorage`.
  - Отправляет `reminder_enabled` (и оставляет `remind` как legacy-алиас).
  - Добавлен экран **Priority Matrix** (Eisenhower‑логика).

- Backend:
  - `TaskCreate/TaskUpdate` теперь принимают `reminder_enabled` (и `remind` как алиас).
  - `TaskOut` возвращает `reminder_enabled`, чтобы UI корректно показывал состояние.

## Переменные окружения Railway
**Обязательно:**
- `DATABASE_URL` — лучше Railway Postgres (иначе SQLite будет сбрасываться при перезапуске контейнера).
- `BOT_TOKEN` — токен Telegram бота (если хотите напоминания через бота).
- `WEB_APP_URL` — публичный URL вашего Railway веб-сервиса (для кнопки открытия Mini App).

## Про напоминания (бот)
Сейчас Railway запускает только веб-процесс:

- `web: uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Чтобы работали напоминания, нужен **второй процесс** (worker) с ботом:

- команда запуска: `python -m app.bot`

### Как включить worker на Railway
В Railway обычно проще сделать **второй сервис** в том же проекте:
1) Создайте новый Service → Deploy from the same repo.
2) В Settings этого сервиса задайте Start Command: `python -m app.bot`.
3) Проставьте ему те же переменные окружения (минимум: `DATABASE_URL`, `BOT_TOKEN`, `WEB_APP_URL`).

> Важно: напоминания отправляются на `user_id`, который для Telegram должен быть **реальным Telegram ID**.
> Поэтому Mini App должен ходить в API с `X-Tg-Init-Data` (это уже исправлено).

## Быстрая проверка
- Откройте Mini App в Telegram → нажмите «+» → создайте задачу.
- В Network (DevTools) проверьте, что запросы к `/api/tasks` содержат `X-Tg-Init-Data`.
- Если задача с дедлайном и включённым напоминанием — worker должен отправить сообщение за 15 минут.
