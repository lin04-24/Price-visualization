import { sendEmail } from "@/lib/email";
import { buildPriceAlertEmailText, queryConfiguredCasePrices } from "@/lib/price-alerts";

const PRICE_MONITOR_INTERVAL_MS = 1000 * 60 * 30;
const GLOBAL_KEY = "__priceVisualizationMonitor";

type MonitorState = {
  started: boolean;
  running: boolean;
  timer?: NodeJS.Timeout;
};

function getMonitorState() {
  const globalObject = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: MonitorState;
  };

  if (!globalObject[GLOBAL_KEY]) {
    globalObject[GLOBAL_KEY] = {
      started: false,
      running: false,
    };
  }

  return globalObject[GLOBAL_KEY];
}

export async function runPriceMonitorOnce() {
  const result = await queryConfiguredCasePrices();
  if (result.alerts.length === 0) {
    return {
      ...result,
      email_sent: false,
      email_message: "本次没有触发价格上下限提醒",
    };
  }

  const emailResult = await sendEmail(
    `Steam市场情报站价格提醒：${result.alerts.length} 个饰品超限`,
    buildPriceAlertEmailText(result.alerts, result.checked_at),
  );

  return {
    ...result,
    email_sent: !emailResult.skipped,
    email_message: emailResult.message,
  };
}

async function runScheduledMonitor(state: MonitorState) {
  if (state.running) {
    return;
  }

  state.running = true;
  try {
    await runPriceMonitorOnce();
  } catch (error) {
    console.error("[price-monitor] 自动批量查询失败", error);
  } finally {
    state.running = false;
  }
}

export function startPriceMonitor() {
  const state = getMonitorState();
  if (state.started) {
    return;
  }

  state.started = true;
  state.timer = setInterval(() => {
    void runScheduledMonitor(state);
  }, PRICE_MONITOR_INTERVAL_MS);
  state.timer.unref?.();
}
