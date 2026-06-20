import { resetAllCooldowns } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  await resetAllCooldowns();
  return jsonResponse({ success: true, message: "已重置所有冷却期" });
}
