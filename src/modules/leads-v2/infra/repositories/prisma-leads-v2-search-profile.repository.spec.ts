import { PrismaLeadsV2SearchProfileRepository } from '@/modules/leads-v2/infra/repositories/prisma-leads-v2-search-profile.repository';

describe('PrismaLeadsV2SearchProfileRepository.upsertBatch', () => {
  it('nao sobrescreve campos ranqueados com valor de menor peso', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const prismaMock = {
      leadSearchProfile: {
        findUnique: jest.fn().mockResolvedValue({
          leadId: 'lead-1',
          salaryMin: 5000,
          salaryMax: 7000,
          ageMin: 30,
          ageMax: 40,
          gender: null,
          companySize: 'enterprise',
          educationLevel: 'master',
          excelKnowledge: 'advanced',
          powerBiKnowledge: 'advanced',
          jobRole: null,
          seniorityLevel: null,
          currentCompany: null,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        upsert,
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const repository = new PrismaLeadsV2SearchProfileRepository(prismaMock as never);

    await repository.upsertBatch([
      {
        leadId: 'lead-1',
        companySize: 'micro',
        educationLevel: 'high_school',
        excelKnowledge: 'basic',
        powerBiKnowledge: 'basic',
      },
    ]);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          companySize: undefined,
          educationLevel: undefined,
          excelKnowledge: undefined,
          powerBiKnowledge: undefined,
        }),
      }),
    );
  });

  it('sobrescreve faixa quando nova faixa e mais especifica', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const prismaMock = {
      leadSearchProfile: {
        findUnique: jest.fn().mockResolvedValue({
          leadId: 'lead-2',
          salaryMin: 5000,
          salaryMax: null,
          ageMin: null,
          ageMax: 60,
          gender: null,
          companySize: null,
          educationLevel: null,
          excelKnowledge: null,
          powerBiKnowledge: null,
          jobRole: null,
          seniorityLevel: null,
          currentCompany: null,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        upsert,
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const repository = new PrismaLeadsV2SearchProfileRepository(prismaMock as never);

    await repository.upsertBatch([
      {
        leadId: 'lead-2',
        salaryMin: 5000,
        salaryMax: 7000,
        ageMin: 30,
        ageMax: 40,
      },
    ]);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          salaryMin: 5000,
          salaryMax: 7000,
          ageMin: 30,
          ageMax: 40,
        }),
      }),
    );
  });
});
