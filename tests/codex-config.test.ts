import { describe, expect, it } from 'vitest';
import { codexJevConfig } from '../src/codex/config.js';
import { OPENROUTER_DECISIONS_URL, SYSTEM_ONE_URL } from '../src/jev.js';

describe('Codex Jev provider configuration', () => {
  it('stays disabled without an eligible key', () => {
    expect(codexJevConfig({})).toBeUndefined();
    expect(codexJevConfig({ OPENROUTER_API_KEY: 'sk-or-unused' })).toBeUndefined();
    expect(codexJevConfig({ JEV_PROVIDER: 'invalid', TYPESAFE_API_KEY: 'ts-key' })).toBeUndefined();
  });

  it('keeps TypeSafe as the default provider', () => {
    expect(codexJevConfig({ TYPESAFE_API_KEY: 'ts-key' })).toEqual({
      apiKey: 'ts-key', provider: 'typesafe', model: 'jev-latest', baseUrl: SYSTEM_ONE_URL,
    });
  });

  it('recognizes an OpenRouter key in the legacy TypeSafe variable', () => {
    expect(codexJevConfig({ TYPESAFE_API_KEY: 'sk-or-compatible' })).toEqual({
      apiKey: 'sk-or-compatible', provider: 'openrouter',
      model: '~typesafe/jev-latest', baseUrl: OPENROUTER_DECISIONS_URL,
      maxScoringRequests: 5,
    });
  });

  it('uses explicit OpenRouter credentials and endpoint overrides', () => {
    expect(codexJevConfig({
      JEV_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'sk-or-dedicated',
      JEV_MODEL: 'custom/jev', JEV_BASE_URL: 'https://jev-proxy.invalid/decisions',
    })).toEqual({
      apiKey: 'sk-or-dedicated', provider: 'openrouter', model: 'custom/jev',
      baseUrl: 'https://jev-proxy.invalid/decisions',
      maxScoringRequests: 5,
    });
  });
});
