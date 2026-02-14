import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ImportSurveySpreadsheetV2Dto {
  @ApiPropertyOptional({
    example: 'spreadsheet',
    description: 'Origem da importação de respostas. Padrão: spreadsheet.',
  })
  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @ApiPropertyOptional({
    example: 'CPB2',
    description: 'Nome lógico da pesquisa/campanha. Se ausente, usa o nome base do arquivo.',
  })
  @IsOptional()
  @IsString()
  tagKey?: string;
}
