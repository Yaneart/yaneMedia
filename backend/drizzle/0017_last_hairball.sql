CREATE TABLE "review_list_snapshot_items" (
	"snapshot_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"review_id" varchar(43) NOT NULL,
	CONSTRAINT "review_list_snapshot_items_snapshot_id_position_pk" PRIMARY KEY("snapshot_id","position")
);
--> statement-breakpoint
CREATE TABLE "review_list_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"sort" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_list_snapshot_items" ADD CONSTRAINT "review_list_snapshot_items_snapshot_id_review_list_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."review_list_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_list_snapshot_items" ADD CONSTRAINT "review_list_snapshot_items_review_id_reviews_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("review_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_list_snapshots" ADD CONSTRAINT "review_list_snapshots_media_ref_media_works_media_ref_fk" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_list_snapshot_items_review_id_index" ON "review_list_snapshot_items" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "review_list_snapshots_expires_at_index" ON "review_list_snapshots" USING btree ("expires_at");