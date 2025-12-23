import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type { SurveyInference } from '@/modules/imports/domain/survey-inference';
import { normalizeText, normalizeKey } from '@/modules/imports/application/utils/normalize';

export interface ProcessedRow {
  rowNumber: number;
  email: string;
  leadId: string | null;
  rowData: Record<string, unknown>;
}

export interface SurveyIngestionParams {
  fileHash: string;
  tagKey: string;
  sourceSystem: string;
  surveyInference: SurveyInference;
  processedRows: ProcessedRow[];
  dryRun: boolean;
}

export interface SurveyIngestionResult {
  questionsCount: number;
  responsesSaved: number;
}

@Injectable()
export class SurveyIngestionService {
  private readonly logger = new Logger(SurveyIngestionService.name);

  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  async ingest(params: SurveyIngestionParams): Promise<SurveyIngestionResult> {
    const { fileHash, tagKey, sourceSystem, surveyInference, processedRows, dryRun } = params;

    if (surveyInference.questionColumns.length === 0) {
      return { questionsCount: 0, responsesSaved: 0 };
    }

    this.logger.log(
      `📋 [SURVEY] Detectadas ${surveyInference.questionColumns.length} perguntas no arquivo ${tagKey}`,
    );

    if (dryRun) {
      let responsesCount = 0;
      for (const processedRow of processedRows) {
        if (!processedRow.leadId) continue;
        for (const question of surveyInference.questionColumns) {
          const answer = normalizeText(processedRow.rowData[question.key]);
          if (answer) {
            responsesCount++;
          }
        }
      }
      this.logger.log(
        `[DRY-RUN] [SURVEY] ${surveyInference.questionColumns.length} perguntas, ${responsesCount} respostas seriam salvas`,
      );
      return {
        questionsCount: surveyInference.questionColumns.length,
        responsesSaved: responsesCount,
      };
    }

    const formName = tagKey.trim();
    const formNameNormalized = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const formSourceRef = `file:${fileHash}`;

    let formSchemaId: string | null = null;

    const existingSchema = await this.supabase
      .from('form_schemas')
      .select('id')
      .eq('source_system', sourceSystem)
      .eq('source_ref', formSourceRef)
      .maybeSingle();

    if (existingSchema.error && existingSchema.error.code !== 'PGRST116') {
      this.logger.error(`Erro ao buscar form_schema: ${existingSchema.error.message}`);
    } else if (existingSchema.data) {
      formSchemaId = existingSchema.data.id;
    } else {
      const schemaInsert = await this.supabase
        .from('form_schemas')
        .insert({
          source_system: sourceSystem,
          source_ref: formSourceRef,
          name: formName,
          meta: {},
        })
        .select('id')
        .single();

      if (schemaInsert.error) {
        this.logger.error(`Erro ao criar form_schema: ${schemaInsert.error.message}`);
        throw new Error(`Falha ao criar form_schema: ${schemaInsert.error.message}`);
      }

      formSchemaId = schemaInsert.data.id;
      this.logger.debug(`✅ [SURVEY] Form schema criado: ${formName} (id: ${formSchemaId})`);
    }

    if (!formSchemaId) {
      throw new Error('Falha ao obter/criar form_schema');
    }

    const questionsMap = new Map<string, string>();

    const questionsToUpsert = surveyInference.questionColumns.map((q, index) => ({
      form_schema_id: formSchemaId!,
      key: normalizeKey(q.header),
      label: q.header,
      position: index + 1,
      data_type: 'text',
      meta: {},
    }));

    const questionsUpsert = await this.supabase
      .from('form_questions')
      .upsert(questionsToUpsert, {
        onConflict: 'form_schema_id,key_normalized',
      })
      .select('id, key_normalized');

    if (questionsUpsert.error) {
      this.logger.error(`Erro ao upsert questions: ${questionsUpsert.error.message}`);
      throw new Error(`Falha ao criar/atualizar perguntas: ${questionsUpsert.error.message}`);
    }

    for (const q of questionsUpsert.data || []) {
      questionsMap.set(q.key_normalized, q.id);
    }

    this.logger.debug(
      `✅ [SURVEY] ${questionsMap.size} perguntas garantidas para form_schema ${formSchemaId}`,
    );

    const BATCH_SIZE = 100;
    const submissionsToInsert: Array<{
      form_schema_id: string;
      lead_id: string | null;
      submitted_at: string;
      source_ref: string;
      dedupe_key: string;
      raw_payload: Record<string, unknown>;
    }> = [];

    const answersToInsert: Array<{
      form_submission_id: string;
      question_id: string;
      value_text: string | null;
      value_number: number | null;
      value_bool: boolean | null;
      value_json: unknown | null;
    }> = [];

    const submissionIdMap = new Map<string, string>();

    for (const processedRow of processedRows) {
      const dedupeKey = `${fileHash}:${processedRow.rowNumber}`;
      const sourceRef = `row:${processedRow.rowNumber}`;

      submissionsToInsert.push({
        form_schema_id: formSchemaId!,
        lead_id: processedRow.leadId,
        submitted_at: new Date().toISOString(),
        source_ref: sourceRef,
        dedupe_key: dedupeKey,
        raw_payload: processedRow.rowData,
      });
    }

    let submissionsSaved = 0;
    for (let i = 0; i < submissionsToInsert.length; i += BATCH_SIZE) {
      const chunk = submissionsToInsert.slice(i, i + BATCH_SIZE);
      const result = await this.supabase
        .from('form_submissions')
        .upsert(chunk, { onConflict: 'form_schema_id,dedupe_key' })
        .select('id, dedupe_key');

      const dedupeKeys = chunk.map((s) => s.dedupe_key);
      const existing = await this.supabase
        .from('form_submissions')
        .select('id, dedupe_key')
        .eq('form_schema_id', formSchemaId!)
        .in('dedupe_key', dedupeKeys);

      if (existing.data) {
        for (const sub of existing.data) {
          submissionIdMap.set(sub.dedupe_key, sub.id);
        }
        submissionsSaved += existing.data.length;
      }

      if (result.error) {
        if (
          !result.error.message?.includes('duplicate key') &&
          !result.error.message?.includes('unique constraint')
        ) {
          this.logger.error(`Erro ao inserir submissions: ${result.error.message}`);
        }
      } else if (result.data) {
        for (const sub of result.data) {
          submissionIdMap.set(sub.dedupe_key, sub.id);
        }
      }
    }

    for (const processedRow of processedRows) {
      const dedupeKey = `${fileHash}:${processedRow.rowNumber}`;
      const submissionId = submissionIdMap.get(dedupeKey);

      if (!submissionId) {
        this.logger.warn(`Submission não encontrada para dedupe_key: ${dedupeKey}`);
        continue;
      }

      for (const question of surveyInference.questionColumns) {
        const answerValue = processedRow.rowData[question.key];
        if (answerValue === null || answerValue === undefined || answerValue === '') {
          continue;
        }

        const questionKeyNormalized = normalizeKey(question.header);
        const questionId = questionsMap.get(questionKeyNormalized);

        if (!questionId) {
          this.logger.warn(
            `Pergunta não encontrada: ${question.header} (normalized: ${questionKeyNormalized})`,
          );
          continue;
        }

        const answerText = normalizeText(answerValue);
        let valueNumber: number | null = null;
        let valueBool: boolean | null = null;
        let valueJson: unknown | null = null;

        if (typeof answerValue === 'number') {
          valueNumber = answerValue;
        } else if (typeof answerValue === 'boolean') {
          valueBool = answerValue;
        } else if (typeof answerValue === 'object') {
          valueJson = answerValue;
        } else {
          const str = String(answerValue).trim().toLowerCase();
          if (str === 'true' || str === 'sim' || str === 'yes' || str === '1') {
            valueBool = true;
          } else if (str === 'false' || str === 'não' || str === 'no' || str === '0') {
            valueBool = false;
          } else if (!isNaN(Number(answerValue)) && answerValue !== '') {
            valueNumber = Number(answerValue);
          }
        }

        answersToInsert.push({
          form_submission_id: submissionId,
          question_id: questionId,
          value_text: answerText,
          value_number: valueNumber,
          value_bool: valueBool,
          value_json: valueJson,
        });
      }
    }

    let answersSaved = 0;
    for (let i = 0; i < answersToInsert.length; i += BATCH_SIZE) {
      const chunk = answersToInsert.slice(i, i + BATCH_SIZE);
      const result = await this.supabase
        .from('form_answers')
        .upsert(chunk, { onConflict: 'form_submission_id,question_id' })
        .select('id');

      if (result.error) {
        if (
          result.error.message?.includes('duplicate key') ||
          result.error.message?.includes('unique constraint')
        ) {
          this.logger.debug(`⚠️ [SURVEY] Algumas answers já existiam (ignoradas)`);
        } else {
          this.logger.error(`Erro ao inserir answers: ${result.error.message}`);
        }
      } else if (result.data) {
        answersSaved += result.data.length;
      }
    }

    this.logger.log(
      `✅ [SURVEY] ${submissionsSaved} submissions e ${answersSaved} answers salvas para ${questionsMap.size} perguntas`,
    );

    const leadsWithSubmissions = new Set(
      processedRows.filter((r) => r.leadId).map((r) => r.leadId!),
    );

    const eventsToInsert = Array.from(leadsWithSubmissions).map((leadId) => ({
      lead_id: leadId,
      event_type: 'survey.imported',
      source_system: sourceSystem,
      occurred_at: new Date().toISOString(),
      ingested_at: new Date().toISOString(),
      dedupe_key: `${sourceSystem}:form:${fileHash}:${leadId}`,
      payload: {
        form_schema_id: formSchemaId,
        form_name: formName,
        questions_count: questionsMap.size,
      },
    }));

    if (eventsToInsert.length > 0) {
      await this.supabase.from('lead_events').insert(eventsToInsert).select('id');
      this.logger.debug(`✅ [SURVEY] ${eventsToInsert.length} eventos survey.imported criados`);
    }

    return {
      questionsCount: questionsMap.size,
      responsesSaved: answersSaved,
    };
  }
}
