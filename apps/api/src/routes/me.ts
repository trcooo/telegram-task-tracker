import { Router } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

export const meRouter = Router();

meRouter.get("/", authMiddleware, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "NOT_FOUND" });

  return res.json({
    user: {
      id: user.id,
      tgId: String(user.tgId),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl
    }
  });
});
