import { Worker } from "bullmq";
import dayjs from "dayjs";
import { env } from "./env.js";
import { connection, hasRedis } from "./queue.js";
import { prisma } from "./prisma.js";
import { sendTelegramMessage } from "./bot.js";

if (!hasRedis) {
  // In production you should run the worker only when REDIS_URL is set.
  // Failing fast here makes misconfigurations obvious.
  throw new Error("REDIS_URL is not set. Reminders worker cannot start.");
}

const w = new Worker(
  "reminders",
  async (job) => {
    const { reminderId } = job.data as { reminderId: string };

    const r = await prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { task: true, user: true },
    });

    if (!r || r.sentAt) return;

    const title = r.task?.title || "Reminder";
    const when = r.fireAt ? dayjs(r.fireAt).format("MMM D, HH:mm") : "";
    await sendTelegramMessage(r.user.telegramId, `⏰ ${title}\n${when}`.trim());

    await prisma.reminder.update({
      where: { id: r.id },
      data: { sentAt: new Date(), status: "SENT" },
    });
  },
  { connection }
);

w.on("failed", (job, err) => {
  console.error("Reminder job failed", { id: job?.id }, err);
});
