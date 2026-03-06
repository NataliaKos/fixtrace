/* ── GitHub clone route ── */

import { Router, type Request, type Response } from "express";
import { cloneAndReadRepo } from "../services/github.service.js";
import type {
  ApiResponse,
  GitHubCloneRequest,
  GitHubCloneResult,
} from "../models/interfaces.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { repoUrl } = req.body as GitHubCloneRequest;

    if (!repoUrl) {
      res
        .status(400)
        .json({ success: false, error: "repoUrl is required" } satisfies ApiResponse);
      return;
    }

    const result = await cloneAndReadRepo(repoUrl);
    res.json({
      success: true,
      data: result,
    } satisfies ApiResponse<GitHubCloneResult>);
  } catch (err: any) {
    console.error("GitHub clone error:", err?.message ?? err);
    res.status(500).json({
      success: false,
      error: err?.message ?? "Failed to clone repository",
    } satisfies ApiResponse);
  }
});

export default router;
