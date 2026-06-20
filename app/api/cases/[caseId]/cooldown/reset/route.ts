import { resetCaseCooldown } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    caseId: string;
  }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  const decodedCaseId = decodeURIComponent(caseId);
  if (!(await resetCaseCooldown(decodedCaseId))) {
    return jsonResponse({ success: false, message: "箱子不存在" }, 404);
  }

  return jsonResponse({ success: true, message: `已重置 ${decodedCaseId} 的冷却期` });
}
