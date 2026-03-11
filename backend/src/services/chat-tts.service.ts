/* ── Chat-TTS Service ──────────────────────────────────────────────────────
 *
 *  Orchestrates two Gemini calls:
 *    1. Text generation  → gemini-3.1-pro-preview  (configurable via TEXT_MODEL)
 *    2. TTS synthesis    → gemini-2.5-flash-preview-tts  (configurable via TTS_MODEL)
 *
 *  Returns the reply text + raw PCM audio as a base64 string.
 *
 *  TODO (streaming upgrade): swap generateContent() for a Gemini Live WebSocket
 *  session to stream audio chunks in real-time once the MVP is stable.
 * ─────────────────────────────────────────────────────────────────────────── */

import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

// ── Model names – change here to try other variants ──────────────────────────
const TEXT_MODEL = "gemini-3.1-pro-preview";
const TTS_MODEL  = "gemini-2.5-flash-preview-tts";

// ── Voice name – other built-in voices: Kore, Charon, Fenrir, Aoede, Orbit ──
const VOICE_NAME = "Puck";

let _client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment");
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export interface ChatTtsResult {
  reply: string;
  /** Base64-encoded PCM 16-bit LE 24 kHz mono audio (audio/pcm) */
  audioBase64: string;
}

// ── Step 1: Generate a concise text answer ────────────────────────────────────
async function generateReply(userText: string): Promise<string> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: "user", parts: [{ text: userText }] }],
    config: {
      systemInstruction:
        "You are a helpful AI assistant. Give concise, friendly answers of 1-3 sentences.",
      // ── Tune these to change reply style ──────────────────────────────────
      temperature: 0.7,
      maxOutputTokens: 256,
    },
  });

  return response.text ?? "";
}

// ── Step 2: Synthesise the reply with Gemini TTS ──────────────────────────────
async function synthesiseSpeech(text: string): Promise<string> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      // AUDIO modality triggers speech synthesis output
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            // ── Swap VOICE_NAME constant above to change the voice ─────────
            voiceName: VOICE_NAME,
          },
        },
      },
    },
  });

  // The SDK returns audio inline as base64 PCM bytes
  const inlineData =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData;

  if (!inlineData?.data) {
    throw new Error("TTS response contained no audio data");
  }

  return inlineData.data; // already base64
}

// ── Public entrypoint ─────────────────────────────────────────────────────────
export async function chatTts(userText: string): Promise<ChatTtsResult> {
  if (!userText?.trim()) throw new Error("userText must not be empty");

  const reply = await generateReply(userText);
  if (!reply) throw new Error("Text model returned an empty reply");

  const audioBase64 = await synthesiseSpeech(reply);

  return { reply, audioBase64 };
}
