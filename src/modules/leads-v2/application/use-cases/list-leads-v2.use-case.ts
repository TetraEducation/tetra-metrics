import { Injectable } from '@nestjs/common';
import type {
  LeadListingItem,
  LeadsListingResult,
  LeadsListingSearchDto,
} from '@/modules/leads/application/dto/leads-listing.dto';
import { LeadsV2ListingService } from '@/modules/leads-v2/application/services/leads-v2-listing.service';

@Injectable()
export class ListLeadsV2UseCase {
  constructor(private readonly leadsListing: LeadsV2ListingService) {}

  async execute(params: LeadsListingSearchDto): Promise<LeadsListingResult<LeadListingItem>> {
    return this.leadsListing.listLeads(params);
  }
}
