import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";

import { env } from "./lib/env";
import { authRouter } from "./routes/auth";
import { meRouter } from "./routes/me";
import { tasksRouter } from "./routes/tasks";
import { tagsRouter } from "./routes/tags";
import { projectsRouter } from "./routes/projects";
import { remindersRouter } from "./routes/reminders";
import { statsRouter } from "./routes/stats";
import { startReminderDispatcher } from "./jobs/reminderDispatcher";

const app = express();

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

if (env.CORS_ORIGIN) {
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
}

app.get("/health", (_, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/reminders", remindersRouter);
app.use("/api/stats", statsRouter);

// Serve built web app
const webDist = path.resolve(process.cwd(), "apps/web/dist");
app.use(express.static(webDist));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "NOT_FOUND" });
  return res.sendFile(path.join(webDist, "index.html"));
});

if (env.NODE_ENV === "production") startReminderDispatcher();

app.listen(env.PORT, () => console.log(`Listening :${env.PORT}`));
