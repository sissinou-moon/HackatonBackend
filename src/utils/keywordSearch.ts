import { extractKeywordsWithWeights, getKeywordWeight } from '../config/keywords';

export interface KeywordMatch {
  keyword: string;
  weight: number;
  count: number;
}

export interface KeywordScore {
  score: number;
  matches: KeywordMatch[];
}

/**
 * Calculate keyword relevance score for a document based on query keywords.
 * Returns a score between 0 and 1, with higher scores indicating more relevance.
 */
export function calculateKeywordScore(query: string, documentText: string): KeywordScore {
  const queryKeywords = extractKeywordsWithWeights(query);
  const docLower = documentText.toLowerCase();
  const matches: KeywordMatch[] = [];
  let totalScore = 0;
  let maxPossibleScore = 0;

  for (const { keyword, weight } of queryKeywords) {
    maxPossibleScore += weight;
    
    // Count occurrences of keyword in document
    const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
    const matchArray = docLower.match(regex);
    const count = matchArray ? matchArray.length : 0;

    if (count > 0) {
      // Diminishing returns for multiple matches (log scale)
      const matchScore = weight * Math.min(1 + Math.log10(count), 2);
      totalScore += matchScore;
      matches.push({ keyword, weight, count });
    }
  }

  // Also check for query words that aren't priority keywords
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  for (const word of queryWords) {
    const cleanWord = word.replace(/[^\w\u00C0-\u024F]/g, '');
    if (cleanWord.length >= 3 && !queryKeywords.some(k => k.keyword === cleanWord)) {
      maxPossibleScore += 1.0;
      if (docLower.includes(cleanWord)) {
        totalScore += 0.5; // Lower score for non-priority keywords
      }
    }
  }

  // Normalize score to 0-1 range
  const normalizedScore = maxPossibleScore > 0 ? Math.min(totalScore / maxPossibleScore, 1) : 0;

  return {
    score: normalizedScore,
    matches
  };
}

/**
 * Calculate weighted combined score from semantic similarity and keyword relevance.
 * @param semanticScore - Cosine similarity score from vector search (0-1)
 * @param keywordScore - Keyword relevance score (0-1)
 * @param semanticWeight - Weight for semantic score (default 0.6)
 * @param keywordWeight - Weight for keyword score (default 0.4)
 */
export function calculateHybridScore(
  semanticScore: number,
  keywordScore: number,
  semanticWeight: number = 0.6,
  keywordWeight: number = 0.4
): number {
  return (semanticScore * semanticWeight) + (keywordScore * keywordWeight);
}

/**
 * Apply keyword boost to a semantic score based on priority keyword matches.
 * This gives additional weight to documents containing high-priority keywords.
 */
export function applyKeywordBoost(
  semanticScore: number,
  query: string,
  documentText: string
): { boostedScore: number; keywordScore: KeywordScore } {
  const keywordScore = calculateKeywordScore(query, documentText);
  
  // Calculate boost factor based on keyword matches
  let boostFactor = 1.0;
  for (const match of keywordScore.matches) {
    // Add small boost for each priority keyword match
    boostFactor += (match.weight - 1.0) * 0.05 * Math.min(match.count, 3);
  }
  
  // Cap the boost at 1.5x
  boostFactor = Math.min(boostFactor, 1.5);
  
  const boostedScore = semanticScore * boostFactor;
  
  return { boostedScore, keywordScore };
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
