/* ── TTS Service ────────────────────────────────────────────────────────────
 *
 *  Converts text to speech using Gemini TTS and returns a WAV-wrapped
 *  base64 string that browsers can decode via AudioContext.decodeAudioData().
 *
 *  Gemini returns raw PCM (16-bit LE, 24 kHz, mono). We prepend a standard
 *  44-byte RIFF/WAVE header so Web Audio API can consume it directly.
 *
 *  Uses the shared Gemini client (Vertex AI in prod, API key locally) via
 *  gemini.service.ts — no duplicate client instantiation.
 * ─────────────────────────────────────────────────────────────────────────── */

import { generateTts } from "./gemini.service.js";

export const DEFAULT_VOICE = "Puck";

/** All built-in Gemini TTS voice names. */
export const TTS_VOICES = ["Puck", "Kore", "Charon", "Fenrir", "Aoede", "Orbit", "Zephyr"] as const;
export type TtsVoice = typeof TTS_VOICES[number];

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

  const pcmBase64 = await generateTts({ text, voiceName: voice });
  const pcmBuffer = Buffer.from(pcmBase64, "base64");
  const wavBuffer = addWavHeader(pcmBuffer);
  return wavBuffer.toString("base64");
}
