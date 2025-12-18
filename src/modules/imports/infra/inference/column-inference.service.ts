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

  // Padrões para nome completo - ordem de prioridade
  private readonly fullNamePatterns = [
    'nome completo',
    'full name',
    'full_name',
    'nome', // Coluna "Nome" pode conter nome completo se "Sobrenome" estiver vazia
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

  // Colunas que devem ser IGNORADAS (não são nomes de pessoas)
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

    // Encontrar coluna de nome, excluindo colunas que são listas/campanhas
    const fullNameKey = this.findBestNameColumn(normalizedHeaders, headers, rows);
    const phoneKey = this.findBestMatch(normalizedHeaders, headers, this.phonePatterns);

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
  ): string | null {
    // Primeiro, encontrar todas as colunas candidatas a nome
    const candidateIndices: number[] = [];

    for (let i = 0; i < normalizedHeaders.length; i++) {
      const normalized = normalizedHeaders[i];
      const original = originalHeaders[i];

      // Ignorar colunas que são claramente listas/campanhas
      const isIgnored = this.ignoredNamePatterns.some((pattern) =>
        normalized.includes(pattern),
      );
      if (isIgnored) continue;

      // Verificar se corresponde aos padrões de nome
      const matchesPattern = this.fullNamePatterns.some((pattern) => {
        return (
          normalized === pattern ||
          normalized.startsWith(pattern) ||
          normalized.includes(pattern)
        );
      });

      if (matchesPattern) {
        candidateIndices.push(i);
      }
    }

    if (candidateIndices.length === 0) {
      return null;
    }

    // Se houver apenas uma candidata, retornar ela
    if (candidateIndices.length === 1) {
      return originalHeaders[candidateIndices[0]];
    }

    // Se houver múltiplas, priorizar:
    // 1. "nome completo" ou "full name"
    // 2. "nome" (se a coluna "sobrenome" estiver vazia ou não existir)
    // 3. Qualquer outra que corresponda

    // Verificar se existe "sobrenome" ou "last name"
    const hasSobrenome = normalizedHeaders.some(
      (h) =>
        h.includes('sobrenome') ||
        h.includes('last name') ||
        h.includes('surname') ||
        h.includes('ultimo nome'),
    );

    // Priorizar "nome completo"
    for (const index of candidateIndices) {
      const normalized = normalizedHeaders[index];
      if (normalized.includes('nome completo') || normalized.includes('full name')) {
        return originalHeaders[index];
      }
    }

    // Se não tem "sobrenome", a coluna "nome" provavelmente contém o nome completo
    if (!hasSobrenome) {
      for (const index of candidateIndices) {
        const normalized = normalizedHeaders[index];
        if (normalized === 'nome' || normalized === 'name') {
          // Verificar se a coluna realmente tem dados (não está vazia)
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

    // Fallback: retornar a primeira candidata
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
    // Primeiro tenta match exato
    for (const pattern of patterns) {
      const index = normalizedHeaders.findIndex((h) => h === pattern);
      if (index !== -1) {
        return originalHeaders[index];
      }
    }

    // Depois tenta match que começa com o padrão
    for (const pattern of patterns) {
      const index = normalizedHeaders.findIndex((h) => h.startsWith(pattern));
      if (index !== -1) {
        return originalHeaders[index];
      }
    }

    // Por último, tenta match que contém o padrão
    for (const pattern of patterns) {
      const index = normalizedHeaders.findIndex((h) => h.includes(pattern));
      if (index !== -1) {
        return originalHeaders[index];
      }
    }

    return null;
  }
}

