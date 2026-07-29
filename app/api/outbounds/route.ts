import {
  ApiError,
  errorResponse,
  requireActor,
  requireRole,
} from "@/app/api/_lib/auth";

type Candidate = {
  inboundItemId: number;
  batchNo: string;
  factoryName: string;
  unitCostFen: number;
  available: number;
  destinationQuantity: number;
};

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(request);
    requireRole(actor, ["admin", "operator"]);
    const payload = (await request.json()) as {
      orderNo?: string;
      targetCompanyId?: number;
      outboundDate?: string;
      destinationNode?: string;
      notes?: string;
      skuId?: number;
      quantity?: number;
    };

    const orderNo = clean(payload.orderNo).toUpperCase();
    const outboundDate = clean(payload.outboundDate);
    const targetCompanyId = positiveInteger(payload.targetCompanyId);
    const skuId = positiveInteger(payload.skuId);
    const quantity = positiveInteger(payload.quantity);
    const destinationNode = clean(payload.destinationNode) || "运输中";

    if (
      !orderNo ||
      !isDate(outboundDate) ||
      !targetCompanyId ||
      !skuId ||
      !quantity
    ) {
      throw new ApiError(400, "请完整填写出库单号、日期、公司、SKU和数量。");
    }

    const candidateResult = await db
      .prepare(
        `SELECT ii.id AS inboundItemId, b.batch_no AS batchNo,
                f.name AS factoryName, ii.unit_cost_fen AS unitCostFen,
                source.quantity AS available,
                COALESCE(destination.quantity, 0) AS destinationQuantity
         FROM inbound_items ii
         JOIN inbound_batches b ON b.id = ii.batch_id AND b.status = 'confirmed'
         JOIN factories f ON f.id = b.factory_id
         JOIN inventory_nodes source
           ON source.inbound_item_id = ii.id
          AND source.node = '国内仓可用'
          AND source.quantity > 0
         LEFT JOIN inventory_nodes destination
           ON destination.inbound_item_id = ii.id
          AND destination.node = ?
         WHERE ii.sku_id = ?
         ORDER BY b.inbound_date ASC, ii.id ASC`,
      )
      .bind(destinationNode, skuId)
      .all<Candidate>();
    const candidates = candidateResult.results;
    const available = candidates.reduce(
      (sum, item) => sum + Number(item.available),
      0,
    );

    if (available < quantity) {
      throw new ApiError(
        409,
        `国内仓可用库存不足：需要 ${quantity}，当前只有 ${available}。`,
      );
    }

    const orderResult = await db
      .prepare(
        `INSERT INTO outbound_orders
          (order_no, target_company_id, outbound_date, destination_node,
           status, notes, created_by)
         VALUES (?, ?, ?, ?, 'processing', ?, ?)`,
      )
      .bind(
        orderNo,
        targetCompanyId,
        outboundDate,
        destinationNode,
        clean(payload.notes),
        actor.email,
      )
      .run();
    const orderId = Number(orderResult.meta.last_row_id);

    const itemResult = await db
      .prepare(
        `INSERT INTO outbound_items (outbound_order_id, sku_id, quantity)
         VALUES (?, ?, ?)`,
      )
      .bind(orderId, skuId, quantity)
      .run();
    const outboundItemId = Number(itemResult.meta.last_row_id);

    let remaining = quantity;
    const allocations: Array<Candidate & { allocated: number }> = [];
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const allocated = Math.min(remaining, Number(candidate.available));
      allocations.push({ ...candidate, allocated });
      remaining -= allocated;
    }

    const statements: D1PreparedStatement[] = [];
    for (const allocation of allocations) {
      const sourceBalance = Number(allocation.available) - allocation.allocated;
      const destinationBalance =
        Number(allocation.destinationQuantity) + allocation.allocated;
      statements.push(
        db
          .prepare(
            `UPDATE inventory_nodes
             SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
             WHERE inbound_item_id = ? AND node = '国内仓可用' AND quantity >= ?`,
          )
          .bind(
            allocation.allocated,
            allocation.inboundItemId,
            allocation.allocated,
          ),
        db
          .prepare(
            `INSERT INTO inventory_nodes
              (inbound_item_id, node, quantity, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(inbound_item_id, node) DO UPDATE SET
               quantity = quantity + excluded.quantity,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            allocation.inboundItemId,
            destinationNode,
            allocation.allocated,
          ),
        db
          .prepare(
            `INSERT INTO fifo_allocations
              (outbound_item_id, inbound_item_id, quantity, unit_cost_fen)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(
            outboundItemId,
            allocation.inboundItemId,
            allocation.allocated,
            allocation.unitCostFen,
          ),
        ledgerStatement(db).bind(
          `${outboundDate} 00:00:00`,
          skuId,
          allocation.inboundItemId,
          "国内仓可用",
          -allocation.allocated,
          sourceBalance,
          "出库确认",
          "outbound",
          orderId,
          actor.email,
          `出库单 ${orderNo}`,
        ),
        ledgerStatement(db).bind(
          `${outboundDate} 00:00:00`,
          skuId,
          allocation.inboundItemId,
          destinationNode,
          allocation.allocated,
          destinationBalance,
          "节点转入",
          "outbound",
          orderId,
          actor.email,
          `出库单 ${orderNo}`,
        ),
      );
    }
    statements.push(
      db
        .prepare("UPDATE outbound_orders SET status = 'confirmed' WHERE id = ?")
        .bind(orderId),
    );
    await db.batch(statements);

    return Response.json(
      {
        id: orderId,
        message: "出库已确认，系统已按FIFO分配批次并更新库存节点。",
        allocations: allocations.map((item) => ({
          batchNo: item.batchNo,
          factoryName: item.factoryName,
          quantity: item.allocated,
          unitCostFen: item.unitCostFen,
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function ledgerStatement(db: D1Database) {
  return db.prepare(
    `INSERT INTO inventory_ledger
      (occurred_at, sku_id, inbound_item_id, node, quantity_delta,
       balance_after, event_type, reference_type, reference_id,
       operator_email, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
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

