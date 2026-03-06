/* ── Upload routes ── */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { uploadFile } from "../services/storage.service.js";
import type { ApiResponse, UploadResult } from "../models/interfaces.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * POST /api/upload
 * Accepts a single file (field name: "file") and stores it in GCS.
 */
router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: "No file provided" } satisfies ApiResponse);
      return;
    }

    const { fileId, gcsUri, fileName } = await uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const result: UploadResult = {
      fileId,
      fileName,
      gcsUri,
      mimeType: file.mimetype,
      uploadedAt: new Date().toISOString(),
    };

    res.json({ success: true, data: result } satisfies ApiResponse<UploadResult>);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, error: "Upload failed" } satisfies ApiResponse);
  }
});

export default router;
