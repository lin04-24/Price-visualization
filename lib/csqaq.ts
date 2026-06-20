import {
  getCsqaqContainersSyncedAt,
  getStoredCsqaqContainers,
  saveCsqaqContainers,
} from "./db";
import type { CsqaqContainer, CsqaqGoodDetail, CsqaqGoodSummary } from "./types";

const CSQAQ_BASE_URL = "https://api.csqaq.com/api/v1";
const CONTAINER_CACHE_MS = 1000 * 60 * 30;
const CONTAINER_SYNC_INTERVAL_MS = 1000 * 60 * 60 * 24;
const CONTAINER_SYNC_CHECK_MS = 1000 * 60 * 60;
const CSQAQ_MIN_REQUEST_INTERVAL_MS = 1200;
const CSQAQ_MAX_RETRIES = 3;
const CSQAQ_RETRY_BASE_MS = 1500;
const GOOD_LOOKUP_CACHE_MS = 1000 * 60 * 10;
const GOOD_DETAIL_CACHE_MS = 1000 * 60 * 5;

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

type RawGoodSummary = {
  id: number;
  name: string;
  market_hash_name?: string;
};

type RawGoodIdResponse = {
  data?: Record<string, RawGoodSummary>;
  page_index?: number;
  page_size?: number;
  total?: number;
};

type RawGoodDetail = {
  goods_info?: {
    id?: number | string;
    name?: string;
    market_hash_name?: string;
    img?: string;
    type_localized_name?: string;
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
let containerSyncPromise: Promise<CsqaqContainer[]> | null = null;
let backgroundSyncStarted = false;
let csqaqRequestQueue = Promise.resolve();
let nextCsqaqRequestAt = 0;
const goodLookupCache = new Map<string, { expiresAt: number; promise: Promise<RawGoodIdResponse> }>();
const goodDetailCache = new Map<string, { expiresAt: number; promise: Promise<RawGoodDetail> }>();

export class CsqaqRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CsqaqRequestError";
  }
}

export function getCsqaqErrorStatus(error: unknown) {
  return error instanceof CsqaqRequestError ? error.status : 502;
}

function getApiToken() {
  const token = process.env.CSQAQ_API_TOKEN?.trim();
  if (!token) {
    throw new Error("缺少 CSQAQ_API_TOKEN 环境变量");
  }
  return token;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMs(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return null;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds)) {
    return Math.max(retryAfterSeconds * 1000, 0);
  }

  const retryAt = Date.parse(retryAfter);
  return Number.isFinite(retryAt) ? Math.max(retryAt - Date.now(), 0) : null;
}

function enqueueCsqaqRequest<T>(request: () => Promise<T>) {
  const queued = csqaqRequestQueue.then(async () => {
    const waitMs = Math.max(nextCsqaqRequestAt - Date.now(), 0);
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    try {
      return await request();
    } finally {
      nextCsqaqRequestAt = Date.now() + CSQAQ_MIN_REQUEST_INTERVAL_MS;
    }
  });

  csqaqRequestQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
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

function toGoodSummary(good: RawGoodSummary): CsqaqGoodSummary {
  return {
    id: good.id,
    name: good.name,
    market_hash_name: good.market_hash_name,
  };
}

function scoreName(primaryName: string, query: string, secondaryName = "") {
  const target = normalizeName(primaryName);
  const normalizedQuery = normalizeName(query);
  const secondaryTarget = normalizeName(secondaryName);

  if (!normalizedQuery) return 0;
  if (target === normalizedQuery) return 1000;
  if (target.includes(normalizedQuery)) return 800 - Math.abs(target.length - normalizedQuery.length);
  if (normalizedQuery.includes(target)) return 650 - Math.abs(target.length - normalizedQuery.length);
  if (primaryName.includes(query)) return 600;
  if (secondaryTarget && secondaryTarget === normalizedQuery) return 560;
  if (secondaryTarget && secondaryTarget.includes(normalizedQuery)) return 520;

  return 0;
}

async function shouldRefreshContainers() {
  const syncedAt = await getCsqaqContainersSyncedAt();
  if (!syncedAt) return true;
  const syncedTime = new Date(syncedAt).getTime();
  return !Number.isFinite(syncedTime) || Date.now() - syncedTime >= CONTAINER_SYNC_INTERVAL_MS;
}

async function csqaqRequest<T>(path: string, init: RequestInit = {}) {
  return enqueueCsqaqRequest(async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= CSQAQ_MAX_RETRIES; attempt += 1) {
      const response = await fetch(`${CSQAQ_BASE_URL}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ApiToken: getApiToken(),
          ...init.headers,
        },
      });

      if (response.status === 429) {
        lastError = new CsqaqRequestError("CSQAQ 请求过于频繁，请稍后再试", 429);
        if (attempt < CSQAQ_MAX_RETRIES) {
          const retryAfterMs = getRetryAfterMs(response);
          await sleep(retryAfterMs ?? CSQAQ_RETRY_BASE_MS * (attempt + 1));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        throw new CsqaqRequestError(`CSQAQ 请求失败: HTTP ${response.status}`, response.status);
      }

      const payload = JSON.parse(new TextDecoder("utf-8").decode(await response.arrayBuffer())) as CsqaqEnvelope<T>;
      if (payload.code !== 200) {
        throw new CsqaqRequestError(payload.msg || `CSQAQ 返回异常状态: ${payload.code}`, 502);
      }

      return payload.data;
    }

    throw lastError ?? new CsqaqRequestError("CSQAQ 请求失败", 502);
  });
}

async function fetchContainersFromCsqaq() {
  const now = Date.now();
  if (!containersCache || containersCache.expiresAt <= now) {
    const promise = csqaqRequest<RawContainer[]>("/info/container_data_info", { method: "POST" }).then(
      (containers) => containers.map(toContainer),
    );

    containersCache = {
      expiresAt: now + CONTAINER_CACHE_MS,
      promise,
    };

    promise.catch(() => {
      if (containersCache?.promise === promise) {
        containersCache = null;
      }
    });
  }

  return containersCache.promise;
}

export async function syncContainersFromCsqaq(force = false) {
  if (!force && !(await shouldRefreshContainers())) {
    return getStoredCsqaqContainers();
  }

  if (!containerSyncPromise) {
    containerSyncPromise = fetchContainersFromCsqaq()
      .then(async (containers) => {
        await saveCsqaqContainers(containers);
        return containers;
      })
      .finally(() => {
        containerSyncPromise = null;
      });
  }

  return containerSyncPromise;
}

export function startContainerAutoSync() {
  if (backgroundSyncStarted) return;
  backgroundSyncStarted = true;

  void syncContainersFromCsqaq().catch(() => undefined);
  setInterval(() => {
    void syncContainersFromCsqaq().catch(() => undefined);
  }, CONTAINER_SYNC_CHECK_MS).unref?.();
}

export async function getContainers() {
  const stored = await getStoredCsqaqContainers();
  if (stored.length > 0) {
    if (await shouldRefreshContainers()) {
      void syncContainersFromCsqaq().catch(() => undefined);
    }
    return stored;
  }

  return syncContainersFromCsqaq(true);
}

export async function getContainerSyncStatus() {
  if (await shouldRefreshContainers()) {
    await syncContainersFromCsqaq();
  }

  return {
    synced_at: await getCsqaqContainersSyncedAt(),
    count: (await getStoredCsqaqContainers()).length,
  };
}

export async function findContainerById(containerId: string | number) {
  const id = Number(containerId);
  if (!Number.isFinite(id)) return undefined;
  const containers = await getContainers();
  return containers.find((container) => container.id === id);
}

export async function lookupContainerByName(name: string, limit = 8) {
  const containers = await getContainers();
  const matches = containers
    .map((container) => ({ container, score: scoreName(container.name, name, container.comment) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.container.id - right.container.id)
    .slice(0, limit)
    .map((match) => match.container);

  return {
    container: matches[0],
    matches,
    synced_at: await getCsqaqContainersSyncedAt(),
  };
}

export async function lookupGoodByName(name: string) {
  const cacheKey = normalizeName(name);
  const now = Date.now();
  const cached = goodLookupCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return rankGoodMatches(await cached.promise, name);
  }

  const promise = csqaqRequest<RawGoodIdResponse>("/info/get_good_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      page_index: 1,
      page_size: 20,
      search: name,
    }),
  });

  goodLookupCache.set(cacheKey, {
    expiresAt: now + GOOD_LOOKUP_CACHE_MS,
    promise,
  });

  try {
    return rankGoodMatches(await promise, name);
  } catch (error) {
    if (goodLookupCache.get(cacheKey)?.promise === promise) {
      goodLookupCache.delete(cacheKey);
    }
    throw error;
  }
}

function rankGoodMatches(result: RawGoodIdResponse, name: string) {
  const goods = Object.values(result.data ?? {}).map(toGoodSummary);
  const rankedMatches = goods
    .map((good, index) => ({
      good,
      index,
      score: scoreName(good.name, name, good.market_hash_name),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 5)
    .map((match) => match.good);

  return {
    good: rankedMatches[0],
    matches: rankedMatches,
  };
}

async function getContainerItems(containerId: string | number) {
  const id = encodeURIComponent(String(containerId));
  return csqaqRequest<RawContainerItem[]>(`/info/good/container_detail?id=${id}`);
}

async function getGoodDetail(goodId: string | number) {
  const cacheKey = String(goodId);
  const now = Date.now();
  const cached = goodDetailCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const id = encodeURIComponent(cacheKey);
  const promise = csqaqRequest<RawGoodDetail>(`/info/good?id=${id}`);
  goodDetailCache.set(cacheKey, {
    expiresAt: now + GOOD_DETAIL_CACHE_MS,
    promise,
  });

  try {
    return await promise;
  } catch (error) {
    if (goodDetailCache.get(cacheKey)?.promise === promise) {
      goodDetailCache.delete(cacheKey);
    }
    throw error;
  }
}

function normalizeGoodDetail(detail: RawGoodDetail, fallback?: RawContainerItem | CsqaqGoodSummary): CsqaqGoodDetail {
  const info = detail.goods_info;
  const rawFallback = fallback as RawContainerItem | undefined;
  const summaryFallback = fallback as CsqaqGoodSummary | undefined;
  const fallbackId = summaryFallback?.id ?? rawFallback?.id;
  const qualityParts = [info?.quality_localized_name, info?.exterior_localized_name].filter(Boolean);

  if (!info?.id && !fallbackId) {
    throw new Error("CSQAQ 未返回饰品详情");
  }

  return {
    id: String(info?.id ?? fallbackId),
    name: info?.name ?? rawFallback?.short_name ?? summaryFallback?.name ?? String(fallbackId),
    market_hash_name: info?.market_hash_name ?? summaryFallback?.market_hash_name,
    img: info?.img ?? rawFallback?.img,
    type: info?.type_localized_name,
    rarity: info?.rarity_localized_name ?? rawFallback?.rln,
    quality: qualityParts.length > 0 ? qualityParts.join(" / ") : rawFallback?.qln,
    buff_sell_price: toNumber(info?.buff_sell_price),
    buff_sell_num: toNumber(info?.buff_sell_num),
    yyyp_sell_price: toNumber(info?.yyyp_sell_price),
    yyyp_sell_num: toNumber(info?.yyyp_sell_num),
    steam_sell_price: toNumber(info?.steam_sell_price),
    steam_sell_num: toNumber(info?.steam_sell_num),
    updated_at: info?.updated_at,
  };
}

export async function getGoodMarketDetail(goodId: string | number) {
  const detail = await getGoodDetail(goodId);
  return normalizeGoodDetail(detail);
}

export async function getContainerMarketItems(containerId: string | number, limit = 20) {
  const rawItems = (await getContainerItems(containerId)).slice(0, limit);
  const items: CsqaqGoodDetail[] = [];

  for (const rawItem of rawItems) {
    try {
      const detail = await getGoodDetail(rawItem.id);
      items.push(normalizeGoodDetail(detail, rawItem));
    } catch (error) {
      items.push({
        ...normalizeGoodDetail({}, rawItem),
        error: error instanceof Error ? error.message : "详情查询失败",
      });
    }
  }

  return items;
}