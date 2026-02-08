import { Router } from "express";
import dayjs from "dayjs";
import { prisma } from "../prisma.js";
import { remindersQueue } from "../queue.js";

export const remindersRouter = Router();

/**
 * Reminder Center API
 * - If REDIS_URL isn't configured, we still allow CRUD,
 *   but job scheduling returns a clear error.
 */

remindersRouter.get("/", async (req, res) => {
  const userId = req.userId!;
  const status = String(req.query.status || "OPEN").toUpperCase();

  const list = await prisma.reminder.findMany({
    where: { userId, status: status as any },
    include: { task: true },
    orderBy: { fireAt: "asc" },
    take: 200,
  });

  return res.json({ reminders: list });
});

remindersRouter.post("/:taskId", async (req, res) => {
  const userId = req.userId!;
  const taskId = String(req.params.taskId);
  const { fireAt } = req.body as { fireAt?: string };

  if (!fireAt) return res.status(400).json({ error: "fireAt required" });

  const r = await prisma.reminder.create({
    data: {
      userId,
      taskId,
      fireAt: new Date(fireAt),
      status: "OPEN",
    },
  });

  if (!remindersQueue) {
    return res.status(503).json({
      reminder: r,
      warning: "REDIS_URL not configured; reminders queue is disabled.",
    });
  }

  await remindersQueue.add(
    "fire",
    { reminderId: r.id },
    { delay: Math.max(0, dayjs(fireAt).diff(dayjs())), removeOnComplete: true, removeOnFail: true }
  );

  return res.json({ reminder: r });
});

remindersRouter.post("/:id/snooze", async (req, res) => {
  const userId = req.userId!;
  const id = String(req.params.id);
  const minutes = Number(req.body?.minutes || 10);

  const r = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!r) return res.status(404).json({ error: "Not found" });

  const nextAt = dayjs().add(minutes, "minute").toDate();

  const updated = await prisma.reminder.update({
    where: { id },
    data: { fireAt: nextAt, status: "SNOOZED", sentAt: null },
  });

  if (!remindersQueue) {
    return res.status(503).json({
      reminder: updated,
      warning: "REDIS_URL not configured; reminders queue is disabled.",
    });
  }

  await remindersQueue.add(
    "fire",
    { reminderId: updated.id },
    { delay: Math.max(0, dayjs(nextAt).diff(dayjs())), removeOnComplete: true, removeOnFail: true }
  );

  return res.json({ reminder: updated });
});
