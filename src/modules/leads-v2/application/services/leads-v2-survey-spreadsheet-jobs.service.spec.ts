import type { ColumnInferencePort } from '@/modules/imports/application/ports/column-inference.port';
import type { SpreadsheetParserPort } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import { SurveyInferenceService } from '@/modules/imports/application/services/survey-inference.service';
import type {
  JobRunV2,
  LeadsV2JobRunsRepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';
import { LeadsV2SurveyIngestionService } from '@/modules/leads-v2/application/services/leads-v2-survey-ingestion.service';
import { LeadsV2SurveySpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-survey-spreadsheet-jobs.service';

const buildJobRunsMock = (): LeadsV2JobRunsRepositoryPort => ({
  createPending: jest.fn(),
  claimNextRunnable: jest.fn(),
  findById: jest.fn(),
  hasRunning: jest.fn(),
  list: jest.fn(),
  updateFilePath: jest.fn().mockResolvedValue(undefined),
  markCompleted: jest.fn(),
  markFailed: jest.fn(),
  markPendingForRetry: jest.fn(),
  updateProgress: jest.fn().mockResolvedValue(undefined),
  failStaleRunningRuns: jest.fn().mockResolvedValue(0),
});

const buildLeadsImportMock = () => ({
  findOrCreateLeadByIdentifiers: jest.fn().mockResolvedValue({
    lead: { id: 'lead_test', name: 'lead', createdAt: new Date().toISOString() },
    created: true,
    phoneIgnoredDueToConflict: false,
  }),
});

const buildSurveyInferenceMock = () =>
  ({
    inferQuestionColumns: jest.fn().mockReturnValue({
      questionColumns: [{ header: 'Pergunta 1', key: 'Pergunta 1' }],
    }),
  }) as unknown as SurveyInferenceService;

const buildSurveyIngestionMock = () =>
  ({
    prepareContext: jest.fn().mockResolvedValue({
      formSchemaId: 'schema-1',
      questionsMap: new Map([['pergunta-1', 'question-1']]),
      questionsCount: 1,
    }),
    ingestRows: jest.fn().mockResolvedValue({ responsesSaved: 1 }),
  }) as unknown as LeadsV2SurveyIngestionService;

describe('LeadsV2SurveySpreadsheetJobsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('combina nome + sobrenome e envia chunk para ingestão de surveys', async () => {
    const jobRuns = buildJobRunsMock();
    const parser = {} as SpreadsheetParserPort;
    const infer = {} as ColumnInferencePort;
    const surveyInference = buildSurveyInferenceMock();
    const surveyIngestion = buildSurveyIngestionMock();
    const leadsImport = buildLeadsImportMock();

    const service = new LeadsV2SurveySpreadsheetJobsService(
      jobRuns,
      parser,
      infer,
      surveyInference,
      surveyIngestion,
      leadsImport as unknown as LeadsV2ImportService,
    );

    await (service as any).processRows({
      runId: 'run-1',
      rows: [
        {
          email: 'maria@example.com',
          Nome: 'Maria',
          Sobrenome: 'Silva',
          'Pergunta 1': 'Resposta 1',
        },
      ],
      inferred: {
        emailKey: 'email',
        fullNameKey: 'Nome',
        nameKey: 'Nome',
        surnameKey: 'Sobrenome',
        phoneKey: null,
      },
      surveyInference: { questionColumns: [{ header: 'Pergunta 1', key: 'Pergunta 1' }] },
      surveyContext: {
        formSchemaId: 'schema-1',
        questionsMap: new Map([['pergunta-1', 'question-1']]),
        questionsCount: 1,
      },
      startFromRow: 1,
      sourceSystem: 'SPREADSHEET',
      tagKey: 'campanha',
      fileHash: 'hash123',
      existingStats: { processedRows: 0, processedOk: 0, processedErrors: 0, surveyResponsesSaved: 0 },
      existingErrors: [],
    });

    expect(leadsImport.findOrCreateLeadByIdentifiers).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Maria Silva',
      }),
    );
    expect((surveyIngestion as any).ingestRows).toHaveBeenCalledTimes(1);
  });

  it('executa recuperação de RUNNING stale antes de buscar próximo job', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.claimNextRunnable as jest.Mock).mockResolvedValue(null);

    const service = new LeadsV2SurveySpreadsheetJobsService(
      jobRuns,
      {} as SpreadsheetParserPort,
      {} as ColumnInferencePort,
      buildSurveyInferenceMock(),
      buildSurveyIngestionMock(),
      buildLeadsImportMock() as unknown as LeadsV2ImportService,
    );

    await service.processNextPendingRun();

    expect(jobRuns.failStaleRunningRuns).toHaveBeenCalledTimes(1);
    expect(jobRuns.claimNextRunnable).toHaveBeenCalledTimes(1);
  });

  it('retoma arquivo por processingPath quando filePath não existe mais', async () => {
    const run = {
      id: 'run_1',
      filePath: '/tmp/pending_file.csv',
      meta: {
        paths: {
          processingPath: '/tmp/processing_file.csv',
        },
      },
    } as unknown as JobRunV2;

    const service = new LeadsV2SurveySpreadsheetJobsService(
      buildJobRunsMock(),
      {} as SpreadsheetParserPort,
      {} as ColumnInferencePort,
      buildSurveyInferenceMock(),
      buildSurveyIngestionMock(),
      buildLeadsImportMock() as unknown as LeadsV2ImportService,
    );

    jest.spyOn(service as any, 'fileExists').mockImplementation(async (path: string) => {
      return path === '/tmp/processing_file.csv';
    });

    const resolved = await (service as any).resolveCurrentFilePath(run);
    expect(resolved).toBe('/tmp/processing_file.csv');
  });

  it('extrai campos opcionais de erros estruturados no meta', () => {
    const service = new LeadsV2SurveySpreadsheetJobsService(
      buildJobRunsMock(),
      {} as SpreadsheetParserPort,
      {} as ColumnInferencePort,
      buildSurveyInferenceMock(),
      buildSurveyIngestionMock(),
      buildLeadsImportMock() as unknown as LeadsV2ImportService,
    );

    const extracted = (service as any).extractErrorsFromMeta({
      errors: [
        {
          row: 9912,
          reason: 'numeric field overflow',
          column: 'Pergunta 3',
          value: '9.999999999999E+30',
          code: 'P2020',
          questionId: 'question-3',
        },
      ],
    });

    expect(extracted).toEqual([
      {
        row: 9912,
        reason: 'numeric field overflow',
        column: 'Pergunta 3',
        value: '9.999999999999E+30',
        code: 'P2020',
        questionId: 'question-3',
      },
    ]);
  });
});
