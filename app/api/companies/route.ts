import {
  ApiError,
  errorResponse,
  requireActor,
  requireRole,
} from "@/app/api/_lib/auth";

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(request);
    requireRole(actor, ["admin"]);
    const payload = (await request.json()) as {
      id?: number;
      code?: string;
      name?: string;
      storeName?: string;
      site?: string;
    };

    const id = Number(payload.id);
    const code = clean(payload.code).toUpperCase();
    const name = clean(payload.name);
    if (!Number.isInteger(id) || id <= 0 || !code || !name) {
      throw new ApiError(400, "请选择公司并填写公司编码和名称。");
    }

    const exists = await db
      .prepare("SELECT id FROM companies WHERE id = ?")
      .bind(id)
      .first();
    if (!exists) throw new ApiError(404, "未找到该公司。");

    await db
      .prepare(
        `UPDATE companies
         SET code = ?, name = ?, store_name = ?, site = ?, active = 1
         WHERE id = ?`,
      )
      .bind(
        code,
        name,
        clean(payload.storeName),
        clean(payload.site),
        id,
      )
      .run();

    return Response.json({ message: "公司与店铺信息已更新。" });
  } catch (error) {
    return errorResponse(error);
  }
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
