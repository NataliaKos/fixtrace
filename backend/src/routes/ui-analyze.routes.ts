/* ── UI Analysis routes ── */

import { Router, type Request, type Response } from "express";
import { analyzeUi } from "../services/ui-analysis.service.js";
import type { ApiResponse, UiAnalysisRequest, UiAnalysisResult } from "../models/interfaces.js";

const router = Router();

/**
 * POST /api/ui-analyze
 * Body: { fileId, gcsUri, mimeType, userPrompt? }
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as UiAnalysisRequest;

    if (!body.fileId || !body.gcsUri || !body.mimeType) {
      res.status(400).json({ success: false, error: "fileId, gcsUri, and mimeType are required" } satisfies ApiResponse);
      return;
    }

    const result = await analyzeUi(body);
    res.json({ success: true, data: result } satisfies ApiResponse<UiAnalysisResult>);
  } catch (err: any) {
    console.error("UI analysis error:", err?.message ?? err);
    console.error("Full error:", JSON.stringify(err, Object.getOwnPropertyNames(err ?? {}), 2));
    res.status(500).json({ success: false, error: err?.message ?? "UI analysis failed" } satisfies ApiResponse);
  }
});

export default router;
