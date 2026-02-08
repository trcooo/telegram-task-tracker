import fetch from "node-fetch";
import { env } from "./env.js";
export async function sendTelegramMessage(telegramId, text) {
    if (!env.BOT_TOKEN)
        throw new Error("BOT_TOKEN not configured");
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: telegramId, text, disable_web_page_preview: true })
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Telegram send failed: ${res.status} ${body}`);
    }
    return res.json();
}
