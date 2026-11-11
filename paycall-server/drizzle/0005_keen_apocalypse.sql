CREATE TABLE "agent_nonces" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passes" (
	"agent_pubkey" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "passes_agent_pubkey_endpoint_id_pk" PRIMARY KEY("agent_pubkey","endpoint_id")
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_id" bigint NOT NULL,
	"owner_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "disputes_entryId_unique" UNIQUE("entry_id")
);
--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "pricing" text DEFAULT 'call' NOT NULL;--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "max_amount" bigint;--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "pass_seconds" integer;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "parent_id" bigint;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "resource" text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "units" integer;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_agent_pubkey_agents_pubkey_fk" FOREIGN KEY ("agent_pubkey") REFERENCES "public"."agents"("pubkey") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_endpoint_id_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_parent_id_index" ON "entries" USING btree ("parent_id");