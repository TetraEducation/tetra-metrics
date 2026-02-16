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
});
