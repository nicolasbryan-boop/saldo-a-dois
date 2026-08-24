import { describe, it, expect } from 'vitest';
import { parseLocally, inferCategory, categoryLabel } from '@/domains/assistant/parser';
import { normalizeLlmAction, interpret } from '@/domains/assistant/interpreter';
import { assistantActionSchema, isMutating } from '@/domains/assistant/actions';
import { NullAiProvider, type AiProvider } from '@/domains/assistant/providers';

const TZ = 'America/Sao_Paulo';

/** A provider that returns whatever text a test hands it. */
function fakeProvider(text: string): AiProvider {
  return {
    id: 'fake',
    available: true,
    async complete() {
      return { text, tokensUsed: 12 };
    },
  };
}

describe('local parser — movements', () => {
  it('reads a full sentence with a verb and a category', () => {
    const result = parseLocally('Gastei 120 no mercado', TZ);
    expect(result?.confidence).toBe('high');
    expect(result?.action).toMatchObject({
      type: 'create_expense',
      amountCents: 12000,
      categorySlug: 'mercado',
    });
  });

  it('reads cents written the Brazilian way', () => {
    const result = parseLocally('Paguei 86,50 de gasolina', TZ);
    expect(result?.action).toMatchObject({
      type: 'create_expense',
      amountCents: 8650,
      categorySlug: 'transporte',
    });
  });

  it('reads bare shorthand', () => {
    expect(parseLocally('mercado 120', TZ)?.action).toMatchObject({
      type: 'create_expense',
      amountCents: 12000,
      categorySlug: 'mercado',
    });

    expect(parseLocally('gasolina 80', TZ)?.action).toMatchObject({
      type: 'create_expense',
      amountCents: 8000,
      categorySlug: 'transporte',
    });
  });

  it('reads delivery shorthand', () => {
    expect(parseLocally('59 no ifood', TZ)?.action).toMatchObject({
      type: 'create_expense',
      amountCents: 5900,
      categorySlug: 'delivery',
    });
  });

  it('reads income', () => {
    expect(parseLocally('Recebi meu salário de 4500', TZ)?.action).toMatchObject({
      type: 'create_income',
      amountCents: 450000,
      categorySlug: 'salario',
    });

    expect(parseLocally('Entrou 300 de um freela', TZ)?.action).toMatchObject({
      type: 'create_income',
      amountCents: 30000,
      categorySlug: 'freela',
    });
  });

  it('reads money set aside', () => {
    expect(parseLocally('Guardei 300 hoje', TZ)?.action).toMatchObject({
      type: 'create_reserve',
      amountCents: 30000,
    });
  });

  it('understands "ontem"', () => {
    const today = new Date();
    const result = parseLocally('Gastei 50 no mercado ontem', TZ);
    const action = result?.action;
    expect(action?.type).toBe('create_expense');
    if (action && 'date' in action) {
      expect(action.date).toBeDefined();
      expect(action.date).not.toBe(today.toISOString().slice(0, 10));
    }
  });

  it('handles amounts with thousands separators', () => {
    expect(parseLocally('Paguei 1.850 de aluguel', TZ)?.action).toMatchObject({
      type: 'create_expense',
      amountCents: 185000,
      categorySlug: 'moradia',
    });
  });
});

describe('local parser — questions never reach a model', () => {
  const cases: Array<[string, string]> = [
    ['Quanto ainda posso gastar?', 'query_free_balance'],
    ['quanto posso gastar', 'query_free_balance'],
    ['Quais contas faltam pagar?', 'query_pending_bills'],
    ['Quanto gastamos com mercado?', 'query_category_spending'],
    ['Quanto gastamos essa semana?', 'query_total_spending'],
    ['Quanto cada um gastou?', 'query_member_spending'],
    ['Resumo do mês', 'query_summary'],
    ['Qual o saldo?', 'query_balance'],
    ['Quanto por dia?', 'query_daily_limit'],
    ['Dá pra gastar 500 em uma roupa hoje?', 'simulate_spend'],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" resolves locally to ${expected}`, () => {
      const result = parseLocally(input, TZ);
      expect(result).not.toBeNull();
      expect(result!.action.type).toBe(expected);
      expect(isMutating(result!.action)).toBe(false);
    });
  }

  it('extracts the amount from a spend simulation', () => {
    const result = parseLocally('Dá pra gastar 500 em uma roupa hoje?', TZ);
    expect(result?.action).toMatchObject({ type: 'simulate_spend', amountCents: 50000 });
  });

  it('detects the period of a spending question', () => {
    expect(parseLocally('Quanto gastamos hoje?', TZ)?.action).toMatchObject({
      type: 'query_total_spending',
      period: 'today',
    });
    expect(parseLocally('Quanto gastamos essa semana?', TZ)?.action).toMatchObject({
      type: 'query_total_spending',
      period: 'week',
    });
  });
});

describe('local parser — escalation', () => {
  it('gives up on genuinely ambiguous language', () => {
    expect(parseLocally('me conta uma história sobre dinheiro', TZ)).toBeNull();
    expect(parseLocally('e aí, tudo certo?', TZ)).toBeNull();
  });

  it('gives up when there is no amount to work with', () => {
    expect(parseLocally('comprei um negócio ali', TZ)).toBeNull();
  });
});

describe('category inference', () => {
  it('maps common words to the right category', () => {
    expect(inferCategory('fui no supermercado', 'expense')).toBe('mercado');
    expect(inferCategory('paguei o uber', 'expense')).toBe('transporte');
    expect(inferCategory('farmácia', 'expense')).toBe('saude');
    expect(inferCategory('netflix', 'expense')).toBe('assinaturas');
  });

  it('works without accents', () => {
    expect(inferCategory('cafe da manha', 'expense')).toBe('alimentacao');
    expect(inferCategory('racao do cachorro', 'expense')).toBe('pets');
  });

  it('labels unknown slugs safely', () => {
    expect(categoryLabel(null)).toBe('Outros');
    expect(categoryLabel('nao-existe')).toBe('Outros');
  });
});

describe('model output is never trusted', () => {
  it('rejects prose', () => {
    expect(normalizeLlmAction('claro! você gastou 120 reais').type).toBe('unknown');
  });

  it('rejects an unknown action type', () => {
    expect(
      normalizeLlmAction({ type: 'delete_everything', amount: 100 }).type,
    ).toBe('unknown');
  });

  it('rejects a negative amount', () => {
    expect(
      normalizeLlmAction({ type: 'create_expense', amount: -50, description: 'x' }).type,
    ).toBe('unknown');
  });

  it('rejects a zero amount', () => {
    expect(
      normalizeLlmAction({ type: 'create_expense', amount: 0, description: 'x' }).type,
    ).toBe('unknown');
  });

  it('rejects a movement with no amount at all', () => {
    expect(normalizeLlmAction({ type: 'create_expense', description: 'x' }).type).toBe(
      'unknown',
    );
  });

  it('rejects an absurd amount', () => {
    expect(
      normalizeLlmAction({ type: 'create_expense', amount: 1e15, description: 'x' }).type,
    ).toBe('unknown');
  });

  it('rejects a category slug it invented', () => {
    const action = normalizeLlmAction({
      type: 'create_expense',
      amount: 50,
      category: 'criptomoedas',
      description: 'x',
    });
    expect(action).toMatchObject({ type: 'create_expense', categorySlug: 'outros' });
  });

  it('drops an invented category on a category query rather than guessing', () => {
    expect(
      normalizeLlmAction({ type: 'query_category_spending', category: 'inventada' }).type,
    ).toBe('unknown');
  });

  it('converts reais to integer cents', () => {
    expect(
      normalizeLlmAction({ type: 'create_expense', amount: 86.5, description: 'Gasolina' }),
    ).toMatchObject({ type: 'create_expense', amountCents: 8650 });

    expect(
      normalizeLlmAction({ type: 'create_expense', amount: '120,50', description: 'Mercado' }),
    ).toMatchObject({ type: 'create_expense', amountCents: 12050 });
  });

  it('never produces a fractional cent', () => {
    const action = normalizeLlmAction({
      type: 'create_expense',
      amount: 10.005,
      description: 'x',
    });
    if (action.type === 'create_expense') {
      expect(Number.isInteger(action.amountCents)).toBe(true);
    }
  });
});

describe('interpret', () => {
  it('answers locally without calling the provider', async () => {
    let called = false;
    const provider: AiProvider = {
      id: 'spy',
      available: true,
      async complete() {
        called = true;
        return { text: '{}', tokensUsed: 999 };
      },
    };

    const result = await interpret('Gastei 120 no mercado', { timezone: TZ, provider });
    expect(called).toBe(false);
    expect(result.resolvedBy).toBe('rules');
    expect(result.tokensUsed).toBe(0);
  });

  it('never calls the provider for a question', async () => {
    let called = false;
    const provider: AiProvider = {
      id: 'spy',
      available: true,
      async complete() {
        called = true;
        return { text: '{}', tokensUsed: 999 };
      },
    };

    await interpret('Quanto ainda posso gastar?', { timezone: TZ, provider });
    expect(called).toBe(false);
  });

  it('falls back to the provider only when the parser gives up', async () => {
    const provider = fakeProvider(
      '{"type":"create_expense","amount":42.9,"category":"lazer","description":"Cinema"}',
    );

    const result = await interpret('aquilo do cinema ficou em 42,90 no fim das contas', {
      timezone: TZ,
      provider,
    });

    expect(result.resolvedBy).toBe('fake');
    expect(result.action).toMatchObject({ type: 'create_expense', amountCents: 4290 });
  });

  it('strips markdown fences around the JSON', async () => {
    const provider = fakeProvider(
      '```json\n{"type":"create_expense","amount":10,"description":"Teste"}\n```',
    );
    const result = await interpret('coisa estranha sem número claro aqui', {
      timezone: TZ,
      provider,
    });
    expect(result.action.type).toBe('create_expense');
  });

  it('returns unknown when the provider answers garbage', async () => {
    const provider = fakeProvider('desculpa, não entendi');
    const result = await interpret('blablabla indecifrável', { timezone: TZ, provider });
    expect(result.action.type).toBe('unknown');
    expect(isMutating(result.action)).toBe(false);
  });

  it('returns unknown when the provider throws', async () => {
    const provider: AiProvider = {
      id: 'broken',
      available: true,
      async complete() {
        throw new Error('boom');
      },
    };
    const result = await interpret('blablabla indecifrável', { timezone: TZ, provider });
    expect(result.action.type).toBe('unknown');
  });

  it('degrades quietly when no provider is configured', async () => {
    const result = await interpret('blablabla indecifrável', {
      timezone: TZ,
      provider: new NullAiProvider(),
    });
    expect(result.action.type).toBe('unknown');
    expect(result.tokensUsed).toBe(0);
  });
});

describe('action schema', () => {
  it('refuses a fractional amount', () => {
    const result = assistantActionSchema.safeParse({
      type: 'create_expense',
      amountCents: 120.5,
      description: 'Teste',
    });
    expect(result.success).toBe(false);
  });

  it('refuses an empty description', () => {
    const result = assistantActionSchema.safeParse({
      type: 'create_expense',
      amountCents: 1000,
      description: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('refuses a badly shaped date', () => {
    const result = assistantActionSchema.safeParse({
      type: 'create_expense',
      amountCents: 1000,
      description: 'Teste',
      date: '23/08/2026',
    });
    expect(result.success).toBe(false);
  });

  it('marks only the three write actions as mutating', () => {
    expect(isMutating({ type: 'create_expense', amountCents: 1, description: 'x' })).toBe(true);
    expect(isMutating({ type: 'query_free_balance' })).toBe(false);
    expect(isMutating({ type: 'unknown' })).toBe(false);
  });
});
