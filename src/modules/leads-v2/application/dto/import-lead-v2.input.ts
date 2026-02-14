export interface ImportLeadV2Input {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  source?: string | null;
  sourceSystem?: string | null;
  sourceRef?: string | null;
  meta?: Record<string, unknown> | null;
  utmCampaign?: string | null;
  utm_campaing?: string | null;
}
