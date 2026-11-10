ALTER TABLE "endpoints" ADD COLUMN "upstream_auth" text;--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;