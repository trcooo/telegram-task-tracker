import cron from "node-cron";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";

async function sendTelegramMessage(chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const body: any = { chat_id: chatId, text, disable_web_page_preview: true };

  if (env.APP_URL) {
    body.reply_markup = { inline_keyboard: [[{ text: "Открыть планировщик", web_app: { url: env.APP_URL } }]] };
  } else if (env.WEBAPP_DEEPLINK) {
    body.reply_markup = { inline_keyboard: [[{ text: "Открыть планировщик", url: env.WEBAPP_DEEPLINK }]] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`Telegram API error ${res.status}: ${await res.text()}`);
}

export function startReminderDispatcher() {
  cron.schedule("*/1 * * * *", async () => {
    const now = new Date();
    const due = await prisma.reminder.findMany({
      where: { status: "PENDING", remindAt: { lte: now } },
      include: { user: true, task: true },
      take: 50
    });

    for (const r of due) {
      try {
        await sendTelegramMessage(String(r.user.tgId), `⏰ Напоминание: ${r.task.title}`);
        await prisma.reminder.update({ where: { id: r.id }, data: { status: "SENT", sentAt: now } });
      } catch (e) {
        console.error(e);
      }
    }
  });
}
