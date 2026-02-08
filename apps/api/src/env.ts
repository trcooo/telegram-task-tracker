import dotenv from "dotenv";
dotenv.config();

export const env = {
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL: process.env.DATABASE_URL || "",
  REDIS_URL: process.env.REDIS_URL || process.env.REDIS_TLS_URL || "",
  BOT_TOKEN: process.env.BOT_TOKEN || "",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
  WEB_APP_URL: process.env.WEB_APP_URL || ""
};
