import type { ParsedSpreadsheet } from '@/modules/imports/domain/spreadsheet-row';

export interface ParseSpreadsheetParams {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export const SPREADSHEET_PARSER = Symbol('SPREADSHEET_PARSER');

export interface SpreadsheetParserPort {
  parse(params: ParseSpreadsheetParams): ParsedSpreadsheet;
}



