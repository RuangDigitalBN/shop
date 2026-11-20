import type { SupabaseClient } from "@supabase/supabase-js";

export const feedbackCategories = ["General", "Storefront", "Checkout", "Product Request", "Other"] as const;
export const requestStatuses = ["pending", "reviewed", "added", "rejected"] as const;
export type RequestStatus = typeof requestStatuses[number];
export type RequestData = {
  request_type: "game_request" | "feedback"; game_name: string | null; requested_item: string | null;
  feedback_category: string | null; message: string | null; contact: string | null;
};
export type CustomerRequest = RequestData & { id: string; created_at: string; status: RequestStatus };
export const REQUEST_COLUMNS = "id, request_type, game_name, requested_item, feedback_category, message, contact, status, created_at";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateCustomerRequest(input: unknown): { data?: RequestData & { submission_key: string }; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return { errors: { form: "Please check your submission." } };
  const body = input as Record<string, unknown>;
  const text = (key: string, limit: number, required = false, multiline = false): string | null => {
    const value = body[key];
    if (value !== undefined && value !== null && typeof value !== "string") { errors[key] = "Please enter plain text."; return null; }
    const clean = typeof value === "string" ? value.trim() : "";
    if (required && !clean) errors[key] = "This field is required.";
    if (clean.length > limit) errors[key] = `Use ${limit} characters or fewer.`;
    if (/[<>]/.test(clean) || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(clean)) errors[key] = "Use plain text without HTML or control characters.";
    return clean || null;
  };
  const type = body.request_type;
  if (type !== "game_request" && type !== "feedback") errors.request_type = "Choose Request a Game or Feedback.";
  if (typeof body.submission_key !== "string" || !UUID_PATTERN.test(body.submission_key)) errors.form = "Please refresh the form and try again.";
  const contact = text("contact", 120);
  const game_name = type === "game_request" ? text("game_name", 120, true) : null;
  const requested_item = type === "game_request" ? text("requested_item", 160) : null;
  const message = text("message", 2000, type === "feedback", true);
  const category = type === "feedback" ? body.feedback_category : null;
  if (type === "feedback" && !feedbackCategories.some(c => c === category)) errors.feedback_category = "Choose a feedback category.";
  if (Object.keys(errors).length) return { errors };
  return { errors, data: { request_type: type as RequestData["request_type"], game_name, requested_item,
    feedback_category: category as string | null, message, contact, submission_key: body.submission_key as string } };
}

export const normalizedGameName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
export function repeatedGameRequests(requests: CustomerRequest[]) {
  const groups = new Map<string, { key: string; name: string; count: number }>();
  for (const request of requests) {
    if (request.request_type !== "game_request" || !request.game_name) continue;
    const key = normalizedGameName(request.game_name);
    if (!key) continue;
    const group = groups.get(key) ?? { key, name: request.game_name.trim(), count: 0 };
    group.count++; groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function updateRequestStatus(client: Pick<SupabaseClient, "from">, id: string, status: string, expected: RequestStatus) {
  if (!UUID_PATTERN.test(id) || !requestStatuses.some(s => s === status) || !requestStatuses.includes(expected)) throw new Error("Invalid request or status.");
  const { data, error } = await client.from("customer_requests").update({ status }).eq("id", id).eq("status", expected).select("id, status").maybeSingle();
  if (error || !data || data.id !== id || data.status !== status) throw new Error("Status was not confirmed. Reload the requests and try again.");
}
