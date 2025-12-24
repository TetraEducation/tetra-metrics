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
  ];

  private readonly weakNamePatterns = [
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
    'investiu',
    'investir',
    'investimento',
    'invest',
    'invested',
    'investment',
    'capacitação',
    'capacitacao',
    'capacitação profissional',
    'capacitacao profissional',
    'cursos',
    'curso',
    'course',
    'courses',
    'treinamentos',
    'treinamento',
    'training',
    'treinamentos nos últimos',
    'training in the last',
    'você investiu',
    'you invested',
    'você tem',
    'you have',
    'você já',
    'you already',
    'você confirma',
    'you confirm',
    'você está',
    'you are',
    'você usa',
    'you use',
    'você já recebeu',
    'you already received',
    'você já conhecia',
    'you already knew',
    'você confirma sua presença',
    'you confirm your presence',
    'qual',
    'what',
    'como',
    'how',
    'quando',
    'when',
    'onde',
    'where',
    'por que',
    'why',
    'porque',
    'por quê',
    'quanto',
    'how much',
    'quantos',
    'how many',
    'qual das opções',
    'which of the options',
    'qual o',
    'what is the',
    'qual a',
    'what is the',
    'qual é',
    'what is',
    'qual seu',
    'what is your',
    'qual sua',
    'what is your',
    'qual das',
    'which of the',
    'confirma',
    'confirm',
    'confirme',
    'confirm',
    'tem interesse',
    'have interest',
    'tem alguma dúvida',
    'have any questions',
    'tem alguma duvida',
    'have any questions',
    'considera',
    'consider',
    'acredita',
    'believe',
    'espera',
    'expect',
    'espera do',
    'expect from',
    'espera do curso',
    'expect from the course',
    'espera do treinamento',
    'expect from the training',
    'dificuldade',
    'difficulty',
    'objetivo',
    'objective',
    'objetivo principal',
    'main objective',
    'nivel',
    'nível',
    'level',
    'nivel de',
    'nível de',
    'level of',
    'escolaridade',
    'education',
    'escolaridade?',
    'education?',
    'faixa etária',
    'age range',
    'faixa etaria',
    'age range',
    'renda',
    'income',
    'renda pessoal',
    'personal income',
    'renda mensal',
    'monthly income',
    'porte',
    'size',
    'porte da empresa',
    'company size',
    'porte da',
    'size of',
    'função',
    'function',
    'funcao',
    'function',
    'função que',
    'function that',
    'funcao que',
    'function that',
    'área',
    'area',
    'area melhor',
    'best area',
    'área melhor',
    'best area',
    'atuação',
    'performance',
    'atuacao',
    'performance',
    'atuação no mercado',
    'market performance',
    'atuacao no mercado',
    'market performance',
    'experiência',
    'experiencia',
    'experience',
    'experiência profissional',
    'professional experience',
    'experiencia profissional',
    'professional experience',
    'últimos 12 meses',
    'last 12 months',
    'ultimos 12 meses',
    'last 12 months',
    'últimos meses',
    'last months',
    'ultimos meses',
    'last months',
    'nos últimos',
    'in the last',
    'nos ultimos',
    'in the last',
  ];

  private readonly phonePatterns = [
    'telefone',
    'phone',
    'celular',
    'whatsapp',
    'tel',
    'mobile',
    'telefone celular',
    'phone number',
    'numero telefone',
    'número telefone',
    'telefone whatsapp',
    'whatsapp number',
    'numero whatsapp',
    'número whatsapp',
    'numero de telefone',
    'número de telefone',
    'numero de celular',
    'número de celular',
    'numero whatsapp',
    'número whatsapp',
    'seu número',
    'your number',
    'seu numero',
    'numero seu',
    'número seu',
    'numero do whatsapp',
    'número do whatsapp',
    'numero do telefone',
    'número do telefone',
    'numero do celular',
    'número do celular',
  ];

  private readonly phoneExclusionPatterns = [
    'salario',
    'salário',
    'renda',
    'income',
    'salary',
    'wage',
    'ganhando',
    'ganhar',
    'receber',
    'recebendo',
    'pessoas',
    'people',
    'funcionarios',
    'funcionários',
    'employees',
    'meses',
    'months',
    'anos',
    'years',
    'idade',
    'age',
    'quantidade',
    'quantity',
    'total',
    'soma',
    'sum',
    'como',
    'how',
    'considera',
    'consider',
    'conhecimentos',
    'knowledge',
    'conhecimento',
    'inteligência',
    'inteligencia',
    'intelligence',
    'artificial',
    'ai',
    'hoje',
    'today',
    'você considera',
    'you consider',
    'você tem',
    'you have',
    'você já',
    'you already',
    'você confirma',
    'you confirm',
    'você está',
    'you are',
    'você usa',
    'you use',
    'você já recebeu',
    'you already received',
    'você já conhecia',
    'you already knew',
    'você confirma sua presença',
    'you confirm your presence',
    'qual',
    'what',
    'quando',
    'when',
    'onde',
    'where',
    'por que',
    'why',
    'porque',
    'por quê',
    'quanto',
    'how much',
    'quantos',
    'how many',
    'qual das opções',
    'which of the options',
    'qual o',
    'what is the',
    'qual a',
    'what is the',
    'qual é',
    'what is',
    'qual seu',
    'what is your',
    'qual sua',
    'what is your',
    'qual das',
    'which of the',
    'confirma',
    'confirm',
    'confirme',
    'confirm',
    'tem interesse',
    'have interest',
    'tem alguma dúvida',
    'have any questions',
    'tem alguma duvida',
    'have any questions',
    'acredita',
    'believe',
    'espera',
    'expect',
    'espera do',
    'expect from',
    'espera do curso',
    'expect from the course',
    'espera do treinamento',
    'expect from the training',
    'dificuldade',
    'difficulty',
    'objetivo',
    'objective',
    'objetivo principal',
    'main objective',
    'nivel',
    'nível',
    'level',
    'nivel de',
    'nível de',
    'level of',
    'escolaridade',
    'education',
    'escolaridade?',
    'education?',
    'faixa etária',
    'age range',
    'faixa etaria',
    'age range',
    'renda pessoal',
    'personal income',
    'renda mensal',
    'monthly income',
    'porte',
    'size',
    'porte da empresa',
    'company size',
    'porte da',
    'size of',
    'função',
    'function',
    'funcao',
    'function',
    'função que',
    'function that',
    'funcao que',
    'function that',
    'área',
    'area',
    'area melhor',
    'best area',
    'área melhor',
    'best area',
    'atuação',
    'performance',
    'atuacao',
    'performance',
    'atuação no mercado',
    'market performance',
    'atuacao no mercado',
    'market performance',
    'experiência',
    'experiencia',
    'experience',
    'experiência profissional',
    'professional experience',
    'experiencia profissional',
    'professional experience',
    'últimos 12 meses',
    'last 12 months',
    'ultimos 12 meses',
    'last 12 months',
    'últimos meses',
    'last months',
    'ultimos meses',
    'last months',
    'nos últimos',
    'in the last',
    'nos ultimos',
    'in the last',
  ];

  infer(headers: string[], rows: Array<Record<string, unknown>>): InferredColumns {
    const normalizedHeaders = headers.map((h) => this.normalizeKey(h));

    const emailKey = this.findBestMatch(normalizedHeaders, headers, this.emailPatterns);
    if (!emailKey) {
      throw new Error('Não foi possível detectar coluna de email na planilha');
    }

    const phoneKey = this.findBestPhoneColumn(normalizedHeaders, headers, rows);

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
    const candidateIndices: Array<{ index: number; isStrong: boolean; score: number }> = [];

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

      const matchesStrongPattern = this.fullNamePatterns.some((pattern) => {
        return (
          normalized === pattern || normalized.startsWith(pattern + ' ') || normalized.startsWith(pattern + ':')
        );
      });

      const matchesWeakPattern = this.weakNamePatterns.some((pattern) => {
        return (
          normalized === pattern || normalized.startsWith(pattern + ' ') || normalized.startsWith(pattern + ':')
        );
      });

      if (matchesStrongPattern || matchesWeakPattern) {
        const isPhoneNumberColumn = this.isPhoneNumberColumn(rows, original, normalized);
        const isNameColumn = this.isNameColumn(rows, original, normalized);
        
        if (!isPhoneNumberColumn && isNameColumn) {
          candidateIndices.push({
            index: i,
            isStrong: matchesStrongPattern,
            score: matchesStrongPattern ? 10 : 5,
          });
        }
      }
    }

    if (candidateIndices.length === 0) {
      return null;
    }

    candidateIndices.sort((a, b) => b.score - a.score);

    const strongCandidates = candidateIndices.filter((c) => c.isStrong);
    if (strongCandidates.length > 0) {
      if (strongCandidates.length === 1) {
        return originalHeaders[strongCandidates[0].index];
      }

      const hasSobrenome = normalizedHeaders.some(
        (h) =>
          h.includes('sobrenome') ||
          h.includes('last name') ||
          h.includes('surname') ||
          h.includes('ultimo nome'),
      );

      for (const candidate of strongCandidates) {
        const normalized = normalizedHeaders[candidate.index];
        if (normalized.includes('nome completo') || normalized.includes('full name')) {
          return originalHeaders[candidate.index];
        }
      }

      if (!hasSobrenome) {
        for (const candidate of strongCandidates) {
          const normalized = normalizedHeaders[candidate.index];
          if (normalized === 'nome' || normalized === 'name') {
            const hasData = rows.some((row) => {
              const value = row[originalHeaders[candidate.index]];
              return value && String(value).trim().length > 0;
            });
            if (hasData) {
              return originalHeaders[candidate.index];
            }
          }
        }
      }

      return originalHeaders[strongCandidates[0].index];
    }

    const weakCandidates = candidateIndices.filter((c) => !c.isStrong);
    if (weakCandidates.length > 0) {
      const bestWeak = weakCandidates[0];
      const nameRatio = this.getNameColumnRatio(rows, originalHeaders[bestWeak.index]);
      if (nameRatio > 0.7) {
        return originalHeaders[bestWeak.index];
      }
    }

    return null;
  }

  private normalizeKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/[_\s\-]+/g, ' ')
      .trim();
  }

  private findBestPhoneColumn(
    normalizedHeaders: string[],
    originalHeaders: string[],
    rows: Array<Record<string, unknown>>,
  ): string | null {
    const candidates: Array<{ index: number; score: number }> = [];

    for (let i = 0; i < normalizedHeaders.length; i++) {
      const normalized = normalizedHeaders[i];
      const original = originalHeaders[i];

      const hasExclusion = this.phoneExclusionPatterns.some((pattern) =>
        normalized.includes(pattern),
      );
      if (hasExclusion) {
        continue;
      }

      let score = 0;

      for (const pattern of this.phonePatterns) {
        if (normalized === pattern) {
          score += 10;
        } else if (normalized.startsWith(pattern + ' ') || normalized.startsWith(pattern + ':')) {
          score += 8;
        } else if (normalized.includes(pattern)) {
          score += 5;
        }
      }

      if (score > 0) {
        const isPhoneColumn = this.isPhoneNumberColumn(rows, original, normalized);
        if (isPhoneColumn) {
          score += 20;
          candidates.push({ index: i, score });
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => b.score - a.score);
    return originalHeaders[candidates[0].index];
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

  /**
   * Verifica se uma coluna contém principalmente nomes
   * Retorna true se a maioria dos valores não vazios parecem ser nomes
   */
  private isNameColumn(
    rows: Array<Record<string, unknown>>,
    columnKey: string,
    normalizedHeader: string,
  ): boolean {
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

    const booleanPattern = /^(sim|não|nao|yes|no|true|false|1|0)$/i;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const urlPattern = /^https?:\/\//i;
    const numberOnlyPattern = /^\d+$/;
    const currencyPattern = /^R\$\s*\d+[.,]?\d*$/;
    const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;

    let nameCount = 0;
    let booleanCount = 0;

    for (const value of nonEmptyValues) {
      const lowerValue = value.toLowerCase().trim();

      if (booleanPattern.test(lowerValue)) {
        booleanCount++;
        continue;
      }

      if (emailPattern.test(value) || urlPattern.test(value) || numberOnlyPattern.test(value)) {
        continue;
      }

      if (currencyPattern.test(value) || datePattern.test(value)) {
        continue;
      }

      const words = value.split(/\s+/).filter((w) => w.length > 0);
      
      if (words.length < 1 || words.length > 5) {
        continue;
      }

      const hasLetters = /[a-záàâãéèêíìîóòôõúùûç]/i.test(value);
      const hasReasonableLength = value.length >= 2 && value.length <= 100;
      const notAllNumbers = !/^\d+$/.test(value.replace(/\s/g, ''));

      if (hasLetters && hasReasonableLength && notAllNumbers) {
        nameCount++;
      }
    }

    const booleanRatio = booleanCount / nonEmptyValues.length;
    if (booleanRatio > 0.5) {
      return false;
    }

    const nameRatio = nameCount / nonEmptyValues.length;
    return nameRatio > 0.5;
  }

  /**
   * Retorna a proporção de valores que parecem ser nomes em uma coluna
   */
  private getNameColumnRatio(
    rows: Array<Record<string, unknown>>,
    columnKey: string,
  ): number {
    const nonEmptyValues = rows
      .map((row) => {
        const value = row[columnKey];
        if (value === null || value === undefined) return null;
        const str = String(value).trim();
        return str.length > 0 ? str : null;
      })
      .filter((v): v is string => v !== null);

    if (nonEmptyValues.length === 0) {
      return 0;
    }

    const booleanPattern = /^(sim|não|nao|yes|no|true|false|1|0)$/i;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const urlPattern = /^https?:\/\//i;
    const numberOnlyPattern = /^\d+$/;
    const currencyPattern = /^R\$\s*\d+[.,]?\d*$/;
    const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;

    let nameCount = 0;

    for (const value of nonEmptyValues) {
      const lowerValue = value.toLowerCase().trim();

      if (booleanPattern.test(lowerValue)) {
        continue;
      }

      if (emailPattern.test(value) || urlPattern.test(value) || numberOnlyPattern.test(value)) {
        continue;
      }

      if (currencyPattern.test(value) || datePattern.test(value)) {
        continue;
      }

      const words = value.split(/\s+/).filter((w) => w.length > 0);
      
      if (words.length < 1 || words.length > 5) {
        continue;
      }

      const hasLetters = /[a-záàâãéèêíìîóòôõúùûç]/i.test(value);
      const hasReasonableLength = value.length >= 2 && value.length <= 100;
      const notAllNumbers = !/^\d+$/.test(value.replace(/\s/g, ''));

      if (hasLetters && hasReasonableLength && notAllNumbers) {
        nameCount++;
      }
    }

    return nameCount / nonEmptyValues.length;
  }
}
