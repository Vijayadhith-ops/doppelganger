CREATE TABLE `admin_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participant_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`participant_code` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submission_keys` (
	`client_id` text PRIMARY KEY NOT NULL,
	`participant_code` text NOT NULL,
	`created_at` text NOT NULL
);
