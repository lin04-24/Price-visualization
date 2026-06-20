import { getCsqaqErrorStatus, lookupContainerByName } from "@/lib/csqaq";
import { errorResponse, jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();

  if (!name) {
    return errorResponse("请输入饰品中文名");
  }

  try {
    const result = await lookupContainerByName(name);
    if (!result.container) {
      return jsonResponse({ success: false, message: "未找到匹配的饰品", matches: [] }, 404);
    }

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "查询失败", getCsqaqErrorStatus(error));
  }
}