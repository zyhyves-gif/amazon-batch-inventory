import {
  ApiError,
  errorResponse,
  requireActor,
  requireRole,
} from "@/app/api/_lib/auth";

const allowedNodes = new Set([
  "国内仓可用",
  "运输中",
  "FBA接收中",
  "FBA可售",
]);

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(request);
    requireRole(actor, ["admin", "operator"]);
    const payload = (await request.json()) as {
      inboundItemId?: number;
      fromNode?: string;
      toNode?: string;
      quantity?: number;
      occurredAt?: string;
      note?: string;
    };

    const inboundItemId = positiveInteger(payload.inboundItemId);
    const quantity = positiveInteger(payload.quantity);
    const fromNode = clean(payload.fromNode);
    const toNode = clean(payload.toNode);
    const occurredAt = clean(payload.occurredAt);
    if (
      !inboundItemId ||
      !quantity ||
      !allowedNodes.has(fromNode) ||
      !allowedNodes.has(toNode) ||
      fromNode === toNode ||
      !isDate(occurredAt)
    ) {
      throw new ApiError(400, "请完整填写有效的库存节点转移信息。");
    }

    const source = await db
      .prepare(
        `SELECT n.quantity, ii.sku_id AS skuId,
                COALESCE(destination.quantity, 0) AS destinationQuantity
         FROM inventory_nodes n
         JOIN inbound_items ii ON ii.id = n.inbound_item_id
         LEFT JOIN inventory_nodes destination
           ON destination.inbound_item_id = n.inbound_item_id
          AND destination.node = ?
         WHERE n.inbound_item_id = ? AND n.node = ?`,
      )
      .bind(toNode, inboundItemId, fromNode)
      .first<{
        quantity: number;
        skuId: number;
        destinationQuantity: number;
      }>();

    if (!source || Number(source.quantity) < quantity) {
      throw new ApiError(409, `${fromNode}库存不足，无法完成本次转移。`);
    }

    const sourceBalance = Number(source.quantity) - quantity;
    const destinationBalance = Number(source.destinationQuantity) + quantity;
    await db.batch([
      db
        .prepare(
          `UPDATE inventory_nodes
           SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
           WHERE inbound_item_id = ? AND node = ? AND quantity >= ?`,
        )
        .bind(quantity, inboundItemId, fromNode, quantity),
      db
        .prepare(
          `INSERT INTO inventory_nodes
            (inbound_item_id, node, quantity, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(inbound_item_id, node) DO UPDATE SET
             quantity = quantity + excluded.quantity,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(inboundItemId, toNode, quantity),
      ledgerStatement(db).bind(
        `${occurredAt} 00:00:00`,
        source.skuId,
        inboundItemId,
        fromNode,
        -quantity,
        sourceBalance,
        "节点转出",
        "transfer",
        inboundItemId,
        actor.email,
        clean(payload.note) || `${fromNode} → ${toNode}`,
      ),
      ledgerStatement(db).bind(
        `${occurredAt} 00:00:00`,
        source.skuId,
        inboundItemId,
        toNode,
        quantity,
        destinationBalance,
        "节点转入",
        "transfer",
        inboundItemId,
        actor.email,
        clean(payload.note) || `${fromNode} → ${toNode}`,
      ),
    ]);

    return Response.json(
      { message: `已将 ${quantity} 件从${fromNode}转入${toNode}。` },
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

