import type { CsqaqCaseDetailItem, CsqaqContainer } from "./types";

const CSQAQ_BASE_URL = "https://api.csqaq.com/api/v1";
const CONTAINER_CACHE_MS = 1000 * 60 * 30;

type CsqaqEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

type RawContainer = {
  id: number;
  img?: string;
  url?: string;
  name: string;
  comment?: string;
  created_at?: string;
};

type RawContainerItem = {
  id: number | string;
  img?: string;
  price?: number | string;
  rln?: string;
  short_name?: string;
  qln?: string;
};

type RawGoodDetail = {
  goods_info?: {
    id?: number | string;
    name?: string;
    img?: string;
    buff_sell_price?: number | string | null;
    buff_sell_num?: number | string | null;
    yyyp_sell_price?: number | string | null;
    yyyp_sell_num?: number | string | null;
    steam_sell_price?: number | string | null;
    steam_sell_num?: number | string | null;
    updated_at?: string;
    rarity_localized_name?: string;
    quality_localized_name?: string;
    exterior_localized_name?: string;
  };
};

let containersCache: { expiresAt: number; promise: Promise<CsqaqContainer[]> } | null = null;

function getApiToken() {
  const token = process.env.CSQAQ_API_TOKEN?.trim();
  if (!token) {
    throw new Error("缺少 CSQAQ_API_TOKEN 环境变量");
  }
  return token;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s|｜·・.。,_，()（）\[\]【】<>《》「」『』™★☆\-—_]/g, "");
}

function toContainer(container: RawContainer): CsqaqContainer {
  return {
    id: container.id,
    img: container.img ?? container.url,
    name: container.name,
    comment: container.comment,
    created_at: container.created_at,
  };
}

function scoreContainer(containerName: string, query: string) {
  const target = normalizeName(containerName);
  const normalizedQuery = normalizeName(query);

  if (!normalizedQuery) return 0;
  if (target === normalizedQuery) return 1000;
  if (target.includes(normalizedQuery)) return 800 - Math.abs(target.length - normalizedQuery.length);
  if (normalizedQuery.includes(target)) return 650 - Math.abs(target.length - normalizedQuery.length);
  if (containerName.includes(query)) return 600;

  return 0;
}

async function csqaqRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${CSQAQ_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ApiToken: getApiToken(),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`CSQAQ 请求失败: HTTP ${response.status}`);
  }

  const payload = JSON.parse(new TextDecoder("utf-8").decode(await response.arrayBuffer())) as CsqaqEnvelope<T>;
  if (payload.code !== 200) {
    throw new Error(payload.msg || `CSQAQ 返回异常状态: ${payload.code}`);
  }

  return payload.data;
}

export async function getContainers() {
  const now = Date.now();
  if (!containersCache || containersCache.expiresAt <= now) {
    containersCache = {
      expiresAt: now + CONTAINER_CACHE_MS,
      promise: csqaqRequest<RawContainer[]>("/info/container_data_info", { method: "POST" }).then(
        (containers) => containers.map(toContainer),
      ),
    };
  }

  return containersCache.promise;
}

export async function findContainerById(containerId: string | number) {
  const id = Number(containerId);
  if (!Number.isFinite(id)) return undefined;
  const containers = await getContainers();
  return containers.find((container) => container.id === id);
}

export async function lookupContainerByName(name: string) {
  const containers = await getContainers();
  const matches = containers
    .map((container) => ({ container, score: scoreContainer(container.name, name) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((match) => match.container);

  return {
    container: matches[0],
    matches,
  };
}

async function getContainerItems(containerId: string | number) {
  const id = encodeURIComponent(String(containerId));
  return csqaqRequest<RawContainerItem[]>(`/info/good/container_detail?id=${id}`);
}

async function getGoodDetail(goodId: string | number) {
  const id = encodeURIComponent(String(goodId));
  return csqaqRequest<RawGoodDetail>(`/info/good?id=${id}`);
}

function normalizeItem(rawItem: RawContainerItem, detail?: RawGoodDetail): CsqaqCaseDetailItem {
  const info = detail?.goods_info;
  const qualityParts = [info?.quality_localized_name, info?.exterior_localized_name].filter(Boolean);

  return {
    id: String(info?.id ?? rawItem.id),
    name: info?.name ?? rawItem.short_name ?? String(rawItem.id),
    img: info?.img ?? rawItem.img,
    rarity: info?.rarity_localized_name ?? rawItem.rln,
    quality: qualityParts.length > 0 ? qualityParts.join(" / ") : rawItem.qln,
    buff_sell_price: toNumber(info?.buff_sell_price),
    buff_sell_num: toNumber(info?.buff_sell_num),
    yyyp_sell_price: toNumber(info?.yyyp_sell_price),
    yyyp_sell_num: toNumber(info?.yyyp_sell_num),
    steam_sell_price: toNumber(info?.steam_sell_price),
    steam_sell_num: toNumber(info?.steam_sell_num),
    updated_at: info?.updated_at,
  };
}

export async function getContainerMarketItems(containerId: string | number, limit = 20) {
  const rawItems = (await getContainerItems(containerId)).slice(0, limit);
  const items: CsqaqCaseDetailItem[] = [];

  for (const rawItem of rawItems) {
    try {
      const detail = await getGoodDetail(rawItem.id);
      items.push(normalizeItem(rawItem, detail));
    } catch (error) {
      items.push({
        ...normalizeItem(rawItem),
        error: error instanceof Error ? error.message : "详情查询失败",
      });
    }
  }

  return items;
}