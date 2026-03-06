/* ── UI Analysis service ── */

import { v4 as uuidv4 } from "uuid";
import { generate, uploadToGemini } from "./gemini.service.js";
import { downloadFile } from "./storage.service.js";
import {
  UI_ANALYSIS_SYSTEM_PROMPT,
  buildUiAnalysisUserPrompt,
} from "../prompts/ui-refactor.prompt.js";
import type {
  UiAnalysisRequest,
  UiAnalysisResult,
} from "../models/interfaces.js";

/**
 * Analyze a UI screenshot / video via Gemini and return structured issues.
 */
export async function analyzeUi(
  req: UiAnalysisRequest,
): Promise<UiAnalysisResult> {
  const requestId = uuidv4();

  // Download from GCS and upload to Gemini File API
  const fileBuffer = await downloadFile(req.gcsUri);
  const filePart = await uploadToGemini(fileBuffer, req.mimeType, req.fileId);

  const text = await generate({
    systemPrompt: UI_ANALYSIS_SYSTEM_PROMPT,
    userParts: [
      filePart,
      { text: buildUiAnalysisUserPrompt(req.userPrompt) },
    ],
  });

  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  // Parse the JSON returned by Gemini
  const parsed = JSON.parse(cleaned) as Omit<UiAnalysisResult, "requestId" | "fileId" | "analyzedAt">;

  return {
    requestId,
    fileId: req.fileId,
    issues: parsed.issues ?? [],
    summary: parsed.summary ?? "",
    score: parsed.score ?? 0,
    analyzedAt: new Date().toISOString(),
  };
}
