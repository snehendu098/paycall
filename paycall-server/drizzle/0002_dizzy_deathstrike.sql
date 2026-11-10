CREATE TABLE "device_logins" (
	"device_hash" text PRIMARY KEY NOT NULL,
	"user_code" text NOT NULL,
	"pubkey" text NOT NULL,
	"name" text NOT NULL,
	"replaces" text,
	"owner_id" text,
	"max_price" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_logins_userCode_unique" UNIQUE("user_code")
);
--> statement-breakpoint
ALTER TABLE "device_logins" ADD CONSTRAINT "device_logins_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;