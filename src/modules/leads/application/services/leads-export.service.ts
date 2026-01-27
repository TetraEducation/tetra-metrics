import { Inject, Injectable } from '@nestjs/common';

import type { LeadDetailDto } from '@/modules/leads/application/dto/lead-detail.dto';
import type { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';
import type { LeadsRepositoryPort } from '@/modules/leads/application/ports/leads-repository.port';
import { LEADS_REPOSITORY } from '@/modules/leads/application/ports/leads-repository.port';

type ExportRow = {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  ultimoContato: string | null;
  tags: string | null;
  perguntas: string | null;
  respostas: string | null;
};

@Injectable()
export class LeadsExportService {
  constructor(@Inject(LEADS_REPOSITORY) private readonly leadsRepo: LeadsRepositoryPort) {}

  async exportLeads(params: LeadsListingSearchDto): Promise<string> {
    const leadIds = await this.leadsRepo.listLeadIds(params);
    if (leadIds.length === 0) {
      return this.buildCsv([]);
    }

    const details = await Promise.all(
      leadIds.map((leadId) => this.leadsRepo.getLeadDetailById(leadId)),
    );

    const rows = details.map((detail) => this.mapLeadDetail(detail as LeadDetailDto));
    return this.buildCsv(rows);
  }

  private mapLeadDetail(lead: LeadDetailDto): ExportRow {
    const identifiers = lead.identifiers ?? [];
    const email = this.pickIdentifierValue(identifiers, 'email');
    const phone = this.pickIdentifierValue(identifiers, 'phone');

    const tags = Array.from(
      new Set(
        (lead.tags ?? [])
          .map((tag) => tag.tag_name ?? tag.tag_key)
          .filter((value): value is string => Boolean(value)),
      ),
    ).join(' | ');

    const answers = (lead.surveys ?? [])
      .flatMap((survey) => survey.answers ?? [])
      .map((answer) => ({
        question: answer.question_label ?? answer.question_key ?? 'Pergunta',
        response: this.formatAnswerValue(answer),
      }));

    const perguntas = answers.map((answer) => answer.question).join(' | ') || null;
    const respostas = answers.map((answer) => answer.response).join(' | ') || null;

    return {
      nome: lead.full_name,
      email,
      telefone: phone,
      ultimoContato: lead.last_activity_at,
      tags: tags || null,
      perguntas,
      respostas,
    };
  }

  private formatAnswerValue(answer: LeadDetailDto['surveys'][number]['answers'][number]): string {
    if (answer.value_text !== null && answer.value_text !== undefined) {
      return answer.value_text;
    }
    if (answer.value_number !== null && answer.value_number !== undefined) {
      return String(answer.value_number);
    }
    if (answer.value_bool !== null && answer.value_bool !== undefined) {
      return answer.value_bool ? 'true' : 'false';
    }
    if (answer.value_json !== null && answer.value_json !== undefined) {
      return JSON.stringify(answer.value_json);
    }
    return '';
  }

  private buildCsv(rows: ExportRow[]): string {
    const header = [
      'nome',
      'email',
      'telefone',
      'ultimo_contato',
      'tags',
      'perguntas',
      'respostas',
    ];

    const data = rows.map((row) => [
      row.nome,
      row.email,
      row.telefone,
      row.ultimoContato,
      row.tags,
      row.perguntas,
      row.respostas,
    ]);

    const lines = [header, ...data].map((line) =>
      line.map((value) => this.escapeCsv(value ?? '')).join(','),
    );
    return `${lines.join('\n')}\n`;
  }

  private escapeCsv(value: string): string {
    const needsWrap = /[",\n]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsWrap ? `"${escaped}"` : escaped;
  }

  private pickIdentifierValue(
    identifiers: LeadDetailDto['identifiers'],
    type: string,
  ): string | null {
    const filtered = identifiers.filter((identifier) => identifier.type === type);
    if (filtered.length === 0) return null;

    const primary = filtered.find((identifier) => identifier.is_primary);
    if (primary?.value) {
      return primary.value;
    }

    const sorted = [...filtered].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return sorted[0]?.value ?? null;
  }
}
