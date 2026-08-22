import { Request, Response, Express } from "express";
import multer from "multer";
import { storagePut } from "./storage";

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export function registerUploadRoute(app: Express) {
  app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // Get file key from header or generate one
      const fileKey = req.headers["x-file-key"] as string || `uploads/${Date.now()}-${req.file.originalname}`;

      // Upload to S3
      const { url } = await storagePut(
        fileKey,
        req.file.buffer,
        req.file.mimetype
      );

      return res.json({
        url,
        key: fileKey,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      });
    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({
        error: "Failed to upload file",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
