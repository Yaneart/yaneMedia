CREATE TYPE "public"."comment_publication_state" AS ENUM('published', 'moderation_hidden');--> statement-breakpoint
CREATE TABLE "review_comments" (
	"comment_id" varchar(44) PRIMARY KEY DEFAULT 'comment_' || gen_random_uuid()::text NOT NULL,
	"review_id" varchar(43) NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"publication_state" "comment_publication_state" DEFAULT 'published' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_comments_comment_id_format_check" CHECK ("review_comments"."comment_id" ~ '^comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "review_comments_body_format_check" CHECK ("review_comments"."body" = btrim("review_comments"."body") and char_length("review_comments"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_review_id_reviews_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("review_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_comments_review_id_created_at_index" ON "review_comments" USING btree ("review_id","created_at","comment_id") WHERE "review_comments"."publication_state" = 'published' and "review_comments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "review_comments_user_id_created_at_index" ON "review_comments" USING btree ("user_id","created_at","comment_id") WHERE "review_comments"."user_id" is not null and "review_comments"."deleted_at" is null;