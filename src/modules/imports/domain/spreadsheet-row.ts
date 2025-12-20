export interface SpreadsheetRow {
  [columnKey: string]: unknown;
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: SpreadsheetRow[];
}



