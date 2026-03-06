/* ── Voice routes (standalone transcription) ── */

import { Router, type Request, type Response } from "express";
import { generate, uploadToGemini } from "../services/gemini.service.js";
import type { ApiResponse } from "../models/interfaces.js";

const router = Router();

/**
 * POST /api/voice/transcribe
 * Body: { audioBase64: string, audioMimeType: string }
 * Returns: { text: string }
 *
 * Uploads audio via the Gemini Files API, then asks the model to transcribe.
 */
router.post("/transcribe", async (req: Request, res: Response) => {
  try {
    const { audioBase64, audioMimeType } = req.body as {
      audioBase64: string;
      audioMimeType: string;
    };

    if (!audioBase64 || !audioMimeType) {
      res.status(400).json({
        success: false,
        error: "audioBase64 and audioMimeType are required",
      } satisfies ApiResponse);
      return;
    }

    // Convert base64 to Buffer and upload via Files API (avoids inline size limits)
    const buffer = Buffer.from(audioBase64, "base64");
    console.log(`Voice transcribe: uploading ${(buffer.length / 1024).toFixed(1)} KB audio (${audioMimeType})`);
    const filePart = await uploadToGemini(buffer, audioMimeType, "voice-recording");

    const text = await generate({
      systemPrompt:
        "You are a transcription assistant. Transcribe the user's audio accurately. " +
        "Output ONLY the transcribed text — no commentary, no labels, no quotation marks. " +
        "If the audio is unclear, do your best approximation.",
      userParts: [
        filePart,
        { text: "Transcribe this audio." },
      ],
    });

    res.json({ success: true, data: { text: text.trim() } } satisfies ApiResponse<{ text: string }>);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Transcription failed";
    const status = err?.status ?? err?.code ?? err?.httpStatusCode ?? "unknown";
    console.error(`Transcription error (status=${status}):`, msg);
    res.status(500).json({ success: false, error: `Transcription failed (${status}): ${msg}` } satisfies ApiResponse);
  }
});

export default router;
