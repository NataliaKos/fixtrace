/* ── Gemini GenAI SDK wrapper ── */

import { GoogleGenAI, type Content, type Part } from "@google/genai";
import "dotenv/config";

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env["GEMINI_API_KEY"] ?? "" });
  }
  return client;
}

const DEFAULT_MODEL = "gemini-2.0-flash";

// ── Retry helper for 429 / 503 transient errors ────────────────────
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2_000;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.code ?? err?.httpStatusCode;
      const isRetryable = status === 429 || status === 503 || /resource.exhausted|too many requests/i.test(String(err?.message));
      if (!isRetryable || attempt === MAX_RETRIES) throw err;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1_000;
      console.warn(`Gemini ${status} — retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ── Upload a buffer to Gemini Files API and return a fileData Part ───
export async function uploadToGemini(
  buffer: Buffer,
  mimeType: string,
  displayName?: string,
): Promise<Part> {
  const ai = getClient();

  // Convert Buffer to a Blob for the SDK
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });

  const uploadResult = await withRetry(() =>
    ai.files.upload({
      file: blob,
      config: { mimeType, displayName: displayName ?? "upload" },
    }),
  );

  const uri = uploadResult.uri;
  if (!uri) throw new Error("Gemini file upload did not return a URI");

  return {
    fileData: {
      fileUri: uri,
      mimeType,
    },
  };
}

// ── One-shot multimodal generation ──────────────────────────────────
export interface GenerateOptions {
  model?: string;
  systemPrompt: string;
  userParts: Part[];
  temperature?: number;
  maxOutputTokens?: number;
}

export async function generate(opts: GenerateOptions): Promise<string> {
  const ai = getClient();

  const contents: Content[] = [
    { role: "user", parts: opts.userParts },
  ];

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: opts.model ?? DEFAULT_MODEL,
      contents,
      config: {
        systemInstruction: opts.systemPrompt,
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxOutputTokens ?? 8192,
      },
    }),
  );

  return response.text ?? "";
}

// ── Image generation ────────────────────────────────────────────────
export interface GenerateImageOptions {
  prompt: string;
  model?: string;
}

export async function generateImage(opts: GenerateImageOptions): Promise<string> {
  const ai = getClient();

  const response = await withRetry(() =>
    ai.models.generateImages({
      model: opts.model ?? "imagen-4.0-generate-001",
      prompt: opts.prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
      },
    })
  );

  const base64 = response.generatedImages?.[0]?.image?.imageBytes;
  if (!base64) {
    throw new Error("Image generation failed: no image bytes returned");
  }

  return `data:image/jpeg;base64,${base64}`;
}

// ── Multimodal chat (for live sessions) ─────────────────────────────
export interface ChatSession {
  sendMessage(parts: Part[]): Promise<string>;
}

export function startChat(opts: {
  model?: string;
  systemPrompt: string;
  history?: Content[];
}): ChatSession {
  const ai = getClient();

  const chat = ai.chats.create({
    model: opts.model ?? DEFAULT_MODEL,
    config: {
      systemInstruction: opts.systemPrompt,
      temperature: 0.3,
    },
    history: opts.history ?? [],
  });

  return {
    async sendMessage(parts: Part[]): Promise<string> {
      const res = await withRetry(() => chat.sendMessage({ message: parts }));
      return res.text ?? "";
    },
  };
}
