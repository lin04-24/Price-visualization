import { getCasesState } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export function GET() {
  return jsonResponse(getCasesState());
}
