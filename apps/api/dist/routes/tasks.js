import { Router } from "express";
import dayjs from "dayjs";
import { prisma } from "../prisma.js";
import { parseNaturalInput } from "../parse.js";
import { remindersQueue } from "../queue.js";
export const tasksRouter = Router();
async function ensureDefaultLists(userId) {
    const count = await prisma.list.count({ where: { userId } });
    if (count > 0)
        return;
    await prisma.list.createMany({
        data: [
            { userId, title: "Personal", color: "#7C9EFF" },
            { userId, title: "Work", color: "#63D6B3" },
            { userId, title: "Study", color: "#FFB020" }
        ]
    });
}
async function resolveListId(userId, listHint) {
    if (!listHint)
        return null;
    const found = await prisma.list.findFirst({ where: { userId, title: { equals: listHint, mode: "insensitive" } } });
    if (found)
        return found.id;
    const created = await prisma.list.create({ data: { userId, title: listHint } });
    return created.id;
}
async function replaceReminders(userId, taskId, reminders) {
    // wipe old reminders + jobs
    const old = await prisma.reminder.findMany({ where: { taskId } });
    for (const r of old) {
        if (remindersQueue) {
            await remindersQueue.remove(r.id).catch(() => { });
        }
    }
    await prisma.reminder.deleteMany({ where: { taskId } });
    // create new
    const created = [];
    for (const r of reminders) {
        const at = new Date(r.at);
        const rec = await prisma.reminder.create({
            data: { taskId, at, method: r.method || "bot", status: r.status || "scheduled" }
        });
        created.push(rec);
        // schedule if future
        const delay = Math.max(0, at.getTime() - Date.now());
        if (remindersQueue) {
            await remindersQueue.add("send", { reminderId: rec.id, userId, taskId }, { jobId: rec.id, delay, removeOnComplete: true, removeOnFail: 1000 });
        }
    }
    return created;
}
tasksRouter.get("/", async (req, res) => {
    await ensureDefaultLists(req.userId);
    const { view, date } = req.query;
    const where = { userId: req.userId };
    if (view === "today") {
        const d = dayjs().format("YYYY-MM-DD");
        where.OR = [{ date: d }, { startAt: { gte: new Date(d), lt: new Date(dayjs(d).add(1, "day").toISOString()) } }];
        where.done = false;
    }
    else if (view === "overdue") {
        const now = new Date();
        where.done = false;
        where.OR = [
            { startAt: { lt: now } },
            { date: { lt: dayjs().format("YYYY-MM-DD") } }
        ];
    }
    else if (view === "date" && date) {
        where.OR = [
            { date: String(date) },
            { startAt: { gte: new Date(String(date)), lt: new Date(dayjs(String(date)).add(1, "day").toISOString()) } }
        ];
    }
    else if (view === "inbox") {
        where.matrixQuadrant = "INBOX";
        where.done = false;
        where.AND = [{ date: null }, { startAt: null }];
    }
    else if (view === "done") {
        where.done = true;
    }
    const tasks = await prisma.task.findMany({
        where,
        orderBy: [{ done: "asc" }, { startAt: "asc" }, { createdAt: "desc" }],
        include: { reminders: true }
    });
    res.json(tasks);
});
tasksRouter.post("/parse", async (req, res) => {
    const text = String(req.body?.text || "");
    const parsed = parseNaturalInput(text);
    res.json(parsed);
});
tasksRouter.post("/", async (req, res) => {
    const body = req.body || {};
    const listId = body.listId ? String(body.listId) : await resolveListId(req.userId, body.listHint || null);
    const task = await prisma.task.create({
        data: {
            userId: req.userId,
            listId: listId || null,
            title: String(body.title || "").trim() || "Untitled",
            note: body.note ? String(body.note) : null,
            priority: Number(body.priority ?? 0),
            kind: String(body.kind || "task"),
            date: body.date ?? null,
            time: body.time ?? null,
            allDay: Boolean(body.allDay ?? false),
            startAt: body.startAt ? new Date(body.startAt) : null,
            endAt: body.endAt ? new Date(body.endAt) : null,
            tags: body.tags ?? [],
            subtasks: body.subtasks ?? [],
            matrixQuadrant: String(body.matrixQuadrant || "INBOX"),
            focusFlag: Boolean(body.focusFlag ?? false),
            done: Boolean(body.done ?? false)
        }
    });
    const reminders = Array.isArray(body.reminders) ? body.reminders : [];
    const createdReminders = reminders.length ? await replaceReminders(req.userId, task.id, reminders) : [];
    res.json({ ...task, reminders: createdReminders });
});
tasksRouter.patch("/:id", async (req, res) => {
    const id = req.params.id;
    const body = req.body || {};
    const listId = body.listId ? String(body.listId) : undefined;
    const task = await prisma.task.update({
        where: { id, userId: req.userId },
        data: {
            title: body.title !== undefined ? String(body.title) : undefined,
            note: body.note !== undefined ? (body.note === null ? null : String(body.note)) : undefined,
            priority: body.priority !== undefined ? Number(body.priority) : undefined,
            kind: body.kind !== undefined ? String(body.kind) : undefined,
            date: body.date !== undefined ? (body.date === null ? null : String(body.date)) : undefined,
            time: body.time !== undefined ? (body.time === null ? null : String(body.time)) : undefined,
            allDay: body.allDay !== undefined ? Boolean(body.allDay) : undefined,
            startAt: body.startAt !== undefined ? (body.startAt === null ? null : new Date(body.startAt)) : undefined,
            endAt: body.endAt !== undefined ? (body.endAt === null ? null : new Date(body.endAt)) : undefined,
            tags: body.tags !== undefined ? body.tags : undefined,
            subtasks: body.subtasks !== undefined ? body.subtasks : undefined,
            matrixQuadrant: body.matrixQuadrant !== undefined ? String(body.matrixQuadrant) : undefined,
            focusFlag: body.focusFlag !== undefined ? Boolean(body.focusFlag) : undefined,
            done: body.done !== undefined ? Boolean(body.done) : undefined,
            listId: listId !== undefined ? (listId === null ? null : listId) : undefined
        }
    });
    let reminders = undefined;
    if (Array.isArray(body.reminders)) {
        reminders = await replaceReminders(req.userId, task.id, body.reminders);
    }
    else {
        reminders = await prisma.reminder.findMany({ where: { taskId: task.id } });
    }
    res.json({ ...task, reminders });
});
tasksRouter.delete("/:id", async (req, res) => {
    const id = req.params.id;
    await prisma.task.delete({ where: { id, userId: req.userId } });
    res.json({ ok: true });
});
