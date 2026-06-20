import { startContainerAutoSync } from "@/lib/csqaq";
import { getSettings } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  startContainerAutoSync();
  return jsonResponse(await getSettings());
}
