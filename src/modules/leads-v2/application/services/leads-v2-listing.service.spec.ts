import { LeadsV2ListingService } from '@/modules/leads-v2/application/services/leads-v2-listing.service';

type PrismaMock = {
  tags: {
    findMany: jest.Mock;
  };
  leads: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
};

const buildPrismaMock = (): PrismaMock => ({
  tags: {
    findMany: jest.fn(),
  },
  leads: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
});

describe('LeadsV2ListingService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lista leads com paginacao, ordenacao e mapeamento de identificadores', async () => {
    const prisma = buildPrismaMock();
    prisma.leads.count.mockResolvedValue(2);
    prisma.leads.findMany.mockResolvedValue([
      {
        name: 'Ana',
        lastActivityAt: new Date('2026-02-10T10:00:00.000Z'),
        identifiers: [
          {
            type: 'EMAIL',
            value: 'ana-primary@example.com',
            isPrimary: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          {
            type: 'PHONE',
            value: '11999990000',
            isPrimary: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
      {
        name: 'Bruno',
        lastActivityAt: null,
        identifiers: [
          {
            type: 'EMAIL',
            value: 'bruno-oldest@example.com',
            isPrimary: false,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          {
            type: 'EMAIL',
            value: 'bruno-newest@example.com',
            isPrimary: false,
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
          },
        ],
      },
    ]);

    const service = new LeadsV2ListingService(prisma as never);
    const result = await service.listLeads({
      page: 2,
      perPage: 2,
      orderBy: 'full_name',
      orderDirection: 'asc',
    });

    expect(prisma.leads.count).toHaveBeenCalledWith({ where: {} });
    expect(prisma.leads.findMany).toHaveBeenCalledWith({
      where: {},
      select: {
        name: true,
        lastActivityAt: true,
        identifiers: {
          select: { type: true, value: true, isPrimary: true, createdAt: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ name: 'asc' }],
      skip: 2,
      take: 2,
    });
    expect(result).toEqual({
      data: [
        {
          nome: 'Ana',
          email: 'ana-primary@example.com',
          telefone: '11999990000',
          ultimoContatoComercial: '2026-02-10T10:00:00.000Z',
        },
        {
          nome: 'Bruno',
          email: 'bruno-oldest@example.com',
          telefone: null,
          ultimoContatoComercial: null,
        },
      ],
      page: 2,
      perPage: 2,
      total: 2,
    });
  });

  it('retorna vazio e evita query quando filtro de tag nao resolve ids', async () => {
    const prisma = buildPrismaMock();
    prisma.tags.findMany.mockResolvedValue([]);
    const service = new LeadsV2ListingService(prisma as never);

    const result = await service.listLeads({
      tag: 'campanha-nao-existe',
      page: 1,
      perPage: 20,
    });

    expect(prisma.tags.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.leads.count).not.toHaveBeenCalled();
    expect(prisma.leads.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: [],
      page: 1,
      perPage: 20,
      total: 0,
    });
  });

  it('aplica filtros funcionais no where do Prisma', async () => {
    const prisma = buildPrismaMock();
    prisma.tags.findMany
      .mockResolvedValueOnce([{ id: 'tag-1' }])
      .mockResolvedValueOnce([{ id: 'tag-2' }])
      .mockResolvedValueOnce([{ id: 'tag-3' }]);
    prisma.leads.count.mockResolvedValue(0);
    prisma.leads.findMany.mockResolvedValue([]);

    const service = new LeadsV2ListingService(prisma as never);
    await service.listLeads({
      name: 'Maria Silva',
      email: 'Maria@Email.com',
      phone: '(11) 98888-7777',
      tag: 'tag-chave',
      campaignTagKey: 'camp-key',
      campaignName: 'Summer',
      hasClintSource: false,
      salaryMin: 1200,
      salaryMax: 4500,
      ageMin: 21,
      ageMax: 35,
      gender: 'female',
      companySize: 'small',
      educationLevel: 'bachelor',
      excelKnowledge: 'intermediate',
      powerBiKnowledge: 'advanced',
      jobRole: 'manager',
      currentCompany: 'acucar',
      lastActivityFrom: '2026-01-01T00:00:00.000Z',
      lastActivityTo: '2026-01-31T23:59:59.999Z',
    });

    expect(prisma.tags.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.leads.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        name: { contains: 'Maria Silva', mode: 'insensitive' },
        tags: { some: { tagId: { in: ['tag-1', 'tag-2', 'tag-3'] } } },
        NOT: { sources: { some: { sourceSystem: 'CLINT' } } },
        lastActivityAt: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-01-31T23:59:59.999Z'),
        },
        searchProfile: {
          is: expect.objectContaining({
            gender: 'female',
            companySize: 'small',
            educationLevel: 'bachelor',
            excelKnowledge: 'intermediate',
            powerBiKnowledge: 'advanced',
            jobRole: 'manager',
            currentCompany: { contains: 'acucar', mode: 'insensitive' },
            AND: expect.arrayContaining([
              { OR: [{ salaryMax: null }, { salaryMax: { gte: 1200 } }] },
              { OR: [{ salaryMin: null }, { salaryMin: { lte: 4500 } }] },
              { OR: [{ ageMax: null }, { ageMax: { gte: 21 } }] },
              { OR: [{ ageMin: null }, { ageMin: { lte: 35 } }] },
            ]),
          }),
        },
      }),
    });
    expect(prisma.leads.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              identifiers: {
                some: {
                  type: 'EMAIL',
                  valueNormalized: 'maria@email.com',
                },
              },
            },
            {
              identifiers: {
                some: {
                  type: 'PHONE',
                  valueNormalized: '11988887777',
                },
              },
            },
          ]),
        }),
        orderBy: [{ lastActivityAt: 'desc' }],
      }),
    );
  });
});
