import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '@/modules/iam/interface/http/guards/supabase.auth.guard';
import type { AuthenticatedRequest } from '@/modules/iam/interface/http/types/authenticated-request';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { WhoAmIQuery } from '@/modules/metrics/application/use-cases/whoami.query';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly whoAmIQuery: WhoAmIQuery) {}

  @Get('whoami')
  @UseGuards(SupabaseAuthGuard)
  whoami(@Req() req: AuthenticatedRequest) {
    return this.whoAmIQuery.execute(req.user);
  }
}
