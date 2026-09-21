import { describe, expect, it } from 'vitest';
import { getApiKey, getJevCredentials, looksSecret, resolveHookConfig } from '../hooks/fast-jev-output.ts';
import { OPENROUTER_DECISIONS_URL, SYSTEM_ONE_URL, jevEndpoint } from '../src/jev.ts';

describe('hook configuration', () => {
  it('uses the documented defaults', () => {
    expect(resolveHookConfig({})).toMatchObject({
      minTokens: 10_000,
      chunkLines: 20,
      keepThreshold: 0.5,
      maxStateTokens: 25_000,
      model: 'jev-latest',
    });
  });

  it('can turn off pruning of engine-saved output', () => {
    expect(resolveHookConfig({ persistedOutputs: false }).persistedOutputs).toBe(false);
  });

  it('accepts option overrides', () => {
    expect(
      resolveHookConfig({
        apiKey: 'key',
        minTokens: 15_000,
        chunkLines: 5,
        keepThreshold: 0.8,
        maxStateTokens: 5_000,
        model: 'jev-custom',
      }),
    ).toEqual({
      apiKey: 'key',
      minTokens: 15_000,
      allowSmallOutputs: false,
      exceedNativePreview: false,
      persistedOutputs: true,
      persistedMaxChars: 8000,
      chunkLines: 5,
      keepThreshold: 0.8,
      maxStateTokens: 5_000,
      model: 'jev-custom',
    });
  });
});

describe('provider configuration', () => {
  it('leaves the provider unset by default and accepts known providers and a base URL', () => {
    expect(resolveHookConfig({})).not.toHaveProperty('provider');
    expect(resolveHookConfig({ provider: 'openrouter', baseUrl: 'https://proxy.test' })).toMatchObject({
      provider: 'openrouter',
      baseUrl: 'https://proxy.test',
    });
    expect(resolveHookConfig({ provider: 'elsewhere' })).not.toHaveProperty('provider');
  });

  it('maps each provider to its endpoint and default model', () => {
    expect(jevEndpoint('typesafe')).toEqual({ url: SYSTEM_ONE_URL, model: 'jev-latest' });
    expect(jevEndpoint('openrouter')).toEqual({ url: OPENROUTER_DECISIONS_URL, model: '~typesafe/jev-latest' });
    expect(jevEndpoint('openrouter', { model: 'jev-latest' }).model).toBe('~typesafe/jev-latest');
    expect(jevEndpoint('openrouter', { model: '~typesafe/jev-1' }).model).toBe('~typesafe/jev-1');
    expect(jevEndpoint('typesafe', { baseUrl: 'https://proxy.test' }).url).toBe('https://proxy.test');
  });
});

describe('secret detection', () => {
  it('detects credential-like commands and output', () => {
    expect(looksSecret('cat .env', '')).toBe(true);
    expect(looksSecret('printf value', 'api_key=secret-value')).toBe(true);
    expect(looksSecret('ls', 'src README.md')).toBe(false);
  });
});

describe('api key lookup', () => {
  const $ = (env: Record<string, string>, settings: Record<string, unknown> = {}) => ({
    env: { get: async (name: string) => env[name] },
    settings: { read: async () => settings },
  });

  it('prefers the plugin option, then TYPESAFE_API_KEY', async () => {
    expect(await getApiKey($({ TYPESAFE_API_KEY: 'from-env' }), { apiKey: 'from-option' } as never)).toBe('from-option');
    expect(await getApiKey($({ TYPESAFE_API_KEY: 'from-env' }), {} as never)).toBe('from-env');
  });

  it('falls back to EVAL_TYPESAFE_API_KEY, which is all an eval run gets', async () => {
    expect(await getApiKey($({ EVAL_TYPESAFE_API_KEY: 'from-eval' }), {} as never)).toBe('from-eval');
  });

  it('falls back to the settings env block, and is undefined with no key anywhere', async () => {
    expect(await getApiKey($({}, { env: { TYPESAFE_API_KEY: 'from-settings' } }), {} as never)).toBe('from-settings');
    expect(await getApiKey($({}), {} as never)).toBeUndefined();
  });
});

describe('archive failure', () => {
  it('keeps the trim when the workspace cannot be written to', () => {
    const marker = "[fast-jev-output trimmed 40 lines (900 chars); full output: .claude/fast-jev-output/bash-t1.txt (Read or grep it if needed)]";
    const fallback = marker.replaceAll(
      '; full output: .claude/fast-jev-output/bash-t1.txt (Read or grep it if needed)',
      '; not saved to disk, re-run the command if you need these lines',
    );
    expect(fallback).toBe('[fast-jev-output trimmed 40 lines (900 chars); not saved to disk, re-run the command if you need these lines]');
  });
});

describe('provider credentials', () => {
  const $ = (env: Record<string, string>, settings: Record<string, unknown> = {}) => ({
    env: { get: async (name: string) => env[name] },
    settings: { read: async () => settings },
  });
  const config = (options: Record<string, string> = {}) => resolveHookConfig(options);

  it('keeps TypeSafe for TypeSafe keys and ignores an unrelated OPENROUTER_API_KEY', async () => {
    expect(await getJevCredentials($({ TYPESAFE_API_KEY: 'ts-key', OPENROUTER_API_KEY: 'sk-or-v1-x' }), config()))
      .toEqual({ apiKey: 'ts-key', provider: 'typesafe' });
    expect(await getJevCredentials($({ OPENROUTER_API_KEY: 'sk-or-v1-x' }), config())).toBeUndefined();
  });

  it('switches to OpenRouter when the configured key is an OpenRouter key', async () => {
    expect(await getJevCredentials($({}), config({ apiKey: 'sk-or-v1-x' })))
      .toEqual({ apiKey: 'sk-or-v1-x', provider: 'openrouter' });
    expect(await getJevCredentials($({}), config({ apiKey: 'sk-or-v1-x', provider: 'typesafe' })))
      .toEqual({ apiKey: 'sk-or-v1-x', provider: 'typesafe' });
  });

  it('reads OPENROUTER_API_KEY and its fallbacks only when OpenRouter is selected', async () => {
    const openRouter = config({ provider: 'openrouter' });
    expect(await getJevCredentials($({ TYPESAFE_API_KEY: 'ts-key', OPENROUTER_API_KEY: 'or-env' }), openRouter))
      .toEqual({ apiKey: 'or-env', provider: 'openrouter' });
    expect(await getJevCredentials($({ EVAL_OPENROUTER_API_KEY: 'or-eval' }), openRouter))
      .toEqual({ apiKey: 'or-eval', provider: 'openrouter' });
    expect(await getJevCredentials($({}, { env: { OPENROUTER_API_KEY: 'or-settings' } }), openRouter))
      .toEqual({ apiKey: 'or-settings', provider: 'openrouter' });
    expect(await getJevCredentials($({ TYPESAFE_API_KEY: 'ts-key' }), openRouter)).toBeUndefined();
  });
});
