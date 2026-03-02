import {
  createUnknownNormalizationCounts,
  formatAgeRange,
  formatSalaryRange,
  normalizeCompanySize,
  normalizeCompanyName,
  normalizeEducationLevel,
  normalizeExcelKnowledge,
  normalizeGender,
  normalizeJobRole,
  normalizePowerBiKnowledge,
  normalizeSeniorityLevel,
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

    it('parseia limite inferior com “ou mais”', () => {
      expect(parseSalaryRange('R$6.000,00 ou mais')).toEqual({
        salary_min: 6000,
        salary_max: null,
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

  describe('formatSalaryRange', () => {
    it('formata faixa fechada e aberta de salário', () => {
      expect(formatSalaryRange({ salary_min: 3500, salary_max: 7000 })).toBe('3500 a 7000');
      expect(formatSalaryRange({ salary_min: null, salary_max: 4000 })).toBe('até 4000');
      expect(formatSalaryRange({ salary_min: 5000, salary_max: null })).toBe('acima de 5000');
      expect(formatSalaryRange({ salary_min: 3500, salary_max: 3500 })).toBe('3500');
      expect(formatSalaryRange({ salary_min: null, salary_max: null })).toBeNull();
    });

    it('garante round-trip parse -> format -> parse', () => {
      const samples = ['R$ 3.500 a R$ 7.000', 'até 4.000', 'acima de 5 mil', '35'];

      for (const sample of samples) {
        const parsed = parseSalaryRange(sample);
        const formatted = formatSalaryRange(parsed);
        expect(parseSalaryRange(formatted)).toEqual(parsed);
      }
    });
  });

  describe('parseAgeRange', () => {
    it('parseia faixa etária com hífen', () => {
      expect(parseAgeRange('18 - 24')).toEqual({ age_min: 18, age_max: 24 });
    });

    it('parseia limite inferior com “ou mais”', () => {
      expect(parseAgeRange('65 anos ou mais')).toEqual({ age_min: 65, age_max: null });
    });

    it('retorna valor único como intervalo fechado', () => {
      expect(parseAgeRange('35')).toEqual({ age_min: 35, age_max: 35 });
    });
  });

  describe('formatAgeRange', () => {
    it('formata faixas etárias fechadas e abertas', () => {
      expect(formatAgeRange({ age_min: 18, age_max: 24 })).toBe('18 a 24');
      expect(formatAgeRange({ age_min: null, age_max: 24 })).toBe('até 24');
      expect(formatAgeRange({ age_min: 35, age_max: null })).toBe('acima de 35');
      expect(formatAgeRange({ age_min: 35, age_max: 35 })).toBe('35');
      expect(formatAgeRange({ age_min: null, age_max: null })).toBeNull();
    });

    it('garante round-trip parse -> format -> parse', () => {
      const samples = ['18 - 24', 'até 30', 'acima de 45', '35'];

      for (const sample of samples) {
        const parsed = parseAgeRange(sample);
        const formatted = formatAgeRange(parsed);
        expect(parseAgeRange(formatted)).toEqual(parsed);
      }
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

    it('normaliza porte da empresa com frases (planilha)', () => {
      expect(normalizeCompanySize('Pequena (até 20 funcionarios)')).toBe('small');
      expect(normalizeCompanySize('Média (20 a 200 funcionários)')).toBe('medium');
      expect(normalizeCompanySize('Grande ou multinacional (acima de 200 funcionários)')).toBe(
        'large',
      );
      expect(normalizeCompanySize('Não estou trabalhando no momento')).toBe('unemployed');
    });

    it('normaliza escolaridade com variações', () => {
      expect(normalizeEducationLevel(' Pós Graduação ')).toBe('post_graduate');
      expect(normalizeEducationLevel('dOutOrAdO')).toBe('doctorate');
    });

    it('normaliza escolaridade com completo/incompleto (planilha)', () => {
      expect(normalizeEducationLevel('Ensino médio incompleto')).toBe('high_school_incomplete');
      expect(normalizeEducationLevel('Ensino médio completo')).toBe('high_school');
      expect(normalizeEducationLevel('Ensino superior incompleto')).toBe('bachelor_incomplete');
      expect(normalizeEducationLevel('Ensino superior completo')).toBe('bachelor');
      expect(normalizeEducationLevel('Ensino técnico')).toBe('technical');
    });

    it('retorna null para desconhecidos', () => {
      expect(normalizeGender('xpto')).toBeNull();
      expect(normalizeCompanySize('porte galáctico')).toBeNull();
      expect(normalizeEducationLevel('curso livre')).toBeNull();
    });

    it('normaliza nível de Excel para chaves canônicas', () => {
      expect(normalizeExcelKnowledge('Iniciante (estou dando os primeiros passos)')).toBe(
        'beginner',
      );
      expect(
        normalizeExcelKnowledge(
          'Intermediário (conheço PROCV, Tabela Dinâmica, SOMASE e as funções mais usadas no dia a dia das empresas)',
        ),
      ).toBe('intermediate');
      expect(normalizeExcelKnowledge('Avançado')).toBe('advanced');
      expect(normalizeExcelKnowledge('Básico')).toBe('basic');
    });

    it('normaliza nível de Power BI para chaves canônicas', () => {
      expect(normalizePowerBiKnowledge('Iniciante')).toBe('beginner');
      expect(normalizePowerBiKnowledge('Intermediário')).toBe('intermediate');
      expect(normalizePowerBiKnowledge('Avançado')).toBe('advanced');
      expect(normalizePowerBiKnowledge('Básico')).toBe('basic');
    });

    it('normaliza função/cargo para chaves canônicas', () => {
      expect(normalizeJobRole('Sou empreendedor')).toBe('entrepreneur');
      expect(normalizeJobRole('Gerente')).toBe('manager');
      expect(normalizeJobRole('Professor')).toBe('teacher');
      expect(normalizeJobRole('Controller')).toBe('controller');
    });

    it('normaliza senioridade para chaves canônicas', () => {
      expect(normalizeSeniorityLevel('Júnior')).toBe('junior');
      expect(normalizeSeniorityLevel('Pleno')).toBe('mid');
      expect(normalizeSeniorityLevel('Sênior')).toBe('senior');
      expect(normalizeSeniorityLevel('Especialista / Líder / Expert')).toBe('expert');
    });

    it('normaliza nome da empresa para string comparável', () => {
      expect(normalizeCompanyName('  Açúcar & Cia  ')).toBe('acucar & cia');
      expect(normalizeCompanyName('   ')).toBeNull();
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
        excelKnowledge: {},
        powerBiKnowledge: {},
        jobRole: {},
        seniorityLevel: {},
      });
    });
  });
});
