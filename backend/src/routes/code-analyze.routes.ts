/* ── Code analysis route ── */

import { Router, type Request, type Response } from "express";
import { analyzeCode } from "../services/code-analysis.service.js";
import type {
  ApiResponse,
  CodeAnalysisRequest,
  CodeAnalysisResult,
} from "../models/interfaces.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as CodeAnalysisRequest;

    if (!body.files || body.files.length === 0) {
      res.status(400).json({
        success: false,
        error: "At least one code file is required",
      } satisfies ApiResponse);
      return;
    }

    if (!body.mode) {
      res.status(400).json({
        success: false,
        error: "mode ('ui' or 'perf') is required",
      } satisfies ApiResponse);
      return;
    }

    const result = await analyzeCode(body);
    res.json({
      success: true,
      data: result,
    } satisfies ApiResponse<CodeAnalysisResult>);
  } catch (err: any) {
    console.error("Code analysis error:", err?.message ?? err);
    res.status(500).json({
      success: false,
      error: err?.message ?? "Code analysis failed",
    } satisfies ApiResponse);
  }
});

export default router;
