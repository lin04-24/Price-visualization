import { findContainerById, getContainerMarketItems } from "@/lib/csqaq";
import { errorResponse, jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    containerId: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { containerId } = await context.params;
  const decodedContainerId = decodeURIComponent(containerId);

  if (!/^\d+$/.test(decodedContainerId)) {
    return errorResponse("收藏品 ID 必须是数字");
  }

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100)
    : 20;

  try {
    const [container, items] = await Promise.all([
      findContainerById(decodedContainerId),
      getContainerMarketItems(decodedContainerId, limit),
    ]);

    return jsonResponse({ success: true, container, items, limit });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "详情查询失败", 502);
  }
}