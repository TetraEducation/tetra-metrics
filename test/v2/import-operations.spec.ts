import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ImportOperationsController } from '@/modules/leads-v2/interface/http/import-operations.controller';
import { LeadsV2ImportOperationsService } from '@/modules/leads-v2/application/services/leads-v2-import-operations.service';

describe('ImportOperationsController', () => {
  it('retorna operacao quando encontrada', async () => {
    const getOperationById = jest.fn().mockResolvedValue({
      id: 'op-1',
      status: 'RUNNING',
      progressPercent: 42,
      etaSeconds: null,
      counts: {
        processed: 42,
        created: 30,
        updated: 0,
        skipped: 0,
        failed: 12,
      },
      errors: [],
      createdAt: '2026-02-14T10:00:00.000Z',
      startedAt: '2026-02-14T10:00:10.000Z',
      finishedAt: null,
      correlationId: null,
    });

    const module = await Test.createTestingModule({
      controllers: [ImportOperationsController],
      providers: [
        {
          provide: LeadsV2ImportOperationsService,
          useValue: { getOperationById },
        },
      ],
    }).compile();

    const controller = module.get(ImportOperationsController);
    const response = await controller.getById('op-1');

    expect(getOperationById).toHaveBeenCalledWith('op-1');
    expect(response.status).toBe('RUNNING');
    expect(response.progressPercent).toBe(42);
    expect(response.counts.processed).toBe(42);
  });

  it('retorna 404 quando operacao nao existe', async () => {
    const getOperationById = jest.fn().mockResolvedValue(null);

    const module = await Test.createTestingModule({
      controllers: [ImportOperationsController],
      providers: [
        {
          provide: LeadsV2ImportOperationsService,
          useValue: { getOperationById },
        },
      ],
    }).compile();

    const controller = module.get(ImportOperationsController);
    await expect(controller.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
