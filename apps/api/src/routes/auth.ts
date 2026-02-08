import { Router } from "express";
import { upsertUserFromInitData, signJwt } from "../auth.js";

export const authRouter = Router();

authRouter.post("/telegram", async (req, res) => {
  try {
    const initData = String(req.body?.initData || "");
    if (!initData) return res.status(400).json({ error: "initData required" });
    const user = await upsertUserFromInitData(initData);
    const token = signJwt({ userId: user.id });
    return res.json({ token, user: { id: user.id, telegramId: user.telegramId, name: user.name } });
  } catch (e: any) {
    return res.status(401).json({ error: e?.message || "Auth failed" });
  }
});
