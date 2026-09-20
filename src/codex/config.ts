import { isOpenRouterKey, jevEndpoint } from '../jev.js';
import type { JevProvider } from '../jev.js';

export type CodexJevConfig = {
  apiKey: string;
  provider: JevProvider;
  model: string;
  baseUrl: string;
  maxScoringRequests?: number;
};

export function codexJevConfig(
  env: Readonly<Record<string, string | undefined>>,
): CodexJevConfig | undefined {
  const requested = env.JEV_PROVIDER;
  if (requested && requested !== 'typesafe' && requested !== 'openrouter') return undefined;

  const legacyKey = env.TYPESAFE_API_KEY;
  const provider: JevProvider = requested === 'openrouter' || (!requested && legacyKey && isOpenRouterKey(legacyKey))
    ? 'openrouter'
    : 'typesafe';
  const apiKey = provider === 'openrouter'
    ? env.OPENROUTER_API_KEY ?? (legacyKey && isOpenRouterKey(legacyKey) ? legacyKey : undefined)
    : legacyKey && !isOpenRouterKey(legacyKey) ? legacyKey : undefined;
  if (!apiKey) return undefined;

  const endpoint = jevEndpoint(provider, {
    model: env.JEV_MODEL || undefined,
    baseUrl: env.JEV_BASE_URL || undefined,
  });
  return {
    apiKey, provider, model: endpoint.model, baseUrl: endpoint.url,
    // The OpenRouter alpha endpoint became unreliable above six concurrent
    // requests in the Argos live pilot. Incomplete coverage is retained, so
    // this trades pruning rate for bounded latency without risking data loss.
    ...(provider === 'openrouter' ? { maxScoringRequests: 5 } : {}),
  };
}
