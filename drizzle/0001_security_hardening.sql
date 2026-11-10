CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"sessions_valid_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "consent_version" text DEFAULT '2027-01' NOT NULL;--> statement-breakpoint
CREATE INDEX "admin_audit_created_idx" ON "admin_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "registration_attempts_ip_created_idx" ON "registration_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
INSERT INTO "admin_state" ("id", "sessions_valid_after") VALUES (1, to_timestamp(0)) ON CONFLICT ("id") DO NOTHING;
