import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

export const remindersRouter = Router();

const ListSchema = z.object({
  status: z.enum(["PENDING", "SENT", "CANCELED"]).optional()
});

const CreateSchema = z.object({
  taskId: z.string().min(1),
  remindAt: z.string().datetime()
});

const SnoozeSchema = z.object({
  minutes: z.number().int().min(1).max(24 * 60)
});

remindersRouter.get("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const q = ListSchema.safeParse(req.query);
  const status = q.success ? q.data.status : undefined;

  const items = await prisma.reminder.findMany({
    where: { userId, ...(status ? { status } : {}) },
    include: { task: true },
    orderBy: [{ status: "asc" }, { remindAt: "asc" }],
    take: 200
  });

  return res.json({
    items: items.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      taskTitle: r.task.title,
      remindAt: r.remindAt.toISOString(),
      status: r.status
    }))
  });
});

remindersRouter.post("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const data = CreateSchema.parse(req.body);

  const task = await prisma.task.findFirst({ where: { id: data.taskId, userId } });
  if (!task) return res.status(404).json({ error: "TASK_NOT_FOUND" });

  const item = await prisma.reminder.create({
    data: { userId, taskId: data.taskId, remindAt: new Date(data.remindAt) }
  });

  return res.json({
    item: {
      id: item.id,
      taskId: item.taskId,
      taskTitle: task.title,
      remindAt: item.remindAt.toISOString(),
      status: item.status
    }
  });
});

remindersRouter.post("/:id/snooze", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const id = req.params.id;
  const data = SnoozeSchema.parse(req.body);

  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (existing.status !== "PENDING") return res.status(400).json({ error: "NOT_PENDING" });

  const newTime = new Date(existing.remindAt);
  newTime.setMinutes(newTime.getMinutes() + data.minutes);

  const updated = await prisma.reminder.update({
    where: { id },
    data: { remindAt: newTime }
  });

  return res.json({
    item: {
      id: updated.id,
      taskId: updated.taskId,
      remindAt: updated.remindAt.toISOString(),
      status: updated.status
    }
  });
});

remindersRouter.post("/:id/cancel", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const id = req.params.id;

  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

  const updated = await prisma.reminder.update({
    where: { id },
    data: { status: "CANCELED" }
  });

  return res.json({ ok: true, item: { id: updated.id, status: updated.status } });
});

remindersRouter.post("/task/:taskId/quick", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const taskId = req.params.taskId;

  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) return res.status(404).json({ error: "TASK_NOT_FOUND" });

  const now = new Date();
  const remindAt = new Date(now);
  remindAt.setMinutes(remindAt.getMinutes() + 10);

  const item = await prisma.reminder.create({ data: { userId, taskId, remindAt } });

  return res.json({
    item: {
      id: item.id,
      taskId: item.taskId,
      taskTitle: task.title,
      remindAt: item.remindAt.toISOString(),
      status: item.status
    }
  });
});
