/* ── Performance Analysis service ── */

import { v4 as uuidv4 } from "uuid";
import { generate, uploadToGemini, extractJson, filePartFromGcsUri } from "./gemini.service.js";
import { Type } from "@google/genai";
import type { Schema } from "@google/genai";
import { downloadFile } from "./storage.service.js";
import {
  PERF_ANALYSIS_SYSTEM_PROMPT,
  buildPerfAnalysisUserPrompt,
} from "../prompts/perf-debug.prompt.js";
import type {
  PerfAnalysisRequest,
  PerfAnalysisResult,
} from "../models/interfaces.js";
import type { Part } from "@google/genai";

/**
 * Analyze a performance trace / screenshot via Gemini and return structured issues.
 */
export async function analyzePerf(
  req: PerfAnalysisRequest,
): Promise<PerfAnalysisResult> {
  const requestId = uuidv4();
  const t0 = Date.now();
  const timing = (label: string) => console.log(`[perf-service] ${label} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Download from GCS
  let fileBuffer: Buffer;
  try {
    fileBuffer = await downloadFile(req.gcsUri);
    timing(`GCS download (${(fileBuffer.length / 1024).toFixed(0)} KB)`);
  } catch (err: any) {
    console.error(`[perf-service] GCS download FAILED:`, err?.message ?? err);
    throw err;
  }

  // For JSON/text, send content inline instead of Files API (avoids Gemini 500s on large JSON uploads)
  const isTextBased = req.mimeType === "application/json" || req.mimeType.startsWith("text/");
  let dataPart: Part;

  if (isTextBased) {
    const textContent = fileBuffer.toString("utf-8");
    // Truncate to stay within model context limits — 300K chars keeps response fast
    const maxChars = 300_000;
    const truncated = textContent.length > maxChars
      ? textContent.substring(0, maxChars) + "\n... [TRUNCATED]"
      : textContent;
    dataPart = { text: `Here is the performance trace data (${req.mimeType}):\n\n${truncated}` };
    timing(`Text prepared (${truncated.length} chars from ${textContent.length})`);
  } else {
    const useVertexAI = process.env["GOOGLE_GENAI_USE_VERTEXAI"] === "true";
    if (useVertexAI) {
      dataPart = filePartFromGcsUri(req.gcsUri, req.mimeType);
    } else {
      try {
        dataPart = await uploadToGemini(fileBuffer, req.mimeType, req.fileId);
      } catch (err: any) {
        console.error(`[perf-service] Gemini upload FAILED:`, err?.message ?? err);
        throw err;
      }
    }
  }

  // JSON Schema for constrained decoding
  const perfAnalysisSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      issues: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            category: { type: Type.STRING },
            severity: { type: Type.STRING },
            description: { type: Type.STRING },
            metric: { type: Type.STRING },
            value: { type: Type.STRING },
            suggestion: { type: Type.STRING },
            codeSnippet: { type: Type.STRING },
          },
          required: ["id", "category", "severity", "description", "suggestion"],
        },
      },
      summary: { type: Type.STRING },
    },
    required: ["issues", "summary"],
  };

  let text: string;
  try {
    timing("Calling Gemini generate…");
    text = await generate({
      systemPrompt: PERF_ANALYSIS_SYSTEM_PROMPT,
      userParts: [
        dataPart,
        { text: buildPerfAnalysisUserPrompt(req.userPrompt) },
      ],
      jsonMode: true,
      responseSchema: perfAnalysisSchema,
    });
    timing(`Gemini response received (${text.length} chars)`);
  } catch (err: any) {
    timing("Gemini generate FAILED");
    console.error(`[perf-service] Gemini generate FAILED:`, err?.message ?? err);
    throw err;
  }

  let parsed;
  try {
    parsed = extractJson<Omit<PerfAnalysisResult, "requestId" | "fileId" | "analyzedAt">>(text);
    timing("JSON parsed OK");
  } catch (err: any) {
    console.error(`[perf-service] JSON parse failed. Raw text:`, text);
    throw err;
  }

  return {
    requestId,
    fileId: req.fileId,
    issues: parsed.issues ?? [],
    summary: parsed.summary ?? "",
    analyzedAt: new Date().toISOString(),
  };
}
