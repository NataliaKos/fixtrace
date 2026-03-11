/* ── UI Enhancement routes ── */

import { Router, type Request, type Response } from "express";
import { enhanceUi } from "../services/ui-enhance.service.js";
import type { ApiResponse, UiEnhanceRequest, UiEnhanceResult } from "../models/interfaces.js";

const router = Router();

/**
 * POST /api/ui-enhance
 * Body: { fileId?, gcsUri?, mimeType?, userPrompt, files? }
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as UiEnhanceRequest;

    if (!body.userPrompt) {
      res.status(400).json({ success: false, error: "userPrompt is required" } satisfies ApiResponse);
      return;
    }

    const result = await enhanceUi(body);
    res.json({ success: true, data: result } satisfies ApiResponse<UiEnhanceResult>);
  } catch (err: any) {
    console.error("UI enhancement error:", err?.message ?? err);
    res.status(500).json({ success: false, error: err?.message ?? "UI enhancement failed" } satisfies ApiResponse);
  }
});

export default router;
