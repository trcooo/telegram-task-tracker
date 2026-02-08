import { Worker } from "bullmq";
import dayjs from "dayjs";
import { connection, hasRedis } from "./queue.js";
import { prisma } from "./prisma.js";
import { sendTelegramMessage } from "./bot.js";
if (!hasRedis) {
    // In production you should run the worker only when REDIS_URL is set.
    // Failing fast here makes misconfigurations obvious.
    throw new Error("REDIS_URL is not set. Reminders worker cannot start.");
}
const w = new Worker("reminders", async (job) => {
    const { reminderId } = job.data;
    const r = await prisma.reminder.findUnique({
        where: { id: reminderId },
        include: { task: { include: { user: true } } },
    });
    if (!r)
        return;
    if (r.status === "sent")
        return;
    const title = r.task?.title || "Reminder";
    const when = r.at ? dayjs(r.at).format("MMM D, HH:mm") : "";
    const chatId = r.task?.user?.telegramId;
    if (!chatId)
        return;
    await sendTelegramMessage(chatId, `⏰ ${title}\n${when}`.trim());
    await prisma.reminder.update({
        where: { id: r.id },
        data: { status: "sent" },
    });
}, { connection });
w.on("failed", (job, err) => {
    console.error("Reminder job failed", { id: job?.id }, err);
});
