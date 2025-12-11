import express, { Request, Response } from 'express';
import { supabase, BUCKET_NAME } from '../config/supabase';

const router = express.Router();

router.get('/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;

    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    // Download file from Supabase storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(fileName);

    if (error) {
      console.error('Download error:', error);
      return res.status(404).json({ error: `File not found: ${error.message}` });
    }

    // Convert blob to buffer
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine content type based on file extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === 'pdf') {
      contentType = 'application/pdf';
    } else if (ext === 'docx') {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (ext === 'doc') {
      contentType = 'application/msword';
    }

    // Set headers and send file
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Download route error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

// List all files in the bucket
router.get('/', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      files: data?.map(file => ({
        name: file.name,
        size: file.metadata?.size,
        createdAt: file.created_at,
      })) || [],
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;

