import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';
import type { ParsedSpreadsheet } from '@/modules/imports/domain/spreadsheet-row';
import type {
  ParseSpreadsheetParams,
  SpreadsheetParserPort,
} from '@/modules/imports/application/ports/spreadsheet-parser.port';

@Injectable()
export class SpreadsheetParserService implements SpreadsheetParserPort {
  parse(params: ParseSpreadsheetParams): ParsedSpreadsheet {
    const { buffer, mimeType, originalName } = params;

    if (mimeType === 'text/csv' || originalName.endsWith('.csv')) {
      return this.parseCsv(buffer);
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      originalName.endsWith('.xlsx') ||
      originalName.endsWith('.xls')
    ) {
      return this.parseExcel(buffer);
    }

    throw new Error(`Formato de arquivo não suportado: ${mimeType}`);
  }

  private parseCsv(buffer: Buffer): ParsedSpreadsheet {
    const content = buffer.toString('utf-8');
    const records = csvParse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, unknown>>;

    if (records.length === 0) {
      throw new Error('Arquivo CSV está vazio ou não possui cabeçalhos válidos');
    }

    const headers = Object.keys(records[0]);
    return {
      headers,
      rows: records,
    };
  }

  private parseExcel(buffer: Buffer): ParsedSpreadsheet {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
    });

    if (workbook.SheetNames.length === 0) {
      throw new Error('Arquivo Excel não possui planilhas');
    }
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
      blankrows: false,
    });

    if (rows.length === 0) {
      throw new Error('Planilha Excel está vazia ou não possui dados válidos');
    }

    const headers = Object.keys(rows[0]);
    return {
      headers,
      rows,
    };
  }
}

