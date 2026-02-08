import { Router } from "express";
import dayjs from "dayjs";
import { prisma } from "../prisma.js";
import { remindersQueue } from "../queue.js";
export const remindersRouter = Router();
/**
 * Reminder Center API
 *
 * Prisma schema:
 * - Reminder has { taskId, at, status }
 * - User ownership is derived from reminder.task.userId
 */
function normalizeStatus(input) {
    const s = input.trim().toLowerCase();
    if (["sent", "done"].includes(s))
        return "sent";
    if (["snoozed", "snooze"].includes(s))
        return "snoozed";
    // default + legacy "open" semantics
    return "scheduled";
}
remindersRouter.get("/", async (req, res) => {
    const userId = req.userId;
    const status = normalizeStatus(String(req.query.status || "scheduled"));
    const list = await prisma.reminder.findMany({
        where: { status, task: { userId } },
        include: { task: true },
        orderBy: { at: "asc" },
        take: 200,
    });
    return res.json({ reminders: list });
});
remindersRouter.post("/:taskId", async (req, res) => {
    const userId = req.userId;
    const taskId = String(req.params.taskId);
    // Accept both `at` and legacy `fireAt`
    const atRaw = (req.body?.at || req.body?.fireAt);
    if (!atRaw)
        return res.status(400).json({ error: "at required" });
    const at = new Date(atRaw);
    if (Number.isNaN(at.getTime()))
        return res.status(400).json({ error: "invalid at" });
    // Ensure ownership
    const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
    if (!task)
        return res.status(404).json({ error: "Task not found" });
    const r = await prisma.reminder.create({
        data: {
            taskId,
            at,
            status: "scheduled",
            method: "bot",
        },
    });
    if (!remindersQueue) {
        return res.status(503).json({
            reminder: r,
            warning: "REDIS_URL not configured; reminders queue is disabled.",
        });
    }
    await remindersQueue.add("send", { reminderId: r.id }, {
        jobId: r.id,
        delay: Math.max(0, dayjs(at).diff(dayjs())),
        removeOnComplete: true,
        removeOnFail: 1000,
    });
    return res.json({ reminder: r });
});
remindersRouter.post("/:id/snooze", async (req, res) => {
    const userId = req.userId;
    const id = String(req.params.id);
    const minutes = Number(req.body?.minutes || 10);
    const r = await prisma.reminder.findFirst({ where: { id, task: { userId } } });
    if (!r)
        return res.status(404).json({ error: "Not found" });
    const nextAt = dayjs().add(minutes, "minute").toDate();
    const updated = await prisma.reminder.update({
        where: { id },
        data: { at: nextAt, status: "snoozed" },
    });
    if (!remindersQueue) {
        return res.status(503).json({
            reminder: updated,
            warning: "REDIS_URL not configured; reminders queue is disabled.",
        });
    }
    await remindersQueue.add("send", { reminderId: updated.id }, {
        jobId: updated.id,
        delay: Math.max(0, dayjs(nextAt).diff(dayjs())),
        removeOnComplete: true,
        removeOnFail: 1000,
    });
    return res.json({ reminder: updated });
});
