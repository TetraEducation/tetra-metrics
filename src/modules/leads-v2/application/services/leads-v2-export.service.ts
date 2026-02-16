import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_V2 } from '@/infra/prisma-v2/prisma-v2.provider';
import type {
  LEAD_COMPANY_SIZES,
  LEAD_EDUCATION_LEVELS,
  LEAD_EXCEL_KNOWLEDGE_LEVELS,
  LEAD_GENDERS,
  LEAD_JOB_ROLES,
  LeadsListingSearchDto,
} from '@/modules/leads/application/dto/leads-listing.dto';
import {
  buildLeadsV2OrderBy,
  buildLeadsV2Where,
} from '@/modules/leads-v2/application/services/leads-v2-prisma-listing-query.helper';

type ExportRow = {
  nome: string;
  email: string;
  telefone: string;
  salario: string;
  porteEmpresa: string;
  idade: string;
  genero: string;
  educationLevel: string;
  cargo: string;
  empresa: string;
  nivelExcel: string;
};

export type ExportCsvProgress = {
  totalRows: number;
  lastProcessedRow: number;
  processedRows: number;
  processedOk: number;
  processedErrors: number;
};

type ExportToFileOptions = {
  batchSize?: number;
  onProgress?: (progress: ExportCsvProgress) => Promise<void> | void;
};

const DEFAULT_BATCH_SIZE = 200;
const LEAD_IDENTIFIER_EMAIL = 'EMAIL';
const LEAD_IDENTIFIER_PHONE = 'PHONE';
const GENDER_TRANSLATIONS: Record<(typeof LEAD_GENDERS)[number], string> = {
  male: 'Masculino',
  female: 'Feminino',
  non_binary: 'Nao-binario',
  other: 'Outro',
  prefer_not_to_say: 'Prefiro nao informar',
};
const COMPANY_SIZE_TRANSLATIONS: Record<(typeof LEAD_COMPANY_SIZES)[number], string> = {
  micro: 'Microempresa',
  small: 'Pequena empresa',
  medium: 'Media empresa',
  large: 'Grande empresa',
  enterprise: 'Empresa grande',
  unemployed: 'Desempregado(a)',
};
const EDUCATION_LEVEL_TRANSLATIONS: Record<(typeof LEAD_EDUCATION_LEVELS)[number], string> = {
  fundamental: 'Fundamental',
  high_school: 'Ensino medio',
  high_school_incomplete: 'Ensino medio incompleto',
  technical: 'Tecnico',
  bachelor: 'Graduacao',
  bachelor_incomplete: 'Graduacao incompleta',
  post_graduate: 'Pos-graduacao',
  master: 'Mestrado',
  doctorate: 'Doutorado',
};
const EXCEL_KNOWLEDGE_TRANSLATIONS: Record<(typeof LEAD_EXCEL_KNOWLEDGE_LEVELS)[number], string> =
  {
    beginner: 'Iniciante',
    basic: 'Basico',
    intermediate: 'Intermediario',
    advanced: 'Avancado',
  };
const JOB_ROLE_TRANSLATIONS: Record<(typeof LEAD_JOB_ROLES)[number], string> = {
  manager: 'Gerente',
  director: 'Diretor',
  consultant: 'Consultor',
  entrepreneur: 'Empreendedor',
  coordinator: 'Coordenador',
  analyst: 'Analista',
  teacher: 'Professor',
  controller: 'Controller',
  supervisor: 'Supervisor',
};

type PrismaDecimal = { toNumber: () => number };

type ExportIdentifierRow = {
  type: string;
  value: string;
  isPrimary: boolean;
  createdAt: Date;
};

type ExportSearchProfileRow = {
  salaryMin: PrismaDecimal | number | null;
  salaryMax: PrismaDecimal | number | null;
  ageMin: number | null;
  ageMax: number | null;
  gender: string | null;
  companySize: string | null;
  educationLevel: string | null;
  excelKnowledge: string | null;
  jobRole: string | null;
  currentCompany: string | null;
} | null;

type ExportLeadRow = {
  id: string;
  name: string;
  identifiers: ExportIdentifierRow[];
  searchProfile: ExportSearchProfileRow;
};

type PrismaV2Client = {
  leads: {
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    findMany: (args: {
      where: Record<string, unknown>;
      select: {
        id: true;
        name: true;
        identifiers: {
          select: { type: true; value: true; isPrimary: true; createdAt: true };
          orderBy: Array<{ isPrimary: 'desc' } | { createdAt: 'asc' }>;
        };
        searchProfile: {
          select: {
            salaryMin: true;
            salaryMax: true;
            ageMin: true;
            ageMax: true;
            gender: true;
            companySize: true;
            educationLevel: true;
            excelKnowledge: true;
            jobRole: true;
            currentCompany: true;
          };
        };
      };
      orderBy: Array<
        | { lastActivityAt: 'asc' | 'desc' }
        | { createdAt: 'asc' | 'desc' }
        | { name: 'asc' | 'desc' }
      >;
      skip: number;
      take: number;
    }) => Promise<ExportLeadRow[]>;
  };
  tags: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: { id: true };
    }) => Promise<Array<{ id: string }>>;
  };
};

@Injectable()
export class LeadsV2ExportService {
  constructor(@Inject(PRISMA_V2) private readonly prisma: PrismaV2Client) {}

  async exportLeadsToFile(
    params: LeadsListingSearchDto,
    outputPath: string,
    options: ExportToFileOptions = {},
  ): Promise<ExportCsvProgress> {
    const { where } = await buildLeadsV2Where(params, this.prisma);
    const totalRows = await this.prisma.leads.count({ where });
    const stream = createWriteStream(outputPath, { encoding: 'utf-8' });

    let processedRows = 0;
    let processedOk = 0;
    const processedErrors = 0;
    const batchSize =
      options.batchSize && options.batchSize > 0
        ? Math.floor(options.batchSize)
        : DEFAULT_BATCH_SIZE;

    try {
      await this.writeLine(stream, this.csvHeaderLine());

      await this.notifyProgress(options.onProgress, {
        totalRows,
        lastProcessedRow: 0,
        processedRows,
        processedOk,
        processedErrors,
      });

      const orderBy = buildLeadsV2OrderBy(params);

      for (let offset = 0; offset < totalRows; offset += batchSize) {
        const leads = await this.prisma.leads.findMany({
          where,
          select: {
            id: true,
            name: true,
            identifiers: {
              select: {
                type: true,
                value: true,
                isPrimary: true,
                createdAt: true,
              },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
            searchProfile: {
              select: {
                salaryMin: true,
                salaryMax: true,
                ageMin: true,
                ageMax: true,
                gender: true,
                companySize: true,
                educationLevel: true,
                excelKnowledge: true,
                jobRole: true,
                currentCompany: true,
              },
            },
          },
          orderBy,
          skip: offset,
          take: batchSize,
        });

        for (const lead of leads) {
          const row = this.mapLead(lead);
          await this.writeLine(stream, this.csvRowLine(row));
          processedRows += 1;
          processedOk += 1;
        }

        await this.notifyProgress(options.onProgress, {
          totalRows,
          lastProcessedRow: processedRows,
          processedRows,
          processedOk,
          processedErrors,
        });
      }

      stream.end();
      await once(stream, 'finish');

      return {
        totalRows,
        lastProcessedRow: processedRows,
        processedRows,
        processedOk,
        processedErrors,
      };
    } catch (error) {
      stream.destroy();
      throw error;
    }
  }

  private mapLead(lead: ExportLeadRow): ExportRow {
    const email = this.pickIdentifierValue(lead.identifiers, LEAD_IDENTIFIER_EMAIL) ?? '';
    const phone = this.pickIdentifierValue(lead.identifiers, LEAD_IDENTIFIER_PHONE) ?? '';
    const salaryMin = this.toNullableNumber(lead.searchProfile?.salaryMin ?? null);
    const salaryMax = this.toNullableNumber(lead.searchProfile?.salaryMax ?? null);
    const ageMin = lead.searchProfile?.ageMin ?? null;
    const ageMax = lead.searchProfile?.ageMax ?? null;

    return {
      nome: lead.name ?? '',
      email,
      telefone: phone ?? '',
      salario: this.formatSalaryRange(salaryMin, salaryMax),
      porteEmpresa: this.translateCompanySize(lead.searchProfile?.companySize),
      idade: this.formatAgeRange(ageMin, ageMax),
      genero: this.translateGender(lead.searchProfile?.gender),
      educationLevel: this.translateEducationLevel(lead.searchProfile?.educationLevel),
      cargo: this.translateJobRole(lead.searchProfile?.jobRole),
      empresa: lead.searchProfile?.currentCompany ?? '',
      nivelExcel: this.translateExcelKnowledge(lead.searchProfile?.excelKnowledge),
    };
  }

  private translateGender(value: string | null | undefined): string {
    if (!value) return '';
    return GENDER_TRANSLATIONS[value as keyof typeof GENDER_TRANSLATIONS] ?? value;
  }

  private translateCompanySize(value: string | null | undefined): string {
    if (!value) return '';
    return COMPANY_SIZE_TRANSLATIONS[value as keyof typeof COMPANY_SIZE_TRANSLATIONS] ?? value;
  }

  private translateEducationLevel(value: string | null | undefined): string {
    if (!value) return '';
    return (
      EDUCATION_LEVEL_TRANSLATIONS[value as keyof typeof EDUCATION_LEVEL_TRANSLATIONS] ?? value
    );
  }

  private translateExcelKnowledge(value: string | null | undefined): string {
    if (!value) return '';
    return EXCEL_KNOWLEDGE_TRANSLATIONS[value as keyof typeof EXCEL_KNOWLEDGE_TRANSLATIONS] ?? value;
  }

  private translateJobRole(value: string | null | undefined): string {
    if (!value) return '';
    return JOB_ROLE_TRANSLATIONS[value as keyof typeof JOB_ROLE_TRANSLATIONS] ?? value;
  }

  private formatSalaryRange(min: number | null, max: number | null): string {
    if (min !== null && max !== null) {
      return `R$ ${this.formatMoney(min)} ate R$ ${this.formatMoney(max)}`;
    }
    if (max !== null) {
      return `Ate R$ ${this.formatMoney(max)}`;
    }
    if (min !== null) {
      return `mais de R$ ${this.formatMoney(min)}`;
    }
    return '';
  }

  private formatAgeRange(min: number | null, max: number | null): string {
    if (min !== null && max !== null) {
      return `${min} ate ${max}`;
    }
    if (max !== null) return `Ate ${max}`;
    if (min !== null) return `mais de ${min}`;
    return '';
  }

  private csvHeaderLine(): string {
    const header = [
      'Nome',
      'E-mail',
      'Telefone',
      'Salario',
      'Porte Empresa',
      'idade',
      'genero',
      'education level',
      'Cargo',
      'Empresa',
      'Nivel Excel',
    ];
    return header.map((value) => this.escapeCsv(value)).join(',');
  }

  private csvRowLine(row: ExportRow): string {
    const data = [
      row.nome,
      row.email,
      row.telefone,
      row.salario,
      row.porteEmpresa,
      row.idade,
      row.genero,
      row.educationLevel,
      row.cargo,
      row.empresa,
      row.nivelExcel,
    ];
    return data.map((value) => this.escapeCsv(value)).join(',');
  }

  private escapeCsv(value: string): string {
    const needsWrap = /[",\n]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsWrap ? `"${escaped}"` : escaped;
  }

  private pickIdentifierValue(identifiers: ExportIdentifierRow[], type: string): string | null {
    const filtered = identifiers.filter((identifier) => identifier.type === type);
    if (filtered.length === 0) return null;

    const primary = filtered.find((identifier) => identifier.isPrimary);
    if (primary?.value) {
      return primary.value;
    }

    const sorted = [...filtered].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return sorted[0]?.value ?? null;
  }

  private formatMoney(value: number): string {
    return value.toFixed(2).replace('.', ',');
  }

  private toNullableNumber(value: PrismaDecimal | number | null): number | null {
    if (value === null) return null;
    if (typeof value === 'number') return value;
    return value.toNumber();
  }

  private async writeLine(
    stream: ReturnType<typeof createWriteStream>,
    line: string,
  ): Promise<void> {
    const hasCapacity = stream.write(`${line}\n`);
    if (hasCapacity) {
      return;
    }
    await once(stream, 'drain');
  }

  private async notifyProgress(
    onProgress: ExportToFileOptions['onProgress'],
    progress: ExportCsvProgress,
  ): Promise<void> {
    if (!onProgress) return;
    await onProgress(progress);
  }
}
