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
  intent?: string,
  config: Partial<RerankerConfig> = {}
): RankedDocument[] {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  logger.log(`[Reranker] Reranking ${documents.length} documents for query: "${query}" (Intent: ${intent || 'None'})`);
  
  // 1. Score each document
  let rankedDocs: RankedDocument[] = documents.map((doc, index) => {
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
  
  // 2. Sort by final score (descending)
  rankedDocs.sort((a, b) => b.finalScore - a.finalScore);

  // 3. Deduplicate by file name (keep best chunk per file)
  const seenFiles = new Set<string>();
  const uniqueDocs: RankedDocument[] = [];
  for (const doc of rankedDocs) {
    if (!seenFiles.has(doc.metadata.fileName)) {
      uniqueDocs.push(doc);
      seenFiles.add(doc.metadata.fileName);
    }
  }
  rankedDocs = uniqueDocs;

  // 4. Apply Dynamic Threshold
  const BASE_THRESHOLD = 0.27;
  const topScore = rankedDocs.length > 0 ? rankedDocs[0].finalScore : 0;
  // If top score is strong, raise the bar. Otherwise stick to base.
  const dynamicThreshold = topScore > BASE_THRESHOLD ? topScore * 0.9 : BASE_THRESHOLD;
  
  let filteredDocs = rankedDocs.filter(doc => doc.finalScore >= dynamicThreshold);
  logger.log(`[Reranker] Threshold: ${dynamicThreshold.toFixed(3)} (Top Score: ${topScore.toFixed(3)}). Docs passing: ${filteredDocs.length}`);

  // 5. Intent Filtering (if intent is present)
  if (intent && intent !== 'unknown') {
    const intentLower = intent.toLowerCase();
    const intentKeywords = getIntentKeywords(intentLower);
    
    if (intentKeywords.length > 0) {
      const intentMatchingDocs = filteredDocs.filter(doc => {
        const textLower = (doc.metadata.text || '').toLowerCase();
        return intentKeywords.some(kw => textLower.includes(kw));
      });

      // Only apply intent filter if we don't lose too many sources
      // (User said: "Drop sources unrelated to the intent", but also "Always return at least 2")
      if (intentMatchingDocs.length >= 1) {
        logger.log(`[Reranker] Applied intent filter for "${intent}". Kept ${intentMatchingDocs.length} docs.`);
        filteredDocs = intentMatchingDocs;
      } else {
         logger.log(`[Reranker] Intent filter found 0 matches. Falling back to score-based list.`);
      }
    }
  }

  // 6. Fallback: Ensure at least 2 sources (if we have them)
  if (filteredDocs.length < 2 && rankedDocs.length >= 2) {
    logger.log(`[Reranker] Fewer than 2 docs passed filters. Restoring top 2 from original ranked list.`);
    filteredDocs = rankedDocs.slice(0, 2);
  }

  // 7. Limit to max 5 sources (User rule: "Never return more than 5 sources")
  const MAX_SOURCES = 5;
  const finalResults = filteredDocs.slice(0, MAX_SOURCES);
  
  logger.log(`[Reranker] Final selection: ${finalResults.length} docs.`);
  finalResults.forEach((doc, i) => {
    logger.log(`  ${i + 1}. [${doc.metadata.fileName}] Score=${doc.finalScore.toFixed(3)}`);
  });
  
  return finalResults;
}

function getIntentKeywords(intent: string): string[] {
  // Map common intents to keywords found in documents
  if (intent.includes('pric') || intent.includes('tarif') || intent.includes('coût') || intent.includes('cost')) {
    return ['prix', 'tarif', 'da/mois', 'dinar', 'paiement', 'facture'];
  }
  if (intent.includes('gam') || intent.includes('jeu')) {
    return ['gaming', 'jeu', 'ping', 'latence', 'gamer'];
  }
  if (intent.includes('bill') || intent.includes('factur') || intent.includes('pay')) {
    return ['facture', 'paiement', 'payer', 'edahabia', 'cib', 'poste'];
  }
  if (intent.includes('speed') || intent.includes('debit') || intent.includes('lenteur')) {
    return ['débit', 'mbps', 'vitesse', 'lenteur', 'test'];
  }
  if (intent.includes('procedure') || intent.includes('comment') || intent.includes('how')) {
    return ['comment', 'procédure', 'étape', 'guide', 'démarche'];
  }
  return [];
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
