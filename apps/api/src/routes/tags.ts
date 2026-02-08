import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

export const tagsRouter = Router();

const CreateSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().max(20).optional()
});

tagsRouter.get("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const items = await prisma.tag.findMany({ where: { userId }, orderBy: { name: "asc" } });
  return res.json({ items });
});

tagsRouter.post("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const data = CreateSchema.parse(req.body);
  const item = await prisma.tag.create({ data: { userId, name: data.name, color: data.color ?? null } });
  return res.json({ item });
});

tagsRouter.delete("/:id", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const id = req.params.id;
  const tag = await prisma.tag.findFirst({ where: { id, userId } });
  if (!tag) return res.status(404).json({ error: "NOT_FOUND" });
  await prisma.tag.delete({ where: { id } });
  return res.json({ ok: true });
});
