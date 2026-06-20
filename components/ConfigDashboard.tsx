"use client";

import { AlertTriangle, Box, Loader2, Moon, Search, SlidersHorizontal, Sun, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type {
  ApiResult,
  CaseConfig,
  CaseMarketSnapshot,
  CsqaqContainer,
  CsqaqContainerSearchResult,
  CsqaqGoodBatchPriceResult,
  CsqaqGoodDetail,
  CsqaqGoodDetailResult,
  CsqaqGoodLookupResult,
  CooldownConfig,
  ScrapeConfig,
  Settings,
  SwitchesConfig,
} from "@/lib/types";

const tabs = [
  { label: "武器箱", icon: Box },
  { label: "全局开关", icon: SlidersHorizontal },
  { label: "冷却期/抓取", icon: Search },
];

const emptyCase: CaseConfig = {
  name: "",
  enabled: true,
  buff_uu: {
    min_price: 0,
    max_price: 999999,
  },
  steam: {
    min_price: 0,
    max_price: 999999,
  },
};

type ToastState = {
  message: string;
  type: "success" | "error";
};

type CaseFormState = {
  id: string;
  data: CaseConfig;
};

type CaseDetailState = {
  caseId: string;
  caseName: string;
  data: CsqaqGoodDetail | null;
  loading: boolean;
  error: string | null;
};

type BatchPriceState = {
  items: CsqaqGoodDetail[];
  loading: boolean;
  error: string | null;
};

type AppDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "info" | "warning" | "danger";
  onConfirm?: () => void | Promise<void>;
};

function formatDuration(seconds: number) {
  const rounded = Math.round(seconds * 10) / 10;

  if (rounded < 60) {
    return `${rounded.toFixed(1)}秒`;
  }

  if (rounded < 3600) {
    const minutes = Math.floor(rounded / 60);
    const remainSeconds = (rounded % 60).toFixed(1);
    return `${minutes}分${remainSeconds}秒`;
  }

  if (rounded < 86400) {
    const hours = Math.floor(rounded / 3600);
    const remainMinutes = Math.floor((rounded % 3600) / 60);
    const remainSeconds = (rounded % 60).toFixed(1);
    return remainMinutes > 0
      ? `${hours}时${remainMinutes}分${remainSeconds}秒`
      : `${hours}时${remainSeconds}秒`;
  }

  const days = Math.floor(rounded / 86400);
  const remainHours = Math.floor((rounded % 86400) / 3600);
  const remainMinutes = Math.floor((rounded % 3600) / 60);
  const remainSeconds = (rounded % 60).toFixed(1);
  let result = `${days}天`;
  if (remainHours > 0) result += `${remainHours}时`;
  if (remainMinutes > 0) result += `${remainMinutes}分`;
  return `${result}${remainSeconds}秒`;
}

function formatUptime(startTime: string | null) {
  if (!startTime) {
    return "加载中...";
  }

  const elapsed = Date.now() - new Date(startTime).getTime();
  const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  const years = Math.floor(days / 365);
  const remainDays = days % 365;
  const hours = Math.floor((elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

  return `${years > 0 ? `${years}年` : ""}${
    remainDays > 0 || years > 0 ? `${remainDays}天` : ""
  }${hours}时${minutes}分${seconds}秒`;
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined) {
    return "--";
  }

  return `￥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatCount(value: number | null) {
  if (value === null || value === undefined) {
    return "暂无在售";
  }

  return `${value.toLocaleString("zh-CN")}件在售`;
}

type SettingsResponse = Settings & {
  case_market_snapshots?: Record<string, CaseMarketSnapshot>;
};

type CaseMarketSnapshotResult = ApiResult & {
  snapshot?: CaseMarketSnapshot;
};

function formatBeijingDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

async function postJson<T>(url: string, payload?: T): Promise<ApiResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return (await response.json()) as ApiResult;
}

export function ConfigDashboard() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [caseMarketSnapshots, setCaseMarketSnapshots] = useState<Record<string, CaseMarketSnapshot>>({});
  const [activeTab, setActiveTab] = useState(0);
  const [darkMode, setDarkMode] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [serverStartTime, setServerStartTime] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [caseForm, setCaseForm] = useState<CaseFormState>({
    id: "",
    data: emptyCase,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [containerSuggestions, setContainerSuggestions] = useState<CsqaqContainer[]>([]);
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);
  const [showContainerSuggestions, setShowContainerSuggestions] = useState(false);
  const [caseDetail, setCaseDetail] = useState<CaseDetailState | null>(null);
  const [batchPrices, setBatchPrices] = useState<BatchPriceState | null>(null);
  const [appDialog, setAppDialog] = useState<AppDialogState | null>(null);

  const uptime = useMemo(
    () => formatUptime(serverStartTime),
    [serverStartTime, nowTick],
  );

  function showToast(message: string, type: ToastState["type"] = "success") {
    setToast({ message, type });
  }

  function openAppDialog(dialog: AppDialogState) {
    setAppDialog(dialog);
  }

  async function confirmAppDialog() {
    const action = appDialog?.onConfirm;
    setAppDialog(null);
    if (!action) return;

    try {
      await action();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败", "error");
    }
  }

  async function loadSettings() {
    const response = await fetch("/api/settings");
    const data = (await response.json()) as SettingsResponse;
    const { case_market_snapshots: snapshots = {}, ...loadedSettings } = data;
    setSettings(loadedSettings);
    setCaseMarketSnapshots(snapshots);
  }

  useEffect(() => {
    document.body.dataset.theme = darkMode ? "dark" : "light";
  }, [darkMode]);

  useEffect(() => {
    void loadSettings().catch((error) => showToast(`加载配置失败: ${error.message}`, "error"));
    void fetch("/api/uptime")
      .then((response) => response.json())
      .then((data: { success: boolean; start_time?: string }) => {
        if (data.success && data.start_time) {
          setServerStartTime(data.start_time);
        }
      })
      .catch((error) => showToast(`获取运行时间失败: ${error.message}`, "error"));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!isModalOpen || editingCaseId) {
      setContainerSuggestions([]);
      setShowContainerSuggestions(false);
      return;
    }

    const query = caseForm.data.name.trim();
    if (query.length < 2) {
      setContainerSuggestions([]);
      setShowContainerSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSuggestionLoading(true);
      fetch(`/api/csqaq/containers?q=${encodeURIComponent(query)}&limit=8`, {
        signal: controller.signal,
      })
        .then((response) => response.json() as Promise<CsqaqContainerSearchResult>)
        .then((data) => {
          if (!data.success) {
            setContainerSuggestions([]);
            return;
          }
          setContainerSuggestions(data.matches ?? []);
          setShowContainerSuggestions(true);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setContainerSuggestions([]);
        })
        .finally(() => setIsSuggestionLoading(false));
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [caseForm.data.name, editingCaseId, isModalOpen]);

  async function saveSwitches() {
    const data = await postJson("/api/switches", settings.switches);
    if (data.success) {
      showToast("全局开关已保存");
    } else {
      showToast(`保存失败: ${data.message || "未知错误"}`, "error");
    }
  }

  async function saveCooldown() {
    const data = await postJson("/api/cooldown", settings.cooldown);
    if (data.success) {
      showToast("冷却期配置已保存");
    } else {
      showToast(`保存失败: ${data.message || "未知错误"}`, "error");
    }
  }

  async function saveScrape() {
    const data = await postJson("/api/scrape", settings.scrape);
    if (data.success) {
      showToast("抓取配置已保存");
    } else {
      showToast(`保存失败: ${data.message || "未知错误"}`, "error");
    }
  }

  function resetAllCooldown() {
    openAppDialog({
      title: "重置所有冷却",
      message: "确定要重置所有箱子的冷却期吗？此操作会清空当前冷却状态。",
      confirmLabel: "重置",
      cancelLabel: "取消",
      variant: "warning",
      onConfirm: async () => {
        const data = await postJson("/api/cooldown/reset");
        if (data.success) {
          showToast("已重置所有冷却期");
        } else {
          showToast(`重置失败: ${data.message || "未知错误"}`, "error");
        }
      },
    });
  }

  function resetCaseCooldown(caseId: string) {
    openAppDialog({
      title: "重置冷却期",
      message: `确定要重置 ${caseId} 的冷却期吗？`,
      confirmLabel: "重置",
      cancelLabel: "取消",
      variant: "warning",
      onConfirm: async () => {
        const data = await postJson(`/api/cases/${encodeURIComponent(caseId)}/cooldown/reset`);
        if (data.success) {
          showToast(data.message || "已重置冷却期");
        } else {
          showToast(`重置失败: ${data.message || "未知错误"}`, "error");
        }
      },
    });
  }

  function openAddCaseModal() {
    setEditingCaseId(null);
    setCaseForm({
      id: "",
      data: {
        ...emptyCase,
        buff_uu: { ...emptyCase.buff_uu },
        steam: { ...emptyCase.steam },
      },
    });
    setIsModalOpen(true);
  }

  function editCase(id: string) {
    const caseData = settings.cases[id];
    if (!caseData) {
      showToast("找不到配置", "error");
      return;
    }

    setEditingCaseId(id);
    setCaseForm({
      id,
      data: {
        ...caseData,
        buff_uu: { ...caseData.buff_uu },
        steam: { ...caseData.steam },
      },
    });
    setIsModalOpen(true);
  }


  async function lookupCaseId(nameOverride?: string) {
    const name = (nameOverride ?? caseForm.data.name).trim();
    if (!name) {
      showToast("请先输入饰品中文名", "error");
      return;
    }

    setIsLookupLoading(true);
    try {
      const response = await fetch(`/api/csqaq/goods/lookup?name=${encodeURIComponent(name)}`);
      const data = (await response.json()) as CsqaqGoodLookupResult;
      if (!response.ok || !data.success || !data.good) {
        showToast(data.message || "没有查询到对应饰品", "error");
        return;
      }

      setCaseForm((current) => ({
        ...current,
        id: String(data.good?.id ?? current.id),
        data: {
          ...current.data,
          name: data.good?.name ?? current.data.name,
          market_hash_name: data.good?.market_hash_name ?? current.data.market_hash_name,
        },
      }));
      setShowContainerSuggestions(false);
      showToast(`已匹配: ${data.good.name} / ID ${data.good.id}`);
    } catch (error) {
      showToast(`查询失败: ${error instanceof Error ? error.message : "未知错误"}`, "error");
    } finally {
      setIsLookupLoading(false);
    }
  }

  function selectContainerSuggestion(container: CsqaqContainer) {
    setCaseForm((current) => ({
      ...current,
      data: {
        ...current.data,
        name: container.name,
      },
    }));
    setContainerSuggestions([]);
    setShowContainerSuggestions(false);
    void lookupCaseId(container.name);
  }

  async function queryConfiguredCasePrices() {
    const configuredCount = Object.keys(settings.cases).length;
    if (configuredCount > 50) {
      openAppDialog({
        title: "无法批量查询",
        message: `已配置 ${configuredCount} 个饰品，批量查询最多支持 50 个。`,
        confirmLabel: "知道了",
        variant: "info",
      });
      return;
    }

    setBatchPrices({ items: [], loading: true, error: null });
    try {
      const response = await fetch("/api/csqaq/goods/prices/batch", { method: "POST" });
      const data = (await response.json()) as CsqaqGoodBatchPriceResult;
      if (!response.ok || !data.success) {
        throw new Error(data.message || "批量查询失败");
      }

      setBatchPrices({ items: data.items ?? [], loading: false, error: null });
      if (data.case_market_snapshots) {
        setCaseMarketSnapshots((current) => ({
          ...current,
          ...data.case_market_snapshots,
        }));
      }
      showToast(`已批量查询 ${data.count ?? data.items?.length ?? 0} 个饰品`);
    } catch (error) {
      setBatchPrices({
        items: [],
        loading: false,
        error: error instanceof Error ? error.message : "批量查询失败",
      });
    }
  }

  async function openCaseDetail(caseId: string, caseData: CaseConfig) {
    const fallbackName = caseData.name || caseId;
    setCaseDetail({
      caseId,
      caseName: fallbackName,
      data: null,
      loading: true,
      error: null,
    });

    try {
      const numericCaseId = /^\d+$/.test(caseId) ? caseId : "";
      let goodId = numericCaseId;
      const nameForLookup = caseData.name.trim();

      if (!goodId && nameForLookup) {
        const lookupResponse = await fetch(
          `/api/csqaq/goods/lookup?name=${encodeURIComponent(nameForLookup)}`,
        );
        const lookupData = (await lookupResponse.json()) as CsqaqGoodLookupResult;
        if (lookupResponse.ok && lookupData.success && lookupData.good) {
          goodId = String(lookupData.good.id);
        } else {
          throw new Error(lookupData.message || "无法匹配饰品 good_id");
        }
      }

      if (!goodId) {
        throw new Error("无法匹配饰品 good_id");
      }

      const detailResponse = await fetch(`/api/csqaq/goods/${encodeURIComponent(goodId)}`);
      const detailData = (await detailResponse.json()) as CsqaqGoodDetailResult;
      if (!detailResponse.ok || !detailData.success || !detailData.item) {
        throw new Error(detailData.message || "饰品详情查询失败");
      }

      setCaseDetail({
        caseId: detailData.item.id,
        caseName: detailData.item.name || fallbackName,
        data: detailData.item,
        loading: false,
        error: null,
      });

      void postJson<Pick<CaseMarketSnapshot, "steam_sell_price" | "yyyp_sell_price">>(
        `/api/cases/${encodeURIComponent(caseId)}/market-snapshot`,
        {
          steam_sell_price: detailData.item.steam_sell_price,
          yyyp_sell_price: detailData.item.yyyp_sell_price,
        },
      )
        .then((snapshotResponse) => snapshotResponse as CaseMarketSnapshotResult)
        .then((snapshotResponse) => {
          if (!snapshotResponse.success || !snapshotResponse.snapshot) return;
          setCaseMarketSnapshots((current) => ({
            ...current,
            [caseId]: snapshotResponse.snapshot as CaseMarketSnapshot,
          }));
        })
        .catch(() => undefined);
    } catch (error) {
      setCaseDetail((current) => ({
        caseId: current?.caseId ?? caseId,
        caseName: current?.caseName ?? fallbackName,
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "详情查询失败",
      }));
    }
  }

  async function saveCase() {
    const id = caseForm.id.trim();
    if (!id) {
      showToast("请输入饰品ID", "error");
      return;
    }

    const payload: CaseConfig = {
      ...caseForm.data,
      name: caseForm.data.name.trim() || id,
      market_hash_name: caseForm.data.market_hash_name,
    };
    const data = await postJson(`/api/cases/${encodeURIComponent(id)}`, payload);
    if (data.success) {
      showToast(data.message || "配置已保存");
      setIsModalOpen(false);
      await loadSettings();
    } else {
      showToast(`保存失败: ${data.message || "未知错误"}`, "error");
    }
  }

  function deleteCaseById(id: string) {
    openAppDialog({
      title: "删除配置",
      message: `确定要删除 ${id} 的配置吗？删除后该饰品的冷却状态和行情快照也会一并清理。`,
      confirmLabel: "删除",
      cancelLabel: "取消",
      variant: "danger",
      onConfirm: async () => {
        const response = await fetch(`/api/cases/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as ApiResult;
        if (data.success) {
          showToast(data.message || "配置已删除");
          await loadSettings();
        } else {
          showToast(`删除失败: ${data.message || "未知错误"}`, "error");
        }
      },
    });
  }

  function updateSwitches(updater: (current: SwitchesConfig) => SwitchesConfig) {
    setSettings((current) => ({
      ...current,
      switches: updater(current.switches),
    }));
  }

  function updateCooldown(updater: (current: CooldownConfig) => CooldownConfig) {
    setSettings((current) => ({
      ...current,
      cooldown: updater(current.cooldown),
    }));
  }

  function updateScrape(updater: (current: ScrapeConfig) => ScrapeConfig) {
    setSettings((current) => ({
      ...current,
      scrape: updater(current.scrape),
    }));
  }

  return (
    <>
      <div className="container">
        <header className="header">
          <div className="header-left">
            <h1>Steam市场情报站</h1>
          </div>
          <div className="header-actions">
            <button
              className="theme-toggle"
              type="button"
              onClick={() => setDarkMode((value) => !value)}
              aria-label="切换深色模式"
              title="切换深色 / 浅色模式"
            >
              <span className="theme-toggle-track">
                <span className="theme-toggle-thumb">
                  <Sun className="ico-sun" aria-hidden="true" />
                  <Moon className="ico-moon" aria-hidden="true" />
                </span>
              </span>
            </button>
            <div className="header-right">
              <div className="uptime-label">网站运行时间</div>
              <div className="uptime-value">{uptime}</div>
            </div>
          </div>
        </header>

        <main className="pager">
          <div className="pager-track" style={{ "--page": activeTab } as React.CSSProperties}>
            <section className={`panel ${activeTab === 0 ? "active" : ""}`}>
              <div className="panel-title">武器箱配置</div>
              <button className="add-case-btn add-case-btn-top" onClick={openAddCaseModal}>
                + 添加武器箱
              </button>
              <div className="case-list cases-ready">
                {Object.entries(settings.cases).map(([id, caseData], index) => {
                  const snapshot = caseMarketSnapshots[id];

                  return (
                    <article
                      className={`case-card ${caseData.enabled === false ? "disabled" : ""}`}
                      data-initial={String(caseData.name || id).trim().charAt(0).toUpperCase()}
                      key={id}
                      role="button"
                      tabIndex={0}
                      title="点击查看当前饰品市场详情"
                      style={{ "--card-index": Math.min(index, 8) } as React.CSSProperties}
                      onClick={() => void openCaseDetail(id, caseData)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void openCaseDetail(id, caseData);
                        }
                      }}
                    >
                      <div className="case-header">
                        <div>
                          <div className="case-name">{caseData.name || id}</div>
                          <div className="case-id">ID: {id}</div>
                        </div>
                        <span
                          className={`status-badge ${
                            caseData.enabled !== false ? "status-enabled" : "status-disabled"
                          }`}
                        >
                          {caseData.enabled !== false ? "已启用" : "已禁用"}
                        </span>
                      </div>
                      <div className="case-config">
                        <div>
                          <span>BUFF/悠悠有品</span>
                          <span>
                            {caseData.buff_uu.min_price} - {caseData.buff_uu.max_price}
                          </span>
                        </div>
                        <div>
                          <span>Steam</span>
                          <span>
                            {caseData.steam.min_price} - {caseData.steam.max_price}
                          </span>
                        </div>
                      </div>
                      <div className="case-market-snapshot">
                        <div className="market-snapshot-row">
                          <span>Steam在售价</span>
                          <strong>{formatPrice(snapshot?.steam_sell_price ?? null)}</strong>
                        </div>
                        <div className="market-snapshot-row">
                          <span>悠悠有品在售价</span>
                          <strong>{formatPrice(snapshot?.yyyp_sell_price ?? null)}</strong>
                        </div>
                        <small>
                          上次用户更新时间（北京时间）：
                          {snapshot?.updated_at ? formatBeijingDateTime(snapshot.updated_at) : "暂无"}
                        </small>
                      </div>
                      <div className="case-actions">
                        <button
                          className="btn btn-primary btn-small"
                          onClick={(event) => {
                            event.stopPropagation();
                            editCase(id);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          className="btn btn-warning btn-small"
                          onClick={(event) => {
                            event.stopPropagation();
                            void resetCaseCooldown(id);
                          }}
                        >
                          重置
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteCaseById(id);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={`panel ${activeTab === 1 ? "active" : ""}`}>
              <div className="panel-title">全局开关</div>
              <SwitchCard
                title="BUFF / 悠悠有品"
                enabled={settings.switches.buff_uu.enabled}
                onEnabledChange={(enabled) =>
                  updateSwitches((current) => ({
                    ...current,
                    buff_uu: { ...current.buff_uu, enabled },
                  }))
                }
              >
                <CheckboxItem
                  label="下限提醒"
                  checked={settings.switches.buff_uu.min_alert}
                  disabled={!settings.switches.buff_uu.enabled}
                  onChange={(checked) =>
                    updateSwitches((current) => ({
                      ...current,
                      buff_uu: { ...current.buff_uu, min_alert: checked },
                    }))
                  }
                />
                <CheckboxItem
                  label="上限提醒"
                  checked={settings.switches.buff_uu.max_alert}
                  disabled={!settings.switches.buff_uu.enabled}
                  onChange={(checked) =>
                    updateSwitches((current) => ({
                      ...current,
                      buff_uu: { ...current.buff_uu, max_alert: checked },
                    }))
                  }
                />
              </SwitchCard>

              <SwitchCard
                title="Steam"
                enabled={settings.switches.steam.enabled}
                onEnabledChange={(enabled) =>
                  updateSwitches((current) => ({
                    ...current,
                    steam: { ...current.steam, enabled },
                  }))
                }
              >
                <CheckboxItem
                  label="下限提醒"
                  checked={settings.switches.steam.min_alert}
                  disabled={!settings.switches.steam.enabled}
                  onChange={(checked) =>
                    updateSwitches((current) => ({
                      ...current,
                      steam: { ...current.steam, min_alert: checked },
                    }))
                  }
                />
                <CheckboxItem
                  label="上限提醒"
                  checked={settings.switches.steam.max_alert}
                  disabled={!settings.switches.steam.enabled}
                  onChange={(checked) =>
                    updateSwitches((current) => ({
                      ...current,
                      steam: { ...current.steam, max_alert: checked },
                    }))
                  }
                />
              </SwitchCard>

              <SwitchCard
                title="涨跌幅监控"
                enabled={settings.switches.change.enabled}
                onEnabledChange={(enabled) =>
                  updateSwitches((current) => ({
                    ...current,
                    change: { ...current.change, enabled },
                  }))
                }
              >
                <NumberSwitchItem
                  label="近1天涨幅"
                  value={settings.switches.change.rise_1d_percent}
                  disabled={!settings.switches.change.enabled}
                  suffix="%"
                  onChange={(value) =>
                    updateSwitches((current) => ({
                      ...current,
                      change: { ...current.change, rise_1d_percent: value },
                    }))
                  }
                />
                <NumberSwitchItem
                  label="近1天跌幅"
                  value={settings.switches.change.fall_1d_percent}
                  disabled={!settings.switches.change.enabled}
                  suffix="%"
                  onChange={(value) =>
                    updateSwitches((current) => ({
                      ...current,
                      change: { ...current.change, fall_1d_percent: value },
                    }))
                  }
                />
                <NumberSwitchItem
                  label="近3天涨幅"
                  value={settings.switches.change.rise_3d_percent}
                  disabled={!settings.switches.change.enabled}
                  suffix="%"
                  onChange={(value) =>
                    updateSwitches((current) => ({
                      ...current,
                      change: { ...current.change, rise_3d_percent: value },
                    }))
                  }
                />
                <NumberSwitchItem
                  label="近3天跌幅"
                  value={settings.switches.change.fall_3d_percent}
                  disabled={!settings.switches.change.enabled}
                  suffix="%"
                  onChange={(value) =>
                    updateSwitches((current) => ({
                      ...current,
                      change: { ...current.change, fall_3d_percent: value },
                    }))
                  }
                />
                <NumberSwitchItem
                  label="近7天涨幅"
                  value={settings.switches.change.rise_7d_percent}
                  disabled={!settings.switches.change.enabled}
                  suffix="%"
                  onChange={(value) =>
                    updateSwitches((current) => ({
                      ...current,
                      change: { ...current.change, rise_7d_percent: value },
                    }))
                  }
                />
                <NumberSwitchItem
                  label="近7天跌幅"
                  value={settings.switches.change.fall_7d_percent}
                  disabled={!settings.switches.change.enabled}
                  suffix="%"
                  onChange={(value) =>
                    updateSwitches((current) => ({
                      ...current,
                      change: { ...current.change, fall_7d_percent: value },
                    }))
                  }
                />
              </SwitchCard>

              <button className="btn btn-success" onClick={() => void saveSwitches()}>
                保存全局开关
              </button>
            </section>

            <section className={`panel settings-panel ${activeTab === 2 ? "active" : ""}`}>
              <div className="panel-title">冷却期配置（天）</div>
              <div className="card-surface">
                <div className="form-group">
                  <NumberField
                    label="售价超限冷却"
                    value={settings.cooldown.price_limit_days}
                    min={0}
                    onChange={(value) =>
                      updateCooldown((current) => ({ ...current, price_limit_days: value }))
                    }
                  />
                  <NumberField
                    label="近1天涨幅冷却"
                    value={settings.cooldown.rise_1d_days}
                    min={0}
                    onChange={(value) =>
                      updateCooldown((current) => ({ ...current, rise_1d_days: value }))
                    }
                  />
                  <NumberField
                    label="近1天跌幅冷却"
                    value={settings.cooldown.fall_1d_days}
                    min={0}
                    onChange={(value) =>
                      updateCooldown((current) => ({ ...current, fall_1d_days: value }))
                    }
                  />
                  <NumberField
                    label="近3天涨幅冷却"
                    value={settings.cooldown.rise_3d_days}
                    min={0}
                    onChange={(value) =>
                      updateCooldown((current) => ({ ...current, rise_3d_days: value }))
                    }
                  />
                  <NumberField
                    label="近3天跌幅冷却"
                    value={settings.cooldown.fall_3d_days}
                    min={0}
                    onChange={(value) =>
                      updateCooldown((current) => ({ ...current, fall_3d_days: value }))
                    }
                  />
                  <NumberField
                    label="近7天涨幅冷却"
                    value={settings.cooldown.rise_7d_days}
                    min={0}
                    onChange={(value) =>
                      updateCooldown((current) => ({ ...current, rise_7d_days: value }))
                    }
                  />
                  <NumberField
                    label="近7天跌幅冷却"
                    value={settings.cooldown.fall_7d_days}
                    min={0}
                    onChange={(value) =>
                      updateCooldown((current) => ({ ...current, fall_7d_days: value }))
                    }
                  />
                </div>
                <div className="button-group">
                  <button className="btn btn-success" onClick={() => void saveCooldown()}>
                    保存冷却期配置
                  </button>
                  <button className="btn btn-warning" onClick={() => void resetAllCooldown()}>
                    一键重置所有冷却
                  </button>
                </div>
              </div>

              <div className="panel-title">抓取配置</div>
              <div className="card-surface">
                <div className="form-group">
                  <NumberField
                    label="执行间隔（秒）"
                    value={settings.scrape.interval_seconds}
                    min={1}
                    onChange={(value) =>
                      updateScrape((current) => ({ ...current, interval_seconds: value }))
                    }
                  />
                  <NumberField
                    label="页面超时（毫秒）"
                    value={settings.scrape.timeout}
                    min={5000}
                    onChange={(value) => updateScrape((current) => ({ ...current, timeout: value }))}
                  />
                </div>
                <button className="btn btn-success" onClick={() => void saveScrape()}>
                  保存抓取配置
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>

      {activeTab === 0 ? (
        <button
          className="batch-query-fab"
          type="button"
          title="批量查询已配置饰品价格"
          aria-label="批量查询已配置饰品价格"
          disabled={batchPrices?.loading}
          onClick={() => void queryConfiguredCasePrices()}
        >
          {batchPrices?.loading ? <Loader2 className="spin-icon" aria-hidden="true" /> : <Zap aria-hidden="true" />}
        </button>
      ) : null}

      <nav className="tab-bar" role="tablist" aria-label="配置分区">
        <span className="tab-indicator" style={{ "--tab-index": activeTab } as React.CSSProperties} />
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const selected = activeTab === index;
          return (
            <button
              className={`tab-btn ${selected ? "active" : ""}`}
              role="tab"
              aria-selected={selected}
              key={tab.label}
              onClick={() => {
                setActiveTab(index);
                window.scrollTo({
                  top: 0,
                  behavior: window.innerWidth <= 720 ? "auto" : "smooth",
                });
              }}
            >
              <span className="tab-ico">
                <Icon aria-hidden="true" />
              </span>
              <span className="tab-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={`toast ${toast ? "show" : ""} ${toast?.type === "error" ? "error" : ""}`}>
        {toast?.message}
      </div>

      <div
        className={`modal ${appDialog ? "show" : ""}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setAppDialog(null);
          }
        }}
      >
        <div className={`modal-content app-dialog-content app-dialog-${appDialog?.variant ?? "info"}`}>
          <div className="app-dialog-body">
            <div className="app-dialog-icon">
              <AlertTriangle aria-hidden="true" />
            </div>
            <div>
              <h2>{appDialog?.title}</h2>
              <p>{appDialog?.message}</p>
            </div>
          </div>
          <div className="modal-actions app-dialog-actions">
            {appDialog?.cancelLabel ? (
              <button className="btn btn-primary btn-quiet" type="button" onClick={() => setAppDialog(null)}>
                {appDialog.cancelLabel}
              </button>
            ) : null}
            <button
              className={`btn ${
                appDialog?.variant === "danger"
                  ? "btn-danger"
                  : appDialog?.variant === "warning"
                    ? "btn-warning"
                    : "btn-primary"
              }`}
              type="button"
              onClick={() => void confirmAppDialog()}
            >
              {appDialog?.confirmLabel}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`modal ${isModalOpen ? "show" : ""}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setIsModalOpen(false);
          }
        }}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h2>{editingCaseId ? "编辑武器箱" : "添加武器箱"}</h2>
            <button className="close" type="button" onClick={() => setIsModalOpen(false)}>
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="form-group lookup-form-group">
            <div className="suggestion-field">
              <TextField
                label="饰品名称"
                value={caseForm.data.name}
                placeholder="输入不完整名称，例如：反冲"
                onFocus={() => setShowContainerSuggestions(containerSuggestions.length > 0)}
                onChange={(value) => {
                  setCaseForm((current) => ({
                    ...current,
                    id: "",
                    data: { ...current.data, name: value },
                  }));
                  setShowContainerSuggestions(true);
                }}
              />
              {showContainerSuggestions && (containerSuggestions.length > 0 || isSuggestionLoading) ? (
                <div className="suggestion-menu">
                  {isSuggestionLoading ? <div className="suggestion-empty">正在搜索本地收藏品库...</div> : null}
                  {containerSuggestions.map((container) => (
                    <button
                      className="suggestion-option"
                      key={container.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectContainerSuggestion(container)}
                    >
                      {container.img ? <img alt="" src={container.img} /> : <span className="suggestion-img" />}
                      <span>
                        <strong>{container.name}</strong>
                        <small>{container.comment || "收藏品"} / 收藏品ID {container.id}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              className="btn btn-primary lookup-btn"
              type="button"
              disabled={Boolean(editingCaseId) || isLookupLoading}
              onClick={() => void lookupCaseId()}
            >
              {isLookupLoading ? <Loader2 className="spin-icon" aria-hidden="true" /> : null}
              查询饰品ID
            </button>
            <TextField
              label="饰品ID / good_id"
              value={caseForm.id}
              disabled={Boolean(editingCaseId)}
              placeholder="输入中文名后点击查询自动填写"
              onChange={(value) => setCaseForm((current) => ({ ...current, id: value }))}
            />
          </div>
          <div className="checkbox-group">
            <input
              checked={caseForm.data.enabled}
              id="case_enabled"
              type="checkbox"
              onChange={(event) =>
                setCaseForm((current) => ({
                  ...current,
                  data: { ...current.data, enabled: event.target.checked },
                }))
              }
            />
            <label htmlFor="case_enabled">启用监控</label>
          </div>
          <div className="price-section">
            <h4>BUFF / 悠悠有品 价格</h4>
            <div className="form-group">
              <NumberField
                label="下限"
                value={caseForm.data.buff_uu.min_price}
                step={0.01}
                onChange={(value) =>
                  setCaseForm((current) => ({
                    ...current,
                    data: {
                      ...current.data,
                      buff_uu: { ...current.data.buff_uu, min_price: value },
                    },
                  }))
                }
              />
              <NumberField
                label="上限"
                value={caseForm.data.buff_uu.max_price}
                step={0.01}
                onChange={(value) =>
                  setCaseForm((current) => ({
                    ...current,
                    data: {
                      ...current.data,
                      buff_uu: { ...current.data.buff_uu, max_price: value },
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="price-section">
            <h4>Steam 价格</h4>
            <div className="form-group">
              <NumberField
                label="下限"
                value={caseForm.data.steam.min_price}
                step={0.01}
                onChange={(value) =>
                  setCaseForm((current) => ({
                    ...current,
                    data: {
                      ...current.data,
                      steam: { ...current.data.steam, min_price: value },
                    },
                  }))
                }
              />
              <NumberField
                label="上限"
                value={caseForm.data.steam.max_price}
                step={0.01}
                onChange={(value) =>
                  setCaseForm((current) => ({
                    ...current,
                    data: {
                      ...current.data,
                      steam: { ...current.data.steam, max_price: value },
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-danger" onClick={() => setIsModalOpen(false)}>
              取消
            </button>
            <button className="btn btn-success" onClick={() => void saveCase()}>
              保存
            </button>
          </div>
        </div>
      </div>
      <div
        className={`modal ${batchPrices ? "show" : ""}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setBatchPrices(null);
          }
        }}
      >
        <div className="modal-content detail-modal-content batch-modal-content">
          <div className="modal-header">
            <div>
              <h2>批量价格查询</h2>
              <div className="detail-subtitle">已配置饰品: {batchPrices?.items.length ?? 0}</div>
            </div>
            <button className="close" type="button" onClick={() => setBatchPrices(null)}>
              <X aria-hidden="true" />
            </button>
          </div>

          {batchPrices?.loading ? (
            <div className="detail-state">
              <Loader2 className="spin-icon" aria-hidden="true" />
              正在批量查询当前配置饰品价格...
            </div>
          ) : batchPrices?.error ? (
            <div className="detail-state detail-state-error">{batchPrices.error}</div>
          ) : batchPrices?.items.length ? (
            <div className="detail-items batch-detail-items">
              {batchPrices.items.map((item) => (
                <article className="detail-item" key={`${item.id}-${item.market_hash_name ?? item.name}`}>
                  <div className="detail-item-head batch-item-head">
                    <div>
                      <h3>{item.name}</h3>
                      {item.market_hash_name ? <div className="detail-item-meta">{item.market_hash_name}</div> : null}
                    </div>
                  </div>
                  <div className="market-grid">
                    <div className="market-card">
                      <span>网易BUFF</span>
                      <strong>{formatPrice(item.buff_sell_price)}</strong>
                      <small>{formatCount(item.buff_sell_num)}</small>
                    </div>
                    <div className="market-card">
                      <span>悠悠有品</span>
                      <strong>{formatPrice(item.yyyp_sell_price)}</strong>
                      <small>{formatCount(item.yyyp_sell_num)}</small>
                    </div>
                    <div className="market-card">
                      <span>Steam市场</span>
                      <strong>{formatPrice(item.steam_sell_price)}</strong>
                      <small>{formatCount(item.steam_sell_num)}</small>
                    </div>
                  </div>
                  {item.error ? <div className="detail-item-error">{item.error}</div> : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="detail-state">暂无已配置饰品</div>
          )}
        </div>
      </div>
      <div
        className={`modal ${caseDetail ? "show" : ""}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setCaseDetail(null);
          }
        }}
      >
        <div className="modal-content detail-modal-content">
          <div className="modal-header">
            <div>
              <h2>{caseDetail?.caseName || "饰品详情"}</h2>
              <div className="detail-subtitle">饰品 ID: {caseDetail?.caseId || "--"}</div>
            </div>
            <button className="close" type="button" onClick={() => setCaseDetail(null)}>
              <X aria-hidden="true" />
            </button>
          </div>

          {caseDetail?.loading ? (
            <div className="detail-state">
              <Loader2 className="spin-icon" aria-hidden="true" />
              正在查询当前饰品的 BUFF、悠悠有品、Steam 在售价...
            </div>
          ) : caseDetail?.error ? (
            <div className="detail-state detail-state-error">{caseDetail.error}</div>
          ) : caseDetail?.data ? (
            <div className="detail-items">
              <article className="detail-item" key={caseDetail.data.id}>
                <div className="detail-item-head">
                  {caseDetail.data.img ? (
                    <img alt="" src={caseDetail.data.img} />
                  ) : (
                    <div className="detail-item-img-placeholder" />
                  )}
                  <div>
                    <h3>{caseDetail.data.name}</h3>
                    <div className="detail-item-meta">
                      {[caseDetail.data.type, caseDetail.data.rarity, caseDetail.data.quality]
                        .filter(Boolean)
                        .join(" / ") || "饰品"}
                    </div>
                    {caseDetail.data.market_hash_name ? (
                      <div className="detail-item-meta">{caseDetail.data.market_hash_name}</div>
                    ) : null}
                  </div>
                </div>
                <div className="market-grid">
                  <div className="market-card">
                    <span>网易BUFF</span>
                    <strong>{formatPrice(caseDetail.data.buff_sell_price)}</strong>
                    <small>{formatCount(caseDetail.data.buff_sell_num)}</small>
                  </div>
                  <div className="market-card">
                    <span>悠悠有品</span>
                    <strong>{formatPrice(caseDetail.data.yyyp_sell_price)}</strong>
                    <small>{formatCount(caseDetail.data.yyyp_sell_num)}</small>
                  </div>
                  <div className="market-card">
                    <span>Steam市场</span>
                    <strong>{formatPrice(caseDetail.data.steam_sell_price)}</strong>
                    <small>{formatCount(caseDetail.data.steam_sell_num)}</small>
                  </div>
                </div>
                {caseDetail.data.error ? <div className="detail-item-error">{caseDetail.data.error}</div> : null}
                {caseDetail.data.updated_at ? (
                  <div className="detail-updated">更新时间: {caseDetail.data.updated_at}</div>
                ) : null}
              </article>
            </div>
          ) : (
            <div className="detail-state">暂无饰品详情数据</div>
          )}
        </div>
      </div>
    </>
  );
}

function SwitchCard({
  title,
  enabled,
  onEnabledChange,
  children,
}: {
  title: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="switch-card">
      <div className="switch-header">
        <input
          checked={enabled}
          type="checkbox"
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <h3>{title}</h3>
      </div>
      <div className={`switch-controls ${!enabled ? "disabled" : ""}`}>{children}</div>
    </div>
  );
}

function CheckboxItem({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`switch-item ${disabled ? "disabled" : ""}`}>
      <input
        checked={checked}
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function NumberSwitchItem({
  label,
  value,
  disabled,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`switch-item ${disabled ? "disabled" : ""}`}>
      {label}:
      <input
        disabled={disabled}
        max={100}
        min={0}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="form-item">
      <label>{label}</label>
      <input
        max={max}
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  disabled,
  placeholder,
  onChange,
  onFocus,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
}) {
  return (
    <div className="form-item">
      <label>{label}</label>
      <input
        disabled={disabled}
        placeholder={placeholder}
        type="text"
        value={value}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}


