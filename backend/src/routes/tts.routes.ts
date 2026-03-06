/* ── /api/tts ────────────────────────────────────────────────────────────────
 *
 *  GET  /api/tts/voices          → { voices: string[], default: string }
 *  POST /api/tts                 Body: { text, voice? }
 *                                → { audioBase64: string }  (base64 WAV)
 *
 *  The Angular frontend decodes audioBase64 → ArrayBuffer →
 *  AudioContext.decodeAudioData() → AvatarSceneComponent.playAndAnimate().
 * ─────────────────────────────────────────────────────────────────────────── */

import { Router, type Request, type Response } from "express";
import { synthesizeToWav, TTS_VOICES, DEFAULT_VOICE, type TtsVoice } from "../services/tts.service.js";
import type { ApiResponse } from "../models/interfaces.js";

const router = Router();

/** GET /api/tts/voices — return the list of supported voice names. */
router.get("/voices", (_req: Request, res: Response) => {
  res.json({ success: true, data: { voices: TTS_VOICES, default: DEFAULT_VOICE } } satisfies ApiResponse<{ voices: readonly string[]; default: string }>);
});

/** POST /api/tts — synthesise text. */
router.post("/", async (req: Request, res: Response) => {
  const { text, voice } = req.body as { text?: string; voice?: string };

  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ success: false, error: "Body must contain a non-empty `text` field." } satisfies ApiResponse);
    return;
  }

  const resolvedVoice: TtsVoice =
    voice && (TTS_VOICES as readonly string[]).includes(voice)
      ? (voice as TtsVoice)
      : DEFAULT_VOICE;

  try {
    const audioBase64 = await synthesizeToWav(text.trim(), resolvedVoice);
    res.json({ success: true, data: { audioBase64 } } satisfies ApiResponse<{ audioBase64: string }>);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "TTS synthesis failed";
    console.error("[tts] Error:", msg);
    const status = (err as { status?: number })?.status === 429 ? 429 : 500;
    res.status(status).json({ success: false, error: msg } satisfies ApiResponse);
  }
});

export default router;
