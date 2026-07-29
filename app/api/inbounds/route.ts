import {
  ApiError,
  errorResponse,
  requireActor,
  requireRole,
} from "@/app/api/_lib/auth";

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(request);
    requireRole(actor, ["admin", "operator"]);
    const payload = (await request.json()) as {
      batchNo?: string;
      factoryId?: number;
      supplierId?: number;
      inboundDate?: string;
      customsMode?: string;
      referenceNo?: string;
      notes?: string;
      skuId?: number;
      quantity?: number;
      unitCost?: number;
    };

    const batchNo = clean(payload.batchNo).toUpperCase();
    const inboundDate = clean(payload.inboundDate);
    const factoryId = positiveInteger(payload.factoryId);
    const supplierId = positiveInteger(payload.supplierId);
    const skuId = positiveInteger(payload.skuId);
    const quantity = positiveInteger(payload.quantity);
    const unitCostFen = Math.round(Number(payload.unitCost ?? 0) * 100);

    if (
      !batchNo ||
      !isDate(inboundDate) ||
      !factoryId ||
      !supplierId ||
      !skuId ||
      !quantity
    ) {
      throw new ApiError(400, "请完整填写批次、日期、工厂、供应商、SKU和数量。");
    }
    if (!Number.isFinite(unitCostFen) || unitCostFen < 0) {
      throw new ApiError(400, "采购单价格式不正确。");
    }

    const batchResult = await db
      .prepare(
        `INSERT INTO inbound_batches
          (batch_no, factory_id, supplier_id, inbound_date, customs_mode,
           reference_no, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?)`,
      )
      .bind(
        batchNo,
        factoryId,
        supplierId,
        inboundDate,
        clean(payload.customsMode) || "一般贸易",
        clean(payload.referenceNo),
        clean(payload.notes),
        actor.email,
      )
      .run();
    const batchId = Number(batchResult.meta.last_row_id);

    const itemResult = await db
      .prepare(
        `INSERT INTO inbound_items (batch_id, sku_id, quantity, unit_cost_fen)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(batchId, skuId, quantity, unitCostFen)
      .run();
    const inboundItemId = Number(itemResult.meta.last_row_id);

    await db.batch([
      db
        .prepare(
          `INSERT INTO inventory_nodes (inbound_item_id, node, quantity)
           VALUES (?, '国内仓可用', ?)`,
        )
        .bind(inboundItemId, quantity),
      db
        .prepare(
          `INSERT INTO inventory_ledger
            (occurred_at, sku_id, inbound_item_id, node, quantity_delta,
             balance_after, event_type, reference_type, reference_id,
             operator_email, note)
           VALUES (?, ?, ?, '国内仓可用', ?, ?, '入库确认', 'inbound', ?, ?, ?)`,
        )
        .bind(
          `${inboundDate} 00:00:00`,
          skuId,
          inboundItemId,
          quantity,
          quantity,
          batchId,
          actor.email,
          `批次 ${batchNo}`,
        ),
      db
        .prepare("UPDATE inbound_batches SET status = 'confirmed' WHERE id = ?")
        .bind(batchId),
    ]);

    return Response.json(
      { id: batchId, message: "入库已确认并写入库存流水。" },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

