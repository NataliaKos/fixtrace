/* ── TTS Service ────────────────────────────────────────────────────────────
 *
 *  Converts text to speech using Gemini TTS and returns a WAV-wrapped
 *  base64 string that browsers can decode via AudioContext.decodeAudioData().
 *
 *  Gemini returns raw PCM (16-bit LE, 24 kHz, mono). We prepend a standard
 *  44-byte RIFF/WAVE header so Web Audio API can consume it directly.
 * ─────────────────────────────────────────────────────────────────────────── */

import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
export const DEFAULT_VOICE = "Puck";

/** All built-in Gemini TTS voice names. */
export const TTS_VOICES = ["Puck", "Kore", "Charon", "Fenrir", "Aoede", "Orbit", "Zephyr"] as const;
export type TtsVoice = typeof TTS_VOICES[number];

let _client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment");
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

/** Prepend a 44-byte RIFF/WAVE header to raw PCM bytes. */
function addWavHeader(pcm: Buffer, sampleRate = 24_000, channels = 1, bitDepth = 16): Buffer {
  const byteRate   = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize   = pcm.length;
  const header     = Buffer.alloc(44);
  let o = 0;

  header.write("RIFF",          o); o += 4;
  header.writeUInt32LE(36 + dataSize, o); o += 4;
  header.write("WAVE",          o); o += 4;
  header.write("fmt ",          o); o += 4;
  header.writeUInt32LE(16,      o); o += 4; // PCM chunk size
  header.writeUInt16LE(1,       o); o += 2; // format = PCM
  header.writeUInt16LE(channels, o); o += 2;
  header.writeUInt32LE(sampleRate, o); o += 4;
  header.writeUInt32LE(byteRate,   o); o += 4;
  header.writeUInt16LE(blockAlign, o); o += 2;
  header.writeUInt16LE(bitDepth,   o); o += 2;
  header.write("data",          o); o += 4;
  header.writeUInt32LE(dataSize,   o);

  return Buffer.concat([header, pcm]);
}

/**
 * Synthesise text to speech.
 * Returns a base64-encoded WAV string (audio/wav, 24 kHz mono 16-bit PCM).
 */
export async function synthesizeToWav(text: string, voice: TtsVoice = DEFAULT_VOICE): Promise<string> {
  if (!text?.trim()) throw new Error("text must not be empty");

  const ai = getClient();

  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) throw new Error("TTS response contained no audio data");

  const pcmBuffer = Buffer.from(inlineData.data, "base64");
  const wavBuffer = addWavHeader(pcmBuffer);
  return wavBuffer.toString("base64");
}
