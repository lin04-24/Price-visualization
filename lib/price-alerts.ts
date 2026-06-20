import { getCsqaqErrorStatus, getGoodBatchPrices, lookupGoodByName } from "@/lib/csqaq";
import { getSettings, saveCaseMarketSnapshot } from "@/lib/db";
import type { CaseConfig, CaseMarketSnapshot, CsqaqGoodDetail, Settings } from "@/lib/types";

export const MAX_BATCH_SIZE = 50;

type ConfiguredCase = {
  id: string;
  config: CaseConfig;
};

export type PriceAlert = {
  case_id: string;
  chinese_name: string;
  english_name?: string;
  prices: {
    yyyp: number | null;
    steam: number | null;
  };
  reasons: string[];
};

export type BatchPriceQueryResult = {
  count: number;
  items: CsqaqGoodDetail[];
  case_market_snapshots: Record<string, CaseMarketSnapshot>;
  alerts: PriceAlert[];
  checked_at: string;
};

export class BatchPriceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "BatchPriceError";
  }
}

export function getBatchPriceErrorStatus(error: unknown) {
  return error instanceof BatchPriceError ? error.status : getCsqaqErrorStatus(error);
}

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

function formatPrice(value: number | null) {
  if (value === null || value === undefined) {
    return "暂无价格";
  }

  return `￥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function isFinitePrice(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function addLimitReasons(
  reasons: string[],
  platform: string,
  price: number | null,
  range: CaseConfig["buff_uu"],
  switchConfig: Settings["switches"]["buff_uu"],
) {
  if (!switchConfig.enabled || !isFinitePrice(price)) {
    return;
  }

  if (switchConfig.min_alert && Number.isFinite(range.min_price) && price < range.min_price) {
    reasons.push(`${platform} 当前 ${formatPrice(price)} 低于下限 ${formatPrice(range.min_price)}`);
  }

  if (switchConfig.max_alert && Number.isFinite(range.max_price) && price > range.max_price) {
    reasons.push(`${platform} 当前 ${formatPrice(price)} 高于上限 ${formatPrice(range.max_price)}`);
  }
}

function buildAlert(
  item: CsqaqGoodDetail,
  config: CaseConfig,
  settings: Settings,
): PriceAlert | null {
  if (item.error || config.enabled === false) {
    return null;
  }

  const reasons: string[] = [];
  addLimitReasons(reasons, "悠悠有品", item.yyyp_sell_price, config.buff_uu, settings.switches.buff_uu);
  addLimitReasons(reasons, "Steam市场", item.steam_sell_price, config.steam, settings.switches.steam);

  if (reasons.length === 0) {
    return null;
  }

  return {
    case_id: item.id,
    chinese_name: config.name || item.name || item.id,
    english_name: item.market_hash_name || config.market_hash_name,
    prices: {
      yyyp: item.yyyp_sell_price,
      steam: item.steam_sell_price,
    },
    reasons,
  };
}

export function buildPriceAlertEmailText(alerts: PriceAlert[], checkedAt: string) {
  const checkedDate = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(checkedAt));

  const sections = alerts.map((alert, index) =>
    [
      `${index + 1}. ${alert.chinese_name}`,
      `ID: ${alert.case_id}`,
      `英文名: ${alert.english_name || "未返回"}`,
      `悠悠有品: ${formatPrice(alert.prices.yyyp)}`,
      `Steam市场: ${formatPrice(alert.prices.steam)}`,
      "提醒原因:",
      ...alert.reasons.map((reason) => `- ${reason}`),
    ].join("\n"),
  );

  return [
    "Steam市场情报站价格提醒",
    `自动批量查询时间（北京时间）：${checkedDate}`,
    `本次共有 ${alerts.length} 个饰品价格超出已设置的上下限。`,
    "",
    sections.join("\n\n"),
  ].join("\n");
}

export async function queryConfiguredCasePrices(): Promise<BatchPriceQueryResult> {
  const settings = await getSettings();
  const configuredCases = Object.entries(settings.cases).map(([id, config]) => ({ id, config }));

  if (configuredCases.length > MAX_BATCH_SIZE) {
    throw new BatchPriceError(`已配置 ${configuredCases.length} 个饰品，批量查询最多支持 ${MAX_BATCH_SIZE} 个`);
  }

  if (configuredCases.length === 0) {
    return {
      count: 0,
      items: [],
      case_market_snapshots: {},
      alerts: [],
      checked_at: new Date().toISOString(),
    };
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
    prices.map((price) => [price.market_hash_name ?? price.name, price]),
  );

  const items = configuredCases.map((item) => {
    const requestItem = requestItems.find((candidate) => candidate.id === item.id);
    if (!requestItem) {
      return errors.find((errorItem) => errorItem.id === item.id) ?? makeErrorItem(item, "饰品未参与批量查询");
    }

    const price = priceByMarketHashName.get(requestItem.marketHashName);
    return price
      ? {
          ...price,
          id: item.id,
          name: price.name || item.config.name || item.id,
          market_hash_name: price.market_hash_name || requestItem.marketHashName,
        }
      : makeErrorItem(item, "批量价格接口未返回该饰品");
  });

  const caseMarketSnapshots: Record<string, CaseMarketSnapshot> = {};
  await Promise.all(
    items.map(async (item) => {
      if (item.error) {
        return;
      }

      caseMarketSnapshots[item.id] = await saveCaseMarketSnapshot(item.id, {
        steam_sell_price: item.steam_sell_price,
        yyyp_sell_price: item.yyyp_sell_price,
      });
    }),
  );

  const configById = new Map(configuredCases.map((item) => [item.id, item.config]));
  const alerts = items
    .map((item) => {
      const config = configById.get(item.id);
      return config ? buildAlert(item, config, settings) : null;
    })
    .filter((alert): alert is PriceAlert => Boolean(alert));

  return {
    count: items.length,
    items,
    case_market_snapshots: caseMarketSnapshots,
    alerts,
    checked_at: new Date().toISOString(),
  };
}
