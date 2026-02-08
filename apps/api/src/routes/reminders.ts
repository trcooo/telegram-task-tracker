import { Router } from "express";
import dayjs from "dayjs";
import type { AuthedRequest } from "../auth.js";
import { prisma } from "../prisma.js";
import { remindersQueue } from "../queue.js";

export const remindersRouter = Router();

remindersRouter.get("/", async (req: AuthedRequest, res) => {
  const mode = String((req.query as any).mode || "upcoming");
  const now = new Date();
  let where: any = { task: { userId: req.userId! } };

  if (mode === "upcoming") where.status = { in: ["scheduled", "snoozed"] }, where.at = { gte: now };
  if (mode === "snoozed") where.status = "snoozed";
  if (mode === "sent") where.status = "sent";

  const reminders = await prisma.reminder.findMany({
    where,
    orderBy: { at: "asc" },
    include: { task: true }
  });
  res.json(reminders);
});

remindersRouter.post("/:id/snooze", async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const minutes = Number(req.body?.minutes || 10);
  const reminder = await prisma.reminder.findFirst({
    where: { id, task: { userId: req.userId! } },
    include: { task: true }
  });
  if (!reminder) return res.status(404).json({ error: "Not found" });

  const at = dayjs(reminder.at).add(minutes, "minute").toDate();
  const updated = await prisma.reminder.update({
    where: { id },
    data: { at, status: "snoozed" }
  });

  await remindersQueue.remove(id).catch(() => {});
  const delay = Math.max(0, at.getTime() - Date.now());
  await remindersQueue.add("send", { reminderId: id, userId: req.userId!, taskId: reminder.taskId }, { jobId: id, delay, removeOnComplete: true, removeOnFail: 1000 });

  await prisma.reminderLog.create({ data: { userId: req.userId!, taskId: reminder.taskId, reminderId: id, status: "snoozed", message: `+${minutes}m` } });
  res.json(updated);
});
