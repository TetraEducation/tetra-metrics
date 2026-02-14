import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { LeadsV2ImportOperationsService } from '@/modules/leads-v2/application/services/leads-v2-import-operations.service';
import { ImportOperationResponseDto } from '@/modules/leads-v2/interface/http/import-operation.dto';

@ApiTags('Import Operations V2')
@Controller('v2/import-operations')
export class ImportOperationsController {
  constructor(private readonly importOperations: LeadsV2ImportOperationsService) {}

  @Get(':operationId')
  @ApiOperation({
    summary: 'Consulta o status de uma operacao assincrona de importacao',
  })
  @ApiParam({
    name: 'operationId',
    type: String,
    description: 'ID da operacao (equivale ao jobRunId).',
    example: 'cmf1d1x1y0000abc123def456',
  })
  @ApiOkResponse({
    description: 'Detalhe da operacao de importacao.',
    type: ImportOperationResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Operacao nao encontrada para o ID informado.',
  })
  async getById(@Param('operationId') operationId: string): Promise<ImportOperationResponseDto> {
    const operation = await this.importOperations.getOperationById(operationId);
    if (!operation) {
      throw new NotFoundException('Operacao nao encontrada.');
    }
    return operation;
  }
}
