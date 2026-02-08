import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

export const projectsRouter = Router();

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(20).optional()
});

projectsRouter.get("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const items = await prisma.project.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return res.json({ items });
});

projectsRouter.post("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const data = CreateSchema.parse(req.body);
  const item = await prisma.project.create({ data: { userId, name: data.name, color: data.color ?? null } });
  return res.json({ item });
});

projectsRouter.delete("/:id", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const id = req.params.id;
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return res.status(404).json({ error: "NOT_FOUND" });
  await prisma.project.delete({ where: { id } });
  return res.json({ ok: true });
});
