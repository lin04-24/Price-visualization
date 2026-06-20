export interface MarketSwitchConfig {
  enabled: boolean;
  min_alert: boolean;
  max_alert: boolean;
}

export interface ChangeSwitchConfig {
  enabled: boolean;
  rise_1d_percent: number;
  fall_1d_percent: number;
  rise_3d_percent: number;
  fall_3d_percent: number;
  rise_7d_percent: number;
  fall_7d_percent: number;
}

export interface SwitchesConfig {
  buff_uu: MarketSwitchConfig;
  steam: MarketSwitchConfig;
  change: ChangeSwitchConfig;
}

export interface CooldownConfig {
  enabled: boolean;
  price_limit_days: number;
  rise_1d_days: number;
  fall_1d_days: number;
  rise_3d_days: number;
  fall_3d_days: number;
  rise_7d_days: number;
  fall_7d_days: number;
}

export interface ScrapeConfig {
  interval_seconds: number;
  timeout: number;
  max_concurrency: number;
}

export interface PriceRangeConfig {
  min_price: number;
  max_price: number;
}

export interface CaseConfig {
  name: string;
  enabled: boolean;
  buff_uu: PriceRangeConfig;
  steam: PriceRangeConfig;
}

export interface CaseState {
  total_seconds: number;
  current_session_seconds: number;
  in_cooldown: boolean;
  remaining_days: number;
}

export interface CaseMarketSnapshot {
  steam_sell_price: number | null;
  yyyp_sell_price: number | null;
  updated_at: string;
}

export interface Settings {
  switches: SwitchesConfig;
  cooldown: CooldownConfig;
  scrape: ScrapeConfig;
  cases: Record<string, CaseConfig>;
}

export interface ApiResult {
  success: boolean;
  message?: string;
}

export interface CsqaqContainer {
  id: number;
  img?: string;
  name: string;
  comment?: string;
  created_at?: string;
}

export interface CsqaqGoodSummary {
  id: number;
  name: string;
  market_hash_name?: string;
}

export interface CsqaqGoodDetail {
  id: string;
  name: string;
  market_hash_name?: string;
  img?: string;
  type?: string;
  rarity?: string;
  quality?: string;
  buff_sell_price: number | null;
  buff_sell_num: number | null;
  yyyp_sell_price: number | null;
  yyyp_sell_num: number | null;
  steam_sell_price: number | null;
  steam_sell_num: number | null;
  updated_at?: string;
  error?: string;
}

export interface CsqaqCaseDetail {
  container?: CsqaqContainer;
  items: CsqaqGoodDetail[];
}

export interface CsqaqContainerSearchResult extends ApiResult {
  matches: CsqaqContainer[];
  container?: CsqaqContainer;
  synced_at?: string | null;
  count?: number;
}

export interface CsqaqGoodLookupResult extends ApiResult {
  good?: CsqaqGoodSummary;
  matches?: CsqaqGoodSummary[];
}

export interface CsqaqGoodDetailResult extends ApiResult {
  item?: CsqaqGoodDetail;
}
