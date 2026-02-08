# TG Planner Mini App (One Service)
Backend: Python (FastAPI)
Frontend: Vanilla JS + HTML + CSS (glass UI)
Deploy: Railway (Nixpacks), один сервис

## Railway (с нуля)
1) Railway → New Project → Deploy from GitHub
2) New → Database → PostgreSQL
3) Service → Variables:
- DATABASE_URL (из Postgres)
- BOT_TOKEN
- JWT_SECRET (32+ символов)
- APP_URL (домен сервиса, желательно)

4) Settings:
- Start Command (если нужно):
  uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips=*
- Healthcheck Path: /health
5) Networking → Generate Domain

## Telegram
В BotFather укажи WebApp URL = APP_URL.
Пользователь должен нажать /start у бота, иначе reminders не придут.

## Локальный запуск
pip install -r requirements.txt
export BOT_TOKEN="..."
export JWT_SECRET="..."
export DATABASE_URL="sqlite:///./data.db"
uvicorn app.main:app --reload --port 3000
