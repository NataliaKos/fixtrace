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

    if (!body.fileId || !body.gcsUri || !body.mimeType) {
      res.status(400).json({ success: false, error: "fileId, gcsUri, and mimeType are required" } satisfies ApiResponse);
      return;
    }

    const result = await analyzePerf(body);
    res.json({ success: true, data: result } satisfies ApiResponse<PerfAnalysisResult>);
  } catch (err: any) {
    console.error("[perf-analyze] ERROR:", err?.message ?? err);
    res.status(500).json({ success: false, error: "Performance analysis failed" } satisfies ApiResponse);
  }
});

export default router;
