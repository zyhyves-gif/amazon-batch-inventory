import {
  ApiError,
  errorResponse,
  requireActor,
  requireRole,
} from "@/app/api/_lib/auth";

type FactoryRow = {
  code?: string;
  name?: string;
};

type SkuRow = {
  internalSku?: string;
  name?: string;
  category?: string;
  purchaseUnit?: string;
  safetyStock?: number;
};

type MasterPackage = {
  action?: "preview" | "commit" | "rollback";
  packageKey?: string;
  sourceFile?: string;
  preparedAt?: string;
  factories?: FactoryRow[];
  skus?: SkuRow[];
  inventoryCommitBlocked?: boolean;
  blockReason?: string;
};

type NormalizedPackage = {
  packageKey: string;
  sourceFile: string;
  preparedAt: string;
  factories: Array<{ code: string; name: string }>;
  skus: Array<{
    internalSku: string;
    name: string;
    category: string;
    purchaseUnit: string;
    safetyStock: number;
  }>;
  inventoryCommitBlocked: boolean;
  blockReason: string;
};

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(request);
    const payload = (await request.json()) as MasterPackage;
    const action = payload.action || "preview";

    if (action === "rollback") {
      requireRole(actor, ["admin"]);
      const packageKey = clean(payload.packageKey);
      if (!packageKey) throw new ApiError(400, "缺少导入包编号。");
      return Response.json(await rollbackPackage(db, packageKey, actor.email));
    }

    requireRole(actor, ["admin", "operator"]);
    const prepared = normalizePackage(payload);
    const preview = await previewPackage(db, prepared);

    if (action === "preview") {
      return Response.json(preview);
    }
    if (action !== "commit") {
      throw new ApiError(400, "不支持的导入操作。");
    }

    if (preview.runStatus === "committed") {
      return Response.json({
        ...preview,
        message: "这份主数据导入包已经写入过，系统已自动跳过重复导入。",
      });
    }

    await createOrResumeRun(db, prepared, actor.email);
    const statements: D1PreparedStatement[] = [];

    for (const factory of prepared.factories) {
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO import_run_items
              (import_run_id, entity_type, entity_key, action)
             SELECT id, 'factory', ?, 'inserted'
             FROM import_runs
             WHERE package_key = ?
               AND NOT EXISTS (SELECT 1 FROM factories WHERE code = ?)`,
          )
          .bind(factory.code, prepared.packageKey, factory.code),
        db
          .prepare(
            `INSERT OR IGNORE INTO factories (code, name, contact, active)
             VALUES (?, ?, '历史数据整理导入', 1)`,
          )
          .bind(factory.code, factory.name),
      );
    }

    for (const sku of prepared.skus) {
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO import_run_items
              (import_run_id, entity_type, entity_key, action)
             SELECT id, 'sku', ?, 'inserted'
             FROM import_runs
             WHERE package_key = ?
               AND NOT EXISTS (
                 SELECT 1 FROM skus WHERE internal_sku = ?
               )`,
          )
          .bind(sku.internalSku, prepared.packageKey, sku.internalSku),
        db
          .prepare(
            `INSERT OR IGNORE INTO skus
              (internal_sku, name, category, purchase_unit, safety_stock, active)
             VALUES (?, ?, ?, ?, ?, 1)`,
          )
          .bind(
            sku.internalSku,
            sku.name,
            sku.category,
            sku.purchaseUnit,
            sku.safetyStock,
          ),
      );
    }

    for (let index = 0; index < statements.length; index += 80) {
      await db.batch(statements.slice(index, index + 80));
    }

    const inserted = await insertedCounts(db, prepared.packageKey);
    await db
      .prepare(
        `UPDATE import_runs
         SET status = 'committed',
             factories_inserted = ?,
             skus_inserted = ?,
             committed_at = CURRENT_TIMESTAMP
         WHERE package_key = ?`,
      )
      .bind(inserted.factories, inserted.skus, prepared.packageKey)
      .run();

    return Response.json({
      ...(await previewPackage(db, prepared)),
      inserted,
      message: `主数据已写入：新增工厂 ${inserted.factories} 个，新增SKU ${inserted.skus} 个；库存数量仍为0。`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function previewPackage(db: D1Database, prepared: NormalizedPackage) {
  const [factoryRows, skuRows, run] = await Promise.all([
    db.prepare("SELECT code FROM factories WHERE active = 1").all<{ code: string }>(),
    db
      .prepare("SELECT internal_sku AS internalSku FROM skus WHERE active = 1")
      .all<{ internalSku: string }>(),
    db
      .prepare(
        `SELECT status, factories_inserted AS factoriesInserted,
                skus_inserted AS skusInserted, committed_at AS committedAt,
                rolled_back_at AS rolledBackAt
         FROM import_runs WHERE package_key = ?`,
      )
      .bind(prepared.packageKey)
      .first<{
        status: string;
        factoriesInserted: number;
        skusInserted: number;
        committedAt: string | null;
        rolledBackAt: string | null;
      }>(),
  ]);

  const existingFactories = new Set(factoryRows.results.map((row) => row.code));
  const existingSkus = new Set(skuRows.results.map((row) => row.internalSku));
  const factoryExisting = prepared.factories.filter((row) =>
    existingFactories.has(row.code),
  ).length;
  const skuExisting = prepared.skus.filter((row) =>
    existingSkus.has(row.internalSku),
  ).length;

  return {
    valid: true,
    packageKey: prepared.packageKey,
    sourceFile: prepared.sourceFile,
    preparedAt: prepared.preparedAt,
    factories: {
      total: prepared.factories.length,
      existing: factoryExisting,
      new: prepared.factories.length - factoryExisting,
    },
    skus: {
      total: prepared.skus.length,
      existing: skuExisting,
      new: prepared.skus.length - skuExisting,
    },
    inventory: {
      willWriteQuantity: false,
      blocked: prepared.inventoryCommitBlocked,
      reason: prepared.blockReason,
    },
    runStatus: run?.status || "not_started",
    previousRun: run || null,
  };
}

async function createOrResumeRun(
  db: D1Database,
  prepared: NormalizedPackage,
  email: string,
) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO import_runs
        (package_key, source_file, prepared_at, status, created_by)
       VALUES (?, ?, ?, 'pending', ?)`,
    )
    .bind(
      prepared.packageKey,
      prepared.sourceFile,
      prepared.preparedAt,
      email,
    )
    .run();

  const run = await db
    .prepare("SELECT id, status FROM import_runs WHERE package_key = ?")
    .bind(prepared.packageKey)
    .first<{ id: number; status: string }>();

  if (!run) throw new ApiError(500, "无法建立导入记录。");
  if (run.status === "rolled_back") {
    await db.batch([
      db.prepare("DELETE FROM import_run_items WHERE import_run_id = ?").bind(run.id),
      db
        .prepare(
          `UPDATE import_runs
           SET status = 'pending', factories_inserted = 0, skus_inserted = 0,
               committed_at = NULL, rolled_back_at = NULL, rolled_back_by = NULL
           WHERE id = ?`,
        )
        .bind(run.id),
    ]);
  }
}

async function insertedCounts(db: D1Database, packageKey: string) {
  const rows = await db
    .prepare(
      `SELECT entity_type AS entityType, COUNT(*) AS count
       FROM import_run_items items
       JOIN import_runs runs ON runs.id = items.import_run_id
       WHERE runs.package_key = ? AND items.action = 'inserted'
       GROUP BY entity_type`,
    )
    .bind(packageKey)
    .all<{ entityType: string; count: number }>();

  const counts = { factories: 0, skus: 0 };
  for (const row of rows.results) {
    if (row.entityType === "factory") counts.factories = Number(row.count);
    if (row.entityType === "sku") counts.skus = Number(row.count);
  }
  return counts;
}

async function rollbackPackage(
  db: D1Database,
  packageKey: string,
  email: string,
) {
  const run = await db
    .prepare("SELECT id, status FROM import_runs WHERE package_key = ?")
    .bind(packageKey)
    .first<{ id: number; status: string }>();
  if (!run) throw new ApiError(404, "没有找到这次导入记录。");
  if (run.status !== "committed") {
    throw new ApiError(400, "只有已完成的导入记录可以撤销。");
  }

  const items = await db
    .prepare(
      `SELECT entity_type AS entityType, entity_key AS entityKey
       FROM import_run_items
       WHERE import_run_id = ? AND action = 'inserted'
       ORDER BY id DESC`,
    )
    .bind(run.id)
    .all<{ entityType: string; entityKey: string }>();

  const statements: D1PreparedStatement[] = [];
  for (const item of items.results) {
    if (item.entityType === "sku") {
      statements.push(
        db
          .prepare(
            `DELETE FROM skus
             WHERE internal_sku = ?
               AND NOT EXISTS (
                 SELECT 1 FROM inbound_items
                 WHERE sku_id = skus.id
               )
               AND NOT EXISTS (
                 SELECT 1 FROM sales_records
                 WHERE sku_id = skus.id
               )`,
          )
          .bind(item.entityKey),
      );
    }
    if (item.entityType === "factory") {
      statements.push(
        db
          .prepare(
            `DELETE FROM factories
             WHERE code = ?
               AND NOT EXISTS (
                 SELECT 1 FROM inbound_batches
                 WHERE factory_id = factories.id
               )`,
          )
          .bind(item.entityKey),
      );
    }
  }
  for (let index = 0; index < statements.length; index += 80) {
    await db.batch(statements.slice(index, index + 80));
  }
  await db
    .prepare(
      `UPDATE import_runs
       SET status = 'rolled_back', rolled_back_at = CURRENT_TIMESTAMP,
           rolled_back_by = ?
       WHERE id = ?`,
    )
    .bind(email, run.id)
    .run();

  return {
    message:
      "本次新增且尚未被业务单据使用的工厂和SKU已撤销；已被入库或销售引用的数据会安全保留。",
  };
}

function normalizePackage(payload: MasterPackage): NormalizedPackage {
  const packageKey = clean(payload.packageKey);
  const sourceFile = clean(payload.sourceFile);
  const preparedAt = clean(payload.preparedAt);
  if (!/^[a-z0-9][a-z0-9._-]{7,119}$/i.test(packageKey)) {
    throw new ApiError(400, "导入包编号格式不正确。");
  }
  if (!sourceFile || sourceFile.length > 160) {
    throw new ApiError(400, "来源文件名称不正确。");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preparedAt)) {
    throw new ApiError(400, "整理日期格式不正确。");
  }
  if (!Array.isArray(payload.factories) || !Array.isArray(payload.skus)) {
    throw new ApiError(400, "导入包缺少工厂或SKU数据。");
  }
  if (payload.factories.length > 1000 || payload.skus.length > 5000) {
    throw new ApiError(400, "单次导入数据量过大，请拆分后再试。");
  }

  const factories = payload.factories.map((row) => ({
    code: clean(row.code).toUpperCase(),
    name: clean(row.name),
  }));
  const skus = payload.skus.map((row) => ({
    internalSku: clean(row.internalSku).toUpperCase(),
    name: clean(row.name),
    category: clean(row.category) || "未分类",
    purchaseUnit: clean(row.purchaseUnit) || "件",
    safetyStock: Math.max(0, Math.trunc(Number(row.safetyStock) || 0)),
  }));

  if (
    factories.some(
      (row) =>
        !/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(row.code) ||
        !row.name ||
        row.name.length > 120,
    )
  ) {
    throw new ApiError(400, "工厂编码或名称存在空值、超长或非法字符。");
  }
  if (
    skus.some(
      (row) =>
        !row.internalSku ||
        row.internalSku.length > 80 ||
        !row.name ||
        row.name.length > 200,
    )
  ) {
    throw new ApiError(400, "SKU编号或商品名称存在空值或超长内容。");
  }
  if (new Set(factories.map((row) => row.code)).size !== factories.length) {
    throw new ApiError(400, "导入包内存在重复工厂编码。");
  }
  if (new Set(skus.map((row) => row.internalSku)).size !== skus.length) {
    throw new ApiError(400, "导入包内存在重复SKU编号。");
  }

  return {
    packageKey,
    sourceFile,
    preparedAt,
    factories,
    skus,
    inventoryCommitBlocked: payload.inventoryCommitBlocked !== false,
    blockReason:
      clean(payload.blockReason) ||
      "库存数量仍需业务确认，本次只导入主数据。",
  };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
