import { Injectable } from "@nestjs/common";
import type { InferredColumns } from "@/modules/imports/domain/column-inference";
import type { ColumnInferencePort } from "@/modules/imports/application/ports/column-inference.port";

@Injectable()
export class ColumnInferenceService implements ColumnInferencePort {
  private readonly emailPatterns = [
    "email",
    "e-mail",
    "e_mail",
    "mail",
    "correio",
    "correio eletronico",
    "endereco de email",
    "endereço de email",
    "email address",
    "endereco email",
    "endereço email",
    "e mail",
  ];

  // Padrões para nome completo - ordem de prioridade
  private readonly fullNamePatterns = [
    "nome completo",
    "full name",
    "full_name",
    "nome", // Coluna "Nome" pode conter nome completo se "Sobrenome" estiver vazia
    "name",
    "responsavel",
    "responsável",
    "aluno",
    "student",
    "participante",
    "participant",
    "candidato",
    "candidate",
  ];

  // Colunas que devem ser IGNORADAS (não são nomes de pessoas)
  private readonly ignoredNamePatterns = [
    "lista de nomes",
    "lista nomes",
    "list names",
    "campanha",
    "campaign",
    "black",
    "geral",
    "mba",
    "tetra",
    "club",
    "bf",
    // Padrões de empresa/organização (não são nomes de pessoas)
    "nome da empresa",
    "nome empresa",
    "nome da organização",
    "nome organização",
    "nome da instituição",
    "nome instituição",
    "nome de empresa",
    "empresa",
    "company",
    "organização",
    "organization",
    "organizacao",
    "trabalha",
    "trabalho",
    "work",
    "job",
    "empregador",
    "employer",
    "instituição",
    "instituicao",
    "institution",
    "organização que",
    "organization that",
    "empresa que",
    "company that",
  ];

  private readonly phonePatterns = [
    "telefone",
    "phone",
    "celular",
    "whatsapp",
    "numero",
    "número",
    "num",
    "tel",
    "mobile",
    "telefone celular",
    "phone number",
    "numero telefone",
    "número telefone",
    "telefone whatsapp",
    "whatsapp number",
  ];

  infer(
    headers: string[],
    rows: Array<Record<string, unknown>>
  ): InferredColumns {
    const normalizedHeaders = headers.map((h) => this.normalizeKey(h));

    const emailKey = this.findBestMatch(
      normalizedHeaders,
      headers,
      this.emailPatterns
    );
    if (!emailKey) {
      throw new Error("Não foi possível detectar coluna de email na planilha");
    }

    // Identificar telefone PRIMEIRO para excluí-lo da busca por nome
    const phoneKey = this.findBestMatch(
      normalizedHeaders,
      headers,
      this.phonePatterns
    );

    // Encontrar coluna de nome, excluindo colunas que são listas/campanhas E telefone
    const fullNameKey = this.findBestNameColumn(
      normalizedHeaders,
      headers,
      rows,
      phoneKey
    );

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
    phoneKey: string | null
  ): string | null {
    // Primeiro, encontrar todas as colunas candidatas a nome
    const candidateIndices: number[] = [];

    for (let i = 0; i < normalizedHeaders.length; i++) {
      const normalized = normalizedHeaders[i];
      const original = originalHeaders[i];

      // Ignorar a coluna de telefone se já foi identificada
      if (phoneKey && original === phoneKey) {
        continue;
      }

      // Ignorar colunas que são claramente listas/campanhas
      const isIgnored = this.ignoredNamePatterns.some((pattern) =>
        normalized.includes(pattern)
      );
      if (isIgnored) continue;

      // Ignorar colunas que mencionam telefone/whatsapp/número (mesmo que não tenham sido identificadas como phoneKey)
      const isPhoneColumn =
        normalized.includes("whatsapp") ||
        normalized.includes("telefone") ||
        normalized.includes("phone") ||
        normalized.includes("celular") ||
        normalized.includes("mobile") ||
        (normalized.includes("numero") && !normalized.includes("nome")) ||
        (normalized.includes("número") && !normalized.includes("nome")) ||
        (normalized.includes("num") && !normalized.includes("nome"));

      if (isPhoneColumn) {
        continue; // Ignora colunas de telefone
      }

      // Verificar se corresponde aos padrões de nome
      // Mas apenas se NÃO for sobre empresa/organização
      const isAboutCompany =
        normalized.includes("empresa") ||
        normalized.includes("company") ||
        normalized.includes("organização") ||
        normalized.includes("organization") ||
        normalized.includes("trabalha") ||
        normalized.includes("trabalho") ||
        normalized.includes("work") ||
        normalized.includes("job") ||
        normalized.includes("empregador") ||
        normalized.includes("employer") ||
        normalized.includes("instituição") ||
        normalized.includes("instituicao") ||
        normalized.includes("institution");

      if (isAboutCompany) {
        continue; // Ignora colunas sobre empresa
      }

      const matchesPattern = this.fullNamePatterns.some((pattern) => {
        return (
          normalized === pattern ||
          normalized.startsWith(pattern) ||
          normalized.includes(pattern)
        );
      });

      if (matchesPattern) {
        // Validar que o conteúdo não é principalmente números de telefone
        const isPhoneNumberColumn = this.isPhoneNumberColumn(
          rows,
          original,
          normalized
        );
        if (!isPhoneNumberColumn) {
          candidateIndices.push(i);
        }
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
        h.includes("sobrenome") ||
        h.includes("last name") ||
        h.includes("surname") ||
        h.includes("ultimo nome")
    );

    // Priorizar "nome completo"
    for (const index of candidateIndices) {
      const normalized = normalizedHeaders[index];
      if (
        normalized.includes("nome completo") ||
        normalized.includes("full name")
      ) {
        return originalHeaders[index];
      }
    }

    // Se não tem "sobrenome", a coluna "nome" provavelmente contém o nome completo
    if (!hasSobrenome) {
      for (const index of candidateIndices) {
        const normalized = normalizedHeaders[index];
        if (normalized === "nome" || normalized === "name") {
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
      .replace(/[_\s\-]+/g, " ")
      .trim();
  }

  private findBestMatch(
    normalizedHeaders: string[],
    originalHeaders: string[],
    patterns: string[]
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

  /**
   * Verifica se uma coluna contém principalmente números de telefone
   * Retorna true se a maioria dos valores não vazios são números de telefone
   */
  private isPhoneNumberColumn(
    rows: Array<Record<string, unknown>>,
    columnKey: string,
    normalizedHeader: string
  ): boolean {
    // Se o header já indica que é telefone, retornar true
    if (
      normalizedHeader.includes("whatsapp") ||
      normalizedHeader.includes("telefone") ||
      normalizedHeader.includes("phone") ||
      normalizedHeader.includes("celular") ||
      normalizedHeader.includes("mobile") ||
      (normalizedHeader.includes("numero") &&
        !normalizedHeader.includes("nome")) ||
      (normalizedHeader.includes("número") &&
        !normalizedHeader.includes("nome"))
    ) {
      return true;
    }

    // Analisar o conteúdo das células
    const nonEmptyValues = rows
      .map((row) => {
        const value = row[columnKey];
        if (value === null || value === undefined) return null;
        const str = String(value).trim();
        return str.length > 0 ? str : null;
      })
      .filter((v): v is string => v !== null);

    if (nonEmptyValues.length === 0) {
      return false; // Coluna vazia não é telefone
    }

    // Padrão para números de telefone: principalmente dígitos, possivelmente com espaços, hífens, parênteses
    const phonePattern = /^[\d\s\-\(\)\+]+$/;
    // Padrão para telefone brasileiro: 10-11 dígitos (com ou sem formatação)
    const brazilianPhonePattern = /^[\d\s\-\(\)]{10,15}$/;

    let phoneCount = 0;
    for (const value of nonEmptyValues) {
      // Remover espaços, hífens, parênteses para contar apenas dígitos
      const digitsOnly = value.replace(/[\s\-\(\)\+]/g, "");

      // Se tem apenas dígitos e está no formato de telefone
      if (
        phonePattern.test(value) &&
        digitsOnly.length >= 8 &&
        digitsOnly.length <= 15 &&
        /^\d+$/.test(digitsOnly)
      ) {
        phoneCount++;
      }
    }

    // Se mais de 70% dos valores não vazios são números de telefone, considerar como coluna de telefone
    const phoneRatio = phoneCount / nonEmptyValues.length;
    return phoneRatio > 0.7;
  }
}
