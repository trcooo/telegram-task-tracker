import { Queue } from "bullmq";
import { env } from "./env.js";
/**
 * Upstash Redis:
 * - Usually provides REDIS_URL starting with `rediss://` (TLS)
 * - BullMQ uses ioredis connection options.
 *
 * IMPORTANT:
 * - `connection` must be a ConnectionOptions object for TypeScript (not undefined),
 *   otherwise builds can fail.
 * - But we should NOT try to connect to localhost in production if REDIS_URL is missing.
 *   So we expose `hasRedis` and create the queue conditionally.
 */
function connectionFromRedisUrl(url) {
    const u = new URL(url);
    const tls = u.protocol === "rediss:";
    const port = Number(u.port || 6379);
    const host = u.hostname;
    const password = u.password || undefined;
    const username = u.username || undefined;
    // Upstash requires TLS when using rediss://
    const tlsOpt = tls ? { rejectUnauthorized: false } : undefined;
    return { host, port, password, username, tls: tlsOpt };
}
export const hasRedis = Boolean(env.REDIS_URL);
export const connection = hasRedis
    ? connectionFromRedisUrl(env.REDIS_URL)
    // Dummy value only to satisfy TS typing — do not use unless hasRedis=true.
    : { host: "127.0.0.1", port: 6379 };
/**
 * Queue is created ONLY when Redis is configured.
 * This prevents ECONNREFUSED on Railway when REDIS_URL is missing.
 */
export const remindersQueue = hasRedis
    ? new Queue("reminders", { connection })
    : null;
