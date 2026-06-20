import { saveCaseMarketSnapshot } from "@/lib/db";
import { errorResponse, jsonResponse, readJson } from "@/lib/http";
import type { CaseMarketSnapshot } from "@/lib/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    caseId: string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  const decodedCaseId = decodeURIComponent(caseId);

  try {
    const payload = await readJson<Pick<CaseMarketSnapshot, "steam_sell_price" | "yyyp_sell_price">>(request);
    const snapshot = await saveCaseMarketSnapshot(decodedCaseId, payload);
    return jsonResponse({ success: true, snapshot });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存行情快照失败");
  }
}