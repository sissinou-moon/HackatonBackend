import express, { Request, Response } from 'express';
import { chatWithDocuments } from '../services/chatService';

const router = express.Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { question, topK } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required and must be a string' });
    }

    const result = await chatWithDocuments(question, topK || 3);

    res.json({
      success: true,
      answer: result.answer,
      sources: result.sources,
    });
  } catch (error) {
    console.error('Chat route error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;

