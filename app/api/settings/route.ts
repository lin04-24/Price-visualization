import { startContainerAutoSync } from "@/lib/csqaq";
import { getCaseMarketSnapshots, getSettings } from "@/lib/db";
import { jsonResponse } from "@/lib/http";
import { startPriceMonitor } from "@/lib/price-monitor";

export const runtime = "nodejs";

export async function GET() {
  startContainerAutoSync();
  startPriceMonitor();
  const [settings, caseMarketSnapshots] = await Promise.all([
    getSettings(),
    getCaseMarketSnapshots(),
  ]);

  return jsonResponse({
    ...settings,
    case_market_snapshots: caseMarketSnapshots,
  });
}
