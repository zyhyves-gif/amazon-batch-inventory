CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`store_name` text DEFAULT '' NOT NULL,
	`site` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_code_uq` ON `companies` (`code`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`incurred_date` text NOT NULL,
	`category` text NOT NULL,
	`amount_fen` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`incurred_date`);--> statement-breakpoint
CREATE INDEX `expenses_company_idx` ON `expenses` (`company_id`);--> statement-breakpoint
CREATE TABLE `factories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `factories_code_uq` ON `factories` (`code`);--> statement-breakpoint
CREATE TABLE `fifo_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`outbound_item_id` integer NOT NULL,
	`inbound_item_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost_fen` integer NOT NULL,
	`overridden` integer DEFAULT false NOT NULL,
	`override_reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fifo_allocations_outbound_idx` ON `fifo_allocations` (`outbound_item_id`);--> statement-breakpoint
CREATE INDEX `fifo_allocations_inbound_idx` ON `fifo_allocations` (`inbound_item_id`);--> statement-breakpoint
CREATE TABLE `inbound_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_no` text NOT NULL,
	`factory_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`inbound_date` text NOT NULL,
	`customs_mode` text DEFAULT '一般贸易' NOT NULL,
	`reference_no` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_batches_batch_no_uq` ON `inbound_batches` (`batch_no`);--> statement-breakpoint
CREATE INDEX `inbound_batches_date_idx` ON `inbound_batches` (`inbound_date`);--> statement-breakpoint
CREATE INDEX `inbound_batches_factory_idx` ON `inbound_batches` (`factory_id`);--> statement-breakpoint
CREATE TABLE `inbound_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`sku_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost_fen` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inbound_items_batch_idx` ON `inbound_items` (`batch_id`);--> statement-breakpoint
CREATE INDEX `inbound_items_sku_idx` ON `inbound_items` (`sku_id`);--> statement-breakpoint
CREATE TABLE `inventory_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text NOT NULL,
	`sku_id` integer NOT NULL,
	`inbound_item_id` integer NOT NULL,
	`node` text NOT NULL,
	`quantity_delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`event_type` text NOT NULL,
	`reference_type` text NOT NULL,
	`reference_id` integer NOT NULL,
	`operator_email` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_ledger_sku_idx` ON `inventory_ledger` (`sku_id`);--> statement-breakpoint
CREATE INDEX `inventory_ledger_item_idx` ON `inventory_ledger` (`inbound_item_id`);--> statement-breakpoint
CREATE INDEX `inventory_ledger_date_idx` ON `inventory_ledger` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `inventory_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inbound_item_id` integer NOT NULL,
	`node` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_nodes_item_node_uq` ON `inventory_nodes` (`inbound_item_id`,`node`);--> statement-breakpoint
CREATE INDEX `inventory_nodes_node_idx` ON `inventory_nodes` (`node`);--> statement-breakpoint
CREATE TABLE `outbound_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`outbound_order_id` integer NOT NULL,
	`sku_id` integer NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outbound_items_order_idx` ON `outbound_items` (`outbound_order_id`);--> statement-breakpoint
CREATE INDEX `outbound_items_sku_idx` ON `outbound_items` (`sku_id`);--> statement-breakpoint
CREATE TABLE `outbound_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_no` text NOT NULL,
	`target_company_id` integer NOT NULL,
	`outbound_date` text NOT NULL,
	`destination_node` text DEFAULT '运输中' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbound_orders_order_no_uq` ON `outbound_orders` (`order_no`);--> statement-breakpoint
CREATE INDEX `outbound_orders_date_idx` ON `outbound_orders` (`outbound_date`);--> statement-breakpoint
CREATE TABLE `sales_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sales_record_id` integer NOT NULL,
	`inbound_item_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost_fen` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sales_allocations_record_idx` ON `sales_allocations` (`sales_record_id`);--> statement-breakpoint
CREATE INDEX `sales_allocations_inbound_idx` ON `sales_allocations` (`inbound_item_id`);--> statement-breakpoint
CREATE TABLE `sales_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`sku_id` integer NOT NULL,
	`sale_date` text NOT NULL,
	`quantity` integer NOT NULL,
	`gross_revenue_fen` integer DEFAULT 0 NOT NULL,
	`fees_fen` integer DEFAULT 0 NOT NULL,
	`net_revenue_fen` integer DEFAULT 0 NOT NULL,
	`reference_no` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_records_reference_uq` ON `sales_records` (`reference_no`);--> statement-breakpoint
CREATE INDEX `sales_records_date_idx` ON `sales_records` (`sale_date`);--> statement-breakpoint
CREATE INDEX `sales_records_sku_idx` ON `sales_records` (`sku_id`);--> statement-breakpoint
CREATE TABLE `skus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`internal_sku` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '未分类' NOT NULL,
	`purchase_unit` text DEFAULT '件' NOT NULL,
	`safety_stock` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skus_internal_sku_uq` ON `skus` (`internal_sku`);--> statement-breakpoint
CREATE INDEX `skus_name_idx` ON `skus` (`name`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_code_uq` ON `suppliers` (`code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'finance' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);