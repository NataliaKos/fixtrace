/* ── Performance Analysis routes ── */

import { Router, type Request, type Response } from "express";
import { analyzePerf } from "../services/perf-analysis.service.js";
import type { ApiResponse, PerfAnalysisRequest, PerfAnalysisResult } from "../models/interfaces.js";

const router = Router();

/**
 * POST /api/perf-analyze
 * Body: { fileId, gcsUri, mimeType, userPrompt? }
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as PerfAnalysisRequest;
    console.log("[perf-analyze] Incoming request body:", JSON.stringify(body));

    if (!body.fileId || !body.gcsUri || !body.mimeType) {
      console.warn("[perf-analyze] Missing required fields:", { fileId: !!body.fileId, gcsUri: !!body.gcsUri, mimeType: !!body.mimeType });
      res.status(400).json({ success: false, error: "fileId, gcsUri, and mimeType are required" } satisfies ApiResponse);
      return;
    }

    const result = await analyzePerf(body);
    console.log("[perf-analyze] Analysis completed successfully, requestId:", result.requestId);
    res.json({ success: true, data: result } satisfies ApiResponse<PerfAnalysisResult>);
  } catch (err: any) {
    console.error("[perf-analyze] ERROR:", err?.message ?? err);
    console.error("[perf-analyze] Stack:", err?.stack);
    res.status(500).json({ success: false, error: "Performance analysis failed" } satisfies ApiResponse);
  }
});

export default router;
