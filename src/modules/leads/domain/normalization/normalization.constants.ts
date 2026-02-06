export const PROFILE_FIELD_TO_QUESTION_KEYS = {
  salaryMin: ['salary-min', 'salary-minimum', 'salario-minimo', 'pretensao-salarial-minima'],
  salaryMax: ['salary-max', 'salary-maximum', 'salario-maximo', 'pretensao-salarial-maxima'],
  ageMin: ['age-min', 'idade-minima'],
  ageMax: ['age-max', 'idade-maxima'],
  gender: ['gender', 'genero', 'sexo'],
  companySize: ['company-size', 'company-porte', 'porte-empresa', 'porte'],
  educationLevel: ['education-level', 'schooling', 'escolaridade'],
} as const;

export const GENDER_ALIASES = {
  male: ['masculino', 'homem', 'm', 'male'],
  female: ['feminino', 'mulher', 'f', 'female'],
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
} as const;

export const EDUCATION_LEVEL_ALIASES = {
  fundamental: ['fundamental', 'ensino fundamental'],
  high_school: ['medio', 'médio', 'ensino medio', 'ensino médio', 'high school'],
  technical: ['tecnico', 'técnico', 'tecnologo', 'tecnólogo', 'technical'],
  bachelor: ['superior', 'graduacao', 'graduação', 'bacharelado', 'bachelor'],
  post_graduate: ['pos graduacao', 'pós graduação', 'especializacao', 'especialização', 'mba'],
  master: ['mestrado', 'master'],
  doctorate: ['doutorado', 'doctorate', 'phd'],
} as const;

export const NORMALIZABLE_FIELDS = ['gender', 'companySize', 'educationLevel'] as const;

export type NormalizableField = (typeof NORMALIZABLE_FIELDS)[number];
