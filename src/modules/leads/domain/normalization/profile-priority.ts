import {
  COMPANY_SIZE_ALIASES,
  EDUCATION_LEVEL_ALIASES,
  EXCEL_KNOWLEDGE_ALIASES,
  POWER_BI_KNOWLEDGE_ALIASES,
} from './normalization.constants';

type NullableNumber = number | null | undefined;
type NullableString = string | null | undefined;

type EducationLevel = keyof typeof EDUCATION_LEVEL_ALIASES;
type ExcelKnowledge = keyof typeof EXCEL_KNOWLEDGE_ALIASES;
type PowerBiKnowledge = keyof typeof POWER_BI_KNOWLEDGE_ALIASES;
type CompanySize = keyof typeof COMPANY_SIZE_ALIASES;

type NumericRange = {
  min: NullableNumber;
  max: NullableNumber;
};

export const RANKED_NORMALIZED_FIELDS = [
  'educationLevel',
  'excelKnowledge',
  'powerBiKnowledge',
  'companySize',
] as const;
export type RankedNormalizedField = (typeof RANKED_NORMALIZED_FIELDS)[number];

const EDUCATION_LEVEL_WEIGHTS: Record<EducationLevel, number> = {
  fundamental: 10,
  high_school_incomplete: 20,
  high_school: 30,
  technical: 40,
  bachelor_incomplete: 50,
  bachelor: 60,
  post_graduate: 70,
  master: 80,
  doctorate: 90,
};

const EXCEL_KNOWLEDGE_WEIGHTS: Record<ExcelKnowledge, number> = {
  beginner: 10,
  basic: 20,
  intermediate: 30,
  advanced: 40,
};

const POWER_BI_KNOWLEDGE_WEIGHTS: Record<PowerBiKnowledge, number> = {
  beginner: 10,
  basic: 20,
  intermediate: 30,
  advanced: 40,
};

const COMPANY_SIZE_WEIGHTS: Record<CompanySize, number> = {
  unemployed: 10,
  micro: 20,
  small: 30,
  medium: 40,
  large: 50,
  enterprise: 60,
};

const FIELD_WEIGHT_GETTERS = {
  educationLevel: (value: NullableString) => getWeightByMap(value, EDUCATION_LEVEL_WEIGHTS),
  excelKnowledge: (value: NullableString) => getWeightByMap(value, EXCEL_KNOWLEDGE_WEIGHTS),
  powerBiKnowledge: (value: NullableString) => getWeightByMap(value, POWER_BI_KNOWLEDGE_WEIGHTS),
  companySize: (value: NullableString) => getWeightByMap(value, COMPANY_SIZE_WEIGHTS),
} as const;

export function shouldReplaceRankedNormalizedField(params: {
  field: RankedNormalizedField;
  currentValue: NullableString;
  nextValue: NullableString;
}): boolean {
  const getWeight = FIELD_WEIGHT_GETTERS[params.field];
  const currentWeight = getWeight(params.currentValue);
  const nextWeight = getWeight(params.nextValue);
  return nextWeight > currentWeight;
}

export function shouldReplaceSalaryRange(params: {
  currentMin: NullableNumber;
  currentMax: NullableNumber;
  nextMin: NullableNumber;
  nextMax: NullableNumber;
}): boolean {
  return shouldReplaceNumericRange({
    current: { min: params.currentMin, max: params.currentMax },
    next: { min: params.nextMin, max: params.nextMax },
  });
}

export function shouldReplaceAgeRange(params: {
  currentMin: NullableNumber;
  currentMax: NullableNumber;
  nextMin: NullableNumber;
  nextMax: NullableNumber;
}): boolean {
  return shouldReplaceNumericRange({
    current: { min: params.currentMin, max: params.currentMax },
    next: { min: params.nextMin, max: params.nextMax },
  });
}

function shouldReplaceNumericRange(params: { current: NumericRange; next: NumericRange }): boolean {
  const currentSpec = getRangeSpecificity(params.current);
  const nextSpec = getRangeSpecificity(params.next);

  if (nextSpec.definedBounds > currentSpec.definedBounds) return true;
  if (nextSpec.definedBounds < currentSpec.definedBounds) return false;

  if (nextSpec.definedBounds === 1) {
    return isMoreRestrictiveOpenRange(params.current, params.next);
  }
  if (nextSpec.definedBounds < 2) return false;

  return nextSpec.width < currentSpec.width;
}

function isMoreRestrictiveOpenRange(current: NumericRange, next: NumericRange): boolean {
  const currentHasMin = isFiniteNumber(current.min);
  const currentHasMax = isFiniteNumber(current.max);
  const nextHasMin = isFiniteNumber(next.min);
  const nextHasMax = isFiniteNumber(next.max);

  // Empate de especificidade: só substitui quando ambos usam o mesmo lado da faixa.
  if (currentHasMin && nextHasMin && !currentHasMax && !nextHasMax) {
    return Number(next.min) > Number(current.min);
  }
  if (currentHasMax && nextHasMax && !currentHasMin && !nextHasMin) {
    return Number(next.max) < Number(current.max);
  }

  return false;
}

function getRangeSpecificity(range: NumericRange): { definedBounds: number; width: number } {
  const hasMin = isFiniteNumber(range.min);
  const hasMax = isFiniteNumber(range.max);
  const definedBounds = Number(hasMin) + Number(hasMax);

  if (!hasMin || !hasMax) {
    return { definedBounds, width: Number.POSITIVE_INFINITY };
  }

  const min = Number(range.min);
  const max = Number(range.max);
  const width = Math.abs(max - min);
  return { definedBounds, width };
}

function getWeightByMap<T extends string>(value: NullableString, map: Record<T, number>): number {
  if (!value) return 0;
  const weight = map[value as T];
  return typeof weight === 'number' ? weight : 0;
}

function isFiniteNumber(value: NullableNumber): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
