export const PROFILE_FIELD_TO_QUESTION_KEYS = {
  salaryMin: [
    'salary-min',
    'salary-minimum',
    'salario-minimo',
    'pretensao-salarial-minima',
    'qual-a-sua-renda-pessoal-mensal',
  ],
  salaryMax: [
    'salary-max',
    'salary-maximum',
    'salario-maximo',
    'pretensao-salarial-maxima',
    'qual-a-sua-renda-pessoal-mensal',
  ],
  ageMin: ['age-min', 'idade-minima', 'qual-a-sua-faixa-etaria'],
  ageMax: ['age-max', 'idade-maxima', 'qual-a-sua-faixa-etaria'],
  gender: ['gender', 'genero', 'sexo', 'voce-e'],
  companySize: [
    'company-size',
    'company-porte',
    'porte-empresa',
    'porte',
    'qual-o-porte-da-empresa-em-que-trabalha-atualmente',
  ],
  educationLevel: [
    'education-level',
    'schooling',
    'escolaridade',
    'qual-a-sua-escolaridade',
  ],
} as const;

export const GENDER_ALIASES = {
  male: ['masculino', 'homem', 'm', 'male', 'HOMEM'],
  female: ['feminino', 'mulher', 'f', 'female', 'MULHER'],
  non_binary: ['nao binario', 'não binário', 'non binary', 'non-binary'],
  other: ['outro', 'outra', 'outros', 'other'],
  prefer_not_to_say: [
    'prefiro nao informar',
    'prefiro não informar',
    'nao informar',
    'não informar',
  ],
} as const;

export const COMPANY_SIZE_ALIASES = {
  micro: ['micro', 'microempresa', 'mei'],
  small: ['pequena', 'pequeno porte', 'small'],
  medium: ['media', 'médio porte', 'medio porte', 'medium'],
  large: ['grande', 'grande porte', 'large'],
  enterprise: ['enterprise', 'corporacao', 'corporação', 'corporate'],
  unemployed: ['nao estou trabalhando no momento', 'não estou trabalhando no momento'],
} as const;

export const EDUCATION_LEVEL_ALIASES = {
  fundamental: ['fundamental', 'ensino fundamental'],
  high_school: ['medio', 'médio', 'ensino medio', 'ensino médio', 'high school'],
  high_school_incomplete: [
    'medio incompleto',
    'médio incompleto',
    'ensino medio incompleto',
    'ensino médio incompleto',
    'high school incompleto',
    'ensino médio parcial',
  ],
  technical: ['tecnico', 'técnico', 'tecnologo', 'tecnólogo', 'technical'],
  bachelor: ['superior', 'graduacao', 'graduação', 'bacharelado', 'bachelor'],
  bachelor_incomplete: [
    'superior incompleto',
    'ensino superior incompleto',
    'graduação incompleta',
    'bacharelado incompleto',
  ],
  post_graduate: ['pos graduacao', 'pós graduação', 'especializacao', 'especialização', 'mba'],
  master: ['mestrado', 'master'],
  doctorate: ['doutorado', 'doctorate', 'phd'],
} as const;

export const NORMALIZABLE_FIELDS = ['gender', 'companySize', 'educationLevel'] as const;

export type NormalizableField = (typeof NORMALIZABLE_FIELDS)[number];
