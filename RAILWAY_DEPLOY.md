# Deploy to Railway (Python single-service)

## 1) Create a new Railway project
- Deploy from GitHub or upload this repo.

## 2) Add environment variables (Service → Variables)
- `BOT_TOKEN` – your Telegram bot token
- `JWT_SECRET` – any long random string
- `DATABASE_URL` – Railway Postgres connection string (SQLAlchemy format)
  - Example: `postgresql+psycopg://user:pass@host:5432/db`

> For quick testing you can omit `DATABASE_URL` and the app will use SQLite file `./data/app.db`.

## 3) Start command
Railway will auto-detect Python. If you need explicit:
- Start: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`

## 4) Telegram Mini App
Set your bot web app URL to the Railway URL (HTTPS).
