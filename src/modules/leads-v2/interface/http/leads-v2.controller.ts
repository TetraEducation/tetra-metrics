import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { ImportLeadV2Input } from '@/modules/leads-v2/application/dto/import-lead-v2.input';
import { SearchLeadV2Dto } from '@/modules/leads-v2/application/dto/search-lead-v2.dto';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';
import { LeadsV2SearchService } from '@/modules/leads-v2/application/services/leads-v2-search.service';
import { LeadsV2DetailService } from '@/modules/leads-v2/application/services/leads-v2-detail.service';
import { LeadsV2SpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-spreadsheet-jobs.service';
import { ImportSpreadsheetV2Dto } from '@/modules/leads-v2/interface/http/import-spreadsheet-v2.dto';
import { ImportOneLeadV2Dto } from '@/modules/leads-v2/interface/http/import-one-lead-v2.dto';
import {
  ListLeadsV2JobRunsQueryDto,
  SpreadsheetImportQueuedResponseDto,
} from '@/modules/leads-v2/interface/http/leads-v2-jobs.dto';
import {
  ImportOneLeadV2ResponseDto,
  LeadDetailResponseDto,
} from '@/modules/leads-v2/interface/http/lead-v2-response.dto';

@ApiTags('Leads V2')
@Controller('v2/leads')
export class LeadsV2Controller {
  constructor(
    private readonly leadsImport: LeadsV2ImportService,
    private readonly leadsSearch: LeadsV2SearchService,
    private readonly leadsDetail: LeadsV2DetailService,
    private readonly spreadsheetJobs: LeadsV2SpreadsheetJobsService,
  ) {}

  @Post('import-one')
  @ApiOperation({
    summary: 'Importa um lead na V2',
    description:
      'Cria ou reaproveita o lead com base em identificadores (email/phone/name) e retorna o resultado da operação.',
  })
  @ApiBody({ type: ImportOneLeadV2Dto })
  @ApiCreatedResponse({
    description: 'Lead importado com sucesso.',
    type: ImportOneLeadV2ResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Payload inválido para importação.',
  })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  async importOne(@Body() body: ImportOneLeadV2Dto): Promise<ImportOneLeadV2ResponseDto> {
    const input = {
      name: body.name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      source: body.source ?? null,
      sourceSystem: body.sourceSystem ?? null,
      sourceRef: body.sourceRef ?? null,
      meta: body.meta ?? null,
      utm_campaign: body.utm_campaign ?? null,
      utm_campaing: body.utm_campaing ?? null,
    } as ImportLeadV2Input;

    const result = await this.leadsImport.findOrCreateLeadByIdentifiers(input);

    return {
      ok: true,
      leadId: result.lead.id,
      created: result.created,
      phoneIgnoredDueToConflict: result.phoneIgnoredDueToConflict,
    };
  }

  @Post('import-spreadsheet')
  @ApiOperation({
    summary: 'Enfileira importação de planilha na V2',
    description:
      'Recebe a planilha, salva em disco e cria um job para processamento assíncrono com checkpoint.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        sourceSystem: {
          type: 'string',
          example: 'spreadsheet',
        },
        tagKey: {
          type: 'string',
          example: 'CPB2',
        },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({
    description: 'Planilha recebida e job criado com sucesso.',
    type: SpreadsheetImportQueuedResponseDto,
  })
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  async importSpreadsheet(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ImportSpreadsheetV2Dto,
  ): Promise<SpreadsheetImportQueuedResponseDto> {
    if (!file) {
      throw new BadRequestException('Arquivo ausente. Envie no campo "file".');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo está vazio ou inválido.');
    }

    const queued = await this.spreadsheetJobs.queueSpreadsheet({
      file,
      sourceSystem: body.sourceSystem,
      tagKey: body.tagKey,
    });

    return {
      ok: true,
      jobRunId: queued.jobRunId,
      status: queued.status,
    };
  }

  @Get('jobs/runs')
  @ApiOperation({
    summary: 'Lista runs de importação de planilha na V2',
  })
  async listJobRuns(@Query() query: ListLeadsV2JobRunsQueryDto) {
    return this.spreadsheetJobs.listRuns({
      status: query.status,
      limit: query.limit,
    });
  }

  @Post('jobs/runs/:id/retry')
  @ApiOperation({
    summary: 'Reenfileira um run com falha',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ID do job run',
  })
  async retryJobRun(@Param('id') id: string) {
    const retried = await this.spreadsheetJobs.retryRun(id);
    return {
      ok: true,
      jobRunId: retried.id,
      status: retried.status,
    };
  }

  @Get('search')
  @ApiOperation({
    summary: 'Busca lead na V2',
    description:
      'Busca por email, telefone ou nome e retorna o detalhamento completo do lead encontrado.',
  })
  @ApiQuery({
    name: 'option',
    required: false,
    enum: ['email', 'phone', 'name'],
    description: 'Força a busca por um campo específico.',
  })
  @ApiQuery({ name: 'name', required: false, type: String })
  @ApiQuery({ name: 'email', required: false, type: String })
  @ApiQuery({ name: 'phone', required: false, type: String })
  @ApiOkResponse({
    description: 'Detalhes do lead encontrado.',
    type: LeadDetailResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Parâmetros de busca inválidos.',
  })
  @ApiNotFoundResponse({
    description: 'Nenhum lead encontrado com os parâmetros fornecidos.',
  })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  async search(@Query() query: SearchLeadV2Dto): Promise<LeadDetailResponseDto> {
    return this.leadsSearch.searchLead(query);
  }

  @Get(':id/details')
  @ApiOperation({
    summary: 'Detalhes do lead por ID',
    description: 'Retorna o detalhamento completo de um lead específico.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ID do lead na base V2.',
    example: 'lead_01HZX8M1M8D4Q5N9S1C2B3A4D5',
  })
  @ApiOkResponse({
    description: 'Detalhes completos do lead.',
    type: LeadDetailResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Lead não encontrado para o ID informado.',
  })
  async details(@Param('id') id: string): Promise<LeadDetailResponseDto> {
    return this.leadsDetail.getLeadDetails(id);
  }
}
