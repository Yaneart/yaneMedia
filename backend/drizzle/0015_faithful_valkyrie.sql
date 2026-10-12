DROP INDEX "favorites_user_id_added_at_index";--> statement-breakpoint
CREATE INDEX "favorites_user_id_added_at_index" ON "favorites" USING btree ("user_id","added_at","media_ref");