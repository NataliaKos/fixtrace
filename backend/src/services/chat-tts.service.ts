/* ── Chat-TTS Service ──────────────────────────────────────────────────────
 *
 *  Orchestrates two Gemini calls:
 *    1. Text generation  → gemini-2.5-flash      (via shared client)
 *    2. TTS synthesis    → gemini-2.5-flash-preview-tts  (via shared client)
 *
 *  Returns the reply text + raw PCM audio as a base64 string.
 *
 *  Uses the shared Gemini client from gemini.service.ts so all calls go
 *  through Vertex AI in production (no duplicate API-key clients).
 * ─────────────────────────────────────────────────────────────────────────── */

import { generate, generateTts } from "./gemini.service.js";

// ── Voice name – other built-in voices: Kore, Charon, Fenrir, Aoede, Orbit ──
const VOICE_NAME = "Puck";

export interface ChatTtsResult {
  reply: string;
  /** Base64-encoded PCM 16-bit LE 24 kHz mono audio (audio/pcm) */
  audioBase64: string;
}

// ── Step 1: Generate a concise text answer ────────────────────────────────────
async function generateReply(userText: string): Promise<string> {
  return generate({
    systemPrompt:
      "You are a helpful AI assistant. Give concise, friendly answers of 1-3 sentences.",
    userParts: [{ text: userText }],
    temperature: 0.7,
    maxOutputTokens: 256,
  });
}

// ── Public entrypoint ─────────────────────────────────────────────────────────
export async function chatTts(userText: string): Promise<ChatTtsResult> {
  if (!userText?.trim()) throw new Error("userText must not be empty");

  const reply = await generateReply(userText);
  if (!reply) throw new Error("Text model returned an empty reply");

  const audioBase64 = await generateTts({ text: reply, voiceName: VOICE_NAME });

  return { reply, audioBase64 };
}
