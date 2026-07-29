import {
  ApiError,
  errorResponse,
  requireActor,
  requireRole,
} from "@/app/api/_lib/auth";

type Candidate = {
  inboundItemId: number;
  unitCostFen: number;
  available: number;
  batchNo: string;
};

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(request);
    requireRole(actor, ["admin", "finance"]);
    const payload = (await request.json()) as {
      companyId?: number;
      skuId?: number;
      saleDate?: string;
      quantity?: number;
      grossRevenue?: number;
      fees?: number;
      netRevenue?: number;
      referenceNo?: string;
    };

    const companyId = positiveInteger(payload.companyId);
    const skuId = positiveInteger(payload.skuId);
    const saleDate = clean(payload.saleDate);
    const quantity = positiveInteger(payload.quantity);
    const referenceNo = clean(payload.referenceNo).toUpperCase();
    const grossRevenueFen = toFen(payload.grossRevenue);
    const feesFen = toFen(payload.fees);
    const netRevenueFen = toFen(payload.netRevenue);

    if (
      !companyId ||
      !skuId ||
      !isDate(saleDate) ||
      !quantity ||
      !referenceNo ||
      grossRevenueFen < 0 ||
      feesFen < 0 ||
      netRevenueFen < 0
    ) {
      throw new ApiError(400, "请完整填写有效的销售记录。");
    }

    const candidateResult = await db
      .prepare(
        `SELECT ii.id AS inboundItemId, ii.unit_cost_fen AS unitCostFen,
                n.quantity AS available, b.batch_no AS batchNo
         FROM inbound_items ii
         JOIN inbound_batches b ON b.id = ii.batch_id AND b.status = 'confirmed'
         JOIN inventory_nodes n
           ON n.inbound_item_id = ii.id
          AND n.node = 'FBA可售'
          AND n.quantity > 0
         WHERE ii.sku_id = ?
         ORDER BY b.inbound_date ASC, ii.id ASC`,
      )
      .bind(skuId)
      .all<Candidate>();
    const candidates = candidateResult.results;
    const available = candidates.reduce(
      (sum, item) => sum + Number(item.available),
      0,
    );

    if (available < quantity) {
      throw new ApiError(
        409,
        `FBA可售库存不足：需要 ${quantity}，当前只有 ${available}。请先完成库存节点转移。`,
      );
    }

    const recordResult = await db
      .prepare(
        `INSERT INTO sales_records
          (company_id, sku_id, sale_date, quantity, gross_revenue_fen,
           fees_fen, net_revenue_fen, reference_no, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        companyId,
        skuId,
        saleDate,
        quantity,
        grossRevenueFen,
        feesFen,
        netRevenueFen,
        referenceNo,
        actor.email,
      )
      .run();
    const salesRecordId = Number(recordResult.meta.last_row_id);

    let remaining = quantity;
    let fifoCostFen = 0;
    const statements: D1PreparedStatement[] = [];
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const allocated = Math.min(remaining, Number(candidate.available));
      const balance = Number(candidate.available) - allocated;
      fifoCostFen += allocated * Number(candidate.unitCostFen);
      statements.push(
        db
          .prepare(
            `UPDATE inventory_nodes
             SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
             WHERE inbound_item_id = ? AND node = 'FBA可售' AND quantity >= ?`,
          )
          .bind(allocated, candidate.inboundItemId, allocated),
        db
          .prepare(
            `INSERT INTO sales_allocations
              (sales_record_id, inbound_item_id, quantity, unit_cost_fen)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(
            salesRecordId,
            candidate.inboundItemId,
            allocated,
            candidate.unitCostFen,
          ),
        db
          .prepare(
            `INSERT INTO inventory_ledger
              (occurred_at, sku_id, inbound_item_id, node, quantity_delta,
               balance_after, event_type, reference_type, reference_id,
               operator_email, note)
             VALUES (?, ?, ?, 'FBA可售', ?, ?, '亚马逊净销售',
                     'sale', ?, ?, ?)`,
          )
          .bind(
            `${saleDate} 00:00:00`,
            skuId,
            candidate.inboundItemId,
            -allocated,
            balance,
            salesRecordId,
            actor.email,
            `销售记录 ${referenceNo}`,
          ),
      );
      remaining -= allocated;
    }
    await db.batch(statements);

    return Response.json(
      {
        id: salesRecordId,
        message: "销售记录已保存，并按FIFO扣减FBA可售库存。",
        fifoCostFen,
        profitFen: netRevenueFen - fifoCostFen,
      },
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

function toFen(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) : -1;
}

