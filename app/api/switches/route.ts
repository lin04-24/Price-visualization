import { setSwitches } from "@/lib/db";
import { errorResponse, jsonResponse, readJson } from "@/lib/http";
import type { SwitchesConfig } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await setSwitches(await readJson<SwitchesConfig>(request));
    return jsonResponse({ success: true, message: "全局开关已保存" });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存失败");
  }
}
