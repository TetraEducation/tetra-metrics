import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { LeadsConsolidationService } from '@/modules/leads/application/services/leads-consolidation.service';
import { LEADS_SOURCE } from '@/modules/leads/domain/leads-source.enum';

interface ActiveCampaignContact {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  createdTimestamp?: string;
  updatedTimestamp?: string;
  // tags serão implementadas depois
}

interface ActiveCampaignApiResponse {
  contacts: ActiveCampaignContact[];
  meta?: {
    total?: string;
    page_input?: {
      limit?: number;
      offset?: number;
    };
  };
}

@Injectable()
export class ActiveCampaignService {
  private readonly logger = new Logger(ActiveCampaignService.name);

  constructor(
    private readonly http: HttpService,
    private readonly leadsConsolidation: LeadsConsolidationService,
  ) {}

  private async fetchContactsWithRetry(
    params: { limit?: number; offset?: number; id_greater?: number },
    maxRetries = 3,
  ): Promise<ActiveCampaignApiResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Adicionar orders[id]=ASC para melhor performance com id_greater
        const requestParams: Record<string, string | number> = {
          ...params,
          'orders[id]': 'ASC',
        };

        const { data } = await firstValueFrom(
          this.http.get<ActiveCampaignApiResponse>('/contacts', {
            params: requestParams,
          }),
        );

        if (!data) {
          throw new Error('Resposta da API está vazia');
        }

        // Garantir que a estrutura está correta
        if (!data.contacts && !Array.isArray(data)) {
          throw new Error('Estrutura de resposta inesperada da API');
        }

        // Se retornou array direto, normalizar para o formato esperado
        if (Array.isArray(data)) {
          return { contacts: data as ActiveCampaignContact[] };
        }

        return data;
      } catch (error) {
        lastError = error as Error;
        const isNetworkError =
          error instanceof Error &&
          (error.message.includes('fetch failed') ||
            error.message.includes('timeout') ||
            error.message.includes('ECONNRESET') ||
            error.message.includes('ETIMEDOUT'));

        if (isNetworkError && attempt < maxRetries) {
          const delay = Math.min(50 * Math.pow(2, attempt - 1), 1000); // 50ms, 100ms, 200ms (max 1s)
          this.logger.warn(
            `Erro de rede ao buscar contatos (tentativa ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}. Tentando novamente em ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new Error('Falha ao buscar contatos após múltiplas tentativas');
  }

  async syncContacts(limit = 100) {
    this.logger.log(`Iniciando sincronização completa de contatos do ActiveCampaign (limit=${limit} por página)`);

    let totalProcessed = 0;
    let totalContacts = 0;
    let lastId: number | null = null;
    let hasMore = true;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    try {
      while (hasMore) {
        const params: { limit: number; id_greater?: number } = { limit };

        // Usar id_greater para melhor performance conforme documentação
        if (lastId !== null) {
          params.id_greater = lastId;
        }

        this.logger.log(
          `Processando contatos${lastId !== null ? ` (id > ${lastId})` : ''}...`,
        );

        let data: ActiveCampaignApiResponse;
        try {
          data = await this.fetchContactsWithRetry(params);
        } catch (error) {
          consecutiveErrors += 1;
          this.logger.error(
            `Erro ao buscar contatos: ${error instanceof Error ? error.message : String(error)}`,
          );

          if (consecutiveErrors >= maxConsecutiveErrors) {
            this.logger.error(
              `Muitos erros consecutivos (${consecutiveErrors}). Interrompendo sincronização.`,
            );
            break;
          }

          // Pequeno delay antes de tentar novamente
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        // Reset contador de erros em caso de sucesso
        consecutiveErrors = 0;

        const contacts = data.contacts || [];

        // Atualizar total se disponível
        if (data.meta?.total) {
          const parsedTotal = parseInt(data.meta.total, 10);
          if (!isNaN(parsedTotal) && parsedTotal > 0) {
            totalContacts = parsedTotal;
          }
        }

        if (contacts.length === 0) {
          this.logger.log(`Nenhum contato retornado. Finalizando sincronização.`);
          break;
        }

        let pageProcessed = 0;
        let pageErrors = 0;
        let maxIdInPage = lastId || 0;

        for (const contact of contacts) {
          try {
            // Combinar firstName e lastName, removendo espaços extras
            const firstName = contact.firstName?.trim() || '';
            const lastName = contact.lastName?.trim() || '';
            const fullName =
              firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ').trim() || null : null;

            await this.leadsConsolidation.consolidateLead({
              name: fullName,
              email: contact.email?.trim() || null,
              phone: contact.phone?.trim() || null,
              sourceName: LEADS_SOURCE.ACTIVE_CAMPAIGN.toLowerCase(),
              externalId: contact.id,
              tags: null, // tags serão implementadas depois
            });

            pageProcessed += 1;
            totalProcessed += 1;

            // Atualizar lastId para paginação baseada em ID
            const contactId = parseInt(contact.id, 10);
            if (!isNaN(contactId) && contactId > maxIdInPage) {
              maxIdInPage = contactId;
            }
          } catch (error) {
            pageErrors += 1;
            this.logger.warn(
              `Falha ao consolidar contato ${contact.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        lastId = maxIdInPage;

        this.logger.log(
          `Página processada: ${pageProcessed}/${contacts.length} contatos (total: ${totalProcessed}/${totalContacts || '?'})${pageErrors > 0 ? ` [${pageErrors} erros]` : ''}`,
        );

        // Se retornou menos contatos que o limit, não há mais páginas
        if (contacts.length < limit) {
          hasMore = false;
        }

        // Pequeno delay entre páginas para evitar rate limiting
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      this.logger.log(
        `Sync do ActiveCampaign finalizada: ${totalProcessed} contatos processados de ${totalContacts || '?'} totais`,
      );
      return { processed: totalProcessed, total: totalContacts };
    } catch (error) {
      this.logger.error(
        `Erro crítico ao sincronizar contatos do ActiveCampaign: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'N/A'}`);
      throw error;
    }
  }
}

