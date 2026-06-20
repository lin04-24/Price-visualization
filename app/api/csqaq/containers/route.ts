import { getContainerSyncStatus, getCsqaqErrorStatus, lookupContainerByName, syncContainersFromCsqaq } from "@/lib/csqaq";
import { errorResponse, jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";
  const requestedLimit = Number(searchParams.get("limit") ?? 8);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 30)
    : 8;

  try {
    if (force) {
      await syncContainersFromCsqaq(true);
    }

    if (!query) {
      const status = await getContainerSyncStatus();
      return jsonResponse({ success: true, matches: [], ...status });
    }

    const result = await lookupContainerByName(query, limit);
    return jsonResponse({ success: true, ...result });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "收藏品查询失败", getCsqaqErrorStatus(error));
  }
}

export async function POST() {
  try {
    const containers = await syncContainersFromCsqaq(true);
    return jsonResponse({
      success: true,
      count: containers.length,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "收藏品同步失败", getCsqaqErrorStatus(error));
  }
}