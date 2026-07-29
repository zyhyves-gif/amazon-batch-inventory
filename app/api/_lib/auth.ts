import { ensureSchema } from "@/db/runtime";

export type AppRole = "admin" | "operator" | "finance";

export type Actor = {
  id: number;
  email: string;
  displayName: string;
  role: AppRole;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireActor(
  request: Request,
): Promise<{ actor: Actor; db: D1Database }> {
  const db = await ensureSchema();
  const url = new URL(request.url);
  const isLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  const forwardedEmail = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  const email = forwardedEmail || (isLocal ? "local-admin@company.local" : "");
  const displayName =
    decodeForwardedName(request) ||
    (isLocal ? "本地管理员" : email.split("@")[0] || "用户");

  if (!email) {
    throw new ApiError(401, "请先登录后再访问系统。");
  }

  const existingCount = await db
    .prepare("SELECT COUNT(*) AS count FROM users")
    .first<{ count: number }>();

  if (Number(existingCount?.count ?? 0) === 0) {
    await db
      .prepare(
        "INSERT INTO users (email, display_name, role, status) VALUES (?, ?, 'admin', 'active')",
      )
      .bind(email, displayName)
      .run();
  }

  const user = await db
    .prepare(
      `SELECT id, email, display_name AS displayName, role
       FROM users
       WHERE email = ? AND status = 'active'`,
    )
    .bind(email)
    .first<Actor>();

  if (!user) {
    throw new ApiError(
      403,
      "当前账号尚未加入系统，请联系管理员在“用户与设置”中添加该邮箱。",
    );
  }

  return { actor: user, db };
}

export function requireRole(actor: Actor, allowed: AppRole[]) {
  if (!allowed.includes(actor.role)) {
    throw new ApiError(403, "当前角色没有执行此操作的权限。");
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "系统处理失败";
  const isUnique = /UNIQUE constraint failed/i.test(message);
  const safeMessage = isUnique
    ? "编号已经存在，请检查后重新提交。"
    : "系统处理失败，请稍后重试或联系管理员。";

  return Response.json({ error: safeMessage }, { status: 500 });
}

function decodeForwardedName(request: Request): string | null {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get(
    "oai-authenticated-user-full-name-encoding",
  );
  if (!encoded || encoding !== "percent-encoded-utf-8") return null;

  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

