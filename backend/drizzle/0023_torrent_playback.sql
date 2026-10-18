CREATE TABLE "torrent_session_probes" (
	"session_id" varchar(40) PRIMARY KEY NOT NULL,
	"file_ref" varchar(37) NOT NULL,
	"probe" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "torrent_sessions" ADD COLUMN "selected_audio_track_ref" varchar(40);--> statement-breakpoint
ALTER TABLE "torrent_sessions" ADD COLUMN "playback_position_seconds" double precision;--> statement-breakpoint
ALTER TABLE "torrent_session_probes" ADD CONSTRAINT "torrent_session_probes_session_id_torrent_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."torrent_sessions"("session_id") ON DELETE cascade ON UPDATE no action;
