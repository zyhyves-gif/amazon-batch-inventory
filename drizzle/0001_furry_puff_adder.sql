CREATE TABLE `import_run_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_run_id` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_key` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_run_items_entity_uq` ON `import_run_items` (`import_run_id`,`entity_type`,`entity_key`,`action`);--> statement-breakpoint
CREATE INDEX `import_run_items_run_idx` ON `import_run_items` (`import_run_id`);--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_key` text NOT NULL,
	`source_file` text NOT NULL,
	`prepared_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`factories_inserted` integer DEFAULT 0 NOT NULL,
	`skus_inserted` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`committed_at` text,
	`rolled_back_at` text,
	`rolled_back_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_runs_package_key_uq` ON `import_runs` (`package_key`);