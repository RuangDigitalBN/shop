import "server-only";

type OrderNotification = {
  orderNumber: string;
  customerName: string;
  total: number;
  paymentStatus: string | null;
  createdAt: string | null;
  items: { name: string; quantity: number }[];
};

function singleLine(value: string, limit: number) {
  return value.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").slice(0, limit);
}

// Best effort only: never let Telegram affect a committed customer order.
export async function notifyNewOrder(order: OrderNotification): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.error("Telegram order notification skipped: missing configuration.");
      return;
    }

    // Bound product text so even a large cart stays below Telegram's limit.
    const itemSummary = order.items.slice(0, 15).map(
      (item) => `- ${item.quantity} x ${singleLine(item.name, 120)}`
    );
    if (order.items.length > 15) {
      itemSummary.push(`- ${order.items.length - 15} more cart entries`);
    }

    const text = [
      "New Ruang Digital order",
      `Order: ${singleLine(order.orderNumber, 80)}`,
      `Customer: ${singleLine(order.customerName, 120)}`,
      `Total: BND ${order.total.toFixed(2)}`,
      `Payment: ${singleLine(order.paymentStatus ?? "unknown", 40)}`,
      `Timestamp: ${singleLine(order.createdAt ?? "unavailable", 80)}`,
      "Items:",
      ...itemSummary,
      "Check Admin Orders for details.",
    ].join("\n");

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(5_000),
        redirect: "manual",
      }
    );

    if (!response.ok) {
      console.error("Telegram order notification failed: HTTP status", response.status);
      return;
    }

    const result = await response.json() as { ok?: boolean };
    if (result?.ok !== true) {
      console.error("Telegram order notification failed: API rejected message.");
    }
  } catch {
    // Fetch errors may contain the token-bearing URL; never log the exception.
    console.error("Telegram order notification failed: request or response error.");
  }
}
