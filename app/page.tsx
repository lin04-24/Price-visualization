import { ConfigDashboard } from "@/components/ConfigDashboard";
import { getCaseMarketSnapshots, getSettings } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, caseMarketSnapshots] = await Promise.all([
    getSettings(),
    getCaseMarketSnapshots(),
  ]);

  return (
    <ConfigDashboard
      initialCaseMarketSnapshots={caseMarketSnapshots}
      initialSettings={settings}
    />
  );
}
