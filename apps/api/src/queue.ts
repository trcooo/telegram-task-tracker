import { Queue } from "bullmq";
import { env } from "./env.js";

function parseRedisUrl(url: string) {
  if (!url) return null;
  // BullMQ accepts ioredis options. Railway often provides REDIS_URL like redis://...
  try {
    const u = new URL(url);
    const tls = u.protocol === "rediss:";
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      password: u.password || undefined,
      username: u.username || undefined,
      tls: tls ? {} : undefined
    };
  } catch {
    return null;
  }
}

export const connection = parseRedisUrl(env.REDIS_URL);

export const remindersQueue = new Queue("reminders", {
  connection: connection || undefined
});
