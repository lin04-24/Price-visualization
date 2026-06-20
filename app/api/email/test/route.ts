import { sendEmail } from "@/lib/email";
import { errorResponse, jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  try {
    const sentAt = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
    const result = await sendEmail(
      "Steam市场情报站邮箱测试",
      [
        "这是一封来自 Steam市场情报站 的邮箱配置测试邮件。",
        `发送时间（北京时间）：${sentAt}`,
        "如果你收到这封邮件，说明 SEND_MAIL、SEND_KEY、ACCEPT_MAIL、SEND_PORT 配置可用。",
      ].join("\n"),
    );

    return jsonResponse({
      success: !result.skipped,
      message: result.message,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "邮箱测试失败", 500);
  }
}
