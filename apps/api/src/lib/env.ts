import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  APP_URL: z.string().optional().default(""),
  WEBAPP_DEEPLINK: z.string().optional().default(""),
  CORS_ORIGIN: z.string().optional().default("")
});

export const env = EnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  BOT_TOKEN: process.env.BOT_TOKEN,
  JWT_SECRET: process.env.JWT_SECRET,
  APP_URL: process.env.APP_URL,
  WEBAPP_DEEPLINK: process.env.WEBAPP_DEEPLINK,
  CORS_ORIGIN: process.env.CORS_ORIGIN
});
