CREATE TYPE "public"."moderation_action" AS ENUM('review_hide', 'review_restore', 'comment_hide', 'comment_restore', 'report_resolve', 'report_reject');--> statement-breakpoint
CREATE TYPE "public"."moderation_target_type" AS ENUM('review', 'comment');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'abuse', 'hate', 'sexual_content', 'violence', 'spoiler', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "content_reports" (
	"report_id" varchar(43) PRIMARY KEY DEFAULT 'report_' || gen_random_uuid()::text NOT NULL,
	"reporter_user_id" uuid,
	"target_type" "moderation_target_type" NOT NULL,
	"target_id" varchar(44) NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" varchar(1000),
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"decision" varchar(1000),
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_reports_report_id_format_check" CHECK ("content_reports"."report_id" ~ '^report_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "content_reports_target_id_format_check" CHECK (("content_reports"."target_type" = 'review' and "content_reports"."target_id" ~ '^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') or ("content_reports"."target_type" = 'comment' and "content_reports"."target_id" ~ '^comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')),
	CONSTRAINT "content_reports_note_format_check" CHECK ("content_reports"."note" is null or ("content_reports"."note" = btrim("content_reports"."note") and char_length("content_reports"."note") between 1 and 1000)),
	CONSTRAINT "content_reports_other_note_check" CHECK ("content_reports"."reason" <> 'other' or "content_reports"."note" is not null),
	CONSTRAINT "content_reports_decision_state_check" CHECK (("content_reports"."status" = 'open' and "content_reports"."decision" is null and "content_reports"."decided_by_user_id" is null and "content_reports"."decided_at" is null) or ("content_reports"."status" <> 'open' and "content_reports"."decision" is not null and "content_reports"."decided_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"administrator_user_id" uuid,
	"action" "moderation_action" NOT NULL,
	"entity_id" varchar(44) NOT NULL,
	"decision" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_events_decision_format_check" CHECK ("moderation_events"."decision" = btrim("moderation_events"."decision") and char_length("moderation_events"."decision") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_administrator_user_id_users_id_fk" FOREIGN KEY ("administrator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_reporter_target_open_unique" ON "content_reports" USING btree ("reporter_user_id","target_type","target_id") WHERE "content_reports"."reporter_user_id" is not null and "content_reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "content_reports_status_created_at_index" ON "content_reports" USING btree ("status","created_at","report_id");--> statement-breakpoint
CREATE INDEX "moderation_events_entity_created_at_index" ON "moderation_events" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_events_administrator_created_at_index" ON "moderation_events" USING btree ("administrator_user_id","created_at");