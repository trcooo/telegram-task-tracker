import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

export const tasksRouter = Router();

const ListSchema = z.object({
  status: z.enum(["TODO", "DONE", "ARCHIVED"]).optional(),
  date: z.string().optional(), // YYYY-MM-DD
  from: z.string().optional(), // ISO
  to: z.string().optional() // ISO
});

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(["TODO", "DONE", "ARCHIVED"]).optional(),
  priority: z.number().int().min(1).max(4).optional(),
  quadrant: z.enum([
    "Q1_URGENT_IMPORTANT",
    "Q2_NOT_URGENT_IMPORTANT",
    "Q3_URGENT_NOT_IMPORTANT",
    "Q4_NOT_URGENT_NOT_IMPORTANT"
  ]).optional(),
  startAt: z.union([z.string().datetime(), z.null()]).optional(),
  dueAt: z.union([z.string().datetime(), z.null()]).optional(),
  durationMin: z.number().int().min(5).max(1440).optional(),
  projectId: z.union([z.string(), z.null()]).optional(),
  tagIds: z.array(z.string()).optional()
});

const UpdateSchema = CreateSchema.partial();

function dayRange(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00.000Z");
  const start = new Date(d);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

tasksRouter.get("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;

  const parsed = ListSchema.safeParse(req.query);
  const q = parsed.success ? parsed.data : {};

  const where: any = { userId };
  if (q.status) where.status = q.status;

  if (q.date) {
    const { start, end } = dayRange(q.date);
    where.OR = [
      { startAt: { gte: start, lt: end } },
      { dueAt: { gte: start, lt: end } }
    ];
  }

  if (q.from && q.to) {
    const from = new Date(q.from);
    const to = new Date(q.to);
    where.OR = [
      { startAt: { gte: from, lt: to } },
      { dueAt: { gte: from, lt: to } }
    ];
  }

  const items = await prisma.task.findMany({
    where,
    include: {
      project: true,
      taskTags: { include: { tag: true } },
      reminders: { where: { status: "PENDING" }, orderBy: { remindAt: "asc" }, take: 1 }
    },
    orderBy: [{ status: "asc" }, { startAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
  });

  return res.json({
    items: items.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      quadrant: t.quadrant,
      startAt: t.startAt?.toISOString() ?? null,
      dueAt: t.dueAt?.toISOString() ?? null,
      durationMin: t.durationMin ?? null,
      project: t.project ? { id: t.project.id, name: t.project.name, color: t.project.color } : null,
      tags: t.taskTags.map((x) => ({ id: x.tag.id, name: x.tag.name, color: x.tag.color })),
      nextReminderAt: t.reminders[0]?.remindAt?.toISOString() ?? null
    }))
  });
});

tasksRouter.post("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const data = CreateSchema.parse(req.body);

  const task = await prisma.task.create({
    data: {
      userId,
      title: data.title,
      description: data.description ?? null,
      status: data.status ?? "TODO",
      priority: data.priority ?? 3,
      quadrant: data.quadrant ?? null,
      startAt: data.startAt ? new Date(data.startAt) : null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      durationMin: data.durationMin ?? null,
      projectId: data.projectId ?? null,
      taskTags: data.tagIds?.length ? { create: data.tagIds.map((tagId) => ({ tagId })) } : undefined
    },
    include: { project: true, taskTags: { include: { tag: true } } }
  });

  return res.json({
    item: {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      quadrant: task.quadrant,
      startAt: task.startAt?.toISOString() ?? null,
      dueAt: task.dueAt?.toISOString() ?? null,
      durationMin: task.durationMin ?? null,
      project: task.project ? { id: task.project.id, name: task.project.name, color: task.project.color } : null,
      tags: task.taskTags.map((x) => ({ id: x.tag.id, name: x.tag.name, color: x.tag.color }))
    }
  });
});

tasksRouter.patch("/:id", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const id = req.params.id;

  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

  const data = UpdateSchema.parse(req.body);

  const updated = await prisma.task.update({
    where: { id },
    data: {
      title: data.title ?? undefined,
      description: data.description ?? undefined,
      status: data.status ?? undefined,
      priority: data.priority ?? undefined,
      quadrant: data.quadrant ?? undefined,
      startAt: data.startAt === null ? null : data.startAt ? new Date(data.startAt) : undefined,
      dueAt: data.dueAt === null ? null : data.dueAt ? new Date(data.dueAt) : undefined,
      durationMin: data.durationMin ?? undefined,
      projectId: data.projectId === null ? null : data.projectId ?? undefined,
      taskTags: data.tagIds
        ? {
            deleteMany: {},
            create: data.tagIds.map((tagId) => ({ tagId }))
          }
        : undefined
    },
    include: {
      project: true,
      taskTags: { include: { tag: true } },
      reminders: { where: { status: "PENDING" }, orderBy: { remindAt: "asc" }, take: 1 }
    }
  });

  return res.json({
    item: {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      priority: updated.priority,
      quadrant: updated.quadrant,
      startAt: updated.startAt?.toISOString() ?? null,
      dueAt: updated.dueAt?.toISOString() ?? null,
      durationMin: updated.durationMin ?? null,
      project: updated.project ? { id: updated.project.id, name: updated.project.name, color: updated.project.color } : null,
      tags: updated.taskTags.map((x) => ({ id: x.tag.id, name: x.tag.name, color: x.tag.color })),
      nextReminderAt: updated.reminders[0]?.remindAt?.toISOString() ?? null
    }
  });
});

tasksRouter.delete("/:id", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const id = req.params.id;

  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

  await prisma.task.delete({ where: { id } });
  return res.json({ ok: true });
});
