import { PrismaLeadsV2Repository } from '@/modules/leads-v2/infra/repositories/prisma-leads-v2.repository';

describe('PrismaLeadsV2Repository.createLeadEvent', () => {
  it('ignora erro de unique violation (P2002)', async () => {
    const prismaMock = {
      leadEvents: {
        create: jest.fn().mockRejectedValue({
          code: 'P2002',
          message: 'Unique constraint failed on the fields: (`dedupe_key`)',
        }),
      },
    };

    const repository = new PrismaLeadsV2Repository(prismaMock as never);

    await expect(
      repository.createLeadEvent({
        leadId: 'lead_1',
        eventType: 'LEAD_IMPORTED',
        sourceSystem: 'SPREADSHEET',
        occurredAt: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
        dedupeKey: 'SPREADSHEET:import-one:source:lead_imported',
        payload: {},
      }),
    ).resolves.toBeUndefined();
  });

  it('relança erro quando não é unique violation', async () => {
    const expectedError = new Error('database offline');
    const prismaMock = {
      leadEvents: {
        create: jest.fn().mockRejectedValue(expectedError),
      },
    };

    const repository = new PrismaLeadsV2Repository(prismaMock as never);

    await expect(
      repository.createLeadEvent({
        leadId: 'lead_2',
        eventType: 'TAG_ADDED',
        sourceSystem: 'SPREADSHEET',
        occurredAt: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
        dedupeKey: 'SPREADSHEET:import-one:source:tag_added:cpb2',
        payload: {},
      }),
    ).rejects.toThrow('database offline');
  });
});
