/* ── Gemini GenAI SDK wrapper ── */

import { GoogleGenAI, Type, type Content, type Part, type Schema } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import "dotenv/config";

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!client) {
    const useVertexAI = process.env["GOOGLE_GENAI_USE_VERTEXAI"] === "true";

    if (useVertexAI) {
      const project = process.env["GOOGLE_CLOUD_PROJECT"] ?? "";
      const location = process.env["GOOGLE_CLOUD_LOCATION"] ?? "us-central1";
      console.log(`[gemini] Initializing Vertex AI client, project=${project}, location=${location}`);
      client = new GoogleGenAI({ vertexai: true, project, location });
    } else {
      const apiKey = process.env["GEMINI_API_KEY"] ?? "";
      console.log(`[gemini] Initializing API key client, key present: ${apiKey.length > 0}, key length: ${apiKey.length}`);
      client = new GoogleGenAI({ apiKey });
    }
  }
  return client;
}

const DEFAULT_MODEL = "gemini-2.5-flash";

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
      const isRetryable = status === 429 || status === 500 || status === 503 || /resource.exhausted|too many requests|internal/i.test(String(err?.message));
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
  /** When true, sets responseMimeType to application/json to force structured output */
  jsonMode?: boolean;
  /** JSON Schema to enforce constrained decoding (requires jsonMode: true) */
  responseSchema?: Schema;
}

export async function generate(opts: GenerateOptions): Promise<string> {
  const ai = getClient();
  const modelName = opts.model ?? DEFAULT_MODEL;

  const partSummary = opts.userParts.map((p, i) => {
    if ('text' in p && p.text) return `part[${i}]: text (${p.text.length} chars)`;
    if ('fileData' in p && p.fileData) return `part[${i}]: fileData (${p.fileData.fileUri})`;
    if ('inlineData' in p && p.inlineData) return `part[${i}]: inlineData (${p.inlineData.mimeType})`;
    return `part[${i}]: unknown`;
  });
  console.log(`[gemini] generate() model=${modelName}, parts=[${partSummary.join(', ')}], temp=${opts.temperature ?? 0.3}, maxTokens=${opts.maxOutputTokens ?? 8192}`);

  const contents: Content[] = [
    { role: "user", parts: opts.userParts },
  ];

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: opts.systemPrompt,
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxOutputTokens ?? 8192,
        ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
        ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
      },
    }),
  );

  const text = response.text ?? "";
  const finishReason = response.candidates?.[0]?.finishReason;
  console.log(`[gemini] generate() response length=${text.length}, finishReason=${finishReason}`);
  if (finishReason === "MAX_TOKENS" || finishReason === "STOP") {
    // expected
  } else if (finishReason) {
    console.warn(`[gemini] Unexpected finishReason: ${finishReason}`);
  }
  return text;
}

/**
 * Extract and parse JSON from a Gemini response, handling markdown fences,
 * unescaped quotes in strings, truncated output, etc.
 * Uses jsonrepair as a robust fallback.
 */
export function extractJson<T = any>(raw: string): T {
  // Strip markdown code fences
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.warn(`[gemini] Direct JSON.parse failed: ${e.message}`);
    const posMatch = e.message?.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      console.warn(`[gemini] Error context around position ${pos}:`, JSON.stringify(cleaned.substring(Math.max(0, pos - 100), pos + 100)));
    }
  }

  // Sanitize: escape raw control characters inside JSON string values
  // Gemini often emits actual newlines/tabs inside strings (e.g. in diff hunks)
  const sanitized = sanitizeJsonControlChars(cleaned);

  // Try parse after sanitization
  try {
    return JSON.parse(sanitized);
  } catch (e: any) {
    console.warn(`[gemini] Sanitized JSON.parse failed: ${e.message}`);
  }

  // Use jsonrepair on the sanitized text to fix remaining issues
  // (unescaped quotes, trailing commas, truncation, etc.)
  try {
    const repaired = jsonrepair(sanitized);
    console.log(`[gemini] jsonrepair succeeded (original=${sanitized.length}, repaired=${repaired.length})`);
    return JSON.parse(repaired);
  } catch (e: any) {
    console.error(`[gemini] jsonrepair also failed: ${e.message}`);
  }

  console.error("[gemini] extractJson FAILED. Raw text (first 2000 chars):", raw.substring(0, 2000));
  console.error("[gemini] extractJson FAILED. Raw text (last 500 chars):", raw.substring(raw.length - 500));
  throw new Error(`Failed to extract valid JSON from Gemini response (length=${raw.length})`);
}

/**
 * Walk through JSON text and escape raw control characters (0x00-0x1F)
 * that appear inside string values. Preserves already-escaped sequences
 * like \\n, \\t, etc. and structural whitespace outside strings.
 */
function sanitizeJsonControlChars(text: string): string {
  const out: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const code = ch.charCodeAt(0);

    if (inString) {
      // Backslash escape — pass both chars through
      if (ch === "\\" && i + 1 < text.length) {
        out.push(ch, text[i + 1]!);
        i++;
        continue;
      }
      // Closing quote
      if (ch === '"') {
        inString = false;
        out.push(ch);
        continue;
      }
      // Raw control character inside a string — must escape
      if (code < 0x20) {
        switch (code) {
          case 0x0a: out.push("\\n"); break;   // newline
          case 0x0d: out.push("\\r"); break;   // carriage return
          case 0x09: out.push("\\t"); break;   // tab
          case 0x08: out.push("\\b"); break;   // backspace
          case 0x0c: out.push("\\f"); break;   // form feed
          default:   out.push("\\u" + code.toString(16).padStart(4, "0"));
        }
        continue;
      }
      out.push(ch);
    } else {
      // Opening quote
      if (ch === '"') {
        inString = true;
      }
      out.push(ch);
    }
  }
  return out.join("");
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
