import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateCustomerRequest } from "@/lib/customer-requests";
import { notifyNewRequest } from "@/lib/telegram-requests";

const buckets = new Map<string, { count: number; expires: number }>();
const windowMs = 10 * 60 * 1000;
// Best-effort per-worker throttle; Cloudflare supplies this header in production.
// Do not retain raw IP addresses, or trust client-supplied X-Forwarded-For.
function allowSubmission(ip: string | null) {
  if (!ip) return true; // Local/non-Cloudflare environments still get validation/honeypot.
  const now = Date.now();
  const key = createHash("sha256").update(ip.slice(0, 64)).digest("hex");
  const current = buckets.get(key);
  if (current && current.expires > now) {
    if (current.count >= 5) return false;
    current.count++; return true;
  }
  if (buckets.size >= 2000) {
    for (const [key, bucket] of buckets) if (bucket.expires <= now) buckets.delete(key);
    if (buckets.size >= 2000 && !buckets.has(key)) return false;
  }
  buckets.set(key, { count: 1, expires: now + windowMs }); return true;
}

async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 8192) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const accepted = () => NextResponse.json({ success: true }, { status: 202 });

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return fail("Please use the form on this store.", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return fail("Please submit the request form.", 415);
    let body: unknown;
    try { body = await readBody(request); }
    catch (error) { return fail(error instanceof RangeError ? "Submission is too large." : "Invalid submission.", error instanceof RangeError ? 413 : 400); }
    if (body && typeof body === "object" && "website" in body && body.website) return accepted();
    const validation = validateCustomerRequest(body);
    if (!validation.data) return NextResponse.json({ error: "Please check the highlighted fields.", errors: validation.errors }, { status: 400 });
    if (!allowSubmission(request.headers.get("cf-connecting-ip"))) return NextResponse.json({ error: "Please wait a few minutes before submitting again." }, { status: 429, headers: { "Retry-After": "600" } });

    // The anonymous endpoint is the only public write path. No public SELECT or direct table INSERT grant.
    const { data, error } = await supabaseAdmin.from("customer_requests").insert(validation.data).select("id, created_at").single();
    if (error?.code === "23505") return accepted(); // Retry/concurrent submission: no duplicate row or notification.
    if (error || !data?.id || !data.created_at) { console.error("Customer request save was not confirmed."); return fail("Requests are temporarily unavailable. Please try again later.", 503); }
    try {
      after(() => notifyNewRequest({ ...validation.data!, id: data.id, created_at: data.created_at }));
    } catch { console.error("Telegram request notification scheduling failed."); }
    return accepted();
  } catch {
    console.error("Customer request submission failed.");
    return fail("Requests are temporarily unavailable. Please try again later.", 503);
  }
}
