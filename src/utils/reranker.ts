import { calculateKeywordScore, calculateHybridScore } from './keywordSearch';
import logger from './logger';

export interface RetrievedDocument {
  id: string;
  score: number; // Semantic similarity score from vector DB
  metadata: {
    fileName: string;
    lineNumber: string;
    text: string;
    [key: string]: any;
  };
}

export interface RankedDocument extends RetrievedDocument {
  originalRank: number;
  semanticScore: number;
  keywordScore: number;
  hybridScore: number;
  finalScore: number;
}

export interface RerankerConfig {
  semanticWeight: number;
  keywordWeight: number;
  initialRetrievalCount: number;
  finalResultCount: number;
}

const DEFAULT_CONFIG: RerankerConfig = {
  semanticWeight: 0.6,
  keywordWeight: 0.4,
  initialRetrievalCount: 20,
  finalResultCount: 10
};

/**
 * Rerank documents based on hybrid scoring (semantic + keyword relevance).
 * Takes initial retrievals and returns top results after reranking.
 */
export function rerankDocuments(
  query: string,
  documents: RetrievedDocument[],
  config: Partial<RerankerConfig> = {}
): RankedDocument[] {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  logger.log(`[Reranker] Reranking ${documents.length} documents for query: "${query}"`);
  
  // Score each document
  const rankedDocs: RankedDocument[] = documents.map((doc, index) => {
    const semanticScore = doc.score;
    const keywordResult = calculateKeywordScore(query, doc.metadata.text || '');
    const keywordScore = keywordResult.score;
    
    const hybridScore = calculateHybridScore(
      semanticScore,
      keywordScore,
      finalConfig.semanticWeight,
      finalConfig.keywordWeight
    );
    
    return {
      ...doc,
      originalRank: index + 1,
      semanticScore,
      keywordScore,
      hybridScore,
      finalScore: hybridScore
    };
  });
  
  // Sort by final score (descending)
  rankedDocs.sort((a, b) => b.finalScore - a.finalScore);
  
  // Take top N results
  const topResults = rankedDocs.slice(0, finalConfig.finalResultCount);
  
  logger.log(`[Reranker] Top ${topResults.length} results after reranking:`);
  topResults.forEach((doc, i) => {
    logger.log(`  ${i + 1}. [orig: #${doc.originalRank}] semantic=${doc.semanticScore.toFixed(3)}, keyword=${doc.keywordScore.toFixed(3)}, final=${doc.finalScore.toFixed(3)}`);
  });
  
  return topResults;
}

/**
 * Get the configuration for initial retrieval count.
 */
export function getInitialRetrievalCount(config: Partial<RerankerConfig> = {}): number {
  return config.initialRetrievalCount ?? DEFAULT_CONFIG.initialRetrievalCount;
}

/**
 * Get the configuration for final result count.
 */
export function getFinalResultCount(config: Partial<RerankerConfig> = {}): number {
  return config.finalResultCount ?? DEFAULT_CONFIG.finalResultCount;
}
