/* ── Live Session service (multi-turn chat with Gemini) ── */

import { v4 as uuidv4 } from "uuid";
import { startChat, uploadToGemini, generateImage, type ChatSession } from "./gemini.service.js";
import type {
  LiveSessionConfig,
  LiveSessionMessage,
  LiveSessionState,
} from "../models/interfaces.js";
import type { Part, Content } from "@google/genai";

// In-memory session store (swap for Redis / Firestore in production)
const sessions = new Map<string, { chat: ChatSession; state: LiveSessionState }>();

const SYSTEM_PROMPTS: Record<LiveSessionConfig["mode"], string> = {
  ui: "You are FixTrace — an expert UI reviewer. Help the user iteratively improve their UI based on screenshots and conversation.",
  perf: "You are FixTrace — an expert web-performance engineer. Help the user debug and improve performance based on traces and conversation.",
  both: "You are FixTrace — an expert in both UI review and web-performance. Help the user with any front-end quality topic.",
  enhance: "You are FixTrace — an expert UI designer and developer. Help the user enhance their UI. If the user asks for a new design or image, you MUST include a prompt for the image generation model in your response, wrapped exactly like this: [IMAGE_PROMPT: <detailed description of the UI layout, colors, and elements>]. I will parse this and generate the image for the user.",
};

/**
 * Create a new live chat session.
 */
export function createSession(mode: LiveSessionConfig["mode"]): LiveSessionState {
  const sessionId = uuidv4();
  const config: LiveSessionConfig = {
    sessionId,
    mode,
    createdAt: new Date().toISOString(),
  };
  const state: LiveSessionState = { config, history: [] };
  const chat = startChat({ systemPrompt: SYSTEM_PROMPTS[mode] });
  sessions.set(sessionId, { chat, state });
  return state;
}

/**
 * Send a user message (optionally with file attachments) and get the model reply.
 */
export async function sendMessage(
  sessionId: string,
  content: string,
  attachments?: { gcsUri: string; mimeType: string }[],
): Promise<LiveSessionMessage> {
  const entry = sessions.get(sessionId);
  if (!entry) throw new Error(`Session ${sessionId} not found`);

  const parts: Part[] = [];
  if (attachments) {
    for (const a of attachments) {
      parts.push({ fileData: { fileUri: a.gcsUri, mimeType: a.mimeType } });
    }
  }
  parts.push({ text: content });

  // Record user message
  const userMsg: LiveSessionMessage = {
    role: "user",
    content,
    timestamp: new Date().toISOString(),
    ...(attachments ? { attachments } : {}),
  };
  entry.state.history.push(userMsg);

  // Get model reply
  let reply = await entry.chat.sendMessage(parts);
  let imageUrl: string | undefined;

  // Check if the model wants to generate an image
  const imagePromptMatch = reply.match(/\[IMAGE_PROMPT:\s*(.*?)\]/i);
  if (imagePromptMatch && imagePromptMatch[1]) {
    const prompt = imagePromptMatch[1].trim();
    try {
      imageUrl = await generateImage({ prompt });
      // Remove the prompt from the text shown to the user
      reply = reply.replace(/\[IMAGE_PROMPT:\s*(.*?)\]/i, "").trim();
    } catch (err) {
      console.error("Failed to generate image in live session:", err);
      reply += "\n\n*(Note: I tried to generate an image for this, but the image generation service failed.)*";
    }
  }

  const modelMsg: LiveSessionMessage = {
    role: "model",
    content: reply,
    timestamp: new Date().toISOString(),
    ...(imageUrl ? { imageUrl } : {}),
  };
  entry.state.history.push(modelMsg);

  return modelMsg;
}

/**
 * Retrieve session state.
 */
export function getSession(sessionId: string): LiveSessionState | undefined {
  return sessions.get(sessionId)?.state;
}

/**
 * Send a voice message (base64 audio) and get the model reply.
 * The audio is sent as inline data to Gemini for understanding.
 */
export async function sendVoiceMessage(
  sessionId: string,
  audioBase64: string,
  audioMimeType: string,
  textPrompt?: string,
): Promise<LiveSessionMessage> {
  const entry = sessions.get(sessionId);
  if (!entry) throw new Error(`Session ${sessionId} not found`);

  // Upload audio via Files API instead of inline (avoids token/size limits)
  const buffer = Buffer.from(audioBase64, "base64");
  console.log(`Voice session: uploading ${(buffer.length / 1024).toFixed(1)} KB audio (${audioMimeType})`);
  const filePart = await uploadToGemini(buffer, audioMimeType, "voice-message");

  const parts: Part[] = [filePart];

  // Optional text prompt to guide the model (e.g. "Transcribe and respond to this voice message")
  parts.push({
    text:
      textPrompt ||
      "The user sent a voice message. Listen to it, understand what they are asking about the UI or performance, and respond helpfully. If they are asking for code changes, provide concrete Angular/Tailwind code. Start your response with a brief transcript of what they said.",
  });

  // Record user message
  const userMsg: LiveSessionMessage = {
    role: "user",
    content: textPrompt || "🎤 Voice message",
    timestamp: new Date().toISOString(),
    isAudio: true,
    audioData: { base64: audioBase64, mimeType: audioMimeType },
  };
  entry.state.history.push(userMsg);

  // Get model reply
  let reply = await entry.chat.sendMessage(parts);
  let imageUrl: string | undefined;

  // Check if the model wants to generate an image
  const imagePromptMatch = reply.match(/\[IMAGE_PROMPT:\s*(.*?)\]/i);
  if (imagePromptMatch && imagePromptMatch[1]) {
    const prompt = imagePromptMatch[1].trim();
    try {
      imageUrl = await generateImage({ prompt });
      // Remove the prompt from the text shown to the user
      reply = reply.replace(/\[IMAGE_PROMPT:\s*(.*?)\]/i, "").trim();
    } catch (err) {
      console.error("Failed to generate image in live session:", err);
      reply += "\n\n*(Note: I tried to generate an image for this, but the image generation service failed.)*";
    }
  }

  const modelMsg: LiveSessionMessage = {
    role: "model",
    content: reply,
    timestamp: new Date().toISOString(),
    ...(imageUrl ? { imageUrl } : {}),
  };
  entry.state.history.push(modelMsg);

  return modelMsg;
}

/**
 * Delete a session.
 */
export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}
