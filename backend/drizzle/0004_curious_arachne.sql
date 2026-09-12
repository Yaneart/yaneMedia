CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_media_ref_pk" PRIMARY KEY("user_id","media_ref")
);
--> statement-breakpoint
CREATE TABLE "history_items" (
	"user_id" uuid NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "history_items_user_id_media_ref_pk" PRIMARY KEY("user_id","media_ref")
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_items" ADD CONSTRAINT "history_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorites_user_id_added_at_index" ON "favorites" USING btree ("user_id","added_at");--> statement-breakpoint
CREATE INDEX "history_items_user_id_opened_at_index" ON "history_items" USING btree ("user_id","opened_at");