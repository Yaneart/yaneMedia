CREATE TABLE "continue_watching_items" (
	"user_id" uuid NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"source_ref" varchar(512) NOT NULL,
	"season_number" integer,
	"episode_number" integer,
	"absolute_episode_number" integer,
	"position_seconds" double precision NOT NULL,
	"duration_seconds" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "continue_watching_items_user_id_media_ref_pk" PRIMARY KEY("user_id","media_ref")
);
--> statement-breakpoint
ALTER TABLE "continue_watching_items" ADD CONSTRAINT "continue_watching_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "continue_watching_user_id_updated_at_index" ON "continue_watching_items" USING btree ("user_id","updated_at");