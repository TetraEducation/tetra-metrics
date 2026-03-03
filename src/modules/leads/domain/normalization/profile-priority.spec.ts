import {
  shouldReplaceAgeRange,
  shouldReplaceRankedNormalizedField,
  shouldReplaceSalaryRange,
} from './profile-priority';

describe('profile-priority', () => {
  describe('shouldReplaceRankedNormalizedField', () => {
    it('substitui quando o novo valor tem maior peso em escolaridade', () => {
      expect(
        shouldReplaceRankedNormalizedField({
          field: 'educationLevel',
          currentValue: 'high_school',
          nextValue: 'bachelor',
        }),
      ).toBe(true);
    });

    it('nao substitui quando o novo valor tem menor peso em excel', () => {
      expect(
        shouldReplaceRankedNormalizedField({
          field: 'excelKnowledge',
          currentValue: 'advanced',
          nextValue: 'basic',
        }),
      ).toBe(false);
    });

    it('substitui quando o novo valor tem maior peso em power bi', () => {
      expect(
        shouldReplaceRankedNormalizedField({
          field: 'powerBiKnowledge',
          currentValue: 'basic',
          nextValue: 'advanced',
        }),
      ).toBe(true);
    });

    it('nao substitui em empate de peso para porte', () => {
      expect(
        shouldReplaceRankedNormalizedField({
          field: 'companySize',
          currentValue: 'medium',
          nextValue: 'medium',
        }),
      ).toBe(false);
    });

    it('nao substitui com valor desconhecido quando ja existe valor atual', () => {
      expect(
        shouldReplaceRankedNormalizedField({
          field: 'educationLevel',
          currentValue: 'master',
          nextValue: null,
        }),
      ).toBe(false);
    });
  });

  describe('shouldReplaceSalaryRange', () => {
    it('prefere faixa fechada sobre faixa aberta', () => {
      expect(
        shouldReplaceSalaryRange({
          currentMin: 5000,
          currentMax: null,
          nextMin: 5000,
          nextMax: 7000,
        }),
      ).toBe(true);
    });

    it('prefere faixa fechada mais estreita', () => {
      expect(
        shouldReplaceSalaryRange({
          currentMin: 4000,
          currentMax: 10000,
          nextMin: 5000,
          nextMax: 7000,
        }),
      ).toBe(true);
    });

    it('nao substitui quando nova faixa e mais aberta', () => {
      expect(
        shouldReplaceSalaryRange({
          currentMin: 5000,
          currentMax: 7000,
          nextMin: 5000,
          nextMax: null,
        }),
      ).toBe(false);
    });

    it('nao substitui em empate de especificidade', () => {
      expect(
        shouldReplaceSalaryRange({
          currentMin: 5000,
          currentMax: 7000,
          nextMin: 3000,
          nextMax: 5000,
        }),
      ).toBe(false);
    });

    it('substitui faixa aberta de teto quando novo maximo e mais restritivo', () => {
      expect(
        shouldReplaceSalaryRange({
          currentMin: null,
          currentMax: 1500,
          nextMin: null,
          nextMax: 1499,
        }),
      ).toBe(true);
    });

    it('substitui faixa aberta de piso quando novo minimo e mais restritivo', () => {
      expect(
        shouldReplaceSalaryRange({
          currentMin: 5000,
          currentMax: null,
          nextMin: 5001,
          nextMax: null,
        }),
      ).toBe(true);
    });

    it('nao substitui quando faixa aberta nova e menos restritiva', () => {
      expect(
        shouldReplaceSalaryRange({
          currentMin: null,
          currentMax: 1499,
          nextMin: null,
          nextMax: 1500,
        }),
      ).toBe(false);
      expect(
        shouldReplaceSalaryRange({
          currentMin: 5001,
          currentMax: null,
          nextMin: 5000,
          nextMax: null,
        }),
      ).toBe(false);
    });
  });

  describe('shouldReplaceAgeRange', () => {
    it('substitui quando a nova faixa e mais especifica', () => {
      expect(
        shouldReplaceAgeRange({
          currentMin: null,
          currentMax: 60,
          nextMin: 30,
          nextMax: 40,
        }),
      ).toBe(true);
    });

    it('nao substitui quando a nova faixa e nula', () => {
      expect(
        shouldReplaceAgeRange({
          currentMin: 30,
          currentMax: 40,
          nextMin: null,
          nextMax: null,
        }),
      ).toBe(false);
    });
  });
});
