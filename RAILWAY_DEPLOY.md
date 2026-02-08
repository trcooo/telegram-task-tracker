# Railway deploy (API + Web + Worker)

This repo is a **monorepo**:
- `apps/api` — Express + Prisma + BullMQ
- `apps/web` — Telegram Mini App (React/Vite) built and served as static by the API

## 1) Required env vars

### Web/API service
- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string (`redis://` or `rediss://`)
- `BOT_TOKEN` — Telegram bot token (needed for initData verification + notifications)
- `JWT_SECRET` — any long random string
- `WEB_APP_URL` — optional (for future deep links)

### Notes
- **Auth** uses Telegram WebApp `initData`. If `BOT_TOKEN` is missing, auth will fail.

### Upstash Redis (recommended)
If you use **Upstash**, your URL will usually start with `rediss://`.
Example shape:
`rediss://default:<PASSWORD>@<HOST>:<PORT>`

This project enables TLS automatically when `REDIS_URL` starts with `rediss://`.

If you only have Upstash REST credentials (`UPSTASH_REDIS_REST_URL`/`TOKEN`),
create an Upstash Redis database and copy the **Redis URL** (not REST) into `REDIS_URL`.

## 2) Prisma migrations
On Railway, run once (in the service console):
- `npx prisma migrate dev` (for local) or
- `npx prisma migrate deploy` (recommended on Railway)

This repo ships only the schema; create migrations as you prefer.

## 3) Worker service (for reminders)

BullMQ needs a long-running worker process.
Create a **second Railway service** from the same repo:

- Build command: `npm install && npm run build`
- Start command: `npm run worker`

Use the **same** env vars (`DATABASE_URL`, `REDIS_URL`, `BOT_TOKEN`, `JWT_SECRET`).

If you only run the web/API service, reminders will be stored in Postgres, but **notifications will not be sent**.

## 4) Local dev

1) Install deps:
`npm install`

2) Generate prisma client:
`npm -w apps/api run prisma:generate`

3) Start DB + Redis (docker recommended), set env vars.

4) Start:
- API: `npm -w apps/api run dev`
- Web: `npm -w apps/web run dev`
- Worker (optional): build first, then `node apps/api/dist/worker.js`

## 5) Telegram settings
- Set your bot's Mini App URL to your deployed Railway URL (web/API service).
