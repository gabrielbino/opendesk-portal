import { Router } from 'express';
import { storagePut } from './storage';

const router = Router();

router.post('/upload-attachment', async (req, res) => {
  try {
    const { fileName, fileData, mimeType, ticketId } = req.body;

    if (!fileName || !fileData || !ticketId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');

    // Generate unique file key with ticket ID
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const fileKey = `tickets/${ticketId}/${timestamp}-${randomSuffix}-${fileName}`;

    // Upload to S3
    const { url } = await storagePut(fileKey, buffer, mimeType);

    res.json({ fileUrl: url, fileKey });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
