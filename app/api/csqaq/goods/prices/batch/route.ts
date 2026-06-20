import { errorResponse, jsonResponse } from "@/lib/http";
import { getBatchPriceErrorStatus, queryConfiguredCasePrices } from "@/lib/price-alerts";

export const runtime = "nodejs";

export async function POST() {
  try {
    return jsonResponse({
      success: true,
      ...(await queryConfiguredCasePrices()),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "批量查询失败", getBatchPriceErrorStatus(error));
  }
}
