CREATE TABLE "approvals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_pubkey" text NOT NULL,
	"seller_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"resource" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "daily_cap" bigint;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "approve_above" bigint;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "allowed_sellers" text[];--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_pubkey_agents_pubkey_fk" FOREIGN KEY ("agent_pubkey") REFERENCES "public"."agents"("pubkey") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_agent_pubkey_seller_id_amount_index" ON "approvals" USING btree ("agent_pubkey","seller_id","amount") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "approvals_owner_id_status_index" ON "approvals" USING btree ("owner_id","status");