import { readEnv } from '@/server/context';

/**
 * AI PROVIDER ABSTRACTION
 * =======================
 * The assistant only ever asks a provider to turn one sentence into one JSON
 * action. It never asks for a number, a balance or a recommendation. Swapping
 * Workers AI for OpenAI / Anthropic / Gemini is a matter of adding a class
 * here — nothing else in the product knows which model answered.
 */

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  tokensUsed: number;
}

export interface AiProvider {
  readonly id: string;
  /** False when credentials or bindings are missing; the caller degrades. */
  readonly available: boolean;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/** Used when no provider is configured. Never throws; the caller falls back. */
export class NullAiProvider implements AiProvider {
  readonly id = 'none';
  readonly available = false;

  async complete(): Promise<CompletionResult> {
    return { text: '', tokensUsed: 0 };
  }
}

class WorkersAiProvider implements AiProvider {
  readonly id = 'workers-ai';

  constructor(
    private readonly ai: Ai | undefined,
    private readonly model: string,
  ) {}

  get available(): boolean {
    return Boolean(this.ai);
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    if (!this.ai) return { text: '', tokensUsed: 0 };

    const response = (await this.ai.run(
      this.model as Parameters<Ai['run']>[0],
      {
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        max_tokens: request.maxTokens ?? 220,
        temperature: 0,
      } as never,
    )) as { response?: string; usage?: { total_tokens?: number } };

    return {
      text: response?.response ?? '',
      tokensUsed: response?.usage?.total_tokens ?? 0,
    };
  }
}

class OpenAiProvider implements AiProvider {
  readonly id = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  get available(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    if (!this.available) return { text: '', tokensUsed: 0 };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: request.maxTokens ?? 220,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[ai:openai] HTTP', response.status);
      return { text: '', tokensUsed: 0 };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    return {
      text: payload.choices?.[0]?.message?.content ?? '',
      tokensUsed: payload.usage?.total_tokens ?? 0,
    };
  }
}

class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  get available(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    if (!this.available) return { text: '', tokensUsed: 0 };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: request.maxTokens ?? 220,
        temperature: 0,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
      }),
    });

    if (!response.ok) {
      console.error('[ai:anthropic] HTTP', response.status);
      return { text: '', tokensUsed: 0 };
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text =
      payload.content?.find((block) => block.type === 'text')?.text ?? '';

    return {
      text,
      tokensUsed:
        (payload.usage?.input_tokens ?? 0) + (payload.usage?.output_tokens ?? 0),
    };
  }
}

class GeminiProvider implements AiProvider {
  readonly id = 'gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  get available(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    if (!this.available) return { text: '', tokensUsed: 0 };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: 'user', parts: [{ text: request.user }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: request.maxTokens ?? 220,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      console.error('[ai:gemini] HTTP', response.status);
      return { text: '', tokensUsed: 0 };
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };

    return {
      text: payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      tokensUsed: payload.usageMetadata?.totalTokenCount ?? 0,
    };
  }
}

export function getAiProvider(env?: Partial<CloudflareEnv>): AiProvider {
  const configured = readEnv(env, 'AI_PROVIDER') || 'workers-ai';

  switch (configured) {
    case 'openai':
      return new OpenAiProvider(
        readEnv(env, 'OPENAI_API_KEY'),
        readEnv(env, 'OPENAI_MODEL') || 'gpt-4o-mini',
      );
    case 'anthropic':
      return new AnthropicProvider(
        readEnv(env, 'ANTHROPIC_API_KEY'),
        readEnv(env, 'ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001',
      );
    case 'gemini':
      return new GeminiProvider(
        readEnv(env, 'GEMINI_API_KEY'),
        readEnv(env, 'GEMINI_MODEL') || 'gemini-2.0-flash',
      );
    case 'none':
      return new NullAiProvider();
    case 'workers-ai':
    default:
      return new WorkersAiProvider(
        env?.AI,
        readEnv(env, 'WORKERS_AI_MODEL') || '@cf/meta/llama-3.1-8b-instruct',
      );
  }
}
