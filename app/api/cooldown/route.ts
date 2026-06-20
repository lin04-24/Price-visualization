import { setCooldown } from "@/lib/db";
import { errorResponse, jsonResponse, readJson } from "@/lib/http";
import type { CooldownConfig } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await setCooldown(await readJson<CooldownConfig>(request));
    return jsonResponse({ success: true, message: "冷却期配置已保存" });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存失败");
  }
}
