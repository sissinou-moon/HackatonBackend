import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { uploadDocument, uploadToPineconeOnly } from '../services/uploadService';
import logger from '../utils/logger';

const router: Router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not allowed. Only PDF and Word documents are supported.`));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * POST /api/upload
 * Upload document to both Supabase storage and Pinecone
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get optional folder from request body (can be new or existing folder name)
    const folder = (req.body.folder || req.body.folderName) as string | undefined;

    const result = await uploadDocument(req.file.path, req.file.originalname, folder);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        fileName: result.fileName,
        folder: result.folder,
        storagePath: result.storagePath,
        chunksCount: result.chunksCount,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Upload route error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * POST /api/upload/re-pinecone
 * Upload document to Pinecone only (skip Supabase storage)
 * Useful for re-indexing documents that are already stored elsewhere
 */
router.post('/re-pinecone', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get optional folder from request body
    const folder = (req.body.folder || req.body.folderName) as string | undefined;

    const result = await uploadToPineconeOnly(req.file.path, req.file.originalname, folder);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        fileName: result.fileName,
        folder: result.folder,
        referencePath: result.storagePath, // Using referencePath instead of storagePath for clarity
        chunksCount: result.chunksCount,
        note: 'Document indexed in Pinecone only. Not stored in Supabase.',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Re-pinecone upload route error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * POST /api/upload/multiple
 * Upload multiple documents to Supabase storage and Pinecone
 */
router.post('/multiple', upload.array('files'), async (req: Request, res: Response) => {
  try {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files as Express.Multer.File[];
    // Get optional folder from request body
    const folder = (req.body.folder || req.body.folderName) as string | undefined;

    logger.log(`Processing ${files.length} files upload to folder: ${folder || 'root'}`);

    const results = [];

    // Process files sequentially to be safer with rate limits
    for (const file of files) {
      try {
        const result = await uploadDocument(file.path, file.originalname, folder);
        results.push(result);
      } catch (error) {
        logger.error(`Error processing file ${file.originalname}:`, error);
        results.push({
          success: false,
          fileName: file.originalname,
          folder: folder,
          message: error instanceof Error ? error.message : 'Unknown error',
          chunksCount: 0
        });

        // Try to clean up temp file if service didn't
        try {
          await fs.unlink(file.path).catch(() => { });
        } catch (e) { }
      }
    }

    res.json({
      success: true,
      message: `Processed ${files.length} files`,
      results
    });

  } catch (error) {
    logger.error('Multiple upload route error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;
