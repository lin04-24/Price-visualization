import { setScrape } from "@/lib/db";
import { errorResponse, jsonResponse, readJson } from "@/lib/http";
import type { ScrapeConfig } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    setScrape(await readJson<ScrapeConfig>(request));
    return jsonResponse({ success: true, message: "抓取配置已保存" });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存失败");
  }
}
