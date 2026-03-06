/* ── Performance Analysis service ── */

import { v4 as uuidv4 } from "uuid";
import { generate, uploadToGemini } from "./gemini.service.js";
import { downloadFile } from "./storage.service.js";
import {
  PERF_ANALYSIS_SYSTEM_PROMPT,
  buildPerfAnalysisUserPrompt,
} from "../prompts/perf-debug.prompt.js";
import type {
  PerfAnalysisRequest,
  PerfAnalysisResult,
} from "../models/interfaces.js";

/**
 * Analyze a performance trace / screenshot via Gemini and return structured issues.
 */
export async function analyzePerf(
  req: PerfAnalysisRequest,
): Promise<PerfAnalysisResult> {
  const requestId = uuidv4();

  // Download from GCS and upload to Gemini File API
  const fileBuffer = await downloadFile(req.gcsUri);
  const filePart = await uploadToGemini(fileBuffer, req.mimeType, req.fileId);

  const text = await generate({
    systemPrompt: PERF_ANALYSIS_SYSTEM_PROMPT,
    userParts: [
      filePart,
      { text: buildPerfAnalysisUserPrompt(req.userPrompt) },
    ],
  });

  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  const parsed = JSON.parse(cleaned) as Omit<PerfAnalysisResult, "requestId" | "fileId" | "analyzedAt">;

  return {
    requestId,
    fileId: req.fileId,
    issues: parsed.issues ?? [],
    summary: parsed.summary ?? "",
    analyzedAt: new Date().toISOString(),
  };
}
