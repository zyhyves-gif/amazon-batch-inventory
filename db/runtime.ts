import { env } from "cloudflare:workers";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'finance',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    store_name TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS factories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS skus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    internal_sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '未分类',
    purchase_unit TEXT NOT NULL DEFAULT '件',
    safety_stock INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS inbound_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_no TEXT NOT NULL UNIQUE,
    factory_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    inbound_date TEXT NOT NULL,
    customs_mode TEXT NOT NULL DEFAULT '一般贸易',
    reference_no TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS inbound_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    sku_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost_fen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inbound_item_id INTEGER NOT NULL,
    node TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(inbound_item_id, node)
  )`,
  `CREATE TABLE IF NOT EXISTS outbound_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL UNIQUE,
    target_company_id INTEGER NOT NULL,
    outbound_date TEXT NOT NULL,
    destination_node TEXT NOT NULL DEFAULT '运输中',
    status TEXT NOT NULL DEFAULT 'confirmed',
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS outbound_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outbound_order_id INTEGER NOT NULL,
    sku_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS fifo_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outbound_item_id INTEGER NOT NULL,
    inbound_item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost_fen INTEGER NOT NULL,
    overridden INTEGER NOT NULL DEFAULT 0,
    override_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    sku_id INTEGER NOT NULL,
    inbound_item_id INTEGER NOT NULL,
    node TEXT NOT NULL,
    quantity_delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id INTEGER NOT NULL,
    operator_email TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sales_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    sku_id INTEGER NOT NULL,
    sale_date TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    gross_revenue_fen INTEGER NOT NULL DEFAULT 0,
    fees_fen INTEGER NOT NULL DEFAULT 0,
    net_revenue_fen INTEGER NOT NULL DEFAULT 0,
    reference_no TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sales_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sales_record_id INTEGER NOT NULL,
    inbound_item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost_fen INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    incurred_date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_fen INTEGER NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS import_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_key TEXT NOT NULL UNIQUE,
    source_file TEXT NOT NULL,
    prepared_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    factories_inserted INTEGER NOT NULL DEFAULT 0,
    skus_inserted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    committed_at TEXT,
    rolled_back_at TEXT,
    rolled_back_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS import_run_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_run_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(import_run_id, entity_type, entity_key, action)
  )`,
  `CREATE INDEX IF NOT EXISTS inbound_batches_date_idx ON inbound_batches(inbound_date)`,
  `CREATE INDEX IF NOT EXISTS inbound_items_sku_idx ON inbound_items(sku_id)`,
  `CREATE INDEX IF NOT EXISTS inventory_nodes_node_idx ON inventory_nodes(node)`,
  `CREATE INDEX IF NOT EXISTS outbound_orders_date_idx ON outbound_orders(outbound_date)`,
  `CREATE INDEX IF NOT EXISTS fifo_allocations_outbound_idx ON fifo_allocations(outbound_item_id)`,
  `CREATE INDEX IF NOT EXISTS inventory_ledger_date_idx ON inventory_ledger(occurred_at)`,
  `CREATE INDEX IF NOT EXISTS inventory_ledger_sku_idx ON inventory_ledger(sku_id)`,
  `CREATE INDEX IF NOT EXISTS sales_allocations_record_idx ON sales_allocations(sales_record_id)`,
  `CREATE INDEX IF NOT EXISTS import_run_items_run_idx ON import_run_items(import_run_id)`,
] as const;

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error("数据库暂不可用，请确认站点已启用 DB 数据库。");
  }
  return env.DB;
}

export async function ensureSchema(): Promise<D1Database> {
  const db = getD1();
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));

  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO companies (code, name, store_name, site) VALUES (?, ?, ?, ?)",
      )
      .bind("GJ", "伽榕", "伽榕美国店", "美国"),
    db
      .prepare(
        "INSERT OR IGNORE INTO companies (code, name, store_name, site) VALUES (?, ?, ?, ?)",
      )
      .bind("KR", "康榕", "康榕店铺（待确认）", "待确认"),
    db
      .prepare(
        "INSERT OR IGNORE INTO companies (code, name, store_name, site) VALUES (?, ?, ?, ?)",
      )
      .bind("C3", "第三公司（待命名）", "待确认", "待确认"),
    db
      .prepare(
        "INSERT OR IGNORE INTO factories (code, name) VALUES (?, ?)",
      )
      .bind("FACT-A", "A 工厂"),
    db
      .prepare(
        "INSERT OR IGNORE INTO factories (code, name) VALUES (?, ?)",
      )
      .bind("FACT-B", "B 工厂"),
    db
      .prepare(
        "INSERT OR IGNORE INTO suppliers (code, name) VALUES (?, ?)",
      )
      .bind("SUP-UNKNOWN", "待确认供应商"),
  ]);

  return db;
}
