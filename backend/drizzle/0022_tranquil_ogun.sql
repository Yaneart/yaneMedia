CREATE TYPE "public"."torrent_session_state" AS ENUM('created', 'fetching_metadata', 'awaiting_file', 'probing', 'awaiting_playback', 'preparing', 'ready', 'failed', 'stopping', 'stopped', 'expiring', 'expired');--> statement-breakpoint
CREATE TABLE "torrent_engine_bindings" (
	"session_id" varchar(40) PRIMARY KEY NOT NULL,
	"engine_key" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "torrent_idempotency" (
	"owner_id" uuid NOT NULL,
	"route" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"input_digest" varchar(64) NOT NULL,
	"session_id" varchar(40) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "torrent_idempotency_owner_id_route_key_pk" PRIMARY KEY("owner_id","route","key"),
	CONSTRAINT "torrent_idempotency_digest_check" CHECK ("torrent_idempotency"."input_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "torrent_session_files" (
	"file_ref" varchar(37) PRIMARY KEY NOT NULL,
	"session_id" varchar(40) NOT NULL,
	"engine_file_index" integer NOT NULL,
	"display_name" varchar(1020) NOT NULL,
	"size_bytes" bigint NOT NULL,
	CONSTRAINT "torrent_session_files_index_check" CHECK ("torrent_session_files"."engine_file_index" >= 0 and "torrent_session_files"."size_bytes" >= 0),
	CONSTRAINT "torrent_session_files_ref_check" CHECK ("torrent_session_files"."file_ref" ~ '^torrent_file_[A-Za-z0-9_-]{22}$')
);
--> statement-breakpoint
CREATE TABLE "torrent_sessions" (
	"session_id" varchar(40) PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"media_ref" varchar(64),
	"state" "torrent_session_state" DEFAULT 'created' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"selected_file_ref" varchar(40),
	"failure_code" varchar(64),
	"generation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"cleanup_after" timestamp with time zone,
	CONSTRAINT "torrent_sessions_version_check" CHECK ("torrent_sessions"."version" > 0 and "torrent_sessions"."generation" >= 0),
	CONSTRAINT "torrent_sessions_id_check" CHECK ("torrent_sessions"."session_id" ~ '^torrent_session_[A-Za-z0-9_-]{22}$')
);
--> statement-breakpoint
ALTER TABLE "torrent_engine_bindings" ADD CONSTRAINT "torrent_engine_bindings_session_id_torrent_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."torrent_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torrent_idempotency" ADD CONSTRAINT "torrent_idempotency_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torrent_idempotency" ADD CONSTRAINT "torrent_idempotency_session_id_torrent_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."torrent_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torrent_session_files" ADD CONSTRAINT "torrent_session_files_session_id_torrent_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."torrent_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torrent_sessions" ADD CONSTRAINT "torrent_sessions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torrent_sessions" ADD CONSTRAINT "torrent_sessions_media_ref_media_works_media_ref_fk" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "torrent_engine_bindings_key_unique" ON "torrent_engine_bindings" USING btree ("engine_key");--> statement-breakpoint
CREATE INDEX "torrent_idempotency_expiry_index" ON "torrent_idempotency" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "torrent_session_files_engine_index_unique" ON "torrent_session_files" USING btree ("session_id","engine_file_index");--> statement-breakpoint
CREATE INDEX "torrent_session_files_session_index" ON "torrent_session_files" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "torrent_sessions_owner_index" ON "torrent_sessions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "torrent_sessions_expiry_index" ON "torrent_sessions" USING btree ("expires_at","idle_expires_at");--> statement-breakpoint
CREATE INDEX "torrent_sessions_cleanup_index" ON "torrent_sessions" USING btree ("cleanup_after");--> statement-breakpoint
CREATE UNIQUE INDEX "torrent_sessions_one_active_per_owner" ON "torrent_sessions" USING btree ("owner_id") WHERE "torrent_sessions"."state" in ('created','fetching_metadata','awaiting_file','probing','awaiting_playback','preparing','ready');