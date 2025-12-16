import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Logger,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { ImportsService } from '@/modules/imports/application/services/imports.service';
import { ImportSpreadsheetDto } from '@/modules/imports/application/dto/import-spreadsheet.dto';
import { FileUploadDebugInterceptor } from '@/modules/imports/infra/interceptors/file-upload-debug.interceptor';

@Controller('imports')
export class ImportsController {
  private readonly logger = new Logger(ImportsController.name);

  constructor(private readonly service: ImportsService) {}

  @Post('spreadsheet')
  @UseInterceptors(
    FileUploadDebugInterceptor,
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
  )
  async spreadsheet(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ImportSpreadsheetDto,
    @Req() request: Request,
  ) {
    this.logger.debug(`Recebida requisição. File: ${file ? 'presente' : 'ausente'}`);
    this.logger.debug(`Body: ${JSON.stringify(body)}`);
    this.logger.debug(`Request files: ${JSON.stringify(request.files || {})}`);
    this.logger.debug(`Request file (single): ${JSON.stringify(request.file || 'null')}`);
    this.logger.debug(`Content-Type: ${request.headers['content-type']}`);

    if (!file) {
      this.logger.warn('Arquivo não foi recebido. Verifique se o campo se chama "file" e está como tipo File no form-data.');
      throw new BadRequestException(
        'Arquivo ausente. Certifique-se de:\n' +
        '1. Enviar o arquivo no campo "file" (minúsculo)\n' +
        '2. Usar form-data (não raw ou x-www-form-urlencoded)\n' +
        '3. O campo "file" deve ser do tipo File (não Text)',
      );
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo está vazio ou inválido.');
    }

    this.logger.log(`Arquivo recebido: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    return this.service.run({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sourceSystem: body.sourceSystem ?? 'spreadsheet',
      dryRun: body.dryRun === 'true',
      forcedTagKey: body.tagKey,
    });
  }
}

