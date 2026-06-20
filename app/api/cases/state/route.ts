import { getCasesState } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  return jsonResponse(await getCasesState());
}
