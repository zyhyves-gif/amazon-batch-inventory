import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["admin", "operator", "finance"] })
      .notNull()
      .default("finance"),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    storeName: text("store_name").notNull().default(""),
    site: text("site").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [uniqueIndex("companies_code_uq").on(table.code)],
);

export const factories = sqliteTable(
  "factories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contact: text("contact").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [uniqueIndex("factories_code_uq").on(table.code)],
);

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contact: text("contact").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [uniqueIndex("suppliers_code_uq").on(table.code)],
);

export const skus = sqliteTable(
  "skus",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    internalSku: text("internal_sku").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("未分类"),
    purchaseUnit: text("purchase_unit").notNull().default("件"),
    safetyStock: integer("safety_stock").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("skus_internal_sku_uq").on(table.internalSku),
    index("skus_name_idx").on(table.name),
  ],
);

export const inboundBatches = sqliteTable(
  "inbound_batches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batchNo: text("batch_no").notNull(),
    factoryId: integer("factory_id").notNull(),
    supplierId: integer("supplier_id").notNull(),
    inboundDate: text("inbound_date").notNull(),
    customsMode: text("customs_mode").notNull().default("一般贸易"),
    referenceNo: text("reference_no").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status", { enum: ["processing", "confirmed", "cancelled"] })
      .notNull()
      .default("confirmed"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("inbound_batches_batch_no_uq").on(table.batchNo),
    index("inbound_batches_date_idx").on(table.inboundDate),
    index("inbound_batches_factory_idx").on(table.factoryId),
  ],
);

export const inboundItems = sqliteTable(
  "inbound_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batchId: integer("batch_id").notNull(),
    skuId: integer("sku_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitCostFen: integer("unit_cost_fen").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("inbound_items_batch_idx").on(table.batchId),
    index("inbound_items_sku_idx").on(table.skuId),
  ],
);

export const inventoryNodes = sqliteTable(
  "inventory_nodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inboundItemId: integer("inbound_item_id").notNull(),
    node: text("node").notNull(),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("inventory_nodes_item_node_uq").on(
      table.inboundItemId,
      table.node,
    ),
    index("inventory_nodes_node_idx").on(table.node),
  ],
);

export const outboundOrders = sqliteTable(
  "outbound_orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderNo: text("order_no").notNull(),
    targetCompanyId: integer("target_company_id").notNull(),
    outboundDate: text("outbound_date").notNull(),
    destinationNode: text("destination_node").notNull().default("运输中"),
    status: text("status", { enum: ["processing", "confirmed", "cancelled"] })
      .notNull()
      .default("confirmed"),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("outbound_orders_order_no_uq").on(table.orderNo),
    index("outbound_orders_date_idx").on(table.outboundDate),
  ],
);

export const outboundItems = sqliteTable(
  "outbound_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    outboundOrderId: integer("outbound_order_id").notNull(),
    skuId: integer("sku_id").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    index("outbound_items_order_idx").on(table.outboundOrderId),
    index("outbound_items_sku_idx").on(table.skuId),
  ],
);

export const fifoAllocations = sqliteTable(
  "fifo_allocations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    outboundItemId: integer("outbound_item_id").notNull(),
    inboundItemId: integer("inbound_item_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitCostFen: integer("unit_cost_fen").notNull(),
    overridden: integer("overridden", { mode: "boolean" })
      .notNull()
      .default(false),
    overrideReason: text("override_reason").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("fifo_allocations_outbound_idx").on(table.outboundItemId),
    index("fifo_allocations_inbound_idx").on(table.inboundItemId),
  ],
);

export const inventoryLedger = sqliteTable(
  "inventory_ledger",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    occurredAt: text("occurred_at").notNull(),
    skuId: integer("sku_id").notNull(),
    inboundItemId: integer("inbound_item_id").notNull(),
    node: text("node").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    eventType: text("event_type").notNull(),
    referenceType: text("reference_type").notNull(),
    referenceId: integer("reference_id").notNull(),
    operatorEmail: text("operator_email").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("inventory_ledger_sku_idx").on(table.skuId),
    index("inventory_ledger_item_idx").on(table.inboundItemId),
    index("inventory_ledger_date_idx").on(table.occurredAt),
  ],
);

export const salesRecords = sqliteTable(
  "sales_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id").notNull(),
    skuId: integer("sku_id").notNull(),
    saleDate: text("sale_date").notNull(),
    quantity: integer("quantity").notNull(),
    grossRevenueFen: integer("gross_revenue_fen").notNull().default(0),
    feesFen: integer("fees_fen").notNull().default(0),
    netRevenueFen: integer("net_revenue_fen").notNull().default(0),
    referenceNo: text("reference_no").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("sales_records_reference_uq").on(table.referenceNo),
    index("sales_records_date_idx").on(table.saleDate),
    index("sales_records_sku_idx").on(table.skuId),
  ],
);

export const salesAllocations = sqliteTable(
  "sales_allocations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    salesRecordId: integer("sales_record_id").notNull(),
    inboundItemId: integer("inbound_item_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitCostFen: integer("unit_cost_fen").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("sales_allocations_record_idx").on(table.salesRecordId),
    index("sales_allocations_inbound_idx").on(table.inboundItemId),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id").notNull(),
    incurredDate: text("incurred_date").notNull(),
    category: text("category").notNull(),
    amountFen: integer("amount_fen").notNull(),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("expenses_date_idx").on(table.incurredDate),
    index("expenses_company_idx").on(table.companyId),
  ],
);

export const importRuns = sqliteTable(
  "import_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    packageKey: text("package_key").notNull(),
    sourceFile: text("source_file").notNull(),
    preparedAt: text("prepared_at").notNull(),
    status: text("status", {
      enum: ["pending", "committed", "rolled_back"],
    })
      .notNull()
      .default("pending"),
    factoriesInserted: integer("factories_inserted").notNull().default(0),
    skusInserted: integer("skus_inserted").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    committedAt: text("committed_at"),
    rolledBackAt: text("rolled_back_at"),
    rolledBackBy: text("rolled_back_by"),
  },
  (table) => [uniqueIndex("import_runs_package_key_uq").on(table.packageKey)],
);

export const importRunItems = sqliteTable(
  "import_run_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    importRunId: integer("import_run_id").notNull(),
    entityType: text("entity_type", { enum: ["factory", "sku"] }).notNull(),
    entityKey: text("entity_key").notNull(),
    action: text("action", { enum: ["inserted"] }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("import_run_items_entity_uq").on(
      table.importRunId,
      table.entityType,
      table.entityKey,
      table.action,
    ),
    index("import_run_items_run_idx").on(table.importRunId),
  ],
);
