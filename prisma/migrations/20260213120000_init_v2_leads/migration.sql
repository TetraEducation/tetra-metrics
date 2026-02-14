CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "public"."leads" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "full_name" text NOT NULL,
    "document" text,
    "first_contact_at" timestamptz(6),
    "last_activity_at" timestamptz(6),
    "created_at" timestamptz(6) NOT NULL DEFAULT now(),
    "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."lead_identifiers" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" uuid NOT NULL,
    "type" text NOT NULL,
    "value" text NOT NULL,
    "value_normalized" text NOT NULL,
    "is_primary" boolean NOT NULL DEFAULT false,
    "created_at" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "lead_identifiers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lead_identifiers_type_not_blank" CHECK (length(btrim("type")) > 0),
    CONSTRAINT "lead_identifiers_lead_id_fkey"
      FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "uq_lead_identifiers_type_value_norm"
  ON "public"."lead_identifiers"("type", "value_normalized");

CREATE UNIQUE INDEX "uq_lead_primary_email"
  ON "public"."lead_identifiers"("lead_id")
  WHERE "type" = 'email' AND "is_primary" = true;

CREATE INDEX "idx_lead_identifiers_lead_id"
  ON "public"."lead_identifiers"("lead_id");

CREATE INDEX "idx_lead_identifiers_primary"
  ON "public"."lead_identifiers"("lead_id", "is_primary" DESC);

CREATE INDEX "idx_leads_last_activity"
  ON "public"."leads"("last_activity_at");
