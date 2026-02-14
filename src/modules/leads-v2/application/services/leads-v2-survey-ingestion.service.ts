import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA_V2 } from '@/infra/prisma-v2/prisma-v2.provider';
import type { SurveyInference } from '@/modules/imports/domain/survey-inference';
import { normalizeKey, normalizeText } from '@/modules/imports/application/utils/normalize';
import type { LeadSourceSystemV2 } from '@/modules/leads-v2/application/ports/leads-v2-repository.port';

export type SurveyProcessedRowV2 = {
  rowNumber: number;
  leadId: string | null;
  rowData: Record<string, unknown>;
};

export type SurveyIngestionContextV2 = {
  formSchemaId: string;
  questionsMap: Map<string, string>;
  questionsCount: number;
};

export type SurveyAnswerIngestionErrorContext = {
  row: number;
  reason: string;
  column?: string;
  value?: string;
  code?: string;
  questionId?: string;
};

export class SurveyAnswerIngestionError extends Error {
  readonly context: SurveyAnswerIngestionErrorContext;

  constructor(context: SurveyAnswerIngestionErrorContext) {
    super(context.reason);
    this.name = 'SurveyAnswerIngestionError';
    this.context = context;
  }
}

type PrismaV2Client = {
  formSchemas: {
    upsert: (args: {
      where: { sourceSystem_sourceRef: { sourceSystem: LeadSourceSystemV2; sourceRef: string } };
      create: {
        sourceSystem: LeadSourceSystemV2;
        sourceRef: string;
        name: string;
        nameNormalized: string;
        meta: Record<string, unknown>;
      };
      update: {
        name: string;
        nameNormalized: string;
        updatedAt: Date;
      };
    }) => Promise<{ id: string }>;
  };
  formQuestions: {
    upsert: (args: {
      where: { keyNormalized: string };
      create: {
        key: string;
        keyNormalized: string;
        label: string;
        position: number;
        dataType: 'text';
        meta: Record<string, unknown>;
      };
      update: {
        label: string;
        position: number;
        updatedAt: Date;
      };
    }) => Promise<{ id: string }>;
  };
  formSchemaQuestions: {
    upsert: (args: {
      where: { formSchemaId_questionId: { formSchemaId: string; questionId: string } };
      create: { formSchemaId: string; questionId: string };
      update: Record<string, never>;
    }) => Promise<{ formSchemaId: string; questionId: string }>;
  };
  formSubmissions: {
    upsert: (args: {
      where: { formSchemaId_dedupeKey: { formSchemaId: string; dedupeKey: string } };
      create: {
        formSchemaId: string;
        leadId: string | null;
        submittedAt: Date;
        sourceRef: string;
        dedupeKey: string;
        rawPayload: Record<string, unknown>;
      };
      update: {
        leadId: string | null;
        submittedAt: Date;
        sourceRef: string;
        rawPayload: Record<string, unknown>;
        updatedAt: Date;
      };
    }) => Promise<{ id: string }>;
  };
  formAnswers: {
    upsert: (args: {
      where: { formSubmissionId_questionId: { formSubmissionId: string; questionId: string } };
      create: {
        formSubmissionId: string;
        questionId: string;
        valueText: string | null;
        valueNumber: number | null;
        valueBool: boolean | null;
        valueJson: unknown | null;
      };
      update: {
        valueText: string | null;
        valueNumber: number | null;
        valueBool: boolean | null;
        valueJson: unknown | null;
      };
    }) => Promise<{ id: string }>;
  };
};

@Injectable()
export class LeadsV2SurveyIngestionService {
  private readonly logger = new Logger(LeadsV2SurveyIngestionService.name);

  constructor(@Inject(PRISMA_V2) private readonly prisma: PrismaV2Client) {}

  async prepareContext(params: {
    fileHash: string;
    tagKey: string;
    sourceSystem: LeadSourceSystemV2;
    surveyInference: SurveyInference;
  }): Promise<SurveyIngestionContextV2 | null> {
    const { surveyInference } = params;
    if (surveyInference.questionColumns.length === 0) {
      return null;
    }

    const formName = params.tagKey.trim();
    const formSourceRef = `file:${params.fileHash}`;
    const formSchema = await this.prisma.formSchemas.upsert({
      where: {
        sourceSystem_sourceRef: {
          sourceSystem: params.sourceSystem,
          sourceRef: formSourceRef,
        },
      },
      create: {
        sourceSystem: params.sourceSystem,
        sourceRef: formSourceRef,
        name: formName,
        nameNormalized: this.normalizeFormName(formName),
        meta: {},
      },
      update: {
        name: formName,
        nameNormalized: this.normalizeFormName(formName),
        updatedAt: new Date(),
      },
    });

    const questionsMap = new Map<string, string>();
    for (const [index, question] of surveyInference.questionColumns.entries()) {
      const normalizedKey = normalizeKey(question.header);
      if (!normalizedKey) continue;
      const upserted = await this.prisma.formQuestions.upsert({
        where: {
          keyNormalized: normalizedKey,
        },
        create: {
          key: normalizedKey,
          keyNormalized: normalizedKey,
          label: question.header.trim(),
          position: index + 1,
          dataType: 'text',
          meta: {},
        },
        update: {
          label: question.header.trim(),
          position: index + 1,
          updatedAt: new Date(),
        },
      });
      await this.prisma.formSchemaQuestions.upsert({
        where: {
          formSchemaId_questionId: {
            formSchemaId: formSchema.id,
            questionId: upserted.id,
          },
        },
        create: {
          formSchemaId: formSchema.id,
          questionId: upserted.id,
        },
        update: {},
      });
      questionsMap.set(normalizedKey, upserted.id);
    }

    this.logger.debug(
      `Contexto de survey preparado: formSchema=${formSchema.id} questions=${questionsMap.size}`,
    );

    return {
      formSchemaId: formSchema.id,
      questionsMap,
      questionsCount: questionsMap.size,
    };
  }

  async ingestRows(params: {
    fileHash: string;
    context: SurveyIngestionContextV2 | null;
    surveyInference: SurveyInference;
    processedRows: SurveyProcessedRowV2[];
  }): Promise<{ responsesSaved: number }> {
    if (!params.context || params.processedRows.length === 0) {
      return { responsesSaved: 0 };
    }

    let responsesSaved = 0;
    const now = new Date();
    for (const processedRow of params.processedRows) {
      const dedupeKey = `${params.fileHash}:${processedRow.rowNumber}`;
      const sourceRef = `row:${processedRow.rowNumber}`;
      const submission = await this.prisma.formSubmissions.upsert({
        where: {
          formSchemaId_dedupeKey: {
            formSchemaId: params.context.formSchemaId,
            dedupeKey,
          },
        },
        create: {
          formSchemaId: params.context.formSchemaId,
          leadId: processedRow.leadId,
          submittedAt: now,
          sourceRef,
          dedupeKey,
          rawPayload: processedRow.rowData,
        },
        update: {
          leadId: processedRow.leadId,
          submittedAt: now,
          sourceRef,
          rawPayload: processedRow.rowData,
          updatedAt: now,
        },
      });

      for (const question of params.surveyInference.questionColumns) {
        const questionNormalized = normalizeKey(question.header);
        const questionId = params.context.questionsMap.get(questionNormalized);
        if (!questionId) continue;

        const answerValue = processedRow.rowData[question.key];
        if (this.isEmptyValue(answerValue)) continue;

        const typedValue = this.parseAnswerValue(answerValue);
        try {
          await this.upsertFormAnswer(submission.id, questionId, typedValue);
        } catch (error) {
          const code = this.extractErrorCode(error);
          const baseReason = error instanceof Error ? error.message : String(error);
          const context: SurveyAnswerIngestionErrorContext = {
            row: processedRow.rowNumber,
            reason: `Erro ao salvar resposta do survey na linha ${processedRow.rowNumber}, coluna "${question.header}": ${baseReason}`,
            column: question.header,
            value: this.stringifyForDiagnostics(answerValue),
            code,
            questionId,
          };
          this.logger.error(context.reason, {
            row: context.row,
            column: context.column,
            code: context.code,
            questionId: context.questionId,
            value: context.value,
            typedValue,
          });

          if (this.shouldFallbackToText(baseReason, typedValue)) {
            const fallbackValue = this.ensureTextFallback(answerValue, typedValue.valueText);
            this.logger.warn(
              `Overflow numérico tratado como texto para a linha ${processedRow.rowNumber}, coluna "${question.header}".`,
              {
                row: processedRow.rowNumber,
                column: question.header,
                questionId,
                originalValue: context.value,
              },
            );
            await this.upsertFormAnswer(submission.id, questionId, fallbackValue);
          } else {
            throw new SurveyAnswerIngestionError(context);
          }
        }
        responsesSaved++;
      }
    }

    return { responsesSaved };
  }

  private normalizeFormName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  private isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim().length === 0) return true;
    return false;
  }

  private parseAnswerValue(value: unknown): {
    valueText: string | null;
    valueNumber: number | null;
    valueBool: boolean | null;
    valueJson: unknown | null;
  } {
    if (typeof value === 'number') {
      return {
        valueText: String(value),
        valueNumber: value,
        valueBool: null,
        valueJson: null,
      };
    }

    if (typeof value === 'boolean') {
      return {
        valueText: String(value),
        valueNumber: null,
        valueBool: value,
        valueJson: null,
      };
    }

    if (typeof value === 'object') {
      return {
        valueText: null,
        valueNumber: null,
        valueBool: null,
        valueJson: value,
      };
    }

    const text = normalizeText(value);
    const lower = (text ?? '').toLowerCase();
    if (lower === 'true' || lower === 'sim' || lower === 'yes' || lower === '1') {
      return { valueText: text, valueNumber: null, valueBool: true, valueJson: null };
    }
    if (lower === 'false' || lower === 'nao' || lower === 'não' || lower === 'no' || lower === '0') {
      return { valueText: text, valueNumber: null, valueBool: false, valueJson: null };
    }

    const numberValue = Number(text);
    if (text && !Number.isNaN(numberValue)) {
      return { valueText: text, valueNumber: numberValue, valueBool: null, valueJson: null };
    }

    return { valueText: text, valueNumber: null, valueBool: null, valueJson: null };
  }

  private extractErrorCode(error: unknown): string | undefined {
    const value = (error as { code?: unknown })?.code;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private stringifyForDiagnostics(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'string') return value.slice(0, 200);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value).slice(0, 200);
    } catch {
      return '[unserializable]';
    }
  }

  private shouldFallbackToText(
    message: string,
    typedValue: { valueNumber: number | null },
  ): boolean {
    if (typedValue.valueNumber === null) return false;
    const normalized = message.toLowerCase();
    return (
      normalized.includes('numeric field overflow') ||
      normalized.includes('value out of range for the type')
    );
  }

  private ensureTextFallback(value: unknown, originalText: string | null) {
    const text = originalText ?? this.stringifyForDiagnostics(value);
    return {
      valueText: text,
      valueNumber: null,
      valueBool: null,
      valueJson: null,
    };
  }

  private async upsertFormAnswer(
    submissionId: string,
    questionId: string,
    typedValue: {
      valueText: string | null;
      valueNumber: number | null;
      valueBool: boolean | null;
      valueJson: unknown | null;
    },
  ) {
    await this.prisma.formAnswers.upsert({
      where: {
        formSubmissionId_questionId: {
          formSubmissionId: submissionId,
          questionId,
        },
      },
      create: {
        formSubmissionId: submissionId,
        questionId,
        valueText: typedValue.valueText,
        valueNumber: typedValue.valueNumber,
        valueBool: typedValue.valueBool,
        valueJson: typedValue.valueJson,
      },
      update: {
        valueText: typedValue.valueText,
        valueNumber: typedValue.valueNumber,
        valueBool: typedValue.valueBool,
        valueJson: typedValue.valueJson,
      },
    });
  }
}
