import { chatWithModel, ChatMessage } from '../config/deepseek';
import logger from '../utils/logger';

export interface RefinedQuery {
  originalQuery: string;
  refinedQuery: string;
  intent: string;
  entities: string[];
  isAmbiguous: boolean;
}
const GHOST_PROMPT_SYSTEM = `You are a LIGHT query-refinement assistant for Algérie Télécom’s Front Office document retrieval system.

Your goal is NOT to rewrite queries aggressively.
Your goal is ONLY to:
1) resolve ambiguity,
2) add missing Algérie Télécom context when needed,
3) keep the query close to the user’s original wording.

Rules:
- Preserve the user's key keywords and phrasing.
- Only add context tokens when they are clearly missing (e.g., "Algérie Télécom", "Idoom Fibre", "ADSL", "4G LTE", "FTTH", "facture", "paiement", "résiliation", "NGBSS").
- Do NOT add long OR lists (no game lists, no marketing buzzwords).
- Do NOT broaden to other domains unless the user is ambiguous.
- If the query is already specific, return it unchanged (isAmbiguous=false).
- Add at most 2–5 extra tokens total.

Output ONLY valid JSON in this schema:
{
  "refinedQuery": "string (same language as input)",
  "intent": "short intent",
  "entities": ["string", "string"],
  "isAmbiguous": true/false
}`;

const GHOST_PROMPT_EXAMPLES = `Examples:
User: "gaming" →
{"refinedQuery":"offre Gamers Algérie Télécom","intent":"find gamers offer","entities":["Gamers"],"isAmbiguous":true}

User: "what's the deal?" →
{"refinedQuery":"offres promotions Algérie Télécom","intent":"find current promotions","entities":["offres","promotions"],"isAmbiguous":true}

User: "cheapest GAMES offer" →
{"refinedQuery":"offre Gamers Algérie Télécom prix moins cher","intent":"find cheapest gamers offer","entities":["Gamers","prix"],"isAmbiguous":true}

User: "fibre 100mb price" →
{"refinedQuery":"fibre FTTH 100 Mbps prix Algérie Télécom","intent":"price for 100 Mbps fiber","entities":["FTTH","100 Mbps","prix"],"isAmbiguous":false}

User: "comment payer facture" →
{"refinedQuery":"paiement facture Algérie Télécom","intent":"how to pay bill","entities":["paiement","facture"],"isAmbiguous":false}

User: "NGBSS activer offre Gamers" →
{"refinedQuery":"NGBSS activation offre Gamers","intent":"NGBSS activation steps","entities":["NGBSS","Gamers"],"isAmbiguous":false}`;


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
    const response = await chatWithModel(messages, 0.1, 'o4-mini');
    
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
