CREATE TABLE "profile_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"object_key" varchar(64) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_assets_mime_type_check" CHECK ("profile_assets"."mime_type" = 'image/webp'),
	CONSTRAINT "profile_assets_width_check" CHECK ("profile_assets"."width" = 512),
	CONSTRAINT "profile_assets_height_check" CHECK ("profile_assets"."height" = 512),
	CONSTRAINT "profile_assets_byte_size_positive" CHECK ("profile_assets"."byte_size" > 0),
	CONSTRAINT "profile_assets_checksum_format_check" CHECK ("profile_assets"."checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "profile_assets_object_key_unique" ON "profile_assets" USING btree ("object_key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_asset_id_profile_assets_id_fk" FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."profile_assets"("id") ON DELETE set null ON UPDATE no action;