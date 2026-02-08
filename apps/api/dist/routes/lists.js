import { Router } from "express";
import { prisma } from "../prisma.js";
export const listsRouter = Router();
listsRouter.get("/", async (req, res) => {
    const lists = await prisma.list.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "asc" } });
    res.json(lists);
});
listsRouter.post("/", async (req, res) => {
    const title = String(req.body?.title || "").trim();
    if (!title)
        return res.status(400).json({ error: "title required" });
    const color = req.body?.color ? String(req.body.color) : undefined;
    const folder = req.body?.folder ? String(req.body.folder) : undefined;
    const list = await prisma.list.create({ data: { userId: req.userId, title, color, folder } });
    res.json(list);
});
listsRouter.patch("/:id", async (req, res) => {
    const id = req.params.id;
    const list = await prisma.list.update({
        where: { id, userId: req.userId },
        data: {
            title: req.body?.title !== undefined ? String(req.body.title) : undefined,
            color: req.body?.color !== undefined ? String(req.body.color) : undefined,
            folder: req.body?.folder !== undefined ? String(req.body.folder) : undefined
        }
    });
    res.json(list);
});
listsRouter.delete("/:id", async (req, res) => {
    const id = req.params.id;
    await prisma.list.delete({ where: { id, userId: req.userId } });
    res.json({ ok: true });
});
