import { getGoodMarketDetail, getCsqaqErrorStatus } from "@/lib/csqaq";
import { errorResponse, jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    goodId: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { goodId } = await context.params;
  const decodedGoodId = decodeURIComponent(goodId);

  if (!/^\d+$/.test(decodedGoodId)) {
    return errorResponse("饰品 good_id 必须是数字");
  }

  try {
    const item = await getGoodMarketDetail(decodedGoodId);
    return jsonResponse({ success: true, item });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "饰品详情查询失败", getCsqaqErrorStatus(error));
  }
}