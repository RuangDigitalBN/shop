import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { readShopState } from "@/lib/shop-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await readShopState(supabaseAdmin);
  return NextResponse.json({ status }, {
    status: status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store", "Cloudflare-CDN-Cache-Control": "no-store" },
  });
}
