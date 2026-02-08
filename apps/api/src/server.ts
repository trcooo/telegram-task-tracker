import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./auth.js";
import { tasksRouter } from "./routes/tasks.js";
import { listsRouter } from "./routes/lists.js";
import { remindersRouter } from "./routes/reminders.js";
import { statsRouter } from "./routes/stats.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);

// protected
app.use("/api", authMiddleware);
app.use("/api/tasks", tasksRouter);
app.use("/api/lists", listsRouter);
app.use("/api/reminders", remindersRouter);
app.use("/api/stats", statsRouter);

// Serve frontend if built (optional single-service deploy)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDist = path.resolve(__dirname, "../../web/dist");
app.use(express.static(webDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"));
});

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT}`);
});
