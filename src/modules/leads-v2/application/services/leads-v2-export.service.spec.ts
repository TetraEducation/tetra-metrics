import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LeadsV2ExportService } from '@/modules/leads-v2/application/services/leads-v2-export.service';

type PrismaMock = {
  leads: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  tags: {
    findMany: jest.Mock;
  };
};

const buildPrismaMock = (): PrismaMock => ({
  leads: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  tags: {
    findMany: jest.fn(),
  },
});

describe('LeadsV2ExportService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('gera CSV com traducoes PT-BR e formata faixas de salario/idade', async () => {
    const prisma = buildPrismaMock();
    prisma.tags.findMany.mockResolvedValue([]);
    prisma.leads.count.mockResolvedValue(3);
    prisma.leads.findMany.mockResolvedValue([
      {
        id: 'lead-1',
        name: 'Ana',
        identifiers: [
          {
            type: 'EMAIL',
            value: 'ana@example.com',
            isPrimary: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          {
            type: 'PHONE',
            value: '11999990000',
            isPrimary: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        searchProfile: {
          salaryMin: 1500,
          salaryMax: 3000,
          ageMin: 18,
          ageMax: 25,
          gender: 'female',
          companySize: 'small',
          educationLevel: 'bachelor',
          excelKnowledge: 'intermediate',
          jobRole: 'manager',
          currentCompany: 'acucar & cia',
        },
      },
      {
        id: 'lead-2',
        name: 'Bruno',
        identifiers: [
          {
            type: 'EMAIL',
            value: 'bruno@example.com',
            isPrimary: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        searchProfile: {
          salaryMin: null,
          salaryMax: 1500,
          ageMin: null,
          ageMax: 40,
          gender: 'male',
          companySize: 'micro',
          educationLevel: 'high_school',
          excelKnowledge: 'basic',
          jobRole: 'analyst',
          currentCompany: 'beta corp',
        },
      },
      {
        id: 'lead-3',
        name: 'Carla',
        identifiers: [
          {
            type: 'PHONE',
            value: '21988887777',
            isPrimary: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        searchProfile: {
          salaryMin: 6000,
          salaryMax: null,
          ageMin: 30,
          ageMax: null,
          gender: 'female',
          companySize: 'enterprise',
          educationLevel: 'master',
          excelKnowledge: 'advanced',
          jobRole: 'director',
          currentCompany: 'gamma sa',
        },
      },
    ]);

    const service = new LeadsV2ExportService(prisma as never);
    const dir = await mkdtemp(join(tmpdir(), 'leads-v2-export-'));
    const outputPath = join(dir, 'result.csv');

    await service.exportLeadsToFile({}, outputPath, { batchSize: 50 });
    const content = await readFile(outputPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines[0]).toBe(
      'Nome,E-mail,Telefone,Salario,Porte Empresa,idade,genero,education level,Cargo,Empresa,Nivel Excel',
    );
    expect(lines[1]).toContain('"R$ 1500,00 ate R$ 3000,00"');
    expect(lines[1]).toContain('18 ate 25');
    expect(lines[1]).toContain('Pequena empresa');
    expect(lines[1]).toContain('Feminino');
    expect(lines[1]).toContain('Graduacao');
    expect(lines[1]).toContain('Gerente');
    expect(lines[1]).toContain('acucar & cia');
    expect(lines[1]).toContain('Intermediario');
    expect(lines[2]).toContain('"Ate R$ 1500,00"');
    expect(lines[2]).toContain('Ate 40');
    expect(lines[2]).toContain('Microempresa');
    expect(lines[2]).toContain('Masculino');
    expect(lines[2]).toContain('Ensino medio');
    expect(lines[2]).toContain('Analista');
    expect(lines[2]).toContain('beta corp');
    expect(lines[2]).toContain('Basico');
    expect(lines[3]).toContain('"mais de R$ 6000,00"');
    expect(lines[3]).toContain('mais de 30');
    expect(lines[3]).toContain('Empresa grande');
    expect(lines[3]).toContain('Feminino');
    expect(lines[3]).toContain('Mestrado');
    expect(lines[3]).toContain('Diretor');
    expect(lines[3]).toContain('gamma sa');
    expect(lines[3]).toContain('Avancado');
  });

  it('deixa campos vazios quando profile e identificadores estao ausentes', async () => {
    const prisma = buildPrismaMock();
    prisma.tags.findMany.mockResolvedValue([]);
    prisma.leads.count.mockResolvedValue(1);
    prisma.leads.findMany.mockResolvedValue([
      {
        id: 'lead-empty',
        name: 'SemDados',
        identifiers: [],
        searchProfile: null,
      },
    ]);

    const service = new LeadsV2ExportService(prisma as never);
    const dir = await mkdtemp(join(tmpdir(), 'leads-v2-export-empty-'));
    const outputPath = join(dir, 'result.csv');

    await service.exportLeadsToFile({}, outputPath);
    const content = await readFile(outputPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines[1]).toBe('SemDados,,,,,,,,,,');
  });

  it('mantem valor original quando nao houver traducao mapeada', async () => {
    const prisma = buildPrismaMock();
    prisma.tags.findMany.mockResolvedValue([]);
    prisma.leads.count.mockResolvedValue(1);
    prisma.leads.findMany.mockResolvedValue([
      {
        id: 'lead-fallback',
        name: 'Fallback',
        identifiers: [],
        searchProfile: {
          salaryMin: null,
          salaryMax: null,
          ageMin: null,
          ageMax: null,
          gender: 'not_mapped_gender',
          companySize: 'not_mapped_company',
          educationLevel: 'not_mapped_education',
          excelKnowledge: 'not_mapped_excel',
          jobRole: 'not_mapped_role',
          currentCompany: 'not_mapped_current_company',
        },
      },
    ]);

    const service = new LeadsV2ExportService(prisma as never);
    const dir = await mkdtemp(join(tmpdir(), 'leads-v2-export-fallback-'));
    const outputPath = join(dir, 'result.csv');

    await service.exportLeadsToFile({}, outputPath);
    const content = await readFile(outputPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines[1]).toContain('not_mapped_company');
    expect(lines[1]).toContain('not_mapped_gender');
    expect(lines[1]).toContain('not_mapped_education');
    expect(lines[1]).toContain('not_mapped_excel');
    expect(lines[1]).toContain('not_mapped_role');
    expect(lines[1]).toContain('not_mapped_current_company');
  });
});
