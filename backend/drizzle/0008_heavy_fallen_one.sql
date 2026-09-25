CREATE TABLE "media_catalog_identities" (
	"revision_id" uuid NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"external_media_ref" varchar(64) NOT NULL,
	"provenance" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_catalog_identities_revision_id_external_media_ref_pk" PRIMARY KEY("revision_id","external_media_ref"),
	CONSTRAINT "media_catalog_identities_provenance_not_blank" CHECK (length(btrim("media_catalog_identities"."provenance")) > 0)
);
--> statement-breakpoint
ALTER TABLE "media_catalog_identities" ADD CONSTRAINT "media_catalog_identities_catalog_item_fk" FOREIGN KEY ("revision_id","media_ref") REFERENCES "public"."media_catalog_items"("revision_id","media_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_catalog_identities_item_index" ON "media_catalog_identities" USING btree ("revision_id","media_ref");
--> statement-breakpoint
INSERT INTO "media_catalog_identities" (
	"revision_id", "media_ref", "external_media_ref", "provenance"
)
SELECT "revision_id", "media_ref", "media_ref", 'catalog-migration'
FROM "media_catalog_items";
