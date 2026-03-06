/* ── UI Enhancement service ── */

import { v4 as uuidv4 } from "uuid";
import { generate, generateImage, uploadToGemini } from "./gemini.service.js";
import { downloadFile } from "./storage.service.js";
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

  // If an image/video was provided, upload it
  if (req.gcsUri && req.mimeType && req.fileId) {
    const fileBuffer = await downloadFile(req.gcsUri);
    const filePart = await uploadToGemini(fileBuffer, req.mimeType, req.fileId);
    userParts.push(filePart);
  }

  userParts.push({ text: buildUiEnhanceUserPrompt(req.userPrompt, req.files) });

  // 1. Get the image prompt and code patches from Gemini
  // gemini-2.5-flash supports up to 65536 output tokens; gemini-2.0-flash caps at 8192
  // which causes JSON truncation when patches are large.
  const text = await generate({
    model: "gemini-2.5-flash",
    systemPrompt: UI_ENHANCE_SYSTEM_PROMPT,
    userParts,
    maxOutputTokens: 65536,
  });

  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  const parsed = JSON.parse(cleaned) as EnhanceResponse;

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
    patches: parsed.patches ?? [],
    summary: parsed.summary ?? "UI Enhancement complete.",
    analyzedAt: new Date().toISOString(),
  };
}
