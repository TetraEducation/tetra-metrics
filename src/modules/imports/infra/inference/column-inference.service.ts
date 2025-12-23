import { Injectable } from '@nestjs/common';
import type { InferredColumns } from '@/modules/imports/domain/column-inference';
import type { ColumnInferencePort } from '@/modules/imports/application/ports/column-inference.port';

@Injectable()
export class ColumnInferenceService implements ColumnInferencePort {
  private readonly emailPatterns = [
    'email',
    'e-mail',
    'e_mail',
    'mail',
    'correio',
    'correio eletronico',
    'endereco de email',
    'endereço de email',
    'email address',
    'endereco email',
    'endereço email',
    'e mail',
  ];

  private readonly fullNamePatterns = [
    'nome completo',
    'full name',
    'full_name',
    'nome',
    'name',
    'responsavel',
    'responsável',
    'aluno',
    'student',
    'participante',
    'participant',
    'candidato',
    'candidate',
  ];

  private readonly ignoredNamePatterns = [
    'lista de nomes',
    'lista nomes',
    'list names',
    'campanha',
    'campaign',
    'black',
    'geral',
    'mba',
    'tetra',
    'club',
    'bf',
    'nome da empresa',
    'nome empresa',
    'nome da organização',
    'nome organização',
    'nome da instituição',
    'nome instituição',
    'nome de empresa',
    'empresa',
    'company',
    'organização',
    'organization',
    'organizacao',
    'trabalha',
    'trabalho',
    'work',
    'job',
    'empregador',
    'employer',
    'instituição',
    'instituicao',
    'institution',
    'organização que',
    'organization that',
    'empresa que',
    'company that',
  ];

  private readonly phonePatterns = [
    'telefone',
    'phone',
    'celular',
    'whatsapp',
    'numero',
    'número',
    'num',
    'tel',
    'mobile',
    'telefone celular',
    'phone number',
    'numero telefone',
    'número telefone',
    'telefone whatsapp',
    'whatsapp number',
  ];

  infer(headers: string[], rows: Array<Record<string, unknown>>): InferredColumns {
    const normalizedHeaders = headers.map((h) => this.normalizeKey(h));

    const emailKey = this.findBestMatch(normalizedHeaders, headers, this.emailPatterns);
    if (!emailKey) {
      throw new Error('Não foi possível detectar coluna de email na planilha');
    }

    const phoneKey = this.findBestMatch(normalizedHeaders, headers, this.phonePatterns);

    const fullNameKey = this.findBestNameColumn(normalizedHeaders, headers, rows, phoneKey);

    return {
      emailKey,
      fullNameKey,
      phoneKey,
    };
  }

  private findBestNameColumn(
    normalizedHeaders: string[],
    originalHeaders: string[],
    rows: Array<Record<string, unknown>>,
    phoneKey: string | null,
  ): string | null {
    const candidateIndices: number[] = [];

    for (let i = 0; i < normalizedHeaders.length; i++) {
      const normalized = normalizedHeaders[i];
      const original = originalHeaders[i];

      if (phoneKey && original === phoneKey) {
        continue;
      }

      const isIgnored = this.ignoredNamePatterns.some((pattern) => normalized.includes(pattern));
      if (isIgnored) continue;

      const isPhoneColumn =
        normalized.includes('whatsapp') ||
        normalized.includes('telefone') ||
        normalized.includes('phone') ||
        normalized.includes('celular') ||
        normalized.includes('mobile') ||
        (normalized.includes('numero') && !normalized.includes('nome')) ||
        (normalized.includes('número') && !normalized.includes('nome')) ||
        (normalized.includes('num') && !normalized.includes('nome'));

      if (isPhoneColumn) {
        continue;
      }

      const isAboutCompany =
        normalized.includes('empresa') ||
        normalized.includes('company') ||
        normalized.includes('organização') ||
        normalized.includes('organization') ||
        normalized.includes('trabalha') ||
        normalized.includes('trabalho') ||
        normalized.includes('work') ||
        normalized.includes('job') ||
        normalized.includes('empregador') ||
        normalized.includes('employer') ||
        normalized.includes('instituição') ||
        normalized.includes('instituicao') ||
        normalized.includes('institution');

      if (isAboutCompany) {
        continue;
      }

      const matchesPattern = this.fullNamePatterns.some((pattern) => {
        return (
          normalized === pattern || normalized.startsWith(pattern) || normalized.includes(pattern)
        );
      });

      if (matchesPattern) {
        const isPhoneNumberColumn = this.isPhoneNumberColumn(rows, original, normalized);
        if (!isPhoneNumberColumn) {
          candidateIndices.push(i);
        }
      }
    }

    if (candidateIndices.length === 0) {
      return null;
    }

    if (candidateIndices.length === 1) {
      return originalHeaders[candidateIndices[0]];
    }

    const hasSobrenome = normalizedHeaders.some(
      (h) =>
        h.includes('sobrenome') ||
        h.includes('last name') ||
        h.includes('surname') ||
        h.includes('ultimo nome'),
    );

    for (const index of candidateIndices) {
      const normalized = normalizedHeaders[index];
      if (normalized.includes('nome completo') || normalized.includes('full name')) {
        return originalHeaders[index];
      }
    }

    if (!hasSobrenome) {
      for (const index of candidateIndices) {
        const normalized = normalizedHeaders[index];
        if (normalized === 'nome' || normalized === 'name') {
          const hasData = rows.some((row) => {
            const value = row[originalHeaders[index]];
            return value && String(value).trim().length > 0;
          });
          if (hasData) {
            return originalHeaders[index];
          }
        }
      }
    }

    return originalHeaders[candidateIndices[0]];
  }

  private normalizeKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/[_\s\-]+/g, ' ')
      .trim();
  }

  private findBestMatch(
    normalizedHeaders: string[],
    originalHeaders: string[],
    patterns: string[],
  ): string | null {
    for (const pattern of patterns) {
      const index = normalizedHeaders.findIndex((h) => h === pattern);
      if (index !== -1) {
        return originalHeaders[index];
      }
    }

    for (const pattern of patterns) {
      const index = normalizedHeaders.findIndex((h) => h.startsWith(pattern));
      if (index !== -1) {
        return originalHeaders[index];
      }
    }

    for (const pattern of patterns) {
      const index = normalizedHeaders.findIndex((h) => h.includes(pattern));
      if (index !== -1) {
        return originalHeaders[index];
      }
    }

    return null;
  }

  /**
   * Verifica se uma coluna contém principalmente números de telefone
   * Retorna true se a maioria dos valores não vazios são números de telefone
   */
  private isPhoneNumberColumn(
    rows: Array<Record<string, unknown>>,
    columnKey: string,
    normalizedHeader: string,
  ): boolean {
    if (
      normalizedHeader.includes('whatsapp') ||
      normalizedHeader.includes('telefone') ||
      normalizedHeader.includes('phone') ||
      normalizedHeader.includes('celular') ||
      normalizedHeader.includes('mobile') ||
      (normalizedHeader.includes('numero') && !normalizedHeader.includes('nome')) ||
      (normalizedHeader.includes('número') && !normalizedHeader.includes('nome'))
    ) {
      return true;
    }

    const nonEmptyValues = rows
      .map((row) => {
        const value = row[columnKey];
        if (value === null || value === undefined) return null;
        const str = String(value).trim();
        return str.length > 0 ? str : null;
      })
      .filter((v): v is string => v !== null);

    if (nonEmptyValues.length === 0) {
      return false;
    }

    const phonePattern = /^[\d\s\-\(\)\+]+$/;
    const brazilianPhonePattern = /^[\d\s\-\(\)]{10,15}$/;

    let phoneCount = 0;
    for (const value of nonEmptyValues) {
      const digitsOnly = value.replace(/[\s\-\(\)\+]/g, '');

      if (
        phonePattern.test(value) &&
        digitsOnly.length >= 8 &&
        digitsOnly.length <= 15 &&
        /^\d+$/.test(digitsOnly)
      ) {
        phoneCount++;
      }
    }

    const phoneRatio = phoneCount / nonEmptyValues.length;
    return phoneRatio > 0.7;
  }
}
