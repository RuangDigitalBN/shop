type FieldKey = "playerId" | "zoneId";
type GameField = { key: FieldKey; label: string; detailKey: string; maxLength: number };
const userId: GameField = { key: "playerId", label: "User ID", detailKey: "player_id", maxLength: 64 };
const serverId: GameField = { key: "zoneId", label: "Server ID", detailKey: "server_id", maxLength: 32 };
const mappings: Record<string, readonly GameField[]> = {
  "mobile-legends-global": [userId, serverId],
  "pubg-mobile-global": [userId],
  roblox: [{ key: "playerId", label: "Roblox username", detailKey: "roblox_username", maxLength: 64 }],
  hotlink: [{ key: "playerId", label: "Phone number", detailKey: "phone_number", maxLength: 32 }],
  digi: [{ key: "playerId", label: "Phone number", detailKey: "phone_number", maxLength: 32 }],
};

export function getGameFields(category: string): readonly GameField[] | null {
  const key = category.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return Object.hasOwn(mappings, key) ? mappings[key] : null;
}

export function validateGameFields(category: string, values: { playerId?: unknown; zoneId?: unknown }) {
  const fields = getGameFields(category);
  if (!fields) return { error: "Account fields are not configured for this game.", values: null };
  const clean = { playerId: "", zoneId: "" };
  for (const field of fields) {
    const value = values[field.key];
    if (typeof value !== "string" || !value.trim() || value.trim().length > field.maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
      return { error: `Please enter a valid ${field.label}.`, values: null };
    }
    if (field.detailKey === "phone_number" && (!/^[+\d ()-]+$/.test(value.trim()) || !/^\d{7,15}$/.test(value.replace(/\D/g, "")))) {
      return { error: "Please enter a valid Phone number.", values: null };
    }
    clean[field.key] = value.trim();
  }
  return { error: null, values: clean };
}

type AccountValues = { categoryName?: string; playerId: string; zoneId: string };

export function accountEntries(item: AccountValues) {
  // Old saved carts did not include categoryName and always used these two slots.
  const fields = item.categoryName ? getGameFields(item.categoryName) : [userId, serverId];
  return (fields ?? []).map((field) => ({ label: field.label, value: item[field.key].trim() })).filter((entry) => entry.value);
}

export function cartAccountKey(item: AccountValues & { productId: string }) {
  return JSON.stringify([item.productId, accountEntries(item).map((entry) => entry.value)]);
}

export function orderAccountEntries(details: Record<string, unknown>) {
  const text = (key: string) => typeof details[key] === "string" ? details[key] as string : "";
  const entries = [
    { label: "User ID", value: text("player_id") || text("playerId") },
    { label: "Server ID", value: text("server_id") || text("zoneId") },
    { label: "Roblox username", value: text("roblox_username") },
    { label: "Phone number", value: text("phone_number") },
  ];
  return entries.filter((entry) => entry.value);
}
