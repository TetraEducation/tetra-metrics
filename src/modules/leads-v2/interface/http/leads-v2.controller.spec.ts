import { StreamableFile } from '@nestjs/common';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LeadsV2Controller } from '@/modules/leads-v2/interface/http/leads-v2.controller';

describe('LeadsV2Controller', () => {
  it('enfileira múltiplos arquivos e retorna jobs por arquivo', async () => {
    const spreadsheetJobs = {
      queueSpreadsheet: jest
        .fn()
        .mockResolvedValueOnce({ jobRunId: 'job-1', status: 'PENDING' })
        .mockRejectedValueOnce(new Error('arquivo duplicado')),
    };

    const controller = new LeadsV2Controller(
      {} as never,
      {} as never,
      {} as never,
      spreadsheetJobs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = await controller.importSpreadsheet(
      [
        {
          originalname: 'a.csv',
          mimetype: 'text/csv',
          buffer: Buffer.from('email\nana@example.com\n'),
          size: 20,
        } as Express.Multer.File,
        {
          originalname: 'b.csv',
          mimetype: 'text/csv',
          buffer: Buffer.from('email\nbia@example.com\n'),
          size: 20,
        } as Express.Multer.File,
      ],
      {},
    );

    expect(response.ok).toBe(false);
    expect(response.jobs).toEqual([
      {
        fileName: 'a.csv',
        jobRunId: 'job-1',
        status: 'PENDING',
      },
      {
        fileName: 'b.csv',
        error: 'arquivo duplicado',
      },
    ]);
  });

  it('falha quando nenhum arquivo é aceito para enfileiramento', async () => {
    const spreadsheetJobs = {
      queueSpreadsheet: jest.fn().mockRejectedValue(new Error('arquivo duplicado')),
    };
    const controller = new LeadsV2Controller(
      {} as never,
      {} as never,
      {} as never,
      spreadsheetJobs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.importSpreadsheet(
        [
          {
            originalname: 'a.csv',
            mimetype: 'text/csv',
            buffer: Buffer.from('email\nana@example.com\n'),
            size: 20,
          } as Express.Multer.File,
        ],
        {},
      ),
    ).rejects.toThrow('Nenhum arquivo foi aceito para enfileiramento.');
  });

  it('retorna StreamableFile no download de export', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-download-stream-'));
    const filePath = join(baseDir, 'export.csv');
    await writeFile(filePath, 'nome,email\nJohn,john@example.com\n', 'utf-8');

    const exportJobs = {
      getDownloadFile: jest.fn().mockResolvedValue({
        path: filePath,
        fileName: 'export.csv',
      }),
    };

    const controller = new LeadsV2Controller(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      exportJobs as never,
      {} as never,
    );

    const response = {
      setHeader: jest.fn(),
    };

    const stream = await controller.downloadExport('operation-1', response as never);

    expect(stream).toBeInstanceOf(StreamableFile);
    expect(exportJobs.getDownloadFile).toHaveBeenCalledWith('operation-1');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="export.csv"',
    );
  });

  it('lista operações de exportação com filtros', async () => {
    const importOperations = {
      listExportOperations: jest.fn().mockResolvedValue([
        {
          id: 'job-export-1',
          status: 'SUCCEEDED',
          progressPercent: 100,
          etaSeconds: null,
          counts: { processed: 10, created: 10, updated: 0, skipped: 0, failed: 0 },
          errors: [],
          createdAt: '2026-02-14T09:59:30.000Z',
          startedAt: '2026-02-14T10:00:00.000Z',
          finishedAt: '2026-02-14T10:01:00.000Z',
          correlationId: 'corr-1',
          downloadUrl: '/v2/leads/exports/job-export-1/download',
          expiresAt: '2026-02-17T10:01:00.000Z',
        },
      ]),
    };

    const controller = new LeadsV2Controller(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      importOperations as never,
    );

    const response = await controller.listExportOperations({ status: 'COMPLETED', limit: 10 });

    expect(importOperations.listExportOperations).toHaveBeenCalledWith({
      status: 'COMPLETED',
      limit: 10,
    });
    expect(response).toHaveLength(1);
    expect(response[0].id).toBe('job-export-1');
  });
});
