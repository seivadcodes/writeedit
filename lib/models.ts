// /lib/models.ts
export const ALLOWED_MODELS = [
  'mistralai/devstral-2512:free',
  'kwaipilot/kat-coder-pro:free',
  'anthropic/claude-3.5-sonnet:free',
  'google/gemini-flash-1.5-8b:free'
] as const;

export type AIModel = typeof ALLOWED_MODELS[number];

// Optional: add metadata for rate limiting
export const MODEL_METADATA: Record<AIModel, { name: string; rpm: number }> = {
  'mistralai/devstral-2512:free': { name: 'Devstral', rpm: 10 },
  'kwaipilot/kat-coder-pro:free': { name: 'Kat Coder', rpm: 8 },
  'anthropic/claude-3.5-sonnet:free': { name: 'Claude Sonnet', rpm: 5 },
  'google/gemini-flash-1.5-8b:free': { name: 'Gemini Flash', rpm: 7 }
};