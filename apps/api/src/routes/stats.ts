import { Router } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

export const statsRouter = Router();

function isoDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

statsRouter.get("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;

  const now = new Date();
  const start = isoDay(now);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const [todo, done, today] = await Promise.all([
    prisma.task.count({ where: { userId, status: "TODO" } }),
    prisma.task.count({ where: { userId, status: "DONE" } }),
    prisma.task.count({
      where: {
        userId,
        status: "TODO",
        OR: [{ dueAt: { gte: start, lt: end } }, { startAt: { gte: start, lt: end } }]
      }
    })
  ]);

  return res.json({ todo, done, today });
});
