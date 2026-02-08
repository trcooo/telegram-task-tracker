import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma.js";

/**
 * Telegram initData verification:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(initData: string, botToken: string): { ok: boolean; data?: Record<string,string> } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false };

    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([k,v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calcHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (calcHash !== hash) return { ok: false };

    const out: Record<string,string> = {};
    for (const [k,v] of params.entries()) out[k] = v;
    return { ok: true, data: out };
  } catch {
    return { ok: false };
  }
}

export async function upsertUserFromInitData(initData: string) {
  const v = verifyTelegramInitData(initData, env.BOT_TOKEN);
  if (!v.ok || !v.data) throw new Error("Invalid Telegram initData");
  const userJson = v.data["user"];
  if (!userJson) throw new Error("Missing user");
  const u = JSON.parse(userJson) as { id: number; first_name?: string; last_name?: string; username?: string };
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || null;
  const telegramId = String(u.id);

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { name },
    create: { telegramId, name }
  });
  return user;
}

export function signJwt(payload: { userId: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "30d" });
}

export type AuthedRequest = Request & { userId?: string };

export async function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const hdr = String(req.headers.authorization || "");
  const initData = String(req.headers["x-tg-init-data"] || "");

  // Preferred: JWT
  if (hdr.startsWith("Bearer ")) {
    const token = hdr.slice("Bearer ".length);
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      req.userId = decoded.userId;
      return next();
    } catch {
      // stale/invalid token — try initData fallback below
    }
  }

  // Fallback: Telegram initData (works inside Telegram Mini App)
  if (initData) {
    try {
      const user = await upsertUserFromInitData(initData);
      req.userId = user.id;
      return next();
    } catch (e: any) {
      return res.status(401).json({ error: e?.message || "Invalid token" });
    }
  }

  return res.status(401).json({ error: "Invalid token" });
}

