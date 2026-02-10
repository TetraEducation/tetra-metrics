import { BadRequestException } from '@nestjs/common';

import { LeadsImportService } from '@/modules/leads/application/services/leads-import.service';
import type { LeadsRepositoryPort } from '@/modules/leads/application/ports/leads-repository.port';

function createRepoMock(overrides?: Partial<LeadsRepositoryPort>): LeadsRepositoryPort {
  const repo: LeadsRepositoryPort = {
    findIdentifiersByValues: jest.fn().mockResolvedValue([]),
    createLead: jest.fn().mockResolvedValue({
      id: 'new-lead',
      name: '',
      createdAt: '2025-01-01T00:00:00.000Z',
    }),
    attachIdentifiers: jest.fn().mockResolvedValue({ conflicts: [] }),
    updateLead: jest.fn().mockResolvedValue(undefined),
    upsertLeadSource: jest.fn().mockResolvedValue(undefined),
    reassignIdentifiers: jest.fn().mockResolvedValue(undefined),
    deleteLeads: jest.fn().mockResolvedValue(undefined),
    getLeadById: jest.fn().mockResolvedValue({
      id: 'lead-1',
      name: 'Any',
      createdAt: '2025-01-01T00:00:00.000Z',
    }),
    findLeadBySearch: jest.fn().mockResolvedValue(null),
    getLeadDetailById: jest.fn().mockResolvedValue({}),
    listLeads: jest.fn().mockResolvedValue({ data: [], page: 1, perPage: 20, total: 0 }),
    listLeadIds: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return repo;
}

describe('LeadsImportService', () => {
  it('rejeita quando não tem email nem telefone', async () => {
    const repo = createRepoMock();
    const svc = new LeadsImportService(repo);

    await expect(
      svc.findOrCreateLeadByIdentifiers({ name: 'x', email: null, phone: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita quando tem sourceSystem mas sourceRef é vazio', async () => {
    const repo = createRepoMock();
    const svc = new LeadsImportService(repo);

    await expect(
      svc.findOrCreateLeadByIdentifiers({
        email: 'lucas@exemplo.com',
        phone: null,
        name: null,
        sourceSystem: 'great_pages',
        sourceRef: '   ',
        meta: { utm_source: 'x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria lead novo quando não encontra por email/phone e anexa identificadores', async () => {
    const repo = createRepoMock({
      createLead: jest.fn().mockResolvedValue({
        id: 'new-lead',
        name: '',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
      getLeadById: jest.fn().mockResolvedValue({
        id: 'new-lead',
        name: 'Lucas',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
    });

    const svc = new LeadsImportService(repo);
    const result = await svc.findOrCreateLeadByIdentifiers({
      name: 'Lucas',
      email: 'lucas@exemplo.com',
      phone: '(98)3033-766',
    });

    expect(result.created).toBe(true);
    expect(result.lead.id).toBe('new-lead');
    expect(repo.createLead).toHaveBeenCalled();
    expect(repo.attachIdentifiers).toHaveBeenCalled();
  });

  it('usa lead existente por email e atualiza nome', async () => {
    const repo = createRepoMock({
      findLeadBySearch: jest.fn().mockImplementation(async (p: { email?: string; phone?: string }) => {
        if (p.email) return 'lead-email';
        return null;
      }),
      getLeadById: jest.fn().mockResolvedValue({
        id: 'lead-email',
        name: 'Novo Nome',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
    });

    const svc = new LeadsImportService(repo);
    const result = await svc.findOrCreateLeadByIdentifiers({
      name: 'Novo Nome',
      email: 'lucas@exemplo.com',
      phone: null,
    });

    expect(result.created).toBe(false);
    expect(repo.updateLead).toHaveBeenCalledWith('lead-email', { name: 'Novo Nome' });
  });

  it('usa lead existente por telefone quando não tem email', async () => {
    const repo = createRepoMock({
      findLeadBySearch: jest.fn().mockImplementation(async (p: { email?: string; phone?: string }) => {
        if (p.phone) return 'lead-phone';
        return null;
      }),
      getLeadById: jest.fn().mockResolvedValue({
        id: 'lead-phone',
        name: null,
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
    });

    const svc = new LeadsImportService(repo);
    const result = await svc.findOrCreateLeadByIdentifiers({
      name: null,
      email: null,
      phone: '+55 (11) 99999-8888',
    });

    expect(result.lead.id).toBe('lead-phone');
    expect(repo.createLead).not.toHaveBeenCalled();
  });

  it('ignora telefone conflitante quando email define o lead', async () => {
    const repo = createRepoMock({
      findLeadBySearch: jest.fn().mockImplementation(async (p: { email?: string; phone?: string }) => {
        if (p.email) return 'lead-email';
        return null;
      }),
      attachIdentifiers: jest.fn().mockResolvedValueOnce({ conflicts: [] }).mockResolvedValueOnce({
        conflicts: [{ type: 'phone', valueNorm: '11999998888' }],
      }),
      getLeadById: jest.fn().mockResolvedValue({
        id: 'lead-email',
        name: 'Any',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
    });

    const svc = new LeadsImportService(repo);
    const result = await svc.findOrCreateLeadByIdentifiers({
      name: null,
      email: 'lucas@exemplo.com',
      phone: '(11) 99999-8888',
    });

    expect(result.phoneIgnoredDueToConflict).toBe(true);
  });

  it('registra source em lead_sources quando source é fornecido', async () => {
    const repo = createRepoMock({
      findLeadBySearch: jest.fn().mockImplementation(async (p: { email?: string; phone?: string }) => {
        if (p.email) return 'lead-email';
        return null;
      }),
      getLeadById: jest.fn().mockResolvedValue({
        id: 'lead-email',
        name: 'Any',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
    });

    const svc = new LeadsImportService(repo);
    await svc.findOrCreateLeadByIdentifiers({
      name: 'Lucas',
      email: 'lucas@exemplo.com',
      phone: null,
      source: 'Great_Pages',
    });

    expect(repo.upsertLeadSource).toHaveBeenCalledWith({
      leadId: 'lead-email',
      sourceSystem: 'great_pages',
      sourceRef: 'lead:lead-email',
      meta: {},
    });
  });

  it('registra source em lead_sources quando sourceSystem/sourceRef/meta são fornecidos', async () => {
    const repo = createRepoMock({
      findLeadBySearch: jest.fn().mockImplementation(async (p: { email?: string; phone?: string }) => {
        if (p.email) return 'lead-email';
        return null;
      }),
      getLeadById: jest.fn().mockResolvedValue({
        id: 'lead-email',
        name: 'Any',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
    });

    const svc = new LeadsImportService(repo);
    await svc.findOrCreateLeadByIdentifiers({
      name: 'Lucas',
      email: 'lucas@exemplo.com',
      phone: null,
      source: 'GREAT_PAGES',
      sourceSystem: 'great_pages',
      sourceRef: 'gp:abc-123',
      meta: {
        url: 'https://example.com',
        utm: { utm_source: 'google' },
      },
    });

    expect(repo.upsertLeadSource).toHaveBeenCalledWith({
      leadId: 'lead-email',
      sourceSystem: 'great_pages',
      sourceRef: 'gp:abc-123',
      meta: {
        url: 'https://example.com',
        utm: { utm_source: 'google' },
      },
    });
  });
});

