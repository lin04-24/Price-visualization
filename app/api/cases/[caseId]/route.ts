import { deleteCase, saveCase } from "@/lib/db";
import { errorResponse, jsonResponse, readJson } from "@/lib/http";
import type { CaseConfig } from "@/lib/types";

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
    saveCase(decodedCaseId, await readJson<CaseConfig>(request));
    return jsonResponse({ success: true, message: `已保存 ${decodedCaseId} 的配置` });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存失败");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  const decodedCaseId = decodeURIComponent(caseId);
  if (!deleteCase(decodedCaseId)) {
    return jsonResponse({ success: false, message: "配置不存在" }, 404);
  }

  return jsonResponse({ success: true, message: `已删除 ${decodedCaseId} 的配置` });
}
