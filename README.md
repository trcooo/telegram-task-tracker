# Telegram Mini App: Планировщик дня

## Что внутри
- Backend: Express + Prisma (PostgreSQL) + Telegram WebApp auth + cron отправка напоминаний через Bot API
- Frontend: React + Vite + Tailwind, UI в стиле рефа (glass cards)

## Локальный запуск
1) Env:
- скопируй `.env.example` → `.env`
- заполни `DATABASE_URL`, `BOT_TOKEN`, `JWT_SECRET`

2) Миграции + запуск:
```bash
npm install
npm -w apps/api run db:migrate
npm -w apps/api run dev
npm -w apps/web run dev
```

## Railway
- Добавь переменные окружения из `.env.example`
- Railway будет использовать `railway.toml`
- `start:railway` применит миграции и поднимет сервер
