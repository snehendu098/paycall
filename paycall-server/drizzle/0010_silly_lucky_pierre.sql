CREATE TABLE "seller_passes" (
	"agent_pubkey" text NOT NULL,
	"seller_id" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seller_passes_agent_pubkey_seller_id_scope_pk" PRIMARY KEY("agent_pubkey","seller_id","scope")
);
--> statement-breakpoint
ALTER TABLE "seller_passes" ADD CONSTRAINT "seller_passes_agent_pubkey_agents_pubkey_fk" FOREIGN KEY ("agent_pubkey") REFERENCES "public"."agents"("pubkey") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_passes" ADD CONSTRAINT "seller_passes_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;