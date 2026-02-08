import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
/**
 * Telegram initData verification:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(initData, botToken) {
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get("hash");
        if (!hash)
            return { ok: false };
        params.delete("hash");
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join("\n");
        const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
        const calcHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
        if (calcHash !== hash)
            return { ok: false };
        const out = {};
        for (const [k, v] of params.entries())
            out[k] = v;
        return { ok: true, data: out };
    }
    catch {
        return { ok: false };
    }
}
export async function upsertUserFromInitData(initData) {
    const v = verifyTelegramInitData(initData, env.BOT_TOKEN);
    if (!v.ok || !v.data)
        throw new Error("Invalid Telegram initData");
    const userJson = v.data["user"];
    if (!userJson)
        throw new Error("Missing user");
    const u = JSON.parse(userJson);
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || null;
    const telegramId = String(u.id);
    const user = await prisma.user.upsert({
        where: { telegramId },
        update: { name },
        create: { telegramId, name }
    });
    return user;
}
export function signJwt(payload) {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "30d" });
}
export function authMiddleware(req, res, next) {
    const hdr = req.headers.authorization || "";
    if (!hdr.startsWith("Bearer "))
        return res.status(401).json({ error: "Missing token" });
    const token = hdr.slice("Bearer ".length);
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    }
    catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}
