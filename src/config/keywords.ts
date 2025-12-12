/**
 * Priority keywords for Algerie Telecom with weight multipliers.
 * Higher weight = more importance in retrieval ranking.
 */

export interface KeywordCategory {
  name: string;
  weight: number;
  keywords: string[];
}

export const KEYWORD_CATEGORIES: KeywordCategory[] = [
  {
    name: 'offers',
    weight: 2.0,
    keywords: [
      'offre', 'offres', 'offer', 'offers',
      'promotion', 'promotions', 'promo', 'promos',
      'réduction', 'reduction', 'remise', 'discount',
      'gratuité', 'gratuit', 'free', 'bonus',
      'solde', 'deal', 'deals', 'pack', 'packs',
      'tarif', 'tarifs', 'price', 'prix'
    ]
  },
  {
    name: 'gaming',
    weight: 2.5,
    keywords: [
      'gaming', 'gamer', 'game', 'games', 'jeux', 'jeu',
      'pubg', 'free fire', 'freefire', 'mobile legends',
      'fortnite', 'cod', 'call of duty', 'fifa',
      'esport', 'esports', 'stream', 'streaming',
      'ping', 'latency', 'lag', 'fps',
      'pack gamer', 'gamer pack', 'gaming pack'
    ]
  },
  {
    name: 'contracts',
    weight: 2.0,
    keywords: [
      'contrat', 'contrats', 'contract', 'contracts',
      'abonnement', 'abonnements', 'subscription',
      'forfait', 'forfaits', 'plan', 'plans',
      'engagement', 'engagements', 'commitment',
      'résiliation', 'resiliation', 'cancel', 'cancellation',
      'renouvellement', 'renewal', 'renew',
      'conditions', 'terms', 'modalités'
    ]
  },
  {
    name: 'internet',
    weight: 1.8,
    keywords: [
      'internet', 'fibre', 'fiber', 'ftth', 'fttp',
      'adsl', 'vdsl', 'connexion', 'connection',
      'débit', 'debit', 'speed', 'vitesse',
      'data', 'données', 'go', 'mo', 'gb', 'mb',
      'wifi', 'wi-fi', 'routeur', 'router', 'modem',
      'box', 'idoom', '4g', '5g', 'lte'
    ]
  },
  {
    name: 'mobile',
    weight: 1.8,
    keywords: [
      'mobile', 'mobiles', 'téléphone', 'telephone', 'phone',
      'sim', 'carte sim', 'sim card', 'esim',
      'recharge', 'recharges', 'topup', 'top-up',
      'crédit', 'credit', 'solde', 'balance',
      'appel', 'appels', 'call', 'calls',
      'sms', 'message', 'messages', 'texto',
      'mobilis', 'djezzy', 'ooredoo'
    ]
  },
  {
    name: 'services',
    weight: 1.5,
    keywords: [
      'service', 'services', 'assistance', 'support',
      'hotline', 'helpdesk', 'help desk', 'aide',
      'réclamation', 'reclamation', 'complaint', 'plainte',
      'demande', 'request', 'ticket', 'tickets',
      'agence', 'agency', 'boutique', 'store',
      'contact', 'contacter', 'joindre'
    ]
  },
  {
    name: 'billing',
    weight: 1.8,
    keywords: [
      'facture', 'factures', 'bill', 'bills', 'invoice',
      'paiement', 'payment', 'payer', 'pay',
      'solde', 'balance', 'montant', 'amount',
      'consommation', 'consumption', 'usage',
      'facturation', 'billing', 'prélèvement',
      'dette', 'debt', 'impayé', 'unpaid',
      'ccp', 'edahabia', 'baridi mob'
    ]
  },
  {
    name: 'enterprise',
    weight: 1.7,
    keywords: [
      'entreprise', 'entreprises', 'enterprise', 'business',
      'professionnel', 'professional', 'pro',
      'b2b', 'corporate', 'société', 'company',
      'pme', 'tpe', 'startup', 'startups',
      'cloud', 'hosting', 'hébergement',
      'vpn', 'ip fixe', 'static ip', 'dédié', 'dedicated'
    ]
  },
  {
    name: 'technical',
    weight: 1.6,
    keywords: [
      'panne', 'outage', 'coupure', 'interruption',
      'problème', 'problem', 'issue', 'bug',
      'configuration', 'configurer', 'configure', 'setup',
      'installation', 'installer', 'install',
      'diagnostic', 'test', 'vérification', 'check',
      'dépannage', 'troubleshoot', 'résoudre', 'fix'
    ]
  },
  {
    name: 'activation',
    weight: 1.8,
    keywords: [
      'activation', 'activer', 'activate', 'active',
      'désactivation', 'désactiver', 'deactivate',
      'souscrire', 'subscribe', 'souscription',
      'inscription', 'register', 'registration',
      'commander', 'order', 'commande'
    ]
  }
];

/**
 * Flatten all keywords with their weights for quick lookup.
 */
export const KEYWORD_WEIGHTS: Map<string, number> = new Map();

for (const category of KEYWORD_CATEGORIES) {
  for (const keyword of category.keywords) {
    const normalizedKeyword = keyword.toLowerCase();
    // If keyword exists in multiple categories, use the higher weight
    const existingWeight = KEYWORD_WEIGHTS.get(normalizedKeyword) || 0;
    if (category.weight > existingWeight) {
      KEYWORD_WEIGHTS.set(normalizedKeyword, category.weight);
    }
  }
}

/**
 * Get the weight for a keyword (returns 1.0 for unknown keywords).
 */
export function getKeywordWeight(keyword: string): number {
  return KEYWORD_WEIGHTS.get(keyword.toLowerCase()) || 1.0;
}

/**
 * Extract weighted keywords from text.
 */
export function extractKeywordsWithWeights(text: string): Array<{ keyword: string; weight: number }> {
  const words = text.toLowerCase().split(/\s+/);
  const result: Array<{ keyword: string; weight: number }> = [];
  const seen = new Set<string>();

  for (const word of words) {
    const cleanWord = word.replace(/[^\w\u00C0-\u024F]/g, '');
    if (cleanWord.length >= 2 && !seen.has(cleanWord)) {
      seen.add(cleanWord);
      const weight = getKeywordWeight(cleanWord);
      if (weight > 1.0) {
        result.push({ keyword: cleanWord, weight });
      }
    }
  }

  // Also check for multi-word keywords
  const textLower = text.toLowerCase();
  for (const category of KEYWORD_CATEGORIES) {
    for (const keyword of category.keywords) {
      if (keyword.includes(' ') && textLower.includes(keyword) && !seen.has(keyword)) {
        seen.add(keyword);
        result.push({ keyword, weight: category.weight });
      }
    }
  }

  return result;
}
