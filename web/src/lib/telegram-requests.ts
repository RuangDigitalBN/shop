import "server-only";
import type { RequestData } from "./customer-requests";

const singleLine = (value: string, limit: number) => value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit);

// Isolated from order notifications, sharing only the existing environment settings/pattern.
export async function notifyNewRequest(request: RequestData & { id: string; created_at: string }): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) { console.error("Telegram request notification skipped: missing configuration."); return; }
    const text = [
      request.request_type === "game_request" ? "New Ruang Digital game request" : "New Ruang Digital feedback",
      `Reference: ${singleLine(request.id, 40)}`,
      request.game_name ? `Game: ${singleLine(request.game_name, 120)}` : `Category: ${singleLine(request.feedback_category ?? "General", 40)}`,
      ...(request.requested_item ? [`Item: ${singleLine(request.requested_item, 160)}`] : []),
      ...(request.message ? [`Message: ${singleLine(request.message, 500)}`] : []),
      ...(request.contact ? [`Contact: ${singleLine(request.contact, 120)}`] : []),
      `Timestamp: ${singleLine(request.created_at, 40)}`,
      "Check Admin Requests for full details.",
    ].join("\n");
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(5_000), redirect: "manual",
    });
    if (!response.ok) { console.error("Telegram request notification failed: HTTP status", response.status); return; }
    const result = await response.json() as { ok?: boolean };
    if (result?.ok !== true) console.error("Telegram request notification failed: API rejected message.");
  } catch {
    // Exception text can contain the token-bearing URL: never log it or submitted text.
    console.error("Telegram request notification failed: request or response error.");
  }
}
