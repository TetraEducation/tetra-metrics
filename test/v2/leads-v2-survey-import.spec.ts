import { Test } from '@nestjs/testing';
import { LeadsV2Controller } from '@/modules/leads-v2/interface/http/leads-v2.controller';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';
import { LeadsV2SearchService } from '@/modules/leads-v2/application/services/leads-v2-search.service';
import { LeadsV2DetailService } from '@/modules/leads-v2/application/services/leads-v2-detail.service';
import { LeadsV2SpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-spreadsheet-jobs.service';
import { LeadsV2SurveySpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-survey-spreadsheet-jobs.service';

describe('LeadsV2Controller survey import', () => {
  it('enfileira planilha de survey e retorna payload assíncrono', async () => {
    const queueSpreadsheet = jest.fn().mockResolvedValue({
      jobRunId: 'job-survey-1',
      status: 'PENDING',
    });

    const module = await Test.createTestingModule({
      controllers: [LeadsV2Controller],
      providers: [
        {
          provide: LeadsV2ImportService,
          useValue: { findOrCreateLeadByIdentifiers: jest.fn() },
        },
        {
          provide: LeadsV2SearchService,
          useValue: { searchLead: jest.fn() },
        },
        {
          provide: LeadsV2DetailService,
          useValue: { getLeadDetails: jest.fn() },
        },
        {
          provide: LeadsV2SpreadsheetJobsService,
          useValue: { queueSpreadsheet: jest.fn(), listRuns: jest.fn(), retryRun: jest.fn() },
        },
        {
          provide: LeadsV2SurveySpreadsheetJobsService,
          useValue: { queueSpreadsheet },
        },
      ],
    }).compile();

    const controller = module.get(LeadsV2Controller);
    const file = {
      originalname: 'survey.csv',
      mimetype: 'text/csv',
      size: 100,
      buffer: Buffer.from('email,Pergunta\nana@example.com,Sim'),
    } as Express.Multer.File;

    const response = await controller.importSurveySpreadsheet(file, {
      sourceSystem: 'spreadsheet',
      tagKey: 'CPB2',
    });

    expect(queueSpreadsheet).toHaveBeenCalledWith({
      file,
      sourceSystem: 'spreadsheet',
      tagKey: 'CPB2',
    });
    expect(response).toEqual({
      ok: true,
      jobRunId: 'job-survey-1',
      status: 'PENDING',
    });
  });
});
