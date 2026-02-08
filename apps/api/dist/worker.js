import { Worker } from "bullmq";
import dayjs from "dayjs";
import { connection } from "./queue.js";
import { prisma } from "./prisma.js";
import { sendTelegramMessage } from "./bot.js";
const w = new Worker("reminders", async (job) => {
    const { reminderId } = job.data;
    const reminder = await prisma.reminder.findUnique({ where: { id: reminderId }, include: { task: { include: { user: true, list: true } } } });
    if (!reminder || !reminder.task)
        return;
    if (reminder.status === "sent")
        return;
    if (dayjs(reminder.at).isAfter(dayjs().add(5, "minute"))) {
        // job ran too early; requeue just in case
        return;
    }
    const user = reminder.task.user;
    if (!user.telegramId) {
        await prisma.reminderLog.create({ data: { userId: user.id, taskId: reminder.taskId, reminderId, status: "failed", message: "User has no telegramId" } });
        return;
    }
    const title = reminder.task.title;
    const when = dayjs(reminder.at).format("DD.MM HH:mm");
    const list = reminder.task.list?.title ? `\nList: ${reminder.task.list.title}` : "";
    const pr = ["0", "1", "2", "3"][reminder.task.priority] ?? "0";
    const text = `⏰ Reminder (${when})\n${title}\nPriority: ${pr}${list}`;
    await sendTelegramMessage(user.telegramId, text);
    await prisma.reminder.update({ where: { id: reminderId }, data: { status: "sent" } });
    await prisma.reminderLog.create({ data: { userId: user.id, taskId: reminder.taskId, reminderId, status: "sent" } });
}, { connection });
w.on("failed", (job, err) => {
    console.error("Job failed", job?.id, err);
});
console.log("Reminder worker started");
