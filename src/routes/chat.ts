import express, { Request, Response, Router } from 'express';
import { chatWithDocuments, chatWithDocumentsStream } from '../services/chatService';
import logger from '../utils/logger';

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { question, topK } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required and must be a string' });
    }

    // If client accepts event-stream (streaming), use streaming handler
    const accept = req.headers['accept'] || '';
    const wantsStream = typeof accept === 'string' && accept.includes('text/event-stream');

    if (wantsStream || req.query.stream === 'true') {
      // Use streaming path
      await chatWithDocumentsStream(question, res, topK || 3);
      return;
    }

    const result = await chatWithDocuments(question, topK || 3);

    res.json({
      success: true,
      answer: result.answer,
      sources: result.sources,
    });
  } catch (error) {
    logger.error('Chat route error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;

