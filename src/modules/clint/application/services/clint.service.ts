import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class ClintService {
  private readonly logger = new Logger(ClintService.name);

  constructor(private readonly http: HttpService) {}

  // TODO: Implementar sincronização de contatos do Clint
}
