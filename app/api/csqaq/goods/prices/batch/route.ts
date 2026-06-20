import { getGoodBatchPrices, getCsqaqErrorStatus, lookupGoodByName } from "@/lib/csqaq";
import { getSettings } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";
import type { CaseConfig, CsqaqGoodDetail } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 50;

type ConfiguredCase = {
  id: string;
  config: CaseConfig;
};

function makeErrorItem(item: ConfiguredCase, message: string): CsqaqGoodDetail {
  return {
    id: item.id,
    name: item.config.name || item.id,
    market_hash_name: item.config.market_hash_name,
    buff_sell_price: null,
    buff_sell_num: null,
    yyyp_sell_price: null,
    yyyp_sell_num: null,
    steam_sell_price: null,
    steam_sell_num: null,
    error: message,
  };
}

async function resolveMarketHashName(item: ConfiguredCase) {
  const savedMarketHashName = item.config.market_hash_name?.trim();
  if (savedMarketHashName) {
    return savedMarketHashName;
  }

  const lookupQuery = item.config.name.trim() || item.id;
  const result = await lookupGoodByName(lookupQuery);
  const exactMatch = result.matches?.find((match) => String(match.id) === item.id);
  return exactMatch?.market_hash_name ?? result.good?.market_hash_name;
}

export async function POST() {
  try {
    const settings = await getSettings();
    const configuredCases = Object.entries(settings.cases).map(([id, config]) => ({ id, config }));

    if (configuredCases.length > MAX_BATCH_SIZE) {
      return errorResponse(`已配置 ${configuredCases.length} 个饰品，批量查询最多支持 ${MAX_BATCH_SIZE} 个`, 400);
    }

    if (configuredCases.length === 0) {
      return jsonResponse({ success: true, count: 0, items: [] });
    }

    const errors: CsqaqGoodDetail[] = [];
    const requestItems: Array<ConfiguredCase & { marketHashName: string }> = [];

    for (const item of configuredCases) {
      try {
        const marketHashName = await resolveMarketHashName(item);
        if (!marketHashName) {
          errors.push(makeErrorItem(item, "无法解析饰品英文 market hash name"));
          continue;
        }
        requestItems.push({ ...item, marketHashName });
      } catch (error) {
        errors.push(makeErrorItem(item, error instanceof Error ? error.message : "饰品英文名解析失败"));
      }
    }

    const requestedMarketHashNames = requestItems.map((item) => item.marketHashName);
    const prices = requestedMarketHashNames.length > 0 ? await getGoodBatchPrices(requestedMarketHashNames) : [];
    const priceByMarketHashName = new Map(
      prices.map((price, index) => [requestedMarketHashNames[index], price]),
    );
    const items = configuredCases.map((item) => {
      const requestItem = requestItems.find((candidate) => candidate.id === item.id);
      if (!requestItem) {
        return errors.find((errorItem) => errorItem.id === item.id) ?? makeErrorItem(item, "饰品未参与批量查询");
      }

      const price = priceByMarketHashName.get(requestItem.marketHashName);
      return price ? { ...price, id: item.id, name: price.name || item.config.name || item.id } : makeErrorItem(item, "批量价格接口未返回该饰品");
    });

    return jsonResponse({ success: true, count: items.length, items });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "批量查询失败", getCsqaqErrorStatus(error));
  }
}
