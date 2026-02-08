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
Recommended: **consider using the provided Dockerfile** and **do not override** the start command in Railway.

If you *do* set a custom start command, make sure it's executed via a shell (otherwise Railway may pass `$PORT` as a literal string):

- Start: `sh -c "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080}"`

### Common pitfalls
- If logs show `python: can't open file '/app/bot/bot.py'` or `npm run start -w apps/api`, you're deploying/starting an old service. Remove the old Node/Bot services and deploy **only this Python repo**.

## 4) Telegram Mini App
Set your bot web app URL to the Railway URL (HTTPS).

## If you see: "Invalid value for --port: '$PORT'"
Railway is using a *Start Command override* instead of the Dockerfile CMD.

Fix:
1) Railway → your service → Settings → Deploy / Start Command → **Clear it** (leave empty)
2) Ensure builder is Dockerfile (not Nixpacks)
3) Redeploy

If you *must* set Start Command manually, use:

sh -c "./start.sh"

(or)

sh -c "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080}"

## If you see: "python: can't open file '/app/bot/bot.py'"
That means you're still deploying an old service / old Start Command from the previous Node project.
Delete/disable that service and deploy this repo as a fresh service.
