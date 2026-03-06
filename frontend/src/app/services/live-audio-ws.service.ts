/**
 * LiveAudioWsService
 *
 * Manages a single WebSocket connection to the backend `/api/live-audio`
 * endpoint which proxies the Gemini Live API for true streaming audio I/O.
 *
 * NOT providedIn root — must be declared in the component's `providers` array
 * so each chat panel gets its own isolated instance.
 *
 * Responsibilities:
 *  - Open/close the WebSocket and Gemini Live session
 *  - Capture microphone audio as 16 kHz 16-bit PCM and stream it to the server
 *  - Track mic audio level for the recording indicator
 *  - Relay 24 kHz PCM chunks received from the AI via `pcmChunk$`
 *  - Relay text/transcript/turn-complete events via Subjects
 */

import { Injectable, signal, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';

/** Derive ws:// URL from the configured http:// API base. */
function toWsUrl(apiUrl: string, path: string): string {
  return apiUrl.replace(/^http/, 'ws') + path;
}

/** Convert a Float32 PCM buffer to a base64-encoded Int16 PCM string. */
function float32ToBase64Pcm16(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
  }
  const bytes = new Uint8Array(i16.buffer);
  // Chunked to avoid call-stack overflow on large buffers
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...(bytes.subarray(i, i + CHUNK) as unknown as number[]));
  }
  return btoa(binary);
}

/** Convert a base64 string to a raw ArrayBuffer. */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Image or file reference to include alongside a context message. */
export interface ContextImage {
  /** GCS URI for files already uploaded to cloud storage (e.g. user screenshot). */
  gcsUri?: string;
  /** Raw base64-encoded image bytes (e.g. AI-generated enhanced UI image). */
  data?: string;
  mimeType: string;
}

@Injectable()
export class LiveAudioWsService implements OnDestroy {
  // ── Signals (bindable state) ─────────────────────────────────────────────
  readonly isConnected  = signal(false);
  readonly isRecording  = signal(false);
  readonly audioLevel   = signal(0);   // 0–1, updated ~60 fps during recording

  // ── Observables (events from the AI) ────────────────────────────────────
  /** Emits once when the Gemini session is ready (server sends `connected`) */
  readonly connected$        = new Subject<void>();
  /** 24 kHz 16-bit mono PCM chunk from the AI — feed to AvatarSceneComponent */
  readonly pcmChunk$        = new Subject<ArrayBuffer>();
  /** Transcription of the AI's spoken reply */
  readonly textOutput$      = new Subject<string>();
  /** Transcription of the user's voice input */
  readonly inputTranscript$ = new Subject<string>();
  /** AI finished its current turn */
  readonly turnComplete$    = new Subject<void>();
  /** Non-fatal error message */
  readonly error$           = new Subject<string>();

  // ── Private state ────────────────────────────────────────────────────────
  private ws:                WebSocket | null = null;
  private micStream:         MediaStream | null = null;
  private micCtx:            AudioContext | null = null;
  private micSource:         MediaStreamAudioSourceNode | null = null;
  private micAnalyser:       AnalyserNode | null = null;
  private micProcessor:      ScriptProcessorNode | null = null;
  private levelRafId:        number | null = null;
  private levelData:         Uint8Array<ArrayBuffer> | null = null;

  // ── Connection ───────────────────────────────────────────────────────────

  /** Open the WebSocket and signal the backend to start a Gemini Live session. */
  connect(voice: string, mode: string): void {
    this.disconnect(); // clean up any previous session

    const url = toWsUrl(environment.apiUrl, '/api/live-audio');
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({ type: 'start', voice, mode }));
    };

    this.ws.onmessage = (event: MessageEvent<string>) => {
      let msg: Record<string, string>;
      try { msg = JSON.parse(event.data) as Record<string, string>; }
      catch { return; }

      switch (msg['type']) {
        case 'connected':
          this.isConnected.set(true);
          this.connected$.next();
          break;
        case 'audio_chunk':
          if (msg['data']) {
            this.pcmChunk$.next(base64ToArrayBuffer(msg['data']));
          }
          break;
        case 'text':
          if (msg['content']) this.textOutput$.next(msg['content']);
          break;
        case 'input_transcript':
          if (msg['content']) this.inputTranscript$.next(msg['content']);
          break;
        case 'turn_complete':
          this.turnComplete$.next();
          break;
        case 'error':
          this.error$.next(msg['message'] ?? 'Unknown error');
          break;
      }
    };

    this.ws.onclose = () => {
      this.isConnected.set(false);
      this.stopRecording();
    };

    this.ws.onerror = () => {
      this.error$.next('WebSocket connection error');
      this.isConnected.set(false);
    };
  }

  /** Close the WebSocket and stop any active recording. */
  disconnect(): void {
    this.stopRecording();
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'stop' }));
      }
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.isConnected.set(false);
  }

  // ── Text input ───────────────────────────────────────────────────────────

  sendText(content: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'text', content }));
    }
  }

  /** Send analysis context with optional image attachments. */
  sendContextWithMedia(content: string, images: ContextImage[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'context',
        content,
        images: JSON.stringify(images),
      }));
    }
  }

  // ── Voice recording ──────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    if (this.isRecording()) return;

    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    // 16 kHz matches Gemini Live input requirement
    this.micCtx = new AudioContext({ sampleRate: 16000 });
    this.micSource = this.micCtx.createMediaStreamSource(this.micStream);

    // Analyser for visual audio-level indicator
    this.micAnalyser = this.micCtx.createAnalyser();
    this.micAnalyser.fftSize = 256;
    this.levelData = new Uint8Array(this.micAnalyser.frequencyBinCount);
    this.micSource.connect(this.micAnalyser);

    // ScriptProcessorNode — deprecated but universally supported; replace with
    // AudioWorklet when project adds a module-bundling step for worklet files.
    this.micProcessor = this.micCtx.createScriptProcessor(4096, 1, 1);
    this.micSource.connect(this.micProcessor);
    this.micProcessor.connect(this.micCtx.destination);

    this.micProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.isRecording() || this.ws?.readyState !== WebSocket.OPEN) return;
      const f32 = e.inputBuffer.getChannelData(0);
      const data = float32ToBase64Pcm16(f32);
      this.ws!.send(JSON.stringify({ type: 'audio_chunk', data }));
    };

    this.isRecording.set(true);
    this.startLevelTracking();
  }

  stopRecording(): void {
    if (!this.isRecording()) return;
    this.isRecording.set(false);
    this.audioLevel.set(0);
    this.stopLevelTracking();

    // Signal end of audio turn to Gemini
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'audio_end' }));
    }

    this.micProcessor?.disconnect();
    this.micProcessor = null;
    this.micAnalyser?.disconnect();
    this.micAnalyser = null;
    this.micSource?.disconnect();
    this.micSource = null;
    this.micCtx?.close();
    this.micCtx = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.levelData = null;
  }

  // ── Audio level tracking ─────────────────────────────────────────────────

  private startLevelTracking(): void {
    const update = () => {
      if (!this.micAnalyser || !this.levelData) return;
      this.micAnalyser.getByteTimeDomainData(this.levelData);
      let sum = 0;
      for (let i = 0; i < this.levelData.length; i++) {
        const v = (this.levelData[i]! - 128) / 128;
        sum += v * v;
      }
      this.audioLevel.set(Math.min(1, Math.sqrt(sum / this.levelData.length) * 4));
      this.levelRafId = requestAnimationFrame(update);
    };
    this.levelRafId = requestAnimationFrame(update);
  }

  private stopLevelTracking(): void {
    if (this.levelRafId !== null) {
      cancelAnimationFrame(this.levelRafId);
      this.levelRafId = null;
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.disconnect();
  }
}
