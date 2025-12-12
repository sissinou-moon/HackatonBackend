import express, { Request, Response, Router } from 'express';
import { warmCache, getCacheStats, clearCache, getCachedQuestions } from '../services/cacheService';
import logger from '../utils/logger';

const router: Router = express.Router();

/**
 * POST /api/cache/index
 * Trigger cache warming from common questions file.
 */
router.post('/index', async (req: Request, res: Response) => {
  try {
    logger.log('[CacheRoute] Starting cache warming...');
    
    const result = await warmCache();
    
    res.json({
      success: result.success,
      message: result.success 
        ? `Cache warming complete. Processed ${result.questionsProcessed} questions.`
        : 'Cache warming failed',
      questionsProcessed: result.questionsProcessed,
      errors: result.errors.length > 0 ? result.errors : undefined
    });
  } catch (error) {
    logger.error('[CacheRoute] Cache warming error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/cache/status
 * Return cache statistics.
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const stats = getCacheStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        hitRate: stats.hitCount + stats.missCount > 0 
          ? (stats.hitCount / (stats.hitCount + stats.missCount) * 100).toFixed(2) + '%'
          : 'N/A',
        lastWarmTime: stats.lastWarmTime 
          ? new Date(stats.lastWarmTime).toISOString()
          : null
      }
    });
  } catch (error) {
    logger.error('[CacheRoute] Status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * DELETE /api/cache/clear
 * Clear the cache.
 */
router.delete('/clear', (req: Request, res: Response) => {
  try {
    clearCache();
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    logger.error('[CacheRoute] Clear error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/cache/questions
 * Get list of cached questions (for debugging).
 */
router.get('/questions', (req: Request, res: Response) => {
  try {
    const questions = getCachedQuestions();
    res.json({
      success: true,
      count: questions.length,
      questions
    });
  } catch (error) {
    logger.error('[CacheRoute] Questions error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
