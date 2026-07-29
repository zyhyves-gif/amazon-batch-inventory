import {
  ApiError,
  errorResponse,
  requireActor,
  requireRole,
  type AppRole,
} from "@/app/api/_lib/auth";

const roles = new Set<AppRole>(["admin", "operator", "finance"]);

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(request);
    requireRole(actor, ["admin"]);
    const payload = (await request.json()) as {
      email?: string;
      displayName?: string;
      role?: AppRole;
    };

    const email = clean(payload.email).toLowerCase();
    const displayName = clean(payload.displayName);
    const role = payload.role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(400, "请输入有效邮箱地址。");
    }
    if (!displayName || !role || !roles.has(role)) {
      throw new ApiError(400, "请完整填写姓名和角色。");
    }

    await db
      .prepare(
        `INSERT INTO users (email, display_name, role, status)
         VALUES (?, ?, ?, 'active')
         ON CONFLICT(email) DO UPDATE SET
           display_name = excluded.display_name,
           role = excluded.role,
           status = 'active'`,
      )
      .bind(email, displayName, role)
      .run();

    return Response.json(
      { message: "用户已保存。对方使用该邮箱登录后即可按角色访问。" },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

