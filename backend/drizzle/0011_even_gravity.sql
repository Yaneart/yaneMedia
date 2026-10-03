CREATE TEMP TABLE "_media_ref_migration" (
	"source_media_ref" varchar(320) PRIMARY KEY,
	"canonical_media_ref" varchar(64) NOT NULL
) ON COMMIT DROP;--> statement-breakpoint
WITH RECURSIVE "redirects" AS (
	SELECT "media_ref" AS "source_media_ref", "media_ref" AS "canonical_media_ref", "redirect_media_ref", 0 AS "depth"
	FROM "media_works"
	UNION ALL
	SELECT "redirects"."source_media_ref", "target"."media_ref", "target"."redirect_media_ref", "redirects"."depth" + 1
	FROM "redirects"
	INNER JOIN "media_works" "target" ON "target"."media_ref" = "redirects"."redirect_media_ref"
	WHERE "redirects"."redirect_media_ref" IS NOT NULL AND "redirects"."depth" < 16
), "canonical_works" AS (
	SELECT DISTINCT ON ("source_media_ref") "source_media_ref", "canonical_media_ref"
	FROM "redirects"
	ORDER BY "source_media_ref", "depth" DESC
)
INSERT INTO "_media_ref_migration" ("source_media_ref", "canonical_media_ref")
SELECT "source_media_ref", "canonical_media_ref" FROM "canonical_works"
UNION
SELECT "works"."slug", "canonical"."canonical_media_ref"
FROM "media_works" "works"
INNER JOIN "canonical_works" "canonical" ON "canonical"."source_media_ref" = "works"."media_ref"
UNION
SELECT "aliases"."namespace" || ':' || "aliases"."value", "canonical"."canonical_media_ref"
FROM "media_work_aliases" "aliases"
INNER JOIN "canonical_works" "canonical" ON "canonical"."source_media_ref" = "aliases"."media_ref"
ON CONFLICT ("source_media_ref") DO NOTHING;--> statement-breakpoint
INSERT INTO "favorites" ("user_id", "media_ref", "added_at")
SELECT "favorites"."user_id", "mapping"."canonical_media_ref", max("favorites"."added_at")
FROM "favorites"
INNER JOIN "_media_ref_migration" "mapping" ON "mapping"."source_media_ref" = "favorites"."media_ref"
GROUP BY "favorites"."user_id", "mapping"."canonical_media_ref"
ON CONFLICT ("user_id", "media_ref") DO UPDATE SET "added_at" = greatest("favorites"."added_at", excluded."added_at");--> statement-breakpoint
DELETE FROM "favorites" USING "_media_ref_migration" "mapping"
WHERE "favorites"."media_ref" = "mapping"."source_media_ref"
	AND "favorites"."media_ref" <> "mapping"."canonical_media_ref";--> statement-breakpoint
INSERT INTO "history_items" ("user_id", "media_ref", "opened_at")
SELECT "history_items"."user_id", "mapping"."canonical_media_ref", max("history_items"."opened_at")
FROM "history_items"
INNER JOIN "_media_ref_migration" "mapping" ON "mapping"."source_media_ref" = "history_items"."media_ref"
GROUP BY "history_items"."user_id", "mapping"."canonical_media_ref"
ON CONFLICT ("user_id", "media_ref") DO UPDATE SET "opened_at" = greatest("history_items"."opened_at", excluded."opened_at");--> statement-breakpoint
DELETE FROM "history_items" USING "_media_ref_migration" "mapping"
WHERE "history_items"."media_ref" = "mapping"."source_media_ref"
	AND "history_items"."media_ref" <> "mapping"."canonical_media_ref";--> statement-breakpoint
INSERT INTO "continue_watching_items" (
	"user_id", "media_ref", "source_ref", "season_number", "episode_number",
	"absolute_episode_number", "position_seconds", "duration_seconds", "updated_at"
)
SELECT DISTINCT ON ("items"."user_id", "mapping"."canonical_media_ref")
	"items"."user_id", "mapping"."canonical_media_ref", "items"."source_ref",
	"items"."season_number", "items"."episode_number", "items"."absolute_episode_number",
	"items"."position_seconds", "items"."duration_seconds", "items"."updated_at"
FROM "continue_watching_items" "items"
INNER JOIN "_media_ref_migration" "mapping" ON "mapping"."source_media_ref" = "items"."media_ref"
ORDER BY "items"."user_id", "mapping"."canonical_media_ref", "items"."updated_at" DESC, "items"."media_ref" ASC
ON CONFLICT ("user_id", "media_ref") DO UPDATE SET
	"source_ref" = excluded."source_ref",
	"season_number" = excluded."season_number",
	"episode_number" = excluded."episode_number",
	"absolute_episode_number" = excluded."absolute_episode_number",
	"position_seconds" = excluded."position_seconds",
	"duration_seconds" = excluded."duration_seconds",
	"updated_at" = excluded."updated_at"
WHERE excluded."updated_at" > "continue_watching_items"."updated_at";--> statement-breakpoint
DELETE FROM "continue_watching_items" USING "_media_ref_migration" "mapping"
WHERE "continue_watching_items"."media_ref" = "mapping"."source_media_ref"
	AND "continue_watching_items"."media_ref" <> "mapping"."canonical_media_ref";--> statement-breakpoint
ALTER TABLE "continue_watching_items" ADD CONSTRAINT "continue_watching_items_media_ref_media_works_media_ref_fk" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_media_ref_media_works_media_ref_fk" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "history_items" ADD CONSTRAINT "history_items_media_ref_media_works_media_ref_fk" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE no action ON UPDATE no action NOT VALID;
