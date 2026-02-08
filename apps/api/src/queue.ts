import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { env } from "./env.js";

function parseRedisUrl(url?: string): ConnectionOptions {
  // IMPORTANT for Railway builds:
  // BullMQ's `connection` must be a ConnectionOptions object (not undefined),
  // otherwise TypeScript fails during `npm run build`.
  if (!url) {
    return { host: "127.0.0.1", port: 6379 };
  }

  // BullMQ accepts ioredis options. Railway often provides REDIS_URL like redis://...
  try {
    const u = new URL(url);
    const tls = u.protocol === "rediss:";
    const port = Number(u.port || 6379);
    const host = u.hostname || "127.0.0.1";
    const password = u.password || undefined;
    const username = u.username || undefined;
    // Upstash commonly uses rediss:// and requires TLS.
    // BullMQ accepts ioredis options. Passing an object to `tls` enables TLS.
    // `rejectUnauthorized: false` avoids issues with some managed cert chains.
    const tlsOpt = tls ? ({ rejectUnauthorized: false } as any) : undefined;
    return { host, port, password, username, tls: tlsOpt } as ConnectionOptions;
  } catch {
    // Fallback keeps TS happy and prevents build-time failures.
    return { host: "127.0.0.1", port: 6379 };
  }
}

export const connection: ConnectionOptions = parseRedisUrl(env.REDIS_URL);

export const remindersQueue = new Queue("reminders", { connection });
