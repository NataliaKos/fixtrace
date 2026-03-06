/* ── FixTrace API — Express entry point ── */

import express from "express";
import cors from "cors";
import "dotenv/config";
import { WebSocketServer } from "ws";

import uploadRoutes from "./routes/upload.routes.js";
import uiAnalyzeRoutes from "./routes/ui-analyze.routes.js";
import uiEnhanceRoutes from "./routes/ui-enhance.routes.js";
import perfAnalyzeRoutes from "./routes/perf-analyze.routes.js";
import liveSessionRoutes from "./routes/live-session.routes.js";
import githubRoutes from "./routes/github.routes.js";
import codeAnalyzeRoutes from "./routes/code-analyze.routes.js";
import voiceRoutes from "./routes/voice.routes.js";
import chatTtsRoutes from "./routes/chat-tts.routes.js";
import ttsRoutes from "./routes/tts.routes.js";
import { handleLiveAudio } from "./live-audio/live-audio.handler.js";

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "8080", 10);

// ── Middleware ───────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// ── Health check ────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Routes ──────────────────────────────────────────────────────────
app.use("/api/upload", uploadRoutes);
app.use("/api/ui-analyze", uiAnalyzeRoutes);
app.use("/api/ui-enhance", uiEnhanceRoutes);
app.use("/api/perf-analyze", perfAnalyzeRoutes);
app.use("/api/live-session", liveSessionRoutes);
app.use("/api/github-clone", githubRoutes);
app.use("/api/code-analyze", codeAnalyzeRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/chat-tts", chatTtsRoutes);
app.use("/api/tts", ttsRoutes);

// ── Start HTTP + WebSocket servers ──────────────────────────────────
const httpServer = app.listen(PORT, () => {
  console.log(`FixTrace API listening on http://localhost:${PORT}`);
});

// Attach WebSocket server for Gemini Live Audio streaming
const wss = new WebSocketServer({ server: httpServer, path: "/api/live-audio" });
wss.on("connection", (ws) => {
  console.log("[live-audio] client connected");
  handleLiveAudio(ws);
});
wss.on("listening", () => {
  console.log(`FixTrace Live Audio WebSocket ready at ws://localhost:${PORT}/api/live-audio`);
});

export default app;
