import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type { ImportReport } from '@/modules/imports/domain/import-report';
import type { SpreadsheetParserPort } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import { SPREADSHEET_PARSER } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import type { ColumnInferencePort } from '@/modules/imports/application/ports/column-inference.port';
import { COLUMN_INFERENCE } from '@/modules/imports/application/ports/column-inference.port';
import { SurveyInferenceService } from '@/modules/imports/application/services/survey-inference.service';
import {
  SurveyIngestionService,
  type ProcessedRow,
} from '@/modules/imports/application/services/survey-ingestion.service';
import {
  fileBaseName,
  normalizeEmail,
  normalizeText,
} from '@/modules/imports/application/utils/normalize';

export interface RunImportParams {
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  sourceSystem: string;
  dryRun: boolean;
  forcedTagKey?: string;
  processSurveys?: boolean;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    @Inject(SUPABASE) private readonly supabase: SupabaseClient,
    @Inject(SPREADSHEET_PARSER) private readonly parser: SpreadsheetParserPort,
    @Inject(COLUMN_INFERENCE) private readonly infer: ColumnInferencePort,
    private readonly surveyInference: SurveyInferenceService,
    private readonly surveyIngestion: SurveyIngestionService,
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

    let surveyInference: ReturnType<typeof this.surveyInference.inferQuestionColumns> | null =
      null;
    let hasSurvey = false;

    if (params.processSurveys) {
      surveyInference = this.surveyInference.inferQuestionColumns(parsed.headers, inferred);
      hasSurvey = surveyInference.questionColumns.length > 0;

      if (hasSurvey) {
        this.logger.log(
          `📋 [SURVEY] Pesquisa detectada: ${surveyInference.questionColumns.length} perguntas encontradas`,
        );
      }
    } else {
      this.logger.log('Processamento de surveys desabilitado. Apenas extraindo email, nome e telefone.');
    }

    this.logger.log(
      `Processando ${parsed.rows.length} linhas. Colunas detectadas: email="${
        inferred.emailKey
      }", nome="${inferred.fullNameKey || 'não detectado'}", telefone="${
        inferred.phoneKey || 'não detectado'
      }"`,
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
        surveyDetected: hasSurvey,
        surveyQuestionsCount: hasSurvey && surveyInference ? surveyInference.questionColumns.length : 0,
        surveyResponsesSaved: 0,
      },
      errors: [],
      dryRun: params.dryRun,
    };

    const CHUNK_SIZE = 100;
    const BATCH_DELAY_MS = 50;
    const totalChunks = Math.ceil(parsed.rows.length / CHUNK_SIZE);
    let rpcFunctionExists = true;

    const processedRows: ProcessedRow[] = [];
    for (let chunkStart = 0; chunkStart < parsed.rows.length; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, parsed.rows.length);
      const chunk = parsed.rows.slice(chunkStart, chunkEnd);
      const chunkNumber = Math.floor(chunkStart / CHUNK_SIZE) + 1;

      this.logger.log(
        `Processando chunk ${chunkNumber}/${totalChunks} (linhas ${
          chunkStart + 1
        }-${chunkEnd} de ${parsed.rows.length})`,
      );

      const chunkPromises = chunk.map(async (row, chunkIndex) => {
        const rowNumber = chunkStart + chunkIndex + 2;
        report.totals.processed++;

        const emailRaw = normalizeText(row[inferred.emailKey]);
        const emailNorm = normalizeEmail(emailRaw ?? undefined);

        if (!emailRaw || !emailNorm) {
          report.totals.ignoredInvalidEmail++;
          return null;
        }

        const fullName = inferred.fullNameKey ? normalizeText(row[inferred.fullNameKey]) : null;
        const phone = inferred.phoneKey ? normalizeText(row[inferred.phoneKey]) : null;
        const sourceRef = `${fileHash}:${rowNumber}`;

        if (params.dryRun) {
          report.totals.ok++;
          if (chunkStart === 0 && chunkIndex < 5) {
            this.logger.debug(
              `[DRY-RUN] Linha ${rowNumber}: email=${emailNorm}, nome=${
                fullName || 'não informado'
              }, telefone=${phone || 'não informado'}`,
            );
          }
          processedRows.push({
            rowNumber,
            email: emailNorm,
            leadId: null,
            rowData: row,
          });
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
            p_row: row,
          };

          if (chunkStart === 0 && chunkIndex === 0) {
            this.logger.debug(
              `Chamando RPC ingest_spreadsheet_row com: ${JSON.stringify({
                ...rpcParams,
                p_row: '[objeto]',
              })}`,
            );
          }

          const { data, error } = await this.supabase.rpc('ingest_spreadsheet_row', rpcParams);

          if (error) {
            if (
              rpcFunctionExists &&
              (error.code === '42883' ||
                error.message?.includes('does not exist') ||
                error.message?.includes('não existe'))
            ) {
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
            report.errors.push({
              row: rowNumber,
              reason: `${error.message} (code: ${error.code})`,
            });
            return null;
          }

          if (data?.status === 'ok') {
            report.totals.ok++;
            if (chunkStart === 0 && chunkIndex < 5) {
              this.logger.debug(`Linha ${rowNumber} importada com sucesso: ${emailNorm}`);
            }

            const leadRes = await this.supabase
              .from('lead_identifiers')
              .select('lead_id')
              .eq('type', 'email')
              .eq('value_normalized', emailNorm)
              .maybeSingle();

            const leadId = leadRes.data?.lead_id ?? null;

            if (!leadId) {
              this.logger.warn(`Lead_id não encontrado para email ${emailNorm} após importação`);
            }

            processedRows.push({
              rowNumber,
              email: emailNorm,
              leadId,
              rowData: row,
            });

            return { rowNumber, email: emailNorm, leadId };
          } else {
            this.logger.warn(`Linha ${rowNumber} retornou status: ${JSON.stringify(data)}`);
            report.totals.ignoredInvalidEmail++;
            return null;
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          if (
            errorMessage.includes('ingest_spreadsheet_row') &&
            errorMessage.includes('não encontrada')
          ) {
            throw err;
          }

          this.logger.error(`Exceção ao processar linha ${rowNumber}: ${errorMessage}`);
          report.totals.errors++;
          report.errors.push({ row: rowNumber, reason: errorMessage });
          return null;
        }
      });

      try {
        await Promise.all(chunkPromises);
      } catch (err) {
        if (err instanceof Error && err.message.includes('ingest_spreadsheet_row')) {
          throw err;
        }
      }

      const progress = ((chunkEnd / parsed.rows.length) * 100).toFixed(1);
      this.logger.log(
        `Progresso: ${progress}% - ${report.totals.ok} ok, ${report.totals.errors} erros, ${report.totals.ignoredInvalidEmail} ignorados de ${report.totals.processed} processados`,
      );

      if (chunkEnd < parsed.rows.length && !params.dryRun) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    this.logger.log(
      `Importação concluída: ${report.totals.ok} ok, ${report.totals.ignoredInvalidEmail} ignorados, ${report.totals.errors} erros de ${report.totals.processed} processados`,
    );

    if (params.processSurveys && hasSurvey && surveyInference && processedRows.length > 0) {
      try {
        this.logger.log(
          `📋 [SURVEY] Iniciando ingestão de ${surveyInference.questionColumns.length} perguntas...`,
        );
        const surveyResult = await this.surveyIngestion.ingest({
          fileHash,
          tagKey,
          sourceSystem: params.sourceSystem,
          surveyInference,
          processedRows,
          dryRun: params.dryRun,
        });

        report.totals.surveyQuestionsCount = surveyResult.questionsCount;
        report.totals.surveyResponsesSaved = surveyResult.responsesSaved;

        this.logger.log(
          `✅ [SURVEY] Ingestão concluída: ${surveyResult.questionsCount} perguntas, ${surveyResult.responsesSaved} respostas salvas`,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ [SURVEY] Erro ao processar surveys: ${errorMessage}`);
      }
    } else if (hasSurvey && !params.processSurveys) {
      this.logger.log(
        '📋 [SURVEY] Pesquisas detectadas, mas processamento desabilitado pela flag processSurveys=false',
      );
    }

    if (report.errors.length > 0 && report.errors.length <= 10) {
      this.logger.warn(`Primeiros erros: ${JSON.stringify(report.errors.slice(0, 5))}`);
    }

    return report;
  }
}
