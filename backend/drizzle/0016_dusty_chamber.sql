CREATE TYPE "public"."review_publication_state" AS ENUM('published', 'moderation_hidden');--> statement-breakpoint
CREATE TABLE "ratings" (
	"user_id" uuid NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_user_id_media_ref_pk" PRIMARY KEY("user_id","media_ref"),
	CONSTRAINT "ratings_value_range_check" CHECK ("ratings"."value" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"review_id" varchar(43) PRIMARY KEY DEFAULT 'review_' || gen_random_uuid()::text NOT NULL,
	"user_id" uuid,
	"media_ref" varchar(64) NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	"publication_state" "review_publication_state" DEFAULT 'published' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_review_id_format_check" CHECK ("reviews"."review_id" ~ '^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "reviews_title_format_check" CHECK ("reviews"."title" = btrim("reviews"."title") and char_length("reviews"."title") between 1 and 120),
	CONSTRAINT "reviews_body_length_check" CHECK (char_length("reviews"."body") between 20 and 10000)
);
--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_media_ref_media_works_media_ref_fk" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_media_ref_media_works_media_ref_fk" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ratings_user_id_created_at_index" ON "ratings" USING btree ("user_id","created_at","media_ref");--> statement-breakpoint
CREATE INDEX "ratings_media_ref_value_index" ON "ratings" USING btree ("media_ref","value");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_user_id_media_ref_active_unique" ON "reviews" USING btree ("user_id","media_ref") WHERE "reviews"."user_id" is not null and "reviews"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "reviews_user_id_created_at_index" ON "reviews" USING btree ("user_id","created_at","review_id") WHERE "reviews"."user_id" is not null and "reviews"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "reviews_media_ref_created_at_index" ON "reviews" USING btree ("media_ref","created_at","review_id") WHERE "reviews"."publication_state" = 'published' and "reviews"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "reviews_media_ref_updated_at_index" ON "reviews" USING btree ("media_ref","updated_at","review_id") WHERE "reviews"."publication_state" = 'published' and "reviews"."deleted_at" is null;