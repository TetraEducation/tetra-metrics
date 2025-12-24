import { Injectable } from '@nestjs/common';
import type { SurveyInference } from '@/modules/imports/domain/survey-inference';
import type { InferredColumns } from '@/modules/imports/domain/column-inference';

@Injectable()
export class SurveyInferenceService {
  inferQuestionColumns(headers: string[], inferred: InferredColumns): SurveyInference {
    const identifierKeys = new Set(
      [inferred.emailKey, inferred.fullNameKey, inferred.phoneKey].filter(Boolean),
    );

    const questionColumns: Array<{ header: string; key: string }> = [];

    for (const header of headers) {
      if (identifierKeys.has(header)) {
        continue;
      }

      const normalized = header.trim().toLowerCase();
      if (!normalized || normalized === 'unnamed' || normalized.startsWith('unnamed:')) {
        continue;
      }

      questionColumns.push({
        header: header.trim(),
        key: header,
      });
    }

    return {
      questionColumns,
    };
  }
}
