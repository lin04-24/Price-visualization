import { getStartTime } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export function GET() {
  return jsonResponse({ success: true, start_time: getStartTime() });
}
