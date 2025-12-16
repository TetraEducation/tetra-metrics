import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class ActiveCampaignService {
  private readonly logger = new Logger(ActiveCampaignService.name);

  constructor(private readonly http: HttpService) {}

  // TODO: Implementar sincronização de contatos do ActiveCampaign
}
