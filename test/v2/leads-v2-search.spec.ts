import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { LeadDetailDto } from '@/modules/leads/application/dto/lead-detail.dto';
import { LeadsV2DetailService } from '@/modules/leads-v2/application/services/leads-v2-detail.service';
import { LeadsV2SearchService } from '@/modules/leads-v2/application/services/leads-v2-search.service';
import type { LeadsV2RepositoryPort } from '@/modules/leads-v2/application/ports/leads-v2-repository.port';

const makeDetail = (): LeadDetailDto => ({
  id: 'lead-123',
  full_name: 'Ana',
  first_contact_at: null,
  last_activity_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  identifiers: [],
  sources: [],
  tags: [],
  events: [],
  funnel_entries: [],
  surveys: [],
});

describe('LeadsV2SearchService', () => {
  let repository: LeadsV2RepositoryPort;
  let service: LeadsV2SearchService;

  beforeEach(() => {
    repository = {
      findLeadBySearch: jest.fn().mockResolvedValue('lead-123'),
      getLeadDetailById: jest.fn().mockResolvedValue(makeDetail()),
    } as unknown as LeadsV2RepositoryPort;
    service = new LeadsV2SearchService(repository);
  });

  it('returns detail when search succeeds', async () => {
    const result = await service.searchLead({ email: 'ANA@example.com' });

    expect(repository.findLeadBySearch).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@example.com' }),
    );
    expect(repository.getLeadDetailById).toHaveBeenCalledWith('lead-123');
    expect(result.id).toBe('lead-123');
  });

  it('throws when option is provided without value', async () => {
    await expect(service.searchLead({ option: 'phone' })).rejects.toThrow(BadRequestException);
  });

  it('throws when no lead is found', async () => {
    (repository.findLeadBySearch as jest.Mock).mockResolvedValue(null);
    await expect(service.searchLead({ email: 'person@example.com' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('LeadsV2DetailService', () => {
  it('proxies to repository detail fetch', async () => {
    const repository = {
      getLeadDetailById: jest.fn().mockResolvedValue(makeDetail()),
    } as unknown as LeadsV2RepositoryPort;
    const service = new LeadsV2DetailService(repository);

    const result = await service.getLeadDetails('lead-123');

    expect(repository.getLeadDetailById).toHaveBeenCalledWith('lead-123');
    expect(result.full_name).toBe('Ana');
  });
});
