import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type { ImportReport } from '@/modules/imports/domain/import-report';
import type { SpreadsheetParserPort } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import { SPREADSHEET_PARSER } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import type { ColumnInferencePort } from '@/modules/imports/application/ports/column-inference.port';
import { COLUMN_INFERENCE } from '@/modules/imports/application/ports/column-inference.port';
import { fileBaseName, normalizeEmail, normalizeText } from '@/modules/imports/application/utils/normalize';

export interface RunImportParams {
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  sourceSystem: string;
  dryRun: boolean;
  forcedTagKey?: string;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    @Inject(SUPABASE) private readonly supabase: SupabaseClient,
    @Inject(SPREADSHEET_PARSER) private readonly parser: SpreadsheetParserPort,
    @Inject(COLUMN_INFERENCE) private readonly infer: ColumnInferencePort,
  ) {}

  async run(params: RunImportParams): Promise<ImportReport> {
    const fileHash = createHash('sha256').update(params.fileBuffer).digest('hex');
    const tagKey = (params.forcedTagKey ?? fileBaseName(params.originalName)).trim();

    if (!tagKey) {
      throw new Error('Nome do arquivo vazio: não consegui gerar tagKey.');
    }

    const parsed = this.parser.parse({
      buffer: params.fileBuffer,
      mimeType: params.mimeType,
      originalName: params.originalName,
    });

    const inferred = this.infer.infer(parsed.headers, parsed.rows);

    this.logger.log(
      `Processando ${parsed.rows.length} linhas. Colunas detectadas: email="${inferred.emailKey}", nome="${inferred.fullNameKey || 'não detectado'}", telefone="${inferred.phoneKey || 'não detectado'}"`,
    );

    const report: ImportReport = {
      file: {
        name: params.originalName,
        tagKey,
        hash: fileHash,
        rows: parsed.rows.length,
      },
      inferred,
      totals: {
        processed: 0,
        ok: 0,
        ignoredInvalidEmail: 0,
        errors: 0,
      },
      errors: [],
      dryRun: params.dryRun,
    };

    const CHUNK_SIZE = 100; // Processar 100 linhas por vez
    const BATCH_DELAY_MS = 50; // Delay entre batches para não sobrecarregar
    const totalChunks = Math.ceil(parsed.rows.length / CHUNK_SIZE);
    let rpcFunctionExists = true; // Flag para evitar múltiplos logs de erro de função não encontrada

    // Processar em chunks
    for (let chunkStart = 0; chunkStart < parsed.rows.length; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, parsed.rows.length);
      const chunk = parsed.rows.slice(chunkStart, chunkEnd);
      const chunkNumber = Math.floor(chunkStart / CHUNK_SIZE) + 1;

      this.logger.log(
        `Processando chunk ${chunkNumber}/${totalChunks} (linhas ${chunkStart + 1}-${chunkEnd} de ${parsed.rows.length})`,
      );

      // Processar chunk em paralelo (mas limitado)
      const chunkPromises = chunk.map(async (row, chunkIndex) => {
        const rowNumber = chunkStart + chunkIndex + 2; // header na linha 1
        report.totals.processed++;

        const emailRaw = normalizeText(row[inferred.emailKey]);
        const emailNorm = normalizeEmail(emailRaw ?? undefined);

        if (!emailRaw || !emailNorm) {
          report.totals.ignoredInvalidEmail++;
          return null;
        }

        const fullName = inferred.fullNameKey ? normalizeText(row[inferred.fullNameKey]) : null;
        const phone = inferred.phoneKey ? normalizeText(row[inferred.phoneKey]) : null;
        const sourceRef = `${fileHash}:${rowNumber}`; // idempotente por arquivo+linha

        if (params.dryRun) {
          report.totals.ok++;
          if (chunkStart === 0 && chunkIndex < 5) {
            // Log primeiras 5 linhas em dry-run para debug
            this.logger.debug(
              `[DRY-RUN] Linha ${rowNumber}: email=${emailNorm}, nome=${fullName || 'não informado'}, telefone=${phone || 'não informado'}`,
            );
          }
          return null;
        }

        try {
          const rpcParams = {
            p_email_raw: emailRaw,
            p_full_name: fullName,
            p_phone: phone,
            p_source_system: params.sourceSystem,
            p_source_ref: sourceRef,
            p_tag_key: tagKey,
            p_row: row, // jsonb
          };

          if (chunkStart === 0 && chunkIndex === 0) {
            // Log dos parâmetros da primeira chamada para debug
            this.logger.debug(`Chamando RPC ingest_spreadsheet_row com: ${JSON.stringify({ ...rpcParams, p_row: '[objeto]' })}`);
          }

          const { data, error } = await this.supabase.rpc('ingest_spreadsheet_row', rpcParams);

          if (error) {
            // Se for erro de função não encontrada, logar de forma especial (apenas uma vez)
            if (rpcFunctionExists && (error.code === '42883' || error.message?.includes('does not exist') || error.message?.includes('não existe'))) {
              this.logger.error(
                `ERRO CRÍTICO: A função RPC 'ingest_spreadsheet_row' não existe no Supabase. Você precisa criar essa função primeiro.`,
              );
              this.logger.error(`Detalhes do erro: ${error.message} (code: ${error.code})`);
              rpcFunctionExists = false;
              throw new Error(
                `Função RPC 'ingest_spreadsheet_row' não encontrada no Supabase. Verifique se a função foi criada.`,
              );
            }

            this.logger.warn(`Erro na linha ${rowNumber}: ${error.message} (code: ${error.code})`);
            report.totals.errors++;
            report.errors.push({ row: rowNumber, reason: `${error.message} (code: ${error.code})` });
            return null;
          }

          if (data?.status === 'ok') {
            report.totals.ok++;
            if (chunkStart === 0 && chunkIndex < 5) {
              // Log primeiras 5 importações bem-sucedidas
              this.logger.debug(`Linha ${rowNumber} importada com sucesso: ${emailNorm}`);
            }
            return { rowNumber, email: emailNorm };
          } else {
            this.logger.warn(`Linha ${rowNumber} retornou status: ${JSON.stringify(data)}`);
            report.totals.ignoredInvalidEmail++;
            return null;
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          
          // Se for erro de função não encontrada, não continuar processando
          if (errorMessage.includes('ingest_spreadsheet_row') && errorMessage.includes('não encontrada')) {
            throw err; // Re-throw para parar o processamento
          }

          this.logger.error(`Exceção ao processar linha ${rowNumber}: ${errorMessage}`);
          report.totals.errors++;
          report.errors.push({ row: rowNumber, reason: errorMessage });
          return null;
        }
      });

      // Aguardar chunk atual terminar
      try {
        await Promise.all(chunkPromises);
      } catch (err) {
        // Se for erro crítico (função não encontrada), parar processamento
        if (err instanceof Error && err.message.includes('ingest_spreadsheet_row')) {
          throw err;
        }
        // Outros erros continuam processando
      }

      // Log de progresso a cada chunk
      const progress = ((chunkEnd / parsed.rows.length) * 100).toFixed(1);
      this.logger.log(
        `Progresso: ${progress}% - ${report.totals.ok} ok, ${report.totals.errors} erros, ${report.totals.ignoredInvalidEmail} ignorados de ${report.totals.processed} processados`,
      );

      // Pequeno delay entre chunks para não sobrecarregar o Supabase
      if (chunkEnd < parsed.rows.length && !params.dryRun) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    this.logger.log(
      `Importação concluída: ${report.totals.ok} ok, ${report.totals.ignoredInvalidEmail} ignorados, ${report.totals.errors} erros de ${report.totals.processed} processados`,
    );

    if (report.errors.length > 0 && report.errors.length <= 10) {
      this.logger.warn(`Primeiros erros: ${JSON.stringify(report.errors.slice(0, 5))}`);
    }

    return report;
  }
}

