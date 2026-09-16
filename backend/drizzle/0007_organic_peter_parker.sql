CREATE TYPE "public"."catalog_revision_status" AS ENUM('staging', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."media_asset_kind" AS ENUM('poster', 'backdrop');--> statement-breakpoint
CREATE TYPE "public"."media_catalog_item_status" AS ENUM('pending', 'ready', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."media_collection_scope" AS ENUM('home', 'catalog');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('movie', 'series', 'anime');--> statement-breakpoint
CREATE TABLE "catalog_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(100) NOT NULL,
	"status" "catalog_revision_status" DEFAULT 'staging' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "media_asset_kind" NOT NULL,
	"object_key" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_width_positive" CHECK ("media_assets"."width" > 0),
	CONSTRAINT "media_assets_height_positive" CHECK ("media_assets"."height" > 0),
	CONSTRAINT "media_assets_byte_size_positive" CHECK ("media_assets"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "media_catalog_items" (
	"revision_id" uuid NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"type" "media_type" NOT NULL,
	"title" varchar(300) NOT NULL,
	"original_title" varchar(300),
	"year" integer,
	"short_description" text,
	"genres" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"rating" double precision,
	"poster_asset_id" uuid,
	"backdrop_asset_id" uuid,
	"status" "media_catalog_item_status" DEFAULT 'pending' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_catalog_items_revision_id_media_ref_pk" PRIMARY KEY("revision_id","media_ref"),
	CONSTRAINT "media_catalog_items_title_not_blank" CHECK (length(btrim("media_catalog_items"."title")) > 0),
	CONSTRAINT "media_catalog_items_rating_range" CHECK ("media_catalog_items"."rating" is null or ("media_catalog_items"."rating" >= 0 and "media_catalog_items"."rating" <= 10))
);
--> statement-breakpoint
CREATE TABLE "media_collection_items" (
	"revision_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"media_ref" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_collection_items_collection_id_media_ref_pk" PRIMARY KEY("collection_id","media_ref"),
	CONSTRAINT "media_collection_items_position_positive" CHECK ("media_collection_items"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "media_collections" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"stable_id" varchar(100) NOT NULL,
	"scope" "media_collection_scope" NOT NULL,
	"type" "media_type",
	"title" varchar(200) NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_collections_id_revision_id_pk" PRIMARY KEY("id","revision_id"),
	CONSTRAINT "media_collections_title_not_blank" CHECK (length(btrim("media_collections"."title")) > 0),
	CONSTRAINT "media_collections_position_positive" CHECK ("media_collections"."position" > 0)
);
--> statement-breakpoint
ALTER TABLE "media_catalog_items" ADD CONSTRAINT "media_catalog_items_revision_id_catalog_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."catalog_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_catalog_items" ADD CONSTRAINT "media_catalog_items_poster_asset_id_media_assets_id_fk" FOREIGN KEY ("poster_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_catalog_items" ADD CONSTRAINT "media_catalog_items_backdrop_asset_id_media_assets_id_fk" FOREIGN KEY ("backdrop_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_collection_items" ADD CONSTRAINT "media_collection_items_collection_revision_fk" FOREIGN KEY ("collection_id","revision_id") REFERENCES "public"."media_collections"("id","revision_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_collection_items" ADD CONSTRAINT "media_collection_items_catalog_item_fk" FOREIGN KEY ("revision_id","media_ref") REFERENCES "public"."media_catalog_items"("revision_id","media_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_collections" ADD CONSTRAINT "media_collections_revision_id_catalog_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."catalog_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_revisions_single_published_index" ON "catalog_revisions" USING btree ("status") WHERE "catalog_revisions"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_object_key_unique" ON "media_assets" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_checksum_unique" ON "media_assets" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "media_catalog_items_revision_type_active_index" ON "media_catalog_items" USING btree ("revision_id","type","active");--> statement-breakpoint
CREATE UNIQUE INDEX "media_collection_items_collection_position_unique" ON "media_collection_items" USING btree ("collection_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "media_collections_revision_stable_id_unique" ON "media_collections" USING btree ("revision_id","stable_id");--> statement-breakpoint
CREATE INDEX "media_collections_revision_scope_type_active_position_index" ON "media_collections" USING btree ("revision_id","scope","type","active","position");