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
      kind?: "factory" | "supplier";
      code?: string;
      name?: string;
      contact?: string;
    };

    const kind = payload.kind;
    const code = clean(payload.code).toUpperCase();
    const name = clean(payload.name);
    const contact = clean(payload.contact);
    if ((kind !== "factory" && kind !== "supplier") || !code || !name) {
      throw new ApiError(400, "请完整填写类型、内部编码和名称。");
    }

    const table = kind === "factory" ? "factories" : "suppliers";
    await db
      .prepare(
        `INSERT INTO ${table} (code, name, contact, active)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           contact = excluded.contact,
           active = 1`,
      )
      .bind(code, name, contact)
      .run();

    return Response.json(
      {
        message: `${kind === "factory" ? "工厂" : "供应商"}档案已保存。`,
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
