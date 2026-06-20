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
