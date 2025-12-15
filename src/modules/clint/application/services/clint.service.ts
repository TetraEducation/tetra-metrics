import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { LeadsConsolidationService } from '@/modules/leads/application/services/leads-consolidation.service';
import { LEADS_SOURCE } from '@/modules/leads/domain/leads-source.enum';

interface ClintContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  updated_at?: string;
  tags?: string[] | null; // tags do contato no Clint
  // depois você acrescenta os outros campos que achar
}

interface ClintApiResponse {
  status: number;
  totalCount: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  data: ClintContact[];
}

@Injectable()
export class ClintService {
  private readonly logger = new Logger(ClintService.name);

  constructor(
    private readonly http: HttpService,
    private readonly leadsConsolidation: LeadsConsolidationService,
  ) {}

  private async fetchPageWithRetry(page: number, limit: number, maxRetries = 3): Promise<ClintApiResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data } = await firstValueFrom(
          this.http.get<ClintApiResponse>('/contacts', {
            params: { page, limit, offset: (page - 1) * limit },
          }),
        );

        if (!data) {
          throw new Error('Resposta da API está vazia');
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
            `Erro de rede ao buscar página ${page} (tentativa ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}. Tentando novamente em ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Se não for erro de rede ou já tentou todas as vezes, propaga o erro
        throw error;
      }
    }

    throw lastError ?? new Error('Falha ao buscar página após múltiplas tentativas');
  }

  async syncContacts(limit = 200) {
    this.logger.log(`Iniciando sincronização completa de contatos do Clint (limit=${limit} por página)`);

    let currentPage = 1;
    let totalProcessed = 0;
    let totalContacts = 0;
    let totalPages = 0;
    let hasNext = true;
    let consecutiveEmptyPages = 0;
    const maxConsecutiveEmptyPages = 3;

    try {
      while (hasNext) {
        this.logger.log(`Processando página ${currentPage}...`);

        let data: ClintApiResponse;
        try {
          data = await this.fetchPageWithRetry(currentPage, limit);
        } catch (error) {
          this.logger.error(
            `Erro ao buscar página ${currentPage}: ${error instanceof Error ? error.message : String(error)}`,
          );
          this.logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'N/A'}`);

          // Se for erro HTTP (não de rede), pode ser que a página não exista mais
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { status?: number; data?: unknown } };
            if (axiosError.response?.status === 404 || axiosError.response?.status === 400) {
              this.logger.warn(`Página ${currentPage} não encontrada (status ${axiosError.response.status}). Finalizando sincronização.`);
              break;
            }
          }

          // Para erros de rede persistentes, continua para próxima página após algumas tentativas
          consecutiveEmptyPages += 1;
          if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
            this.logger.error(
              `Muitas páginas consecutivas com erro (${consecutiveEmptyPages}). Interrompendo sincronização.`,
            );
            break;
          }

          currentPage += 1;
          continue;
        }

        // Reset contador de páginas vazias em caso de sucesso
        consecutiveEmptyPages = 0;

        // Atualizar totais se disponíveis
        if (data.totalCount && data.totalCount > 0) {
          totalContacts = data.totalCount;
        }
        if (data.totalPages && data.totalPages > 0) {
          totalPages = data.totalPages;
        }

        // Verificar se há dados
        if (!data.data || data.data.length === 0) {
          this.logger.warn(
            `Página ${currentPage} retornou sem dados. hasNext=${data.hasNext}, totalPages=${data.totalPages}, totalCount=${data.totalCount}`,
          );
          consecutiveEmptyPages += 1;

          // Se não tem mais páginas ou já verificou várias páginas vazias, para
          if (!data.hasNext || consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
            this.logger.log(`Finalizando sincronização: sem mais dados disponíveis.`);
            break;
          }

          currentPage += 1;
          continue;
        }

        const contacts = data.data;

        let pageProcessed = 0;
        let pageErrors = 0;
        for (const contact of contacts) {
          try {
            await this.leadsConsolidation.consolidateLead({
              name: contact.name ?? null,
              email: contact.email ?? null,
              phone: contact.phone ?? null,
              sourceName: LEADS_SOURCE.CLINT.toLowerCase(),
              externalId: contact.id,
              tags: contact.tags ?? null,
            });
            pageProcessed += 1;
            totalProcessed += 1;
          } catch (error) {
            pageErrors += 1;
            this.logger.warn(
              `Falha ao consolidar contato ${contact.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        this.logger.log(
          `Página ${currentPage}/${totalPages || '?'} processada: ${pageProcessed}/${contacts.length} contatos (total: ${totalProcessed}/${totalContacts || '?'})${pageErrors > 0 ? ` [${pageErrors} erros]` : ''}`,
        );

        hasNext = data.hasNext ?? false;
        currentPage += 1;

        // Pequeno delay entre páginas para evitar rate limiting
        if (hasNext) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      this.logger.log(
        `Sync do Clint finalizada: ${totalProcessed} contatos processados de ${totalContacts || '?'} totais em ${currentPage - 1} páginas`,
      );
      return { processed: totalProcessed, total: totalContacts, pages: currentPage - 1 };
    } catch (error) {
      this.logger.error(`Erro crítico ao sincronizar contatos do Clint: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'N/A'}`);
      throw error;
    }
  }
}





