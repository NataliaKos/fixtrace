/* ── Live Session routes ── */

import { Router, type Request, type Response } from "express";
import {
  createSession,
  sendMessage,
  sendVoiceMessage,
  getSession,
  deleteSession,
} from "../services/live-session.service.js";
import type { ApiResponse, LiveSessionState, LiveSessionMessage } from "../models/interfaces.js";

const router = Router();

/**
 * POST /api/live-session
 * Body: { mode: "ui" | "perf" | "both" }
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const { mode } = req.body as { mode?: "ui" | "perf" | "both" };
    const state = createSession(mode ?? "both");
    res.json({ success: true, data: state } satisfies ApiResponse<LiveSessionState>);
  } catch (err) {
    console.error("Create session error:", err);
    res.status(500).json({ success: false, error: "Failed to create session" } satisfies ApiResponse);
  }
});

/**
 * GET /api/live-session/:sessionId
 */
router.get("/:sessionId", (req: Request, res: Response) => {
  const sessionId = String(req.params["sessionId"]);
  const state = getSession(sessionId);
  if (!state) {
    res.status(404).json({ success: false, error: "Session not found" } satisfies ApiResponse);
    return;
  }
  res.json({ success: true, data: state } satisfies ApiResponse<LiveSessionState>);
});

/**
 * POST /api/live-session/:sessionId/message
 * Body: { content, attachments?: [{ gcsUri, mimeType }] }
 */
router.post("/:sessionId/message", async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params["sessionId"]);
    const { content, attachments } = req.body as {
      content: string;
      attachments?: { gcsUri: string; mimeType: string }[];
    };

    if (!content) {
      res.status(400).json({ success: false, error: "content is required" } satisfies ApiResponse);
      return;
    }

    if (!getSession(sessionId)) {
      res.status(404).json({ success: false, error: "Session not found" } satisfies ApiResponse);
      return;
    }

    const reply = await sendMessage(sessionId, content, attachments);
    res.json({ success: true, data: reply } satisfies ApiResponse<LiveSessionMessage>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send message";
    console.error("Send message error:", err);
    res.status(500).json({ success: false, error: msg } satisfies ApiResponse);
  }
});

/**
 * DELETE /api/live-session/:sessionId
 */
router.delete("/:sessionId", (req: Request, res: Response) => {
  const sessionId = String(req.params["sessionId"]);
  const deleted = deleteSession(sessionId);
  if (!deleted) {
    res.status(404).json({ success: false, error: "Session not found" } satisfies ApiResponse);
    return;
  }
  res.json({ success: true } satisfies ApiResponse);
});

/**
 * POST /api/live-session/:sessionId/voice
 * Body: { audioBase64: string, audioMimeType: string, textPrompt?: string }
 */
router.post("/:sessionId/voice", async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params["sessionId"]);
    const { audioBase64, audioMimeType, textPrompt } = req.body as {
      audioBase64: string;
      audioMimeType: string;
      textPrompt?: string;
    };

    if (!audioBase64 || !audioMimeType) {
      res.status(400).json({
        success: false,
        error: "audioBase64 and audioMimeType are required",
      } satisfies ApiResponse);
      return;
    }

    if (!getSession(sessionId)) {
      res.status(404).json({ success: false, error: "Session not found" } satisfies ApiResponse);
      return;
    }

    const reply = await sendVoiceMessage(sessionId, audioBase64, audioMimeType, textPrompt);
    res.json({ success: true, data: reply } satisfies ApiResponse<LiveSessionMessage>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process voice message";
    console.error("Voice message error:", err);
    res.status(500).json({ success: false, error: msg } satisfies ApiResponse);
  }
});

export default router;
