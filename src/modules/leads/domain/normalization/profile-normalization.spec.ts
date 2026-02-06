import {
  createUnknownNormalizationCounts,
  normalizeCompanySize,
  normalizeEducationLevel,
  normalizeGender,
  parseAgeRange,
  parseSalaryRange,
  withUnknownValueCount,
} from './index';

describe('profile-normalization', () => {
  describe('parseSalaryRange', () => {
    it('parseia faixa de salário com moeda e separador', () => {
      expect(parseSalaryRange('R$ 3.500 a R$ 7.000')).toEqual({
        salary_min: 3500,
        salary_max: 7000,
      });
    });

    it('parseia limites abertos', () => {
      expect(parseSalaryRange('até 4.000')).toEqual({
        salary_min: null,
        salary_max: 4000,
      });
      expect(parseSalaryRange('acima de 5 mil')).toEqual({
        salary_min: 5000,
        salary_max: null,
      });
    });

    it('retorna null quando inválido', () => {
      expect(parseSalaryRange('não informado')).toEqual({
        salary_min: null,
        salary_max: null,
      });
    });
  });

  describe('parseAgeRange', () => {
    it('parseia faixa etária com hífen', () => {
      expect(parseAgeRange('18 - 24')).toEqual({ age_min: 18, age_max: 24 });
    });

    it('retorna valor único como intervalo fechado', () => {
      expect(parseAgeRange('35')).toEqual({ age_min: 35, age_max: 35 });
    });
  });

  describe('normalizers', () => {
    it('normaliza gênero com acento/caixa/espaços', () => {
      expect(normalizeGender('  FEMININO ')).toBe('female');
      expect(normalizeGender('nÃo binÁrio')).toBe('non_binary');
    });

    it('normaliza porte da empresa com variações', () => {
      expect(normalizeCompanySize('  Médio Porte  ')).toBe('medium');
      expect(normalizeCompanySize('MEI')).toBe('micro');
    });

    it('normaliza escolaridade com variações', () => {
      expect(normalizeEducationLevel(' Pós Graduação ')).toBe('post_graduate');
      expect(normalizeEducationLevel('dOutOrAdO')).toBe('doctorate');
    });

    it('retorna null para desconhecidos', () => {
      expect(normalizeGender('xpto')).toBeNull();
      expect(normalizeCompanySize('porte galáctico')).toBeNull();
      expect(normalizeEducationLevel('curso livre')).toBeNull();
    });
  });

  describe('unknown counts', () => {
    it('acumula contagem de desconhecidos para log estruturado', () => {
      const base = createUnknownNormalizationCounts();
      const first = withUnknownValueCount({
        counts: base,
        field: 'gender',
        rawValue: 'Não sei',
        normalizedValue: null,
      });
      const second = withUnknownValueCount({
        counts: first,
        field: 'gender',
        rawValue: 'nao sei',
        normalizedValue: null,
      });
      const third = withUnknownValueCount({
        counts: second,
        field: 'companySize',
        rawValue: '  ',
        normalizedValue: null,
      });

      expect(third).toEqual({
        gender: { 'nao sei': 2 },
        companySize: {},
        educationLevel: {},
      });
    });
  });
});
