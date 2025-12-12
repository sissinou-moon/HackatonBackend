import { generateEmbedding } from '../utils/embeddings';
import { getPineconeIndex } from '../config/pinecone';
import { rerankDocuments, RetrievedDocument, RankedDocument } from '../utils/reranker';
import logger from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface CachedQuery {
  question: string;
  embedding: number[];
  retrievalResults: RankedDocument[];
  timestamp: number;
}

interface CacheStats {
  totalQuestions: number;
  cachedQuestions: number;
  hitCount: number;
  missCount: number;
  lastWarmTime: number | null;
}

// In-memory cache
const queryCache: Map<string, CachedQuery> = new Map();
const embeddingIndex: Array<{ id: string; embedding: number[] }> = [];

// Cache statistics
const stats: CacheStats = {
  totalQuestions: 0,
  cachedQuestions: 0,
  hitCount: 0,
  missCount: 0,
  lastWarmTime: null
};

const SIMILARITY_THRESHOLD = 0.95;

/**
 * Calculate cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Check cache for a similar query.
 * Returns the cached result if similarity > threshold, null otherwise.
 */
export async function checkCache(queryEmbedding: number[]): Promise<CachedQuery | null> {
  let bestMatch: { id: string; similarity: number } | null = null;
  
  for (const { id, embedding } of embeddingIndex) {
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (similarity >= SIMILARITY_THRESHOLD) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { id, similarity };
      }
    }
  }
  
  if (bestMatch) {
    const cached = queryCache.get(bestMatch.id);
    if (cached) {
      stats.hitCount++;
      logger.log(`[Cache] HIT! Similarity: ${bestMatch.similarity.toFixed(4)} for question: "${cached.question}"`);
      return cached;
    }
  }
  
  stats.missCount++;
  return null;
}

/**
 * Add a query and its results to the cache.
 */
export function addToCache(question: string, embedding: number[], results: RankedDocument[]): void {
  const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  queryCache.set(id, {
    question,
    embedding,
    retrievalResults: results,
    timestamp: Date.now()
  });
  
  embeddingIndex.push({ id, embedding });
  stats.cachedQuestions++;
  
  logger.log(`[Cache] Added to cache: "${question}" (total cached: ${stats.cachedQuestions})`);
}

/**
 * Warm the cache by pre-computing embeddings and retrievals for common questions.
 */
export async function warmCache(): Promise<{ success: boolean; questionsProcessed: number; errors: string[] }> {
  const errors: string[] = [];
  let questionsProcessed = 0;
  
  try {
    // Load common questions
    const questionsPath = path.join(__dirname, '../data/common-questions.json');
    const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
    const questions: string[] = questionsData.questions || [];
    
    stats.totalQuestions = questions.length;
    logger.log(`[Cache] Starting cache warming with ${questions.length} questions...`);
    
    const index = await getPineconeIndex();
    
    for (const question of questions) {
      try {
        // Generate embedding
        const embedding = await generateEmbedding(question);
        
        // Check if already cached
        const existing = await checkCache(embedding);
        if (existing) {
          logger.log(`[Cache] Question already cached, skipping: "${question}"`);
          questionsProcessed++;
          continue;
        }
        
        // Retrieve documents (20 for reranking)
        const results = await index.query({
          vector: embedding,
          topK: 20,
          includeMetadata: true
        });
        
        // Convert to RetrievedDocument format
        const documents: RetrievedDocument[] = (results.matches || []).map(match => ({
          id: match.id,
          score: match.score || 0,
          metadata: {
            fileName: (match.metadata?.fileName as string) || 'Unknown',
            lineNumber: (match.metadata?.lineNumber as string) || '0',
            text: (match.metadata?.text as string) || '',
            ...match.metadata
          }
        }));
        
        // Rerank to top 10
        const rerankedResults = rerankDocuments(question, documents);
        
        // Add to cache
        addToCache(question, embedding, rerankedResults);
        questionsProcessed++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (err) {
        const errorMsg = `Failed to cache question "${question}": ${err instanceof Error ? err.message : String(err)}`;
        logger.error(`[Cache] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
    
    stats.lastWarmTime = Date.now();
    logger.log(`[Cache] Cache warming complete. Processed: ${questionsProcessed}, Errors: ${errors.length}`);
    
    return { success: true, questionsProcessed, errors };
    
  } catch (err) {
    const errorMsg = `Cache warming failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(`[Cache] ${errorMsg}`);
    return { success: false, questionsProcessed, errors: [errorMsg] };
  }
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): CacheStats {
  return { ...stats };
}

/**
 * Clear the cache.
 */
export function clearCache(): void {
  queryCache.clear();
  embeddingIndex.length = 0;
  stats.cachedQuestions = 0;
  stats.hitCount = 0;
  stats.missCount = 0;
  logger.log('[Cache] Cache cleared');
}

/**
 * Get all cached questions (for debugging).
 */
export function getCachedQuestions(): string[] {
  return Array.from(queryCache.values()).map(q => q.question);
}
