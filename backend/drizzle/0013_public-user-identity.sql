ALTER TABLE "users" ADD COLUMN "handle" varchar(30);--> statement-breakpoint
CREATE FUNCTION "public"."migration_0013_uuid_handle"("user_id" uuid) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
	"alphabet" constant text := '0123456789abcdefghjkmnpqrstvwxyz';
	"bytes" bytea := uuid_send("user_id");
	"encoded" text := '';
	"remaining" numeric := 0;
	"index" integer;
BEGIN
	FOR "index" IN 0..15 LOOP
		"remaining" := "remaining" * 256 + get_byte("bytes", "index");
	END LOOP;

	FOR "index" IN 1..26 LOOP
		"encoded" := substr("alphabet", mod("remaining", 32)::integer + 1, 1) || "encoded";
		"remaining" := div("remaining", 32);
	END LOOP;

	RETURN 'u_' || "encoded";
END;
$$;--> statement-breakpoint
UPDATE "users" SET "handle" = "public"."migration_0013_uuid_handle"("id");--> statement-breakpoint
DROP FUNCTION "public"."migration_0013_uuid_handle"(uuid);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "handle" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" varchar(300) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ratings_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "favorites_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_unique" ON "users" USING btree (lower("handle"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_handle_format_check" CHECK ("users"."handle" = lower("users"."handle") and "users"."handle" ~ '^[a-z0-9_]{3,30}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_handle_not_reserved_check" CHECK ("users"."handle" not in ('admin', 'anime', 'api', 'auth', 'collections', 'comments', 'continue-watching', 'favorites', 'forgot-password', 'health', 'history', 'login', 'media', 'movies', 'profile', 'profile-assets', 'profiles', 'register', 'reports', 'reset-password', 'reviews', 'search', 'series', 'settings', 'u', 'users', 'verify-email'));
