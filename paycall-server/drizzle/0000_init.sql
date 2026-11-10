CREATE TABLE "agents" (
	"pubkey" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"max_price" bigint DEFAULT 1000000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_pubkey" text NOT NULL,
	"seller_id" text NOT NULL,
	"cumulative" bigint NOT NULL,
	"seq" integer NOT NULL,
	"last_sig" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"owner_id" text,
	"seller_id" text,
	"agent_pubkey" text,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"vault_id" text,
	"paypal_customer_id" text,
	"reload_below" bigint DEFAULT 2000000 NOT NULL,
	"reload_amount" bigint DEFAULT 10000000 NOT NULL,
	"daily_cap" bigint DEFAULT 5000000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owners_email_unique" UNIQUE("email"),
	CONSTRAINT "owners_apiKeyHash_unique" UNIQUE("api_key_hash"),
	CONSTRAINT "balance_nonneg" CHECK ("owners"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"paypal_batch_id" text,
	"status" text DEFAULT 'CREATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_items" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"gross" bigint NOT NULL,
	"net" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paypal_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"paypal_email" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"paid_out" bigint DEFAULT 0 NOT NULL,
	"pending_payout" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sellers_apiKeyHash_unique" UNIQUE("api_key_hash"),
	CONSTRAINT "pending_nonneg" CHECK ("sellers"."pending_payout" >= 0)
);
--> statement-breakpoint
CREATE TABLE "topups" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount" bigint NOT NULL,
	"paypal_order_id" text,
	"capture_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topups_paypalOrderId_unique" UNIQUE("paypal_order_id"),
	CONSTRAINT "topups_captureId_unique" UNIQUE("capture_id")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_agent_pubkey_agents_pubkey_fk" FOREIGN KEY ("agent_pubkey") REFERENCES "public"."agents"("pubkey") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_batch_id_payout_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payout_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topups" ADD CONSTRAINT "topups_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channels_agent_pubkey_seller_id_index" ON "channels" USING btree ("agent_pubkey","seller_id");--> statement-breakpoint
CREATE INDEX "entries_owner_id_created_at_index" ON "entries" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "entries_seller_id_id_index" ON "entries" USING btree ("seller_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_reload" ON "topups" USING btree ("owner_id") WHERE "topups"."kind" = 'auto' and "topups"."status" = 'pending';