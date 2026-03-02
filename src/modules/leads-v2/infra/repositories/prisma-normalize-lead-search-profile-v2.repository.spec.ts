import { PrismaNormalizeLeadSearchProfileV2Repository } from '@/modules/leads-v2/infra/repositories/prisma-normalize-lead-search-profile-v2.repository';

describe('PrismaNormalizeLeadSearchProfileV2Repository.resolveQuestionIdsByNormalizedKeys', () => {
  it('resolve com fallback por similaridade quando nao houver match exato', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'question-role-1',
          keyNormalized:
            'qual-das-opcoes-descreveria-melhor-a-funcao-que-voce-desempenha-ou-a-ultima-funcao-que-desempenhou',
        },
      ]);

    const prismaMock = {
      formQuestions: { findMany },
      formAnswers: { findMany: jest.fn() },
      jobRuns: {
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const repository = new PrismaNormalizeLeadSearchProfileV2Repository(prismaMock as never, {
      upsertBatch: jest.fn(),
      findByLeadId: jest.fn(),
      findLeadIdsByFilters: jest.fn(),
    });

    const key =
      'qual-das-opcoes-descreveria-melhor-a-funcao-que-voce-desempenha-ou-a-ultima-que-desempenhou';

    const result = await repository.resolveQuestionIdsByNormalizedKeys([key]);

    expect(result[key]).toEqual(['question-role-1']);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { keyNormalized: { in: [key] } },
      select: { id: true, keyNormalized: true },
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      select: { id: true, keyNormalized: true },
    });
  });
});
