CREATE TABLE "media_comments" (
	"comment_id" varchar(50) PRIMARY KEY DEFAULT 'media_comment_' || gen_random_uuid()::text NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"parent_comment_id" varchar(50),
	"user_id" uuid,
	"body" text NOT NULL,
	"publication_state" "comment_publication_state" DEFAULT 'published' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_comments_comment_id_format_check" CHECK ("media_comments"."comment_id" ~ '^media_comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "media_comments_parent_comment_id_format_check" CHECK ("media_comments"."parent_comment_id" is null or "media_comments"."parent_comment_id" ~ '^media_comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "media_comments_body_format_check" CHECK ("media_comments"."body" = btrim("media_comments"."body") and char_length("media_comments"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_media_ref_media_works_media_ref_fk" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_parent_comment_id_media_comments_comment_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."media_comments"("comment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_comments_media_ref_created_at_index" ON "media_comments" USING btree ("media_ref","created_at","comment_id") WHERE "media_comments"."publication_state" = 'published' and "media_comments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "media_comments_parent_comment_id_created_at_index" ON "media_comments" USING btree ("parent_comment_id","created_at","comment_id") WHERE "media_comments"."parent_comment_id" is not null and "media_comments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "media_comments_user_id_created_at_index" ON "media_comments" USING btree ("user_id","created_at","comment_id") WHERE "media_comments"."user_id" is not null and "media_comments"."deleted_at" is null;