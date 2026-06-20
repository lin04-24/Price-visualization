export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPriceMonitor } = await import("@/lib/price-monitor");
    startPriceMonitor();
  }
}
