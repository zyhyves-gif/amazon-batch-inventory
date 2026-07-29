import { errorResponse, requireActor } from "@/app/api/_lib/auth";
import { buildXlsx } from "@/lib/xlsx";

export async function GET(request: Request) {
  try {
    const { actor, db } = await requireActor(request);
    const url = new URL(request.url);
    if (url.searchParams.get("mode") === "template") {
      const template = buildTemplate(actor.displayName);
      return workbookResponse(template, "亚马逊进销存_数据整理模板.xlsx");
    }
    const from = validDate(url.searchParams.get("from")) || "2000-01-01";
    const to = validDate(url.searchParams.get("to")) || "2099-12-31";

    const [inventory, inbounds, outboundAllocations, ledger, sales, expenses] =
      await Promise.all([
        db
          .prepare(
            `SELECT f.name AS factoryName, sp.name AS supplierName,
                    b.batch_no AS batchNo, b.inbound_date AS inboundDate,
                    s.internal_sku AS internalSku, s.name AS skuName,
                    ii.quantity AS inboundQuantity,
                    ROUND(ii.unit_cost_fen / 100.0, 2) AS unitCost,
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
             ORDER BY b.inbound_date, b.batch_no, s.internal_sku`,
          )
          .all<Record<string, string | number>>(),
        db
          .prepare(
            `SELECT b.inbound_date AS inboundDate, b.batch_no AS batchNo,
                    f.name AS factoryName, sp.name AS supplierName,
                    s.internal_sku AS internalSku, s.name AS skuName,
                    ii.quantity,
                    ROUND(ii.unit_cost_fen / 100.0, 2) AS unitCost,
                    ROUND(ii.quantity * ii.unit_cost_fen / 100.0, 2) AS totalCost,
                    b.customs_mode AS customsMode, b.reference_no AS referenceNo,
                    b.created_by AS createdBy
             FROM inbound_batches b
             JOIN factories f ON f.id = b.factory_id
             JOIN suppliers sp ON sp.id = b.supplier_id
             JOIN inbound_items ii ON ii.batch_id = b.id
             JOIN skus s ON s.id = ii.sku_id
             WHERE b.status = 'confirmed'
               AND b.inbound_date BETWEEN ? AND ?
             ORDER BY b.inbound_date, b.id`,
          )
          .bind(from, to)
          .all<Record<string, string | number>>(),
        db
          .prepare(
            `SELECT o.outbound_date AS outboundDate, o.order_no AS orderNo,
                    c.name AS companyName, c.store_name AS storeName,
                    s.internal_sku AS internalSku, s.name AS skuName,
                    f.name AS factoryName, b.batch_no AS batchNo,
                    fa.quantity,
                    ROUND(fa.unit_cost_fen / 100.0, 2) AS unitCost,
                    ROUND(fa.quantity * fa.unit_cost_fen / 100.0, 2) AS fifoCost,
                    o.destination_node AS destinationNode,
                    fa.overridden, fa.override_reason AS overrideReason,
                    o.created_by AS createdBy
             FROM fifo_allocations fa
             JOIN outbound_items oi ON oi.id = fa.outbound_item_id
             JOIN outbound_orders o ON o.id = oi.outbound_order_id
             JOIN companies c ON c.id = o.target_company_id
             JOIN skus s ON s.id = oi.sku_id
             JOIN inbound_items ii ON ii.id = fa.inbound_item_id
             JOIN inbound_batches b ON b.id = ii.batch_id
             JOIN factories f ON f.id = b.factory_id
             WHERE o.status = 'confirmed'
               AND o.outbound_date BETWEEN ? AND ?
             ORDER BY o.outbound_date, o.id, fa.id`,
          )
          .bind(from, to)
          .all<Record<string, string | number>>(),
        db
          .prepare(
            `SELECT l.occurred_at AS occurredAt, s.internal_sku AS internalSku,
                    s.name AS skuName, f.name AS factoryName,
                    b.batch_no AS batchNo, l.node,
                    l.quantity_delta AS quantityDelta,
                    l.balance_after AS balanceAfter, l.event_type AS eventType,
                    l.reference_type AS referenceType, l.operator_email AS operatorEmail,
                    l.note
             FROM inventory_ledger l
             JOIN skus s ON s.id = l.sku_id
             JOIN inbound_items ii ON ii.id = l.inbound_item_id
             JOIN inbound_batches b ON b.id = ii.batch_id
             JOIN factories f ON f.id = b.factory_id
             WHERE SUBSTR(l.occurred_at, 1, 10) BETWEEN ? AND ?
             ORDER BY l.occurred_at, l.id`,
          )
          .bind(from, to)
          .all<Record<string, string | number>>(),
        db
          .prepare(
            `SELECT sr.sale_date AS saleDate, sr.reference_no AS referenceNo,
                    c.name AS companyName, c.store_name AS storeName,
                    s.internal_sku AS internalSku, s.name AS skuName,
                    sr.quantity,
                    ROUND(sr.gross_revenue_fen / 100.0, 2) AS grossRevenue,
                    ROUND(sr.fees_fen / 100.0, 2) AS amazonFees,
                    ROUND(sr.net_revenue_fen / 100.0, 2) AS netRevenue,
                    ROUND(COALESCE(SUM(sa.quantity * sa.unit_cost_fen), 0) / 100.0, 2) AS fifoCost,
                    ROUND((sr.net_revenue_fen - COALESCE(SUM(sa.quantity * sa.unit_cost_fen), 0)) / 100.0, 2) AS grossProfit,
                    sr.created_by AS createdBy
             FROM sales_records sr
             JOIN companies c ON c.id = sr.company_id
             JOIN skus s ON s.id = sr.sku_id
             LEFT JOIN sales_allocations sa ON sa.sales_record_id = sr.id
             WHERE sr.sale_date BETWEEN ? AND ?
             GROUP BY sr.id
             ORDER BY sr.sale_date, sr.id`,
          )
          .bind(from, to)
          .all<Record<string, string | number>>(),
        db
          .prepare(
            `SELECT e.incurred_date AS incurredDate, c.name AS companyName,
                    e.category, ROUND(e.amount_fen / 100.0, 2) AS amount,
                    e.notes, e.created_by AS createdBy
             FROM expenses e
             JOIN companies c ON c.id = e.company_id
             WHERE e.incurred_date BETWEEN ? AND ?
             ORDER BY e.incurred_date, e.id`,
          )
          .bind(from, to)
          .all<Record<string, string | number>>(),
      ]);

    const workbook = buildXlsx([
      {
        name: "导出说明",
        rows: [
          ["项目", "内容"],
          ["统计期间", `${from} 至 ${to}`],
          ["导出时间", new Date().toLocaleString("zh-CN")],
          ["导出人", actor.displayName],
          ["导出账号", actor.email],
          ["库存口径", "当前批次库存节点实时余额"],
          ["销售口径", "亚马逊净销售记录，FIFO成本按FBA可售批次扣减"],
        ],
      },
      toSheet(
        "批次库存余额",
        [
          ["factoryName", "工厂"],
          ["supplierName", "供应商"],
          ["batchNo", "批次号"],
          ["inboundDate", "入库日期"],
          ["internalSku", "SKU"],
          ["skuName", "商品名称"],
          ["inboundQuantity", "入库数量"],
          ["unitCost", "采购单价"],
          ["domesticAvailable", "国内仓可用"],
          ["inTransit", "运输中"],
          ["fbaReceiving", "FBA接收中"],
          ["fbaSellable", "FBA可售"],
          ["totalRemaining", "当前剩余"],
        ],
        inventory.results,
      ),
      toSheet(
        "入库明细",
        [
          ["inboundDate", "入库日期"],
          ["batchNo", "批次号"],
          ["factoryName", "工厂"],
          ["supplierName", "供应商"],
          ["internalSku", "SKU"],
          ["skuName", "商品名称"],
          ["quantity", "数量"],
          ["unitCost", "采购单价"],
          ["totalCost", "采购金额"],
          ["customsMode", "报关方式"],
          ["referenceNo", "参考单号"],
          ["createdBy", "录入人"],
        ],
        inbounds.results,
      ),
      toSheet(
        "出库FIFO分配",
        [
          ["outboundDate", "出库日期"],
          ["orderNo", "出库单号"],
          ["companyName", "公司"],
          ["storeName", "店铺"],
          ["internalSku", "SKU"],
          ["skuName", "商品名称"],
          ["factoryName", "来源工厂"],
          ["batchNo", "来源批次"],
          ["quantity", "分配数量"],
          ["unitCost", "单位FIFO成本"],
          ["fifoCost", "FIFO成本"],
          ["destinationNode", "目标节点"],
          ["overridden", "是否人工覆盖"],
          ["overrideReason", "覆盖原因"],
          ["createdBy", "操作人"],
        ],
        outboundAllocations.results,
      ),
      toSheet(
        "库存流水",
        [
          ["occurredAt", "发生时间"],
          ["internalSku", "SKU"],
          ["skuName", "商品名称"],
          ["factoryName", "工厂"],
          ["batchNo", "批次号"],
          ["node", "库存节点"],
          ["quantityDelta", "数量变化"],
          ["balanceAfter", "变动后余额"],
          ["eventType", "事件类型"],
          ["referenceType", "来源类型"],
          ["operatorEmail", "操作账号"],
          ["note", "说明"],
        ],
        ledger.results,
      ),
      toSheet(
        "销售与利润",
        [
          ["saleDate", "销售日期"],
          ["referenceNo", "销售参考号"],
          ["companyName", "公司"],
          ["storeName", "店铺"],
          ["internalSku", "SKU"],
          ["skuName", "商品名称"],
          ["quantity", "净销售数量"],
          ["grossRevenue", "商品销售额"],
          ["amazonFees", "亚马逊费用"],
          ["netRevenue", "净回款"],
          ["fifoCost", "FIFO成本"],
          ["grossProfit", "毛利润"],
          ["createdBy", "录入人"],
        ],
        sales.results,
      ),
      toSheet(
        "费用明细",
        [
          ["incurredDate", "费用日期"],
          ["companyName", "公司"],
          ["category", "费用类别"],
          ["amount", "金额"],
          ["notes", "说明"],
          ["createdBy", "录入人"],
        ],
        expenses.results,
      ),
    ]);

    const fileName = `亚马逊进销存_${from}_${to}.xlsx`;
    return workbookResponse(workbook, fileName);
  } catch (error) {
    return errorResponse(error);
  }
}

function buildTemplate(exporter: string) {
  return buildXlsx([
    {
      name: "填写说明",
      rows: [
        ["项目", "说明"],
        ["整理人", exporter],
        ["填写顺序", "先基础资料，再入库；出库和销售必须引用已存在的SKU"],
        ["日期格式", "统一填写为 YYYY-MM-DD，例如 2026-07-01"],
        ["金额格式", "填写人民币元，不要带¥符号或千位逗号"],
        ["期初老库存", "日期或来源不明时，批次号填 INITIAL-UNKNOWN，工厂填“期初未知工厂”"],
        ["重要提醒", "同一批次号、SKU或参考号不要重复填写"],
      ],
    },
    {
      name: "SKU档案",
      rows: [
        ["SKU编号*", "商品名称*", "分类", "采购单位", "安全库存"],
        ["示例-SKU-001", "示例商品（填写时删除本行）", "示例分类", "件", 50],
      ],
    },
    {
      name: "工厂与供应商",
      rows: [
        ["类型*", "内部编码*", "名称*", "联系人或备注"],
        ["工厂", "FACTORY-A", "A工厂", "示例（填写时删除本行）"],
        ["供应商", "SUPPLIER-A", "示例供应商", "示例（填写时删除本行）"],
      ],
    },
    {
      name: "入库明细",
      rows: [
        [
          "入库日期*",
          "入库批次号*",
          "工厂编码*",
          "供应商编码*",
          "SKU编号*",
          "数量*",
          "采购单价(元)",
          "贸易方式",
          "参考单号",
          "备注",
        ],
        [
          "2026-07-01",
          "RK-20260701-001",
          "FACTORY-A",
          "SUPPLIER-A",
          "示例-SKU-001",
          100,
          12.5,
          "一般贸易",
          "PO-001",
          "示例（填写时删除本行）",
        ],
      ],
    },
    {
      name: "出库报关明细",
      rows: [
        [
          "出库日期*",
          "出库单号*",
          "公司编码*",
          "SKU编号*",
          "数量*",
          "目标节点",
          "备注",
        ],
        [
          "2026-07-15",
          "CK-20260715-001",
          "JIARONG",
          "示例-SKU-001",
          20,
          "运输中",
          "示例（填写时删除本行）",
        ],
      ],
    },
    {
      name: "销售与结算",
      rows: [
        [
          "销售日期*",
          "结算或订单参考号*",
          "公司编码*",
          "SKU编号*",
          "销售数量*",
          "商品销售额(元)",
          "亚马逊费用(元)",
          "净收入(元)*",
        ],
        [
          "2026-07-25",
          "SETTLEMENT-001",
          "JIARONG",
          "示例-SKU-001",
          10,
          500,
          120,
          380,
        ],
      ],
    },
    {
      name: "费用明细",
      rows: [
        ["费用日期*", "公司编码*", "费用类别*", "金额(元)*", "备注"],
        ["2026-07-25", "JIARONG", "广告费", 100, "示例（填写时删除本行）"],
      ],
    },
  ]);
}

function workbookResponse(workbook: Uint8Array, fileName: string) {
  return new Response(workbook, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

function toSheet(
  name: string,
  columns: Array<[string, string]>,
  rows: Array<Record<string, string | number>>,
) {
  return {
    name,
    rows: [
      columns.map(([, label]) => label),
      ...rows.map((row) => columns.map(([key]) => row[key] ?? "")),
    ],
  };
}

function validDate(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}
