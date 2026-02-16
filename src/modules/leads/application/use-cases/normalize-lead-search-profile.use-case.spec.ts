import type { ObservabilityAdapter } from '@/infra/observability/observability.adapter';
import type {
  FormAnswerBatchItem,
  JobRunSnapshot,
  NormalizeLeadSearchProfilePort,
} from '@/modules/leads/application/ports/normalize-lead-search-profile.port';
import { NormalizeLeadSearchProfileUseCase } from './normalize-lead-search-profile.use-case';

const QUESTION_ID = 'q-gender-1';
const QUESTION_EXCEL_ID = 'q-excel-1';
const QUESTION_ROLE_ID = 'q-role-1';
const QUESTION_SENIORITY_ID = 'q-seniority-1';
const QUESTION_COMPANY_ID = 'q-company-1';
const JOB_NAME = 'normalize-lead-search-profile';

function buildBatchItem(params: Partial<FormAnswerBatchItem>): FormAnswerBatchItem {
  return {
    id: 'answer-1',
    questionId: QUESTION_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    leadId: 'lead-1',
    valueText: 'feminino',
    valueNumber: null,
    ...params,
  };
}

function buildJobRunSnapshot(overrides: Partial<JobRunSnapshot> = {}): JobRunSnapshot {
  return {
    id: 'run-1',
    jobName: JOB_NAME,
    status: 'running',
    cursor: null,
    processedRows: 0,
    processedLeads: 0,
    meta: {},
    ...overrides,
  };
}

type PortMock = jest.Mocked<NormalizeLeadSearchProfilePort>;
type ObservabilityMock = jest.Mocked<ObservabilityAdapter>;

function createPortMock(): PortMock {
  return {
    resolveQuestionIdsByNormalizedKeys: jest.fn().mockResolvedValue({ gender: [QUESTION_ID] }),
    readFormAnswersBatch: jest.fn().mockResolvedValue([]),
    upsertLeadSearchProfile: jest.fn().mockResolvedValue(undefined),
    findLatestJobRunByStatuses: jest.fn().mockResolvedValue(null),
    createJobRun: jest.fn().mockResolvedValue(buildJobRunSnapshot()),
    hasRunningJobRun: jest.fn().mockResolvedValue(false),
    updateJobRunProgress: jest.fn().mockResolvedValue(undefined),
    markJobRunFailed: jest.fn().mockResolvedValue(undefined),
    markJobRunCompleted: jest.fn().mockResolvedValue(undefined),
  };
}

function createObservabilityMock(): ObservabilityMock {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe('NormalizeLeadSearchProfileUseCase', () => {
  it('ignora execução quando já existe run ativa e allowConcurrentRun não está habilitado', async () => {
    const port = createPortMock();
    const observability = createObservabilityMock();
    port.hasRunningJobRun.mockResolvedValueOnce(true);

    const useCase = new NormalizeLeadSearchProfileUseCase(port, observability);
    const result = await useCase.execute({ batchSize: 50 });

    expect(result).toEqual({
      jobRunId: null,
      resumedFromJobRunId: null,
      processedRows: 0,
      processedLeads: 0,
      cursor: null,
      completionReason: null,
      skipped: true,
    });
    expect(port.createJobRun).not.toHaveBeenCalled();
    expect(observability.warn).toHaveBeenCalledWith(
      'normalize_lead_search_profile_skipped_running_job',
      expect.objectContaining({ jobName: JOB_NAME }),
    );
  });

  it('ignora execução quando createJobRun sinaliza lock lógico ativo', async () => {
    const port = createPortMock();
    const observability = createObservabilityMock();
    port.createJobRun.mockRejectedValueOnce(
      new Error('Já existe execução em andamento para este job (lock lógico ativo).'),
    );

    const useCase = new NormalizeLeadSearchProfileUseCase(port, observability);
    const result = await useCase.execute({ batchSize: 50 });

    expect(result.skipped).toBe(true);
    expect(observability.warn).toHaveBeenCalledWith(
      'normalize_lead_search_profile_skipped_lock',
      expect.objectContaining({ jobName: JOB_NAME }),
    );
  });

  it('retoma de job_runs com status running e usa cursor/progresso como base', async () => {
    const port = createPortMock();
    const runningRun = buildJobRunSnapshot({
      id: 'run-running',
      status: 'running',
      cursor: { createdAt: '2025-01-05T00:00:00.000Z', id: 'cursor-running' },
      processedRows: 10,
      processedLeads: 4,
    });

    port.findLatestJobRunByStatuses.mockResolvedValueOnce(runningRun);
    port.createJobRun.mockResolvedValueOnce(
      buildJobRunSnapshot({
        id: 'run-new',
        cursor: runningRun.cursor,
        processedRows: runningRun.processedRows,
        processedLeads: runningRun.processedLeads,
      }),
    );

    const useCase = new NormalizeLeadSearchProfileUseCase(port, createObservabilityMock());
    await useCase.execute({ batchSize: 50 });

    expect(port.findLatestJobRunByStatuses).toHaveBeenCalledWith({
      jobName: JOB_NAME,
      statuses: ['running', 'failed'],
    });
    expect(port.createJobRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: runningRun.cursor,
        processedRows: 10,
        processedLeads: 4,
        meta: expect.objectContaining({ resumedFromJobRunId: 'run-running' }),
      }),
    );
  });

  it('retoma de job_runs com status failed quando não há running', async () => {
    const port = createPortMock();
    const failedRun = buildJobRunSnapshot({
      id: 'run-failed',
      status: 'failed',
      cursor: { createdAt: '2025-01-06T00:00:00.000Z', id: 'cursor-failed' },
      processedRows: 7,
      processedLeads: 3,
    });

    port.findLatestJobRunByStatuses.mockResolvedValueOnce(failedRun);

    const useCase = new NormalizeLeadSearchProfileUseCase(port, createObservabilityMock());
    await useCase.execute({ batchSize: 25 });

    expect(port.createJobRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: failedRun.cursor,
        processedRows: 7,
        processedLeads: 3,
        meta: expect.objectContaining({ resumedFromJobRunId: 'run-failed' }),
      }),
    );
  });

  it('faz fallback para último completed quando não encontra running/failed', async () => {
    const port = createPortMock();
    const completedRun = buildJobRunSnapshot({
      id: 'run-completed',
      status: 'completed',
      cursor: { createdAt: '2025-01-07T00:00:00.000Z', id: 'cursor-completed' },
      processedRows: 20,
      processedLeads: 10,
    });

    port.findLatestJobRunByStatuses.mockResolvedValueOnce(null).mockResolvedValueOnce(completedRun);

    const useCase = new NormalizeLeadSearchProfileUseCase(port, createObservabilityMock());
    await useCase.execute({ batchSize: 100 });

    expect(port.findLatestJobRunByStatuses).toHaveBeenNthCalledWith(1, {
      jobName: JOB_NAME,
      statuses: ['running', 'failed'],
    });
    expect(port.findLatestJobRunByStatuses).toHaveBeenNthCalledWith(2, {
      jobName: JOB_NAME,
      statuses: ['completed'],
    });
    expect(port.createJobRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: completedRun.cursor,
        processedRows: 20,
        processedLeads: 10,
      }),
    );
  });

  it('atualiza cursor incrementalmente por batch e contabiliza processed_rows/processed_leads', async () => {
    const port = createPortMock();
    port.readFormAnswersBatch
      .mockResolvedValueOnce([
        buildBatchItem({ id: 'a-1', leadId: 'lead-1', createdAt: '2025-02-01T00:00:00.000Z' }),
        buildBatchItem({ id: 'a-2', leadId: 'lead-2', createdAt: '2025-02-01T00:00:01.000Z' }),
      ])
      .mockResolvedValueOnce([
        buildBatchItem({ id: 'a-3', leadId: 'lead-3', createdAt: '2025-02-01T00:00:02.000Z' }),
      ])
      .mockResolvedValueOnce([]);

    const useCase = new NormalizeLeadSearchProfileUseCase(port, createObservabilityMock());
    const result = await useCase.execute({ batchSize: 2 });

    expect(port.updateJobRunProgress).toHaveBeenNthCalledWith(1, {
      id: 'run-1',
      cursor: { createdAt: '2025-02-01T00:00:01.000Z', id: 'a-2' },
      processedRows: 2,
      processedLeads: 2,
    });
    expect(port.updateJobRunProgress).toHaveBeenNthCalledWith(2, {
      id: 'run-1',
      cursor: { createdAt: '2025-02-01T00:00:02.000Z', id: 'a-3' },
      processedRows: 3,
      processedLeads: 3,
    });
    expect(port.markJobRunCompleted).toHaveBeenCalledWith({
      id: 'run-1',
      cursor: { createdAt: '2025-02-01T00:00:02.000Z', id: 'a-3' },
      processedRows: 3,
      processedLeads: 3,
    });
    expect(result).toMatchObject({
      processedRows: 3,
      processedLeads: 3,
      cursor: { createdAt: '2025-02-01T00:00:02.000Z', id: 'a-3' },
      skipped: false,
    });
  });

  it('marca como failed preservando cursor, error_message e progresso em exceção', async () => {
    const port = createPortMock();
    port.readFormAnswersBatch
      .mockResolvedValueOnce([
        buildBatchItem({ id: 'a-1', leadId: 'lead-1', createdAt: '2025-03-01T00:00:00.000Z' }),
      ])
      .mockResolvedValueOnce([
        buildBatchItem({ id: 'a-2', leadId: 'lead-2', createdAt: '2025-03-01T00:00:01.000Z' }),
      ]);
    port.upsertLeadSearchProfile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('falha no upsert'));

    const useCase = new NormalizeLeadSearchProfileUseCase(port, createObservabilityMock());

    await expect(useCase.execute({ batchSize: 1 })).rejects.toThrow('falha no upsert');

    expect(port.updateJobRunProgress).toHaveBeenCalledTimes(1);
    expect(port.updateJobRunProgress).toHaveBeenCalledWith({
      id: 'run-1',
      cursor: { createdAt: '2025-03-01T00:00:00.000Z', id: 'a-1' },
      processedRows: 1,
      processedLeads: 1,
    });
    expect(port.markJobRunFailed).toHaveBeenCalledWith({
      id: 'run-1',
      cursor: { createdAt: '2025-03-01T00:00:00.000Z', id: 'a-1' },
      processedRows: 1,
      processedLeads: 1,
      errorMessage: 'falha no upsert',
    });
    expect(port.markJobRunCompleted).not.toHaveBeenCalled();
  });

  it('normaliza e persiste excel, função, senioridade e empresa atual', async () => {
    const port = createPortMock();
    port.resolveQuestionIdsByNormalizedKeys.mockResolvedValue({
      gender: [QUESTION_ID],
      'como-voce-considera-seus-conhecimentos-em-excel-hoje': [QUESTION_EXCEL_ID],
      'qual-das-opcoes-descreveria-melhor-a-funcao-que-voce-desempenha-ou-a-ultima-que-desempenhou':
        [QUESTION_ROLE_ID],
      'qual-seu-nivel-de-senioridade': [QUESTION_SENIORITY_ID],
      'qual-o-nome-da-empresa-em-que-trabalha-atualmente': [QUESTION_COMPANY_ID],
    });
    port.readFormAnswersBatch
      .mockResolvedValueOnce([
        buildBatchItem({
          id: 'a-1',
          questionId: QUESTION_EXCEL_ID,
          leadId: 'lead-42',
          valueText:
            'Intermediário (conheço PROCV, Tabela Dinâmica, SOMASE e as funções mais usadas no dia a dia das empresas)',
        }),
        buildBatchItem({
          id: 'a-2',
          questionId: QUESTION_ROLE_ID,
          leadId: 'lead-42',
          valueText: 'Sou empreendedor',
        }),
        buildBatchItem({
          id: 'a-3',
          questionId: QUESTION_SENIORITY_ID,
          leadId: 'lead-42',
          valueText: 'Sênior',
        }),
        buildBatchItem({
          id: 'a-4',
          questionId: QUESTION_COMPANY_ID,
          leadId: 'lead-42',
          valueText: 'Açúcar & Cia',
        }),
      ])
      .mockResolvedValueOnce([]);

    const useCase = new NormalizeLeadSearchProfileUseCase(port, createObservabilityMock());
    await useCase.execute({ batchSize: 10 });

    expect(port.upsertLeadSearchProfile).toHaveBeenCalledWith([
      {
        leadId: 'lead-42',
        excelKnowledge: 'intermediate',
        jobRole: 'entrepreneur',
        seniorityLevel: 'senior',
        currentCompany: 'acucar & cia',
      },
    ]);
  });

  it('normaliza currentCompany quando só há valueNumber e envia string', async () => {
    const port = createPortMock();
    port.resolveQuestionIdsByNormalizedKeys.mockResolvedValue({
      'qual-o-nome-da-empresa-em-que-trabalha-atualmente': [QUESTION_COMPANY_ID],
    });
    port.readFormAnswersBatch.mockResolvedValueOnce([
      buildBatchItem({
        id: 'a-company-number',
        questionId: QUESTION_COMPANY_ID,
        leadId: 'lead-999',
        valueText: null,
        valueNumber: 987654,
      }),
    ]);
    port.readFormAnswersBatch.mockResolvedValueOnce([]);

    const useCase = new NormalizeLeadSearchProfileUseCase(port, createObservabilityMock());

    await useCase.execute({ batchSize: 5 });

    expect(port.upsertLeadSearchProfile).toHaveBeenCalledWith([
      {
        leadId: 'lead-999',
        currentCompany: '987654',
      },
    ]);
  });
});

it('emite eventos estruturados de início, progresso e conclusão', async () => {
  const port = createPortMock();
  const observability = createObservabilityMock();

  port.resolveQuestionIdsByNormalizedKeys.mockResolvedValue({
    gender: [QUESTION_ID],
    'genero da pessoa': [],
    sexo: [],
    company_size: [],
    porte_empresa: [],
    'porte da empresa': [],
    company: [],
    education_level: [],
    escolaridade: [],
    formacao: [],
    age: [],
    idade: [],
    faixa_etaria: [],
    salary: [],
    salario: [],
    renda: [],
  });
  port.readFormAnswersBatch
    .mockResolvedValueOnce([
      buildBatchItem({ id: 'a-1', leadId: 'lead-1', createdAt: '2025-02-01T00:00:00.000Z' }),
    ])
    .mockResolvedValueOnce([]);

  const useCase = new NormalizeLeadSearchProfileUseCase(port, observability);

  await useCase.execute({ batchSize: 10 });

  expect(observability.info).toHaveBeenCalledWith(
    'normalize_lead_search_profile_started',
    expect.objectContaining({
      jobRunId: 'run-1',
      step: 'start',
      batchSize: 10,
      unknownEducationCount: 0,
    }),
  );
  expect(observability.info).toHaveBeenCalledWith(
    'normalize_lead_search_profile_progress',
    expect.objectContaining({
      jobRunId: 'run-1',
      step: 'batch_progress',
      cursorId: 'a-1',
      processedRows: 1,
      processedLeads: 1,
    }),
  );
  expect(observability.info).toHaveBeenCalledWith(
    'normalize_lead_search_profile_completed',
    expect.objectContaining({
      jobRunId: 'run-1',
      step: 'complete',
      processedRows: 1,
      processedLeads: 1,
    }),
  );
});
