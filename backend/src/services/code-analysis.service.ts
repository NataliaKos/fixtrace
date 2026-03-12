/* ── Code Analysis service ── */

import { v4 as uuidv4 } from "uuid";
import { generate, uploadToGemini, extractJson, filePartFromGcsUri } from "./gemini.service.js";
import { Type } from "@google/genai";
import type { Schema } from "@google/genai";
import { downloadFile } from "./storage.service.js";
import { applyHunks } from "./diff-apply.service.js";
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
  const t0 = Date.now();
  const timing = (label: string) => console.log(`[code-service] ${label} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const systemPrompt =
    req.mode === "ui"
      ? CODE_ANALYSIS_UI_SYSTEM_PROMPT
      : CODE_ANALYSIS_PERF_SYSTEM_PROMPT;

  const userParts: Part[] = [];

  // If a screenshot/report file was also uploaded, include it as visual context
  if (req.gcsUri && req.mimeType && req.fileId) {
    const fileBuffer = await downloadFile(req.gcsUri);
    timing(`GCS download (${(fileBuffer.length / 1024).toFixed(0)} KB)`);
    const isTextBased = req.mimeType === "application/json" || req.mimeType.startsWith("text/");

    if (isTextBased) {
      const textContent = fileBuffer.toString("utf-8");
      const maxChars = 300_000;
      const truncated = textContent.length > maxChars
        ? textContent.substring(0, maxChars) + "\n... [TRUNCATED]"
        : textContent;
      userParts.push({ text: `Here is the uploaded analysis data (${req.mimeType}):\n\n${truncated}` });
      timing(`Uploaded data prepared (${truncated.length} chars)`);
    } else {
      const useVertexAI = process.env["GOOGLE_GENAI_USE_VERTEXAI"] === "true";
      if (useVertexAI) {
        userParts.push(filePartFromGcsUri(req.gcsUri, req.mimeType));
      } else {
        const filePart = await uploadToGemini(fileBuffer, req.mimeType, req.fileId);
        userParts.push(filePart);
      }
    }
  }

  // Add code files as text
  const codePrompt = buildCodeAnalysisUserPrompt(req.files, req.userPrompt);
  userParts.push({ text: codePrompt });

  // JSON Schema for constrained decoding — no 'modified' field, hunks only
  const codeAnalysisSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      patches: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            filePath: { type: Type.STRING },
            hunks: { type: Type.STRING },
            rationale: { type: Type.STRING },
          },
          required: ["filePath", "hunks", "rationale"],
        },
      },
      summary: { type: Type.STRING },
      score: { type: Type.NUMBER },
      issues: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            category: { type: Type.STRING },
            severity: { type: Type.STRING },
            description: { type: Type.STRING },
            location: { type: Type.STRING },
            suggestion: { type: Type.STRING },
            codeSnippet: { type: Type.STRING },
            metric: { type: Type.STRING },
            value: { type: Type.STRING },
          },
          required: ["id", "category", "severity", "description", "suggestion"],
        },
      },
    },
    required: ["patches", "summary", "issues"],
  };

  timing("Calling Gemini generate…");
  const text = await generate({
    systemPrompt,
    userParts,
    maxOutputTokens: 16384,
    temperature: 0.2,
    jsonMode: true,
    responseSchema: codeAnalysisSchema,
  });
  timing(`Gemini response received (${text.length} chars)`);

  const parsed = extractJson(text);
  timing("JSON parsed OK");

  // Build a lookup of original file content
  const originalsByPath = new Map<string, string>();
  for (const f of req.files) {
    originalsByPath.set(f.path, f.content);
  }

  // Compute 'modified' server-side by applying hunks to originals
  const patches = (parsed.patches ?? []).map((p: any) => {
    const original = originalsByPath.get(p.filePath) ?? "";
    const modified = original ? applyHunks(original, p.hunks ?? "") : (p.hunks ?? "");
    return { ...p, modified };
  });
  timing(`Patches applied (${patches.length} files)`);

  return {
    requestId,
    patches,
    summary: parsed.summary ?? "",
    score: parsed.score,
    issues: parsed.issues ?? [],
    analyzedAt: new Date().toISOString(),
  };
}
