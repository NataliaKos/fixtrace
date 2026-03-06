/* ── Code Analysis service ── */

import { v4 as uuidv4 } from "uuid";
import { generate, uploadToGemini } from "./gemini.service.js";
import { downloadFile } from "./storage.service.js";
import {
  CODE_ANALYSIS_UI_SYSTEM_PROMPT,
  CODE_ANALYSIS_PERF_SYSTEM_PROMPT,
  buildCodeAnalysisUserPrompt,
} from "../prompts/code-analysis.prompt.js";
import type {
  CodeAnalysisRequest,
  CodeAnalysisResult,
} from "../models/interfaces.js";
import type { Part } from "@google/genai";

/**
 * Analyze code files via Gemini and return structured patches + issues.
 */
export async function analyzeCode(
  req: CodeAnalysisRequest,
): Promise<CodeAnalysisResult> {
  const requestId = uuidv4();

  const systemPrompt =
    req.mode === "ui"
      ? CODE_ANALYSIS_UI_SYSTEM_PROMPT
      : CODE_ANALYSIS_PERF_SYSTEM_PROMPT;

  const userParts: Part[] = [];

  // If a screenshot/report file was also uploaded, include it as visual context
  if (req.gcsUri && req.mimeType && req.fileId) {
    const fileBuffer = await downloadFile(req.gcsUri);
    const filePart = await uploadToGemini(fileBuffer, req.mimeType, req.fileId);
    userParts.push(filePart);
  }

  // Add code files as text
  const codePrompt = buildCodeAnalysisUserPrompt(req.files, req.userPrompt);
  userParts.push({ text: codePrompt });

  const text = await generate({
    systemPrompt,
    userParts,
    maxOutputTokens: 16384,
    temperature: 0.2,
  });

  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "");

  const parsed = JSON.parse(cleaned);

  return {
    requestId,
    patches: parsed.patches ?? [],
    summary: parsed.summary ?? "",
    score: parsed.score,
    issues: parsed.issues ?? [],
    analyzedAt: new Date().toISOString(),
  };
}
