/* ── POST /api/chat-tts ────────────────────────────────────────────────────────
 *
 *  Body:    { text: string }
 *  Returns: { reply: string, audioBase64: string }
 *           where audioBase64 is PCM 16-bit LE 24 kHz mono, base64-encoded.
 *
 *  The Angular frontend decodes audioBase64 → ArrayBuffer → AudioContext.
 *
 *  TODO (streaming): When upgrading to Gemini Live API, replace this REST
 *  endpoint with a WebSocket handler that streams audio chunks and sentence
 *  boundaries to the client so the avatar can start animating before the full
 *  audio is ready.
 * ─────────────────────────────────────────────────────────────────────────── */

import { Router, type Request, type Response } from "express";
import { chatTts } from "../services/chat-tts.service.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "Body must contain a non-empty `text` field." });
    return;
  }

  try {
    const result = await chatTts(text.trim());
    res.json(result);
  } catch (err: any) {
    console.error("[chat-tts] Error:", err?.message ?? err);

    // Propagate a structured error to the client
    const status =
      err?.status === 429 ? 429 :
      err?.status === 503 ? 503 :
      500;

    res.status(status).json({
      error: err?.message ?? "Internal server error",
    });
  }
});

export default router;
