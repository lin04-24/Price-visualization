"use client";

import { Box, Moon, Search, SlidersHorizontal, Sun, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type {
  ApiResult,
  CaseConfig,
  CaseState,
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
  const [casesState, setCasesState] = useState<Record<string, CaseState>>({});
  const [activeTab, setActiveTab] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [serverStartTime, setServerStartTime] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [caseForm, setCaseForm] = useState<CaseFormState>({
    id: "",
    data: emptyCase,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const uptime = useMemo(
    () => formatUptime(serverStartTime),
    [serverStartTime, nowTick],
  );

  function showToast(message: string, type: ToastState["type"] = "success") {
    setToast({ message, type });
  }

  async function loadCasesState() {
    const response = await fetch("/api/cases/state");
    setCasesState((await response.json()) as Record<string, CaseState>);
  }

  async function loadSettings() {
    const response = await fetch("/api/settings");
    setSettings((await response.json()) as Settings);
    await loadCasesState();
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

  async function resetAllCooldown() {
    if (!window.confirm("确定要重置所有箱子的冷却期吗？")) return;
    const data = await postJson("/api/cooldown/reset");
    if (data.success) {
      showToast("已重置所有冷却期");
      await loadCasesState();
    } else {
      showToast(`重置失败: ${data.message || "未知错误"}`, "error");
    }
  }

  async function resetCaseCooldown(caseId: string) {
    if (!window.confirm(`确定要重置 ${caseId} 的冷却期吗？`)) return;
    const data = await postJson(`/api/cases/${encodeURIComponent(caseId)}/cooldown/reset`);
    if (data.success) {
      showToast(data.message || "已重置冷却期");
      await loadCasesState();
    } else {
      showToast(`重置失败: ${data.message || "未知错误"}`, "error");
    }
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

  async function saveCase() {
    const id = caseForm.id.trim();
    if (!id) {
      showToast("请输入武器箱ID", "error");
      return;
    }

    const payload: CaseConfig = {
      ...caseForm.data,
      name: caseForm.data.name.trim() || id,
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

  async function deleteCaseById(id: string) {
    if (!window.confirm(`确定要删除 ${id} 的配置吗？`)) return;
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
              <div className="case-list cases-ready">
                {Object.entries(settings.cases).map(([id, caseData], index) => {
                  const state = casesState[id] || {
                    total_seconds: 0,
                    current_session_seconds: 0,
                    in_cooldown: false,
                    remaining_days: 0,
                  };
                  const status = state.in_cooldown
                    ? `冷却中 (剩余${state.remaining_days}天)`
                    : state.current_session_seconds > 0
                      ? `监控中 (${formatDuration(state.current_session_seconds)})`
                      : "等待监控";

                  return (
                    <article
                      className={`case-card ${caseData.enabled === false ? "disabled" : ""}`}
                      data-initial={String(caseData.name || id).trim().charAt(0).toUpperCase()}
                      key={id}
                      style={{ "--card-index": Math.min(index, 8) } as React.CSSProperties}
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
                      <div className="case-status">
                        <div className="status-row">
                          <span className="status-label">状态:</span>
                          <span
                            className={`status-value ${
                              state.in_cooldown
                                ? "status-cooldown"
                                : state.current_session_seconds > 0
                                  ? "status-monitoring"
                                  : "status-idle"
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                        <div className="status-row">
                          <span className="status-label">总监控:</span>
                          <span className="status-value">{formatDuration(state.total_seconds)}</span>
                        </div>
                      </div>
                      <div className="case-actions">
                        <button className="btn btn-primary btn-small" onClick={() => editCase(id)}>
                          编辑
                        </button>
                        <button
                          className="btn btn-warning btn-small"
                          onClick={() => void resetCaseCooldown(id)}
                        >
                          重置
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => void deleteCaseById(id)}
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button className="add-case-btn" onClick={openAddCaseModal}>
                + 添加武器箱
              </button>
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
          <div className="form-group">
            <TextField
              label="武器箱ID"
              value={caseForm.id}
              disabled={Boolean(editingCaseId)}
              placeholder="例如: 1078"
              onChange={(value) => setCaseForm((current) => ({ ...current, id: value }))}
            />
            <TextField
              label="武器箱名称"
              value={caseForm.data.name}
              placeholder="例如: 梦魇武器箱"
              onChange={(value) =>
                setCaseForm((current) => ({
                  ...current,
                  data: { ...current.data, name: value },
                }))
              }
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
}: {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="form-item">
      <label>{label}</label>
      <input
        disabled={disabled}
        placeholder={placeholder}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

