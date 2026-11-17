import { accountEntries, validateGameFields } from "./game-fields";

// Existing public ordering number from the legacy storefront's config.json.
const whatsappNumber = "6737420706";

export type OrderMethod = "normal_checkout" | "whatsapp";

export function getOrderMethod(metadata: unknown): OrderMethod {
  return metadata !== null && typeof metadata === "object" &&
    !Array.isArray(metadata) && "order_method" in metadata &&
    metadata.order_method === "whatsapp" ? "whatsapp" : "normal_checkout";
}

export function withOrderMethod(metadata: unknown, method: OrderMethod) {
  const existing = metadata !== null && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata : {};
  return { ...existing, order_method: method };
}

export function whatsappOrderUrl(
  product: { name: string; price: number | string },
  category: string,
  values: { playerId?: unknown; zoneId?: unknown },
  quantity: number,
) {
  const validation = validateGameFields(category, values);
  if (!validation.values) return { error: validation.error, url: null };
  const price = Number(product.price);
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) {
    return { error: "Please check the price and quantity.", url: null };
  }
  const message = [
    product.name,
    `Price: BND ${price.toFixed(2)}`,
    ...(quantity > 1 ? [`Quantity: ${quantity} · Total: BND ${(price * quantity).toFixed(2)}`] : []),
    ...accountEntries({ categoryName: category, ...validation.values })
      .map((entry) => `${entry.label}: ${entry.value}`),
  ].join("\n");
  return { error: null, url: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}` };
}
