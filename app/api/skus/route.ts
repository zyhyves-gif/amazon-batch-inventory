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
      internalSku?: string;
      name?: string;
      category?: string;
      purchaseUnit?: string;
      safetyStock?: number;
    };

    const internalSku = clean(payload.internalSku).toUpperCase();
    const name = clean(payload.name);
    if (!internalSku || !name) {
      throw new ApiError(400, "SKU编号和商品名称不能为空。");
    }

    const safetyStock = Math.max(0, toInteger(payload.safetyStock, 0));
    const result = await db
      .prepare(
        `INSERT INTO skus
          (internal_sku, name, category, purchase_unit, safety_stock)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        internalSku,
        name,
        clean(payload.category) || "未分类",
        clean(payload.purchaseUnit) || "件",
        safetyStock,
      )
      .run();

    return Response.json(
      { id: Number(result.meta.last_row_id), message: "SKU已保存。" },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

