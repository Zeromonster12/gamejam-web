CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"team_id" uuid,
	"origin" text NOT NULL,
	"is_leader" boolean DEFAULT false NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"age" integer NOT NULL,
	"school_type" text NOT NULL,
	"school_name" text NOT NULL,
	"focus" text[] NOT NULL,
	"focus_note" text,
	"allergies" text,
	"guardian_name" text,
	"guardian_contact" text,
	"guardian_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"ip_hash" text NOT NULL,
	"gdpr_consent_at" timestamp with time zone NOT NULL,
	"health_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"origin" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_ip_created_idx" ON "login_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "participants_team_idx" ON "participants" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_email_lower_uq" ON "participants" USING btree (lower("email")) WHERE "participants"."email" is not null;--> statement-breakpoint
CREATE INDEX "registrations_ip_created_idx" ON "registrations" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_lower_uq" ON "teams" USING btree (lower("name"));