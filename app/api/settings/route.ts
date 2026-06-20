import { startContainerAutoSync } from "@/lib/csqaq";
import { getCaseMarketSnapshots, getSettings } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  startContainerAutoSync();
  const [settings, caseMarketSnapshots] = await Promise.all([
    getSettings(),
    getCaseMarketSnapshots(),
  ]);

  return jsonResponse({
    ...settings,
    case_market_snapshots: caseMarketSnapshots,
  });
}