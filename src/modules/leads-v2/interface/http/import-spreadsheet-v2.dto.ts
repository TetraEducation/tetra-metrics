import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ImportSpreadsheetV2Dto {
  @ApiPropertyOptional({
    example: 'spreadsheet',
    description: 'Origem da importação. Padrão: spreadsheet.',
  })
  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @ApiPropertyOptional({
    example: 'CPB2',
    description: 'Tag da campanha. Se ausente, usa o nome base do arquivo.',
  })
  @IsOptional()
  @IsString()
  tagKey?: string;
}
