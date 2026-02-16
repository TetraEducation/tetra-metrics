import { normalizeText } from '../../../imports/application/utils/normalize';
import {
  COMPANY_SIZE_ALIASES,
  EDUCATION_LEVEL_ALIASES,
  EXCEL_KNOWLEDGE_ALIASES,
  GENDER_ALIASES,
  JOB_ROLE_ALIASES,
  SENIORITY_LEVEL_ALIASES,
  type NormalizableField,
} from './normalization.constants';

export interface SalaryRange {
  salary_min: number | null;
  salary_max: number | null;
}

export interface AgeRange {
  age_min: number | null;
  age_max: number | null;
}

interface NumericRange {
  min: number | null;
  max: number | null;
}

export type UnknownNormalizationCounts = Record<NormalizableField, Record<string, number>>;

const RANGE_SEPARATOR_REGEX = /(?:\ba\b|até|ate|-|–|—|to)/i;

export function parseSalaryRange(valueText: string | null | undefined): SalaryRange {
  const { min, max } = parseNumericRange(valueText);
  return {
    salary_min: min,
    salary_max: max,
  };
}

export function parseAgeRange(valueText: string | null | undefined): AgeRange {
  const { min, max } = parseNumericRange(valueText);
  return {
    age_min: min,
    age_max: max,
  };
}

export function formatSalaryRange(range: SalaryRange): string | null {
  return formatNumericRange({ min: range.salary_min, max: range.salary_max });
}

export function formatAgeRange(range: AgeRange): string | null {
  return formatNumericRange({ min: range.age_min, max: range.age_max });
}

export function normalizeGender(valueText: string | null | undefined): string | null {
  return normalizeByAliasesExact(valueText, GENDER_ALIASES);
}

export function normalizeCompanySize(valueText: string | null | undefined): string | null {
  return normalizeByAliasesContains(valueText, COMPANY_SIZE_ALIASES);
}

export function normalizeEducationLevel(valueText: string | null | undefined): string | null {
  return normalizeByAliasesContains(valueText, EDUCATION_LEVEL_ALIASES);
}

export function normalizeExcelKnowledge(valueText: string | null | undefined): string | null {
  return normalizeByAliasesContains(valueText, EXCEL_KNOWLEDGE_ALIASES);
}

export function normalizeJobRole(valueText: string | null | undefined): string | null {
  return normalizeByAliasesContains(valueText, JOB_ROLE_ALIASES);
}

export function normalizeSeniorityLevel(valueText: string | null | undefined): string | null {
  return normalizeByAliasesContains(valueText, SENIORITY_LEVEL_ALIASES);
}

export function normalizeCompanyName(valueText: string | null | undefined): string | null {
  const normalized = normalizeComparableText(valueText);
  return normalized || null;
}

export function createUnknownNormalizationCounts(): UnknownNormalizationCounts {
  return {
    gender: {},
    companySize: {},
    educationLevel: {},
    excelKnowledge: {},
    jobRole: {},
    seniorityLevel: {},
  };
}

export function withUnknownValueCount(params: {
  counts: UnknownNormalizationCounts;
  field: NormalizableField;
  rawValue: string | null | undefined;
  normalizedValue: string | null;
}): UnknownNormalizationCounts {
  if (params.normalizedValue !== null) return params.counts;

  const normalizedRawValue = normalizeComparableText(params.rawValue);
  if (!normalizedRawValue) return params.counts;

  return {
    ...params.counts,
    [params.field]: {
      ...params.counts[params.field],
      [normalizedRawValue]: (params.counts[params.field][normalizedRawValue] ?? 0) + 1,
    },
  };
}

function parseNumericRange(valueText: string | null | undefined): {
  min: number | null;
  max: number | null;
} {
  const normalized = normalizeText(valueText) ?? '';
  if (!normalized) {
    return { min: null, max: null };
  }

  const numbers = extractNumbers(normalized);
  if (numbers.length === 0) {
    return { min: null, max: null };
  }

  if (numbers.length >= 2) {
    const [first, second] = numbers;
    return first <= second ? { min: first, max: second } : { min: second, max: first };
  }

  const single = numbers[0];
  const comparable = normalizeComparableText(normalized);
  if (/^(ate|até|no maximo|no máximo)/i.test(comparable)) {
    return { min: null, max: single };
  }

  if (/^(acima de|a partir de|mais de|>=?)/i.test(comparable)) {
    return { min: single, max: null };
  }

  // Casos comuns em pesquisas: "65 anos ou mais", "R$6.000,00 ou mais" etc.
  if (/\bou\s+mais\b/i.test(comparable)) {
    return { min: single, max: null };
  }

  if (RANGE_SEPARATOR_REGEX.test(comparable)) {
    return { min: single, max: null };
  }

  return { min: single, max: single };
}

function formatNumericRange(range: NumericRange): string | null {
  const min = normalizeRangeBound(range.min);
  const max = normalizeRangeBound(range.max);

  if (min === null && max === null) return null;
  if (min === null) return `até ${formatNumber(max)}`;
  if (max === null) return `acima de ${formatNumber(min)}`;
  if (min === max) return formatNumber(min);

  return `${formatNumber(min)} a ${formatNumber(max)}`;
}

function normalizeRangeBound(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function formatNumber(value: number | null): string {
  if (value === null) return '';
  if (Number.isInteger(value)) return String(value);

  return value.toString();
}

function extractNumbers(valueText: string): number[] {
  const tokens = valueText.match(/-?\d+(?:[.,]\d+)*(?:\s?mil)?/gi) ?? [];

  return tokens
    .map((token) => parseNumberToken(token))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function parseNumberToken(token: string): number | null {
  const normalizedToken = token.toLowerCase().trim();
  const isThousand = normalizedToken.endsWith('mil');
  const rawNumber = normalizedToken.replace(/mil$/i, '').trim();

  if (!rawNumber) return null;

  const dotCount = (rawNumber.match(/\./g) ?? []).length;
  const commaCount = (rawNumber.match(/,/g) ?? []).length;

  let normalizedNumber = rawNumber;
  if (dotCount > 0 && commaCount > 0) {
    normalizedNumber = rawNumber.replace(/\./g, '').replace(',', '.');
  } else if (dotCount > 0 && commaCount === 0) {
    normalizedNumber = /^\d{1,3}(?:\.\d{3})+$/.test(rawNumber)
      ? rawNumber.replace(/\./g, '')
      : rawNumber;
  } else if (commaCount > 0) {
    normalizedNumber = /^\d{1,3}(?:,\d{3})+$/.test(rawNumber)
      ? rawNumber.replace(/,/g, '')
      : rawNumber.replace(',', '.');
  }

  const parsed = Number(normalizedNumber);
  if (!Number.isFinite(parsed)) return null;

  return isThousand ? parsed * 1000 : parsed;
}

function normalizeByAliasesExact(
  valueText: string | null | undefined,
  aliases: Record<string, readonly string[]>,
): string | null {
  const normalizedInput = normalizeComparableText(valueText);
  if (!normalizedInput) return null;

  for (const [canonical, entries] of Object.entries(aliases)) {
    if (entries.some((entry) => normalizeComparableText(entry) === normalizedInput)) {
      return canonical;
    }
  }

  return null;
}

function normalizeByAliasesContains(
  valueText: string | null | undefined,
  aliases: Record<string, readonly string[]>,
): string | null {
  const normalizedInput = normalizeComparableTokens(valueText);
  if (!normalizedInput) return null;

  const haystack = ` ${normalizedInput} `;
  let bestMatch: { canonical: string; needleLength: number } | null = null;
  for (const [canonical, entries] of Object.entries(aliases)) {
    for (const entry of entries) {
      const needle = normalizeComparableTokens(entry);
      if (!needle) continue;
      if (haystack.includes(` ${needle} `)) {
        const candidate = { canonical, needleLength: needle.length };
        if (!bestMatch || candidate.needleLength > bestMatch.needleLength) {
          bestMatch = candidate;
        }
      }
    }
  }

  return bestMatch?.canonical ?? null;
}

function normalizeComparableText(value: string | null | undefined): string {
  return (
    normalizeText(value)
      ?.normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim() ?? ''
  );
}

function normalizeComparableTokens(value: string | null | undefined): string {
  return (
    normalizeText(value)
      ?.normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() ?? ''
  );
}
