import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';

export interface ConsolidateLeadInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  sourceName: string; // 'clint', 'activecampaign', 'form_pop_up', ...
  externalId?: string | null; // id no sistema de origem (id do Clint, etc.)
  tags?: string[] | null; // tags do sistema de origem
}

@Injectable()
export class LeadsConsolidationService {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  private normalizeEmail(email?: string | null): string | null {
    if (!email) return null;
    const e = String(email).trim().toLowerCase();
    return /\S+@\S+\.\S+/.test(e) ? e : null;
  }

  private normalizePhone(phone?: string | null): string | null {
    if (!phone) return null;
    const digits = String(phone).replace(/\D+/g, '');
    // ajusta depois se quiser DDI/DDDs obrigatórios
    return digits.length >= 8 ? digits : null;
  }

  private normalizeTag(tag: string): string {
    return String(tag).trim().toLowerCase();
  }

  async consolidateLead(input: ConsolidateLeadInput) {
    const emailNorm = this.normalizeEmail(input.email);
    const phoneNorm = this.normalizePhone(input.phone);

    if (!emailNorm && !phoneNorm) {
      // lead sem identificador útil → por enquanto ignoramos
      return null;
    }

    const identifiersToCheck = [emailNorm, phoneNorm].filter(Boolean) as string[];

    // 1) ver se já existe lead por algum identifier
    const { data: existingIds, error: idErr } = await this.supabase
      .from('lead_identifiers')
      .select('lead_id, value_norm')
      .in('value_norm', identifiersToCheck);

    if (idErr) throw idErr;

    let leadId: string | null = null;

    if (existingIds && existingIds.length > 0) {
      // já temos lead para pelo menos um dos identifiers (graças ao índice unique não teremos conflito sério)
      leadId = existingIds[0].lead_id;
    } else {
      // 2) criar novo lead
      const { data: insertedLead, error: leadErr } = await this.supabase
        .from('leads')
        .insert({
          name: input.name ?? null,
        })
        .select('id')
        .single();

      if (leadErr || !insertedLead) {
        throw leadErr ?? new Error('Failed to create lead');
      }

      leadId = insertedLead.id;
    }

    // Garantir que leadId não é null (não deveria ser, mas TypeScript precisa dessa garantia)
    if (!leadId) {
      throw new Error('Failed to resolve or create lead');
    }

    // 3) garantir que todos identifiers estão cadastrados
    const identifiersPayload: Array<{
      lead_id: string;
      type: 'email' | 'phone';
      value_norm: string;
    }> = [];

    if (emailNorm) {
      identifiersPayload.push({
        lead_id: leadId,
        type: 'email',
        value_norm: emailNorm,
      });
    }

    if (phoneNorm) {
      identifiersPayload.push({
        lead_id: leadId,
        type: 'phone',
        value_norm: phoneNorm,
      });
    }

    if (identifiersPayload.length) {
      const { error: upsertIdsErr } = await this.supabase
        .from('lead_identifiers')
        .upsert(identifiersPayload, {
          onConflict: 'value_norm', // você já criou índice unique em value_norm
        });

      if (upsertIdsErr) throw upsertIdsErr;
    }

    // 4) registrar presença na origem (lead_sources)
    // Buscar todas as linhas existentes para este lead (pode ter múltiplas se já existiam antes)
    const { data: existingSources, error: sourceCheckErr } = await this.supabase
      .from('lead_sources')
      .select('source_name, external_id')
      .eq('lead_id', leadId);

    if (sourceCheckErr) throw sourceCheckErr;

    // Coletar todos os sources únicos mantendo ordem de chegada
    const allSources: string[] = [];
    const seenSources = new Set<string>();
    const newSourceLower = input.sourceName.toLowerCase();

    // Adicionar sources existentes (mantendo ordem)
    if (existingSources && existingSources.length > 0) {
      for (const existing of existingSources) {
        if (existing.source_name) {
          // Se já está concatenado, separar e adicionar cada um
          const sources = existing.source_name
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          for (const source of sources) {
            if (!seenSources.has(source)) {
              allSources.push(source);
              seenSources.add(source);
            }
          }
        }
      }
    }

    // Adicionar o novo source se ainda não estiver na lista
    if (!seenSources.has(newSourceLower)) {
      allSources.push(newSourceLower);
      seenSources.add(newSourceLower);
    }

    // Construir source_name final concatenado (mantendo ordem de chegada)
    const finalSourceName = allSources
      .map((s, index) => (index === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s))
      .join(', ');

    // Usar o external_id do novo source (ou manter o primeiro existente se não houver novo)
    const finalExternalId =
      input.externalId ?? (existingSources && existingSources.length > 0 ? existingSources[0].external_id : null);

    // Deletar todas as linhas existentes para este lead
    if (existingSources && existingSources.length > 0) {
      const { error: deleteErr } = await this.supabase.from('lead_sources').delete().eq('lead_id', leadId);
      if (deleteErr) throw deleteErr;
    }

    // Inserir nova linha consolidada
    const { error: sourceErr } = await this.supabase.from('lead_sources').insert({
      lead_id: leadId,
      source_name: finalSourceName,
      external_id: finalExternalId,
    });

    if (sourceErr) throw sourceErr;

    // 5) processar tags se fornecidas
    if (input.tags && input.tags.length > 0) {
      await this.processTags(leadId, input.sourceName, input.tags);
    }

    return { leadId };
  }

  private async processTags(leadId: string, system: string, tags: string[]) {
    if (!tags || tags.length === 0) return;

    const now = new Date().toISOString();

    // Processar cada tag individualmente para melhor controle
    for (const tag of tags) {
      if (!tag || !String(tag).trim()) continue;

      const tagRaw = String(tag).trim();
      const tagNorm = this.normalizeTag(tag);

      // Verificar se a tag já existe
      const { data: existingTag } = await this.supabase
        .from('lead_system_tags')
        .select('id, first_seen_at')
        .eq('lead_id', leadId)
        .eq('system', system)
        .eq('tag_norm', tagNorm)
        .maybeSingle();

      if (existingTag) {
        // Tag já existe: atualizar apenas last_seen_at
        const { error } = await this.supabase
          .from('lead_system_tags')
          .update({ last_seen_at: now })
          .eq('id', existingTag.id);

        if (error) {
          console.warn(`Falha ao atualizar tag ${tagRaw} para lead ${leadId}: ${error.message}`);
        }
      } else {
        // Tag nova: inserir com first_seen_at e last_seen_at
        const { error } = await this.supabase.from('lead_system_tags').insert({
          lead_id: leadId,
          system,
          tag_raw: tagRaw,
          tag_norm: tagNorm,
          first_seen_at: now,
          last_seen_at: now,
        });

        if (error) {
          // Pode ser conflito de corrida, tenta novamente como update
          const { data: retryTag } = await this.supabase
            .from('lead_system_tags')
            .select('id')
            .eq('lead_id', leadId)
            .eq('system', system)
            .eq('tag_norm', tagNorm)
            .maybeSingle();

          if (retryTag) {
            await this.supabase
              .from('lead_system_tags')
              .update({ last_seen_at: now })
              .eq('id', retryTag.id);
          } else {
            console.warn(`Falha ao inserir tag ${tagRaw} para lead ${leadId}: ${error.message}`);
          }
        }
      }
    }
  }
}



