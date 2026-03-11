/* ── UI Analysis service ── */

import { v4 as uuidv4 } from "uuid";
import { generate, uploadToGemini, filePartFromGcsUri, extractJson } from "./gemini.service.js";
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

  // Get file part: use GCS URI directly on Vertex AI, otherwise download + upload
  const useVertexAI = process.env["GOOGLE_GENAI_USE_VERTEXAI"] === "true";
  let filePart;
  if (useVertexAI) {
    filePart = filePartFromGcsUri(req.gcsUri, req.mimeType);
  } else {
    const fileBuffer = await downloadFile(req.gcsUri);
    filePart = await uploadToGemini(fileBuffer, req.mimeType, req.fileId);
  }

  const text = await generate({
    systemPrompt: UI_ANALYSIS_SYSTEM_PROMPT,
    userParts: [
      filePart,
      { text: buildUiAnalysisUserPrompt(req.userPrompt) },
    ],
  });

  // Parse the JSON returned by Gemini
  const parsed = extractJson<Omit<UiAnalysisResult, "requestId" | "fileId" | "analyzedAt">>(text);

  return {
    requestId,
    fileId: req.fileId,
    issues: parsed.issues ?? [],
    summary: parsed.summary ?? "",
    score: parsed.score ?? 0,
    analyzedAt: new Date().toISOString(),
  };
}
