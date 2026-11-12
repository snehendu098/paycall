ALTER TABLE "disputes" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "disputes" SET "decided_by" = 'seller' WHERE "status" IN ('refunded', 'rejected');