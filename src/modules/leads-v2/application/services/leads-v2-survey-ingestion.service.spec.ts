import { LeadsV2SurveyIngestionService } from '@/modules/leads-v2/application/services/leads-v2-survey-ingestion.service';

const buildPrismaMock = () => ({
  formSchemas: {
    upsert: jest.fn().mockResolvedValue({ id: 'schema-1' }),
  },
  formQuestions: {
    upsert: jest
      .fn()
      .mockResolvedValueOnce({ id: 'q-1' })
      .mockResolvedValueOnce({ id: 'q-2' }),
  },
  formSchemaQuestions: {
    upsert: jest.fn().mockResolvedValue({ formSchemaId: 'schema-1', questionId: 'q-1' }),
  },
  formSubmissions: {
    upsert: jest
      .fn()
      .mockResolvedValueOnce({ id: 'sub-1' })
      .mockResolvedValueOnce({ id: 'sub-2' }),
  },
  formAnswers: {
    upsert: jest.fn().mockResolvedValue({ id: 'ans-1' }),
  },
});

describe('LeadsV2SurveyIngestionService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('prepara schema/perguntas e salva respostas com chaves idempotentes', async () => {
    const prisma = buildPrismaMock();
    const service = new LeadsV2SurveyIngestionService(prisma as any);

    const surveyInference = {
      questionColumns: [
        { header: 'Pergunta 1', key: 'Pergunta 1' },
        { header: 'Pergunta 2', key: 'Pergunta 2' },
      ],
    };

    const context = await service.prepareContext({
      fileHash: 'filehash',
      tagKey: 'CPB2',
      sourceSystem: 'SPREADSHEET',
      surveyInference,
    });

    expect(context?.formSchemaId).toBe('schema-1');
    expect(prisma.formSchemas.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.formQuestions.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.formSchemaQuestions.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.formQuestions.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { keyNormalized: 'pergunta-1' },
      }),
    );

    const result = await service.ingestRows({
      fileHash: 'filehash',
      context,
      surveyInference,
      processedRows: [
        {
          rowNumber: 2,
          leadId: 'lead-1',
          rowData: { 'Pergunta 1': 'Sim', 'Pergunta 2': 10 },
        },
        {
          rowNumber: 3,
          leadId: 'lead-2',
          rowData: { 'Pergunta 1': 'Nao', 'Pergunta 2': 20 },
        },
      ],
    });

    expect(result.responsesSaved).toBe(4);
    expect(prisma.formSubmissions.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.formAnswers.upsert).toHaveBeenCalledTimes(4);
    expect(prisma.formSubmissions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          formSchemaId_dedupeKey: {
            formSchemaId: 'schema-1',
            dedupeKey: 'filehash:2',
          },
        },
      }),
    );
  });

  it('faz fallback para texto quando overflow numerico ocorre', async () => {
    const prisma = buildPrismaMock();
    const overflowError = new Error('Value out of range for the type: numeric field overflow');
    (prisma.formAnswers.upsert as jest.Mock)
      .mockRejectedValueOnce(overflowError)
      .mockResolvedValue({ id: 'ans-overflow' });

    const service = new LeadsV2SurveyIngestionService(prisma as any);
    const context = {
      formSchemaId: 'schema-overflow',
      questionsMap: new Map([['idade', 'question-overflow']]),
      questionsCount: 1,
    };

    const surveyInference = {
      questionColumns: [{ header: 'Idade', key: 'Idade' }],
    };

    const result = await service.ingestRows({
      fileHash: 'filehash',
      context,
      surveyInference,
      processedRows: [
        {
          rowNumber: 2,
          leadId: 'lead-1',
          rowData: { Idade: 35988933764 },
        },
      ],
    });

    expect(result.responsesSaved).toBe(1);
    expect(prisma.formAnswers.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.formAnswers.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          valueText: '35988933764',
          valueNumber: null,
        }),
        update: expect.objectContaining({
          valueNumber: null,
        }),
      }),
    );
  });

  it('reutiliza pergunta global e cria vinculos para schemas diferentes', async () => {
    const prisma = buildPrismaMock();
    (prisma.formSchemas.upsert as jest.Mock)
      .mockResolvedValueOnce({ id: 'schema-a' })
      .mockResolvedValueOnce({ id: 'schema-b' });
    (prisma.formQuestions.upsert as jest.Mock)
      .mockResolvedValueOnce({ id: 'q-global' })
      .mockResolvedValueOnce({ id: 'q-global' });

    const service = new LeadsV2SurveyIngestionService(prisma as any);
    const surveyInference = {
      questionColumns: [{ header: 'Você é?', key: 'Você é?' }],
    };

    const firstContext = await service.prepareContext({
      fileHash: 'file-a',
      tagKey: 'CPB-A',
      sourceSystem: 'SPREADSHEET',
      surveyInference,
    });
    const secondContext = await service.prepareContext({
      fileHash: 'file-b',
      tagKey: 'CPB-B',
      sourceSystem: 'SPREADSHEET',
      surveyInference,
    });

    expect(firstContext?.questionsMap.get('voce-e')).toBe('q-global');
    expect(secondContext?.questionsMap.get('voce-e')).toBe('q-global');
    expect(prisma.formQuestions.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.formSchemaQuestions.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          formSchemaId_questionId: { formSchemaId: 'schema-a', questionId: 'q-global' },
        },
      }),
    );
    expect(prisma.formSchemaQuestions.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          formSchemaId_questionId: { formSchemaId: 'schema-b', questionId: 'q-global' },
        },
      }),
    );
  });
});
