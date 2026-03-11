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

// ── WebSocket diagnostics endpoint ──────────────────────────────────
app.get("/api/live-audio", (_req, res) => {
  console.log("[ws-diag] GET /api/live-audio hit (non-upgrade request)");
  console.log("[ws-diag] headers:", JSON.stringify(_req.headers));
  res.status(426).json({ error: "WebSocket upgrade required", hint: "Use wss:// not https://" });
});

// ── Start HTTP + WebSocket servers ──────────────────────────────────
const httpServer = app.listen(PORT, () => {
  console.log(`FixTrace API listening on http://localhost:${PORT}`);
  console.log(`[ws] Environment: PORT=${PORT}, NODE_ENV=${process.env["NODE_ENV"]}, VERTEXAI=${process.env["GOOGLE_GENAI_USE_VERTEXAI"]}`);
});

// Log ALL upgrade requests at the HTTP level
httpServer.on("upgrade", (req, socket, head) => {
  console.log(`[ws] HTTP upgrade request — url=${req.url} method=${req.method}`);
  console.log(`[ws] upgrade headers:`, JSON.stringify({
    upgrade: req.headers["upgrade"],
    connection: req.headers["connection"],
    origin: req.headers["origin"],
    host: req.headers["host"],
    "sec-websocket-key": req.headers["sec-websocket-key"],
    "sec-websocket-version": req.headers["sec-websocket-version"],
  }));
  socket.on("error", (err) => {
    console.error("[ws] socket error during upgrade:", err.message);
  });
});

// Attach WebSocket server for Gemini Live Audio streaming
const wss = new WebSocketServer({ server: httpServer, path: "/api/live-audio" });
wss.on("connection", (ws, req) => {
  console.log(`[live-audio] client connected — origin=${req.headers["origin"]} url=${req.url}`);
  console.log(`[live-audio] remote: ${req.socket.remoteAddress}:${req.socket.remotePort}`);
  console.log(`[live-audio] wss.clients.size=${wss.clients.size}`);
  handleLiveAudio(ws);
});
wss.on("error", (err) => {
  console.error("[ws] WebSocketServer error:", err.message, err);
});
wss.on("listening", () => {
  console.log(`FixTrace Live Audio WebSocket ready at ws://localhost:${PORT}/api/live-audio`);
});
wss.on("headers", (headers, req) => {
  console.log(`[ws] handshake headers sending for ${req.url}`);
});

export default app;
