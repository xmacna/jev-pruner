import type {
  On,
  PluginOptions,
  Register,
  SessionMessage,
} from 'claude-code';

import {
  DEFAULT_MODEL,
  buildJevRequest,
  isOpenRouterKey,
  jevEndpoint,
  parseJevResponse,
} from '../src/jev.js';
import { exceedsOutputThreshold, MIN_OUTPUT_TOKENS, trimOutput } from '../src/output.js';
import type { JevAsker, JevProvider } from '../src/jev.js';

const ARCHIVE_DIR = '.claude/fast-jev-output';
const DEFAULTS = {
  persistedMaxChars: 8_000,
  chunkLines: 20,
  keepThreshold: 0.5,
  maxStateTokens: 25_000,
  minTokens: MIN_OUTPUT_TOKENS,
  model: DEFAULT_MODEL,
};

export type HookFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type HookFetchResponse = {
  status: number;
  ok: boolean;
  text: string;
};

export type HookFetch = (
  url: string,
  init?: HookFetchInit,
) => Promise<HookFetchResponse>;

export type HookConfig = {
  apiKey?: string;
  chunkLines: number;
  keepThreshold: number;
  maxStateTokens: number;
  minTokens: number;
  persistedOutputs: boolean;
  persistedMaxChars: number;
  model: string;
  /** Unset: TypeSafe, unless the key found is an OpenRouter key. */
  provider?: JevProvider;
  baseUrl?: string;
};

function optionNumber(options: PluginOptions, key: string, fallback: number): number {
  const value = options[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionString(options: PluginOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function resolveHookConfig(options: PluginOptions): HookConfig {
  const config: HookConfig = {
    chunkLines: optionNumber(options, 'chunkLines', DEFAULTS.chunkLines),
    keepThreshold: optionNumber(options, 'keepThreshold', DEFAULTS.keepThreshold),
    maxStateTokens: optionNumber(options, 'maxStateTokens', DEFAULTS.maxStateTokens),
    minTokens: Math.max(MIN_OUTPUT_TOKENS, optionNumber(options, 'minTokens', DEFAULTS.minTokens)),
    persistedOutputs:
      typeof options.persistedOutputs === 'boolean' ? options.persistedOutputs : true,
    persistedMaxChars: optionNumber(options, 'persistedMaxChars', DEFAULTS.persistedMaxChars),
    model: optionString(options, 'model') ?? DEFAULTS.model,
  };
  const apiKey = optionString(options, 'apiKey');
  if (apiKey) config.apiKey = apiKey;
  const provider = optionString(options, 'provider');
  if (provider === 'typesafe' || provider === 'openrouter') config.provider = provider;
  const baseUrl = optionString(options, 'baseUrl');
  if (baseUrl) config.baseUrl = baseUrl;
  return config;
}

export function jevAsker(
  fetchFn: HookFetch,
  apiKey: string,
  model: string,
  baseUrl?: string,
): JevAsker {
  return {
    async ask(state, questions) {
      const request = buildJevRequest({ apiKey, model, baseUrl }, state, questions);
      const response = await fetchFn(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return parseJevResponse(response.status, response.ok, response.text);
    },
  };
}

export function goalFromMessages(messages: readonly SessionMessage[]): string {
  return messages
    .filter(
      (message) =>
        message.role === 'user' &&
        message.text.trim().length > 0 &&
        (!message.toolResults || message.toolResults.length === 0),
    )
    .slice(-3)
    .map((message) => message.text.slice(0, 500))
    .join('\n');
}

type KeySources = {
  env: { get: (name: string) => Promise<string | undefined> };
  settings: { read: () => Promise<Readonly<Record<string, unknown>>> };
};

function settingsEnv(settings: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const env = settings['env'];
  if (!env || typeof env !== 'object') return undefined;
  const value = (env as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : undefined;
}

// `claude plugin eval` runs with a fresh HOME and a scrubbed environment, and
// passes through only EVAL_* variables, so those are the eval suite's key path.
// Variable names stay literal: the plugin validator lists what `$.env.get` reads.

/** Key lookup order: plugin option, TYPESAFE_API_KEY, EVAL_TYPESAFE_API_KEY, settings env. */
export async function getApiKey($: KeySources, config: HookConfig): Promise<string | undefined> {
  if (config.apiKey) return config.apiKey;
  return (
    (await $.env.get('TYPESAFE_API_KEY')) ||
    (await $.env.get('EVAL_TYPESAFE_API_KEY')) ||
    settingsEnv(await $.settings.read(), 'TYPESAFE_API_KEY')
  );
}

async function getOpenRouterKey($: KeySources, config: HookConfig): Promise<string | undefined> {
  if (config.apiKey) return config.apiKey;
  return (
    (await $.env.get('OPENROUTER_API_KEY')) ||
    (await $.env.get('EVAL_OPENROUTER_API_KEY')) ||
    settingsEnv(await $.settings.read(), 'OPENROUTER_API_KEY')
  );
}

/**
 * The key and the provider it belongs to. With `provider: "openrouter"` the
 * key comes from the plugin option or OPENROUTER_API_KEY (same fallbacks as
 * TYPESAFE_API_KEY). Otherwise lookup is unchanged and only an OpenRouter-style
 * key found there switches to OpenRouter; an OPENROUTER_API_KEY that is set for
 * other tools is never picked up on its own.
 */
export async function getJevCredentials(
  $: KeySources,
  config: HookConfig,
): Promise<{ apiKey: string; provider: JevProvider } | undefined> {
  if (config.provider === 'openrouter') {
    const apiKey = await getOpenRouterKey($, config);
    return apiKey ? { apiKey, provider: 'openrouter' } : undefined;
  }
  const apiKey = await getApiKey($, config);
  if (!apiKey) return undefined;
  return {
    apiKey,
    provider: config.provider ?? (isOpenRouterKey(apiKey) ? 'openrouter' : 'typesafe'),
  };
}

const SECRET_COMMAND =
  /(^|[|;&]\s*)(printenv|env)\b|\.env\b|\b(secret|secrets|credential|credentials|password|token|keychain|netrc|id_rsa|private[_-]?key)\b/i;
const SECRET_OUTPUT =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(aws_secret_access_key|api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[=:]\s*\S|:\/\/[^\s:@/]+:[^\s:@/]+@/i;

export function looksSecret(command: string, output: string): boolean {
  return SECRET_COMMAND.test(command) || SECRET_OUTPUT.test(output);
}

export const register: Register = (on: On, options: PluginOptions) => {
  const configured = resolveHookConfig(options);

  on('tool.call', { tool: 'Bash' }, async ($, event, next) => {
    const answer = await next(event);
    try {
      if (answer.deny !== undefined || answer.isError || !answer.result) return answer;
      const record = answer.result;
      const persisted = record.persistedOutputPath;
      if (persisted && !configured.persistedOutputs) return answer;
      const output = persisted ? await $.fs.read(persisted) : record.stdout;
      if (!exceedsOutputThreshold(output, configured.minTokens)) return answer;
      const combined = persisted ? output : output + (record.stderr ? `\n${record.stderr}` : '');
      const credentials = await getJevCredentials($, configured);
      if (!credentials) return answer;
      const endpoint = jevEndpoint(credentials.provider, configured);
      const messages = await $.session.messages();
      const goal = goalFromMessages(messages);
      const secret = looksSecret(event.command, combined);
      const path = secret
        ? undefined
        : persisted ?? `${ARCHIVE_DIR}/bash-${event.tool_use_id ?? Date.now()}.txt`;
      const footer = path
        ? `\n\n[fast-jev-output full output: ${path} (Read or grep it if needed)]`
        : '';
      const maxChars = persisted ? Math.max(0, configured.persistedMaxChars) : 0;
      if (maxChars > 0 && maxChars <= footer.length) return answer;
      let archived: Promise<void> | undefined;
      const saveOutput = async (): Promise<void> => {
        if (!path || persisted) return;
        const ignorePath = `${ARCHIVE_DIR}/.gitignore`;
        if (!(await $.fs.exists(ignorePath))) await $.fs.write(ignorePath, '*\n');
        await $.fs.write(path, combined);
      };
      const asker = jevAsker(
        async (url, init) => {
          if (path) await (archived ??= saveOutput());
          const response = await $.http.fetch(url, init);
          return { status: response.status, ok: response.ok, text: response.text };
        },
        credentials.apiKey,
        endpoint.model,
        endpoint.url,
      );
      let cost: number | undefined;
      const trimmed = await trimOutput(
        {
          command: event.command,
          goal,
          messages,
          output,
          fullOutputPath: path,
        },
        {
          async ask(state, questions) {
            const response = await asker.ask(state, questions);
            const billed = response.usage?.cost;
            if (typeof billed === 'number') cost = (cost ?? 0) + billed;
            return response;
          },
        },
        {
          minTokens: configured.minTokens,
          maxChars: maxChars > 0 ? maxChars - footer.length : 0,
          chunkLines: configured.chunkLines,
          keepThreshold: configured.keepThreshold,
          maxStateTokens: configured.maxStateTokens,
        },
      );
      if (!trimmed.trimmed) return answer;
      const stdout = trimmed.output + footer;
      const scores = trimmed.scores.map((score) => score.toFixed(2)).join(',');
      $.ui.log(
        `bash output: kept ${trimmed.kept}/${trimmed.chunks} chunks (${trimmed.charsBefore}→${stdout.length} chars) scores=${scores}${cost === undefined ? '' : ` cost=$${cost.toFixed(6)}`}`,
      );
      $.ui.toast(
        `trimmed Bash output ${trimmed.charsBefore}→${stdout.length} chars`,
        { timeoutMs: 8_000 },
      );
      const result = { ...record, stdout };
      delete result.persistedOutputPath;
      delete result.persistedOutputSize;
      if (persisted) result.stderr = '';
      return { result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      $.ui.log(`bash output trim skipped (${message})`);
      return answer;
    }
  });
};
