ALTER TABLE "endpoints" ADD COLUMN "mode" text DEFAULT 'proxy' NOT NULL;--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "docs" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "routes" jsonb;