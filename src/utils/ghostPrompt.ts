import { chatWithDeepSeek, ChatMessage } from '../config/deepseek';
import logger from '../utils/logger';

export interface RefinedQuery {
  originalQuery: string;
  refinedQuery: string;
  intent: string;
  entities: string[];
  isAmbiguous: boolean;
}

const GHOST_PROMPT_SYSTEM = `You are a query refinement assistant for Algerie Telecom's document retrieval system.
Your job is to transform user queries into optimized search queries.

Context: This system is used in Algerie Telecom's communication center to retrieve documents about:
- Offers and promotions (internet, mobile, bundles)
- Contracts and subscriptions (terms, renewal, cancellation)
- Gaming packs and services
- Billing and payments
- Technical support and troubleshooting
- Enterprise/B2B services
- 4G/5G, Fibre, ADSL services

When given a user query, you must:
1. Identify the user's intent
2. Extract key entities (product names, service types, actions)
3. Expand ambiguous terms to specific Algerie Telecom context
4. Create an optimized query for document retrieval

Respond ONLY with valid JSON in this exact format:
{
  "refinedQuery": "the optimized search query in the same language as input",
  "intent": "brief description of user intent",
  "entities": ["entity1", "entity2"],
  "isAmbiguous": true/false
}`;

const GHOST_PROMPT_EXAMPLES = `Examples:
User: "what's the deal?" → {"refinedQuery": "offres promotions actuelles Algerie Telecom", "intent": "looking for current promotional offers", "entities": ["offers", "promotions"], "isAmbiguous": true}
User: "gaming" → {"refinedQuery": "packs gaming forfaits jeux PUBG Free Fire Mobile Legends", "intent": "looking for gaming-related services", "entities": ["gaming packs", "game data"], "isAmbiguous": true}
User: "comment payer" → {"refinedQuery": "méthodes paiement facture CCP Edahabia Baridi Mob", "intent": "looking for payment methods", "entities": ["payment", "bill"], "isAmbiguous": true}
User: "fibre optic 100mb price" → {"refinedQuery": "tarif prix offre fibre optique 100 Mbps FTTH", "intent": "pricing for 100Mbps fiber", "entities": ["fiber", "100Mbps", "price"], "isAmbiguous": false}`;

/**
 * Use a lightweight LLM call to refine ambiguous queries for better retrieval.
 * This "ghost" prompt runs quickly to enhance query quality before the main retrieval.
 */
export async function refineQueryWithGhostPrompt(query: string): Promise<RefinedQuery> {
  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: GHOST_PROMPT_SYSTEM + '\n\n' + GHOST_PROMPT_EXAMPLES
      },
      {
        role: 'user',
        content: `Refine this query: "${query}"`
      }
    ];

    logger.log('[GhostPrompt] Refining query:', query);
    
    // Use low temperature for consistent, focused responses
    const response = await chatWithDeepSeek(messages, 0.1);
    
    // Parse the JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('[GhostPrompt] Failed to parse JSON response, using original query');
      return {
        originalQuery: query,
        refinedQuery: query,
        intent: 'unknown',
        entities: [],
        isAmbiguous: false
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    const result: RefinedQuery = {
      originalQuery: query,
      refinedQuery: parsed.refinedQuery || query,
      intent: parsed.intent || 'unknown',
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      isAmbiguous: Boolean(parsed.isAmbiguous)
    };

    logger.log('[GhostPrompt] Refined result:', result);
    return result;

  } catch (error) {
    logger.error('[GhostPrompt] Error refining query:', error);
    // Fallback to original query on error
    return {
      originalQuery: query,
      refinedQuery: query,
      intent: 'unknown',
      entities: [],
      isAmbiguous: false
    };
  }
}

/**
 * Quick check if a query is likely ambiguous and needs refinement.
 */
export function isQueryLikelyAmbiguous(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  
  // Very short queries are often ambiguous
  if (trimmed.split(/\s+/).length <= 2) {
    return true;
  }
  
  // Questions without specific context
  const ambiguousPatterns = [
    /^(what|how|where|when|why|qui|quoi|comment|où|quand|pourquoi)\s/i,
    /^(tell me|show me|give me|dis moi|montre)/i,
    /\?$/,
    /^(the|le|la|les|un|une|des)\s+\w+$/i
  ];
  
  return ambiguousPatterns.some(pattern => pattern.test(trimmed));
}
