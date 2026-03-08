/**
 * GeminiVoiceService
 *
 * Sends a text question to the backend POST /api/chat-tts endpoint,
 * receives the AI reply text + base64-encoded PCM audio, and wraps
 * the PCM bytes in a WAV container so the browser's AudioContext can
 * decode it with decodeAudioData().
 *
 * TODO (microphone input): To add voice-in, record with getUserMedia,
 *   convert to base64, POST to a /api/transcribe endpoint that calls
 *   Gemini's transcription model, then pass the transcript to chatToSpeech().
 *
 * TODO (streaming): Replace this HTTP call with a WebSocket that connects
 *   to a Gemini Live API session on the backend so audio chunks stream in
 *   real time before the full reply is ready.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

// ── Match the backend's response shape ───────────────────────────────────────
interface ChatTtsResponse {
  reply: string;
  /** Base64-encoded PCM 16-bit LE 24 kHz mono */
  audioBase64: string;
}

export interface ChatTtsResult {
  reply: string;
  /** WAV-wrapped AudioArrayBuffer ready for decodeAudioData() */
  audioArrayBuffer: ArrayBuffer;
}

// ── Backend URL from environment config ──────────────────────────────────────
const API_URL = `${environment.apiUrl}/api/chat-tts`;

// Gemini TTS returns PCM 16-bit LE at 24 kHz, mono
const PCM_SAMPLE_RATE = 24_000;
const PCM_CHANNELS    = 1;
const PCM_BIT_DEPTH   = 16;

@Injectable({ providedIn: 'root' })
export class GeminiVoiceService {
  private readonly http = inject(HttpClient);

  async chatToSpeech(text: string): Promise<ChatTtsResult> {
    const { reply, audioBase64 } = await firstValueFrom(
      this.http.post<ChatTtsResponse>(API_URL, { text }),
    );

    // Decode base64 → raw PCM bytes
    const pcmBytes = base64ToUint8Array(audioBase64);

    // Wrap in a WAV container so AudioContext.decodeAudioData() accepts it
    const audioArrayBuffer = pcmToWav(pcmBytes, PCM_SAMPLE_RATE, PCM_CHANNELS, PCM_BIT_DEPTH);

    return { reply, audioArrayBuffer };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Prepend a standard WAV/RIFF header to raw PCM bytes.
 * This makes the data parseable by AudioContext.decodeAudioData().
 */
function pcmToWav(
  pcm: Uint8Array,
  sampleRate: number,
  numChannels: number,
  bitDepth: number,
): ArrayBuffer {
  const byteRate  = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize  = pcm.byteLength;
  const buffer    = new ArrayBuffer(44 + dataSize);
  const view      = new DataView(buffer);

  // RIFF chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);           // sub-chunk size
  view.setUint16(20, 1, true);            // PCM = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples
  new Uint8Array(buffer, 44).set(pcm);

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
