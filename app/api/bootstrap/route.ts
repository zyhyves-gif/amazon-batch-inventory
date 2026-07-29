import { errorResponse, requireActor } from "@/app/api/_lib/auth";

export async function GET(request: Request) {
  try {
    const { actor, db } = await requireActor(request);

    const [
      companies,
      factories,
      suppliers,
      skus,
      inventory,
      inbounds,
      outbounds,
      allocations,
      ledger,
      sales,
      expenses,
      users,
      totals,
      salesTotals,
      expenseTotals,
    ] = await Promise.all([
      db
        .prepare(
          "SELECT id, code, name, store_name AS storeName, site FROM companies WHERE active = 1 ORDER BY id",
        )
        .all(),
      db
        .prepare(
          "SELECT id, code, name, contact FROM factories WHERE active = 1 ORDER BY id",
        )
        .all(),
      db
        .prepare(
          "SELECT id, code, name, contact FROM suppliers WHERE active = 1 ORDER BY id",
        )
        .all(),
      db
        .prepare(
          `SELECT id, internal_sku AS internalSku, name, category,
                  purchase_unit AS purchaseUnit, safety_stock AS safetyStock,
                  created_at AS createdAt
           FROM skus
           WHERE active = 1
           ORDER BY internal_sku`,
        )
        .all(),
      db
        .prepare(
          `SELECT ii.id AS inboundItemId, b.id AS batchId, b.batch_no AS batchNo,
                  b.inbound_date AS inboundDate, f.name AS factoryName,
                  sp.name AS supplierName, s.id AS skuId,
                  s.internal_sku AS internalSku, s.name AS skuName,
                  ii.quantity AS inboundQuantity, ii.unit_cost_fen AS unitCostFen,
                  COALESCE(SUM(CASE WHEN n.node = '国内仓可用' THEN n.quantity ELSE 0 END), 0) AS domesticAvailable,
                  COALESCE(SUM(CASE WHEN n.node = '运输中' THEN n.quantity ELSE 0 END), 0) AS inTransit,
                  COALESCE(SUM(CASE WHEN n.node = 'FBA接收中' THEN n.quantity ELSE 0 END), 0) AS fbaReceiving,
                  COALESCE(SUM(CASE WHEN n.node = 'FBA可售' THEN n.quantity ELSE 0 END), 0) AS fbaSellable,
                  COALESCE(SUM(n.quantity), 0) AS totalRemaining
           FROM inbound_items ii
           JOIN inbound_batches b ON b.id = ii.batch_id AND b.status = 'confirmed'
           JOIN factories f ON f.id = b.factory_id
           JOIN suppliers sp ON sp.id = b.supplier_id
           JOIN skus s ON s.id = ii.sku_id
           LEFT JOIN inventory_nodes n ON n.inbound_item_id = ii.id
           GROUP BY ii.id
           ORDER BY b.inbound_date ASC, ii.id ASC`,
        )
        .all(),
      db
        .prepare(
          `SELECT b.id, b.batch_no AS batchNo, b.inbound_date AS inboundDate,
                  f.name AS factoryName, sp.name AS supplierName,
                  b.customs_mode AS customsMode, b.reference_no AS referenceNo,
                  b.notes, b.created_by AS createdBy,
                  COUNT(ii.id) AS skuCount, COALESCE(SUM(ii.quantity), 0) AS totalQuantity,
                  COALESCE(SUM(ii.quantity * ii.unit_cost_fen), 0) AS totalCostFen
           FROM inbound_batches b
           JOIN factories f ON f.id = b.factory_id
           JOIN suppliers sp ON sp.id = b.supplier_id
           LEFT JOIN inbound_items ii ON ii.batch_id = b.id
           WHERE b.status = 'confirmed'
           GROUP BY b.id
           ORDER BY b.inbound_date DESC, b.id DESC
           LIMIT 100`,
        )
        .all(),
      db
        .prepare(
          `SELECT o.id, o.order_no AS orderNo, o.outbound_date AS outboundDate,
                  c.name AS companyName, c.store_name AS storeName,
                  o.destination_node AS destinationNode, o.status,
                  o.notes, o.created_by AS createdBy,
                  s.internal_sku AS internalSku, s.name AS skuName,
                  oi.quantity
           FROM outbound_orders o
           JOIN companies c ON c.id = o.target_company_id
           JOIN outbound_items oi ON oi.outbound_order_id = o.id
           JOIN skus s ON s.id = oi.sku_id
           WHERE o.status = 'confirmed'
           ORDER BY o.outbound_date DESC, o.id DESC
           LIMIT 100`,
        )
        .all(),
      db
        .prepare(
          `SELECT fa.id, o.order_no AS orderNo, s.internal_sku AS internalSku,
                  b.batch_no AS batchNo, f.name AS factoryName,
                  fa.quantity, fa.unit_cost_fen AS unitCostFen,
                  fa.overridden, fa.override_reason AS overrideReason
           FROM fifo_allocations fa
           JOIN outbound_items oi ON oi.id = fa.outbound_item_id
           JOIN outbound_orders o ON o.id = oi.outbound_order_id
           JOIN inbound_items ii ON ii.id = fa.inbound_item_id
           JOIN inbound_batches b ON b.id = ii.batch_id
           JOIN factories f ON f.id = b.factory_id
           JOIN skus s ON s.id = oi.sku_id
           ORDER BY fa.id DESC
           LIMIT 200`,
        )
        .all(),
      db
        .prepare(
          `SELECT l.id, l.occurred_at AS occurredAt, s.internal_sku AS internalSku,
                  b.batch_no AS batchNo, f.name AS factoryName, l.node,
                  l.quantity_delta AS quantityDelta,
                  l.balance_after AS balanceAfter, l.event_type AS eventType,
                  l.operator_email AS operatorEmail, l.note
           FROM inventory_ledger l
           JOIN skus s ON s.id = l.sku_id
           JOIN inbound_items ii ON ii.id = l.inbound_item_id
           JOIN inbound_batches b ON b.id = ii.batch_id
           JOIN factories f ON f.id = b.factory_id
           ORDER BY l.occurred_at DESC, l.id DESC
           LIMIT 200`,
        )
        .all(),
      db
        .prepare(
          `SELECT sr.id, sr.sale_date AS saleDate, sr.reference_no AS referenceNo,
                  c.name AS companyName, c.store_name AS storeName,
                  s.internal_sku AS internalSku, s.name AS skuName,
                  sr.quantity, sr.gross_revenue_fen AS grossRevenueFen,
                  sr.fees_fen AS feesFen, sr.net_revenue_fen AS netRevenueFen,
                  COALESCE(SUM(sa.quantity * sa.unit_cost_fen), 0) AS fifoCostFen,
                  sr.created_by AS createdBy
           FROM sales_records sr
           JOIN companies c ON c.id = sr.company_id
           JOIN skus s ON s.id = sr.sku_id
           LEFT JOIN sales_allocations sa ON sa.sales_record_id = sr.id
           GROUP BY sr.id
           ORDER BY sr.sale_date DESC, sr.id DESC
           LIMIT 200`,
        )
        .all(),
      db
        .prepare(
          `SELECT e.id, e.incurred_date AS incurredDate, c.name AS companyName,
                  e.category, e.amount_fen AS amountFen, e.notes,
                  e.created_by AS createdBy
           FROM expenses e
           JOIN companies c ON c.id = e.company_id
           ORDER BY e.incurred_date DESC, e.id DESC
           LIMIT 200`,
        )
        .all(),
      actor.role === "admin"
        ? db
            .prepare(
              `SELECT id, email, display_name AS displayName, role, status,
                      created_at AS createdAt
               FROM users ORDER BY id`,
            )
            .all()
        : Promise.resolve({ results: [] }),
      db
        .prepare(
          `SELECT
             COALESCE(SUM(n.quantity), 0) AS totalInventory,
             COALESCE(SUM(CASE WHEN n.node = '国内仓可用' THEN n.quantity ELSE 0 END), 0) AS domesticAvailable,
             COALESCE(SUM(CASE WHEN n.node = '运输中' THEN n.quantity ELSE 0 END), 0) AS inTransit,
             COALESCE(SUM(CASE WHEN n.node = 'FBA接收中' THEN n.quantity ELSE 0 END), 0) AS fbaReceiving,
             COALESCE(SUM(CASE WHEN n.node = 'FBA可售' THEN n.quantity ELSE 0 END), 0) AS fbaSellable,
             COALESCE(SUM(n.quantity * ii.unit_cost_fen), 0) AS inventoryValueFen,
             COUNT(DISTINCT CASE WHEN n.quantity > 0 THEN ii.sku_id END) AS skuInStock
           FROM inventory_nodes n
           JOIN inbound_items ii ON ii.id = n.inbound_item_id`,
        )
        .first(),
      db
        .prepare(
          `SELECT COALESCE(SUM(quantity), 0) AS unitsSold,
                  COALESCE(SUM(gross_revenue_fen), 0) AS grossRevenueFen,
                  COALESCE(SUM(fees_fen), 0) AS amazonFeesFen,
                  COALESCE(SUM(net_revenue_fen), 0) AS netRevenueFen,
                  COALESCE(
                    (SELECT SUM(quantity * unit_cost_fen) FROM sales_allocations),
                    0
                  ) AS fifoCostFen
           FROM sales_records`,
        )
        .first(),
      db
        .prepare(
          "SELECT COALESCE(SUM(amount_fen), 0) AS otherExpensesFen FROM expenses",
        )
        .first(),
    ]);

    return Response.json({
      actor,
      references: {
        companies: companies.results,
        factories: factories.results,
        suppliers: suppliers.results,
      },
      skus: skus.results,
      inventory: inventory.results,
      inbounds: inbounds.results,
      outbounds: outbounds.results,
      allocations: allocations.results,
      ledger: ledger.results,
      sales: sales.results,
      expenses: expenses.results,
      users: users.results,
      dashboard: {
        ...(totals ?? {}),
        ...(salesTotals ?? {}),
        ...(expenseTotals ?? {}),
        profitFen:
          Number(
            (salesTotals as { netRevenueFen?: number } | null)?.netRevenueFen ??
              0,
          ) -
          Number(
            (salesTotals as { fifoCostFen?: number } | null)?.fifoCostFen ?? 0,
          ) -
          Number(
            (expenseTotals as { otherExpensesFen?: number } | null)
              ?.otherExpensesFen ?? 0,
          ),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
