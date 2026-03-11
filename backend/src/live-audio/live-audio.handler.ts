/* ── Live Audio WebSocket handler ───────────────────────────────────────────
 *
 *  Manages one browser WebSocket connection and proxies it to a Gemini Live
 *  API session so the chat panel gets truly streaming bidirectional audio.
 *
 *  Protocol (JSON text frames):
 *
 *  Client → Server
 *    { type: "start",       voice?: string, mode?: string }
 *    { type: "audio_chunk", data: string }   base64 PCM 16 kHz 16-bit mono
 *    { type: "audio_end" }
 *    { type: "text",        content: string }
 *    { type: "context",    content: string, images?: string }  JSON array of {gcsUri?,data?,mimeType}
 *    { type: "stop" }
 *
 *  Server → Client
 *    { type: "connected" }
 *    { type: "audio_chunk", data: string }   base64 PCM 24 kHz 16-bit mono
 *    { type: "text",        content: string }   AI output transcript
 *    { type: "input_transcript", content: string }   user voice transcript
 *    { type: "turn_complete" }
 *    { type: "error",       message: string }
 * ─────────────────────────────────────────────────────────────────────────── */

import { GoogleGenAI, Modality } from "@google/genai";
import type { WebSocket } from "ws";
import "dotenv/config";

type SessionMode = "ui" | "perf" | "both" | "enhance";

const SYSTEM_PROMPTS: Record<SessionMode, string> = {
  ui:      "You are FixTrace — an expert UI reviewer. Help the user iteratively improve their UI based on screenshots and conversation. Keep responses concise and conversational since you are speaking aloud.",
  perf:    "You are FixTrace — an expert web-performance engineer. Help the user debug and improve performance. Keep responses concise and conversational since you are speaking aloud.",
  both:    "You are FixTrace — an expert in both UI review and web-performance. Help the user with any front-end quality topic. Keep responses concise and conversational since you are speaking aloud.",
  enhance: "You are FixTrace — an expert UI designer and developer. Help the user enhance their UI. Keep responses concise and conversational since you are speaking aloud.",
};

let _ai: GoogleGenAI | undefined;
function getAi(): GoogleGenAI {
  if (!_ai) {
    const useVertexAI = process.env["GOOGLE_GENAI_USE_VERTEXAI"] === "true";
    if (useVertexAI) {
      const project = process.env["GOOGLE_CLOUD_PROJECT"] ?? "";
      const location = process.env["GOOGLE_CLOUD_LOCATION"] ?? "us-central1";
      _ai = new GoogleGenAI({ vertexai: true, project, location });
    } else {
      const apiKey = process.env["GEMINI_API_KEY"] ?? "";
      _ai = new GoogleGenAI({ apiKey });
    }
  }
  return _ai;
}

/** Send a JSON message only if the WebSocket is still open (readyState === 1). */
function safeSend(ws: WebSocket, payload: object): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

export function handleLiveAudio(ws: WebSocket): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null; // Gemini Live Session (avoid deep generic inference)
  let audioChunks: string[] = []; // buffered base64 PCM chunks within a recording turn

  ws.on("message", async (raw) => {
    let msg: Record<string, string>;
    try {
      msg = JSON.parse(raw.toString()) as Record<string, string>;
    } catch {
      safeSend(ws, { type: "error", message: "Invalid JSON message" });
      return;
    }

    switch (msg["type"]) {

      // ── Open a Gemini Live session ──────────────────────────────────────
      case "start": {
        if (session) {
          try { session.close(); } catch { /* ignore */ }
          session = null;
        }
        audioChunks = [];

        const voice = msg["voice"] ?? "Puck";
        const mode  = (msg["mode"] ?? "both") as SessionMode;

        try {
          const ai = getAi();
          const useVertexAI = process.env["GOOGLE_GENAI_USE_VERTEXAI"] === "true";
          // Vertex AI uses different model IDs for Live API
          const liveModel = useVertexAI
            ? "gemini-live-2.5-flash-native-audio"
            : "gemini-2.5-flash-native-audio-latest";
          session = await ai.live.connect({
            model: liveModel,
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction: {
                parts: [{ text: SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS["both"] }],
              },
              // Disable server-side VAD so we can send manual activityStart/End
              // signals — required for push-to-talk (record button) pattern.
              realtimeInputConfig: {
                automaticActivityDetection: { disabled: true },
              },
            },
            callbacks: {
              onopen: () => {
                console.log("[live-audio] Gemini session open → sending connected");
                safeSend(ws, { type: "connected" });
              },
              onmessage: (e: any) => {
                // Log the raw top-level keys so we can see what the SDK delivers
                console.log("[live-audio] onmessage keys:", Object.keys(e ?? {}));
                console.log("[live-audio] onmessage full:", JSON.stringify(e)?.slice(0, 400));

                const parts: any[] = e?.serverContent?.modelTurn?.parts ?? [];
                for (const part of parts) {
                  // ── Streaming audio chunk ──────────────────────────────
                  const audioData: string | undefined = part?.inlineData?.data;
                  if (audioData) {
                    console.log(`[live-audio] audio_chunk bytes≈${Math.round(audioData.length * 0.75)}`);
                    safeSend(ws, { type: "audio_chunk", data: audioData });
                  }
                  // ── Text part from TEXT modality ───────────────────────
                  const textPart: string | undefined = part?.text;
                  if (textPart) {
                    console.log("[live-audio] text part →", textPart.slice(0, 80));
                    safeSend(ws, { type: "text", content: textPart });
                  }
                }

                const sc = e?.serverContent;
                if (sc) {
                  // ── Turn complete ────────────────────────────────────
                  if (sc.turnComplete === true) {
                    console.log("[live-audio] turn_complete");
                    safeSend(ws, { type: "turn_complete" });
                  }
                }
              },
              onerror: (e: unknown) => {
                const errMsg = e instanceof Error ? e.message : String(e);
                console.error("[live-audio] Gemini WS error:", errMsg, e);
                safeSend(ws, { type: "error", message: errMsg });
              },
              onclose: () => {
                session = null;
              },
            },
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Failed to start Gemini Live session";
          console.error("[live-audio] connect error:", errMsg);
          safeSend(ws, { type: "error", message: errMsg });
        }
        break;
      }

      // ── Buffer mic audio chunk — flushed to Gemini on audio_end ──────
      case "audio_chunk": {
        if (!session || !msg["data"]) break;
        audioChunks.push(msg["data"]);
        break;
      }

      // ── Combine buffered audio and send as a complete push-to-talk turn ──
      case "audio_end": {
        if (!session) { audioChunks = []; break; }
        if (audioChunks.length === 0) break;

        // Manual activity signaling (VAD disabled): signal start, burst all
        // buffered chunks at once, then signal end so the model responds.
        session.sendRealtimeInput({ activityStart: {} });
        for (const chunk of audioChunks) {
          session.sendRealtimeInput({ audio: { data: chunk, mimeType: "audio/pcm;rate=16000" } });
        }
        audioChunks = [];
        session.sendRealtimeInput({ activityEnd: {} });
        break;
      }

      // ── Send typed text turn ───────────────────────────────────────────
      case "text": {
        if (!session || !msg["content"]) break;
        try {
          session.sendClientContent({
            turns: [{ role: "user", parts: [{ text: msg["content"] }] }],
            turnComplete: true,
          });
        } catch (err) {
          console.error("[live-audio] sendClientContent error:", err);
        }
        break;
      }

      // ── Send analysis context (text + optional images) to Gemini ─────────
      case "context": {
        if (!session || !msg["content"]) break;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imgParts: any[] = [];
        try {
          const images: Array<{ gcsUri?: string; data?: string; mimeType?: string }> =
            JSON.parse(msg["images"] ?? "[]");
          for (const img of images) {
            if (img.gcsUri) {
              imgParts.push({ fileData: { fileUri: img.gcsUri, mimeType: img.mimeType ?? "image/png" } });
            } else if (img.data) {
              imgParts.push({ inlineData: { data: img.data, mimeType: img.mimeType ?? "image/png" } });
            }
          }
        } catch { /* ignore malformed images JSON */ }
        try {
          session.sendClientContent({
            turns: [{ role: "user", parts: [{ text: msg["content"] }, ...imgParts] }],
            turnComplete: true,
          });
        } catch (err) {
          console.error("[live-audio] sendClientContent context error:", err);
        }
        break;
      }

      // ── Close the Gemini session ───────────────────────────────────────
      case "stop": {
        audioChunks = [];
        if (session) {
          try { session.close(); } catch { /* ignore */ }
          session = null;
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    audioChunks = [];
    if (session) {
      try { session.close(); } catch { /* ignore */ }
      session = null;
    }
  });

  ws.on("error", (err) => {
    console.error("[live-audio] WebSocket error:", err.message);
  });
}
