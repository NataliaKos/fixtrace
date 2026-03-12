/* ── UI Enhancement service ── */

import { v4 as uuidv4 } from "uuid";
import { generate, generateImage, uploadToGemini, filePartFromGcsUri, extractJson } from "./gemini.service.js";
import { downloadFile } from "./storage.service.js";
import { applyHunks } from "./diff-apply.service.js";
import {
  UI_ENHANCE_SYSTEM_PROMPT,
  buildUiEnhanceUserPrompt,
} from "../prompts/ui-enhance.prompt.js";
import type {
  UiEnhanceRequest,
  UiEnhanceResult,
  FilePatch,
} from "../models/interfaces.js";
import type { Part } from "@google/genai";

interface EnhanceResponse {
  imagePrompt: string;
  summary: string;
  patches: FilePatch[];
}

export async function enhanceUi(
  req: UiEnhanceRequest,
): Promise<UiEnhanceResult> {
  const requestId = uuidv4();
  const userParts: Part[] = [];

  // If an image/video was provided, get the file part
  if (req.gcsUri && req.mimeType && req.fileId) {
    const useVertexAI = process.env["GOOGLE_GENAI_USE_VERTEXAI"] === "true";
    if (useVertexAI) {
      userParts.push(filePartFromGcsUri(req.gcsUri, req.mimeType));
    } else {
      const fileBuffer = await downloadFile(req.gcsUri);
      const filePart = await uploadToGemini(fileBuffer, req.mimeType, req.fileId);
      userParts.push(filePart);
    }
  }

  userParts.push({ text: buildUiEnhanceUserPrompt(req.userPrompt, req.files) });

  // 1. Get the image prompt and code patches from Gemini
  const text = await generate({
    model: "gemini-2.5-flash",
    systemPrompt: UI_ENHANCE_SYSTEM_PROMPT,
    userParts,
    maxOutputTokens: 16384,
  });

  const parsed = extractJson<EnhanceResponse>(text);

  // Build lookup of original file content for applying hunks
  const originalsByPath = new Map<string, string>();
  if (req.files) {
    for (const f of req.files) {
      originalsByPath.set(f.path, f.content);
    }
  }

  // Compute 'modified' server-side by applying hunks
  const patches = (parsed.patches ?? []).map((p: any) => {
    const original = originalsByPath.get(p.filePath) ?? "";
    const modified = original ? applyHunks(original, p.hunks ?? "") : (p.modified ?? p.hunks ?? "");
    return { ...p, modified };
  });

  // 2. Generate the image using Imagen 3
  let imageUrl = "";
  try {
    imageUrl = await generateImage({ prompt: parsed.imagePrompt });
  } catch (err) {
    console.error("Failed to generate image:", err);
    throw new Error("Image generation failed. Please try again.");
  }

  return {
    requestId,
    imageUrl,
    patches,
    summary: parsed.summary ?? "UI Enhancement complete.",
    analyzedAt: new Date().toISOString(),
  };
}
