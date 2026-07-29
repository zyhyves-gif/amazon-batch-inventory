import {
  ApiError,
  errorResponse,
  requireActor,
  requireRole,
} from "@/app/api/_lib/auth";

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(request);
    requireRole(actor, ["admin", "finance"]);
    const payload = (await request.json()) as {
      companyId?: number;
      incurredDate?: string;
      category?: string;
      amount?: number;
      notes?: string;
    };

    const companyId = positiveInteger(payload.companyId);
    const incurredDate = clean(payload.incurredDate);
    const category = clean(payload.category);
    const amountFen = Math.round(Number(payload.amount ?? 0) * 100);
    if (
      !companyId ||
      !isDate(incurredDate) ||
      !category ||
      !Number.isFinite(amountFen) ||
      amountFen <= 0
    ) {
      throw new ApiError(400, "请完整填写有效的费用记录。");
    }

    const result = await db
      .prepare(
        `INSERT INTO expenses
          (company_id, incurred_date, category, amount_fen, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        companyId,
        incurredDate,
        category,
        amountFen,
        clean(payload.notes),
        actor.email,
      )
      .run();

    return Response.json(
      { id: Number(result.meta.last_row_id), message: "费用记录已保存。" },
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

