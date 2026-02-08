# All‑in‑One Productivity Partner (Telegram Mini App)

Light, airy, card-based UI inspired by **TickTick + Calendar + Priority Matrix**.

## What you get
- **Inbox**: quick natural-language input (`tomorrow 14:00-15:00 @Work #tag !!!`)
- **Calendar**: monthly view with colored task markers
- **Schedule**: day timeline with **drag & drop** rescheduling
- **Priority Matrix**: Eisenhower 2x2 with **drag & drop**
- **Reminder Center**: upcoming / snoozed / sent
- **Settings**: lists + folders (TickTick-like)

## Tech stack
**Frontend**
- React + Vite + TypeScript
- TailwindCSS, Zustand, TanStack Query
- dnd-kit, dayjs
- Telegram WebApp SDK (via `window.Telegram.WebApp`)

**Backend**
- Node.js Express + TypeScript
- Postgres + Prisma
- Redis + BullMQ (reminders)
- Telegram Bot API notifications
- JWT auth based on Telegram `initData`

## Run
See `RAILWAY_DEPLOY.md` for Railway and worker setup.
