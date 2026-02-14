import { ImportOneLeadV2Dto } from '@/modules/leads-v2/interface/http/import-one-lead-v2.dto';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';
import {
  LEADS_V2_REPOSITORY,
  type LeadEventTypeV2,
  type LeadSourceSystemV2,
  type LeadsV2RepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-repository.port';
import type { LeadV2 } from '@/modules/leads-v2/domain/lead-v2';
import { Test } from '@nestjs/testing';

const mockLead: LeadV2 = {
  id: 'lead-123',
  name: 'Ana',
  createdAt: new Date().toISOString(),
};

const createRepositoryMock = (): LeadsV2RepositoryPort => {
  const lead = { ...mockLead };
  const mocks = {
    findLeadBySearch: jest.fn().mockResolvedValue(null),
    createLead: jest.fn().mockResolvedValue(lead),
    attachIdentifiers: jest.fn().mockResolvedValue({ conflicts: [] }),
    updateLead: jest.fn().mockResolvedValue(undefined),
    deleteLeads: jest.fn().mockResolvedValue(undefined),
    getLeadById: jest.fn().mockResolvedValue(lead),
    upsertLeadSource: jest.fn().mockResolvedValue(undefined),
    upsertTag: jest
      .fn()
      .mockResolvedValue('tag-123'),
    upsertTagAlias: jest.fn().mockResolvedValue(undefined),
    upsertLeadTag: jest.fn().mockResolvedValue(undefined),
    createLeadEvent: jest.fn().mockResolvedValue(undefined),
  };

  return mocks as unknown as LeadsV2RepositoryPort;
};

describe('LeadsV2ImportService', () => {
  let service: LeadsV2ImportService;
  let repository: LeadsV2RepositoryPort & { createLeadEvent: jest.Mock };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LeadsV2ImportService,
        {
          provide: LEADS_V2_REPOSITORY,
          useFactory: () => createRepositoryMock(),
        },
      ],
    }).compile();

    service = module.get(LeadsV2ImportService);
    repository = module.get(LEADS_V2_REPOSITORY);
  });

  it('records tags and events when UTMs are supplied', async () => {
    const input = {
      name: 'Ana',
      email: 'ana@example.com',
      phone: '(11) 99999-0000',
      source: 'clint',
      sourceSystem: 'clint',
      sourceRef: 'card-123',
      utm_campaign: 'CPB13',
    } satisfies ImportOneLeadV2Dto;

    await service.findOrCreateLeadByIdentifiers(input as any);

    expect(repository.upsertLeadSource).toHaveBeenCalled();
    expect(repository.upsertTag).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'CPB13' }),
    );
    expect(repository.upsertLeadTag).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSystem: 'CLINT' }),
    );

    const events = repository.createLeadEvent.mock.calls.map((call) => call[0]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'LEAD_IMPORTED' }),
        expect.objectContaining({ eventType: 'TAG_ADDED' }),
      ]),
    );
    expect(repository.createLeadEvent).toHaveBeenCalledTimes(2);
  });
});
