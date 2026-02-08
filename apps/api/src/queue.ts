import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "./env.js";

function getRedisConnection(): ConnectionOptions {
  const url = env.REDIS_URL;
  if (!url) {
    // Local/dev fallback (also makes TS happy during CI builds where env may be absent).
    return { host: "127.0.0.1", port: 6379 };
  }
  try {
    const u = new URL(url);
    const isTls = u.protocol === "rediss:";
    const host = u.hostname || "127.0.0.1";
    const port = Number(u.port || (isTls ? 6380 : 6379));
    const password = u.password ? u.password : undefined;
    const username = u.username ? u.username : undefined;

    // BullMQ uses ioredis connection options. TLS is enabled when using rediss://
    const tls = isTls ? {} : undefined;

    return { host, port, password, username, tls };
  } catch {
    return { host: "127.0.0.1", port: 6379 };
  }
}

export const connection = getRedisConnection();

export const remindersQueue = new Queue("reminders", {
  connection
});
