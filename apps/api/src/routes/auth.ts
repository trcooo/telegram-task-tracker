import { Router } from "express";
import { z } from "zod";
import { env } from "../lib/env";
import { validateInitData } from "../lib/telegram";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";

export const authRouter = Router();

const TelegramAuthSchema = z.object({
  initData: z.string().min(1)
});

authRouter.post("/telegram", async (req, res) => {
  try {
    const { initData } = TelegramAuthSchema.parse(req.body);
    const parsed = validateInitData(initData, env.BOT_TOKEN);
    if (!parsed.user) return res.status(400).json({ error: "NO_USER_IN_INITDATA" });

    const tg = parsed.user;
    const tgId = BigInt(tg.id);

    const user = await prisma.user.upsert({
      where: { tgId },
      update: {
        username: tg.username ?? null,
        firstName: tg.first_name ?? null,
        lastName: tg.last_name ?? null,
        photoUrl: tg.photo_url ?? null
      },
      create: {
        tgId,
        username: tg.username ?? null,
        firstName: tg.first_name ?? null,
        lastName: tg.last_name ?? null,
        photoUrl: tg.photo_url ?? null
      }
    });

    const token = signToken({ userId: user.id, tgId: String(user.tgId) });

    return res.json({
      token,
      user: {
        id: user.id,
        tgId: String(user.tgId),
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl
      }
    });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "BAD_REQUEST" });
  }
});
