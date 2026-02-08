import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

export type AuthedRequest = Request & { auth: { userId: string; tgId: string } };

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "UNAUTHORIZED" });

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });

    (req as AuthedRequest).auth = { userId: payload.userId, tgId: payload.tgId };
    return next();
  } catch {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
}
