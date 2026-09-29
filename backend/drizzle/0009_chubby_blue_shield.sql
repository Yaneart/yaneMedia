CREATE TABLE "media_work_aliases" (
	"namespace" varchar(32) NOT NULL,
	"value" varchar(128) NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_work_aliases_namespace_value_pk" PRIMARY KEY("namespace","value")
);
--> statement-breakpoint
CREATE TABLE "media_works" (
	"media_ref" varchar(64) PRIMARY KEY NOT NULL,
	"type" "media_type" NOT NULL,
	"slug" varchar(320) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_work_aliases" ADD CONSTRAINT "media_work_aliases_media_ref_media_works_media_ref_fk" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_work_aliases_media_ref_index" ON "media_work_aliases" USING btree ("media_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "media_works_slug_unique" ON "media_works" USING btree ("slug");