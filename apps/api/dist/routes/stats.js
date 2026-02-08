import { Router } from "express";
import dayjs from "dayjs";
import { prisma } from "../prisma.js";
export const statsRouter = Router();
statsRouter.get("/", async (req, res) => {
    const today = dayjs().format("YYYY-MM-DD");
    const now = new Date();
    const weekStart = dayjs().startOf("week").toDate();
    const todayCount = await prisma.task.count({
        where: { userId: req.userId, done: false, OR: [{ date: today }, { startAt: { gte: new Date(today), lt: dayjs(today).add(1, "day").toDate() } }] }
    });
    const overdueCount = await prisma.task.count({
        where: { userId: req.userId, done: false, OR: [{ startAt: { lt: now } }, { date: { lt: today } }] }
    });
    const completedWeek = await prisma.task.count({ where: { userId: req.userId, done: true, updatedAt: { gte: weekStart } } });
    res.json({ todayCount, overdueCount, completedWeek, focusMinutesWeek: 0 });
});
