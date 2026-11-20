"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { REQUEST_COLUMNS, repeatedGameRequests, normalizedGameName, requestStatuses, updateRequestStatus, type CustomerRequest } from "@/lib/customer-requests";

export default function AdminRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [game, setGame] = useState("");
  const saving = useRef(false);

  const load = useCallback(() => {
    return supabase.auth.getUser().then(async ({ data: { user }, error: authError }) => {
      setLoading(true); setError("");
      if (authError || !user) { setRequests([]); router.replace("/admin/login"); return; }
      const { data: admin, error: adminError } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
      if (adminError) throw new Error("Could not verify administrator access.");
      if (!admin) { setRequests([]); await supabase.auth.signOut(); router.replace("/admin/login"); return; }
      const all: CustomerRequest[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from("customer_requests").select(REQUEST_COLUMNS).order("created_at", { ascending: false }).order("id").range(from, from + 499);
        if (error) throw new Error("Unable to load requests. Please try again.");
        all.push(...data as CustomerRequest[] ?? []);
        if ((data?.length ?? 0) < 500) break;
      }
      setRequests(all);
    }).catch(error => { setRequests([]); setError(error instanceof Error ? error.message : "Could not load requests."); })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function changeStatus(request: CustomerRequest, status: string) {
    if (saving.current || status === request.status) return;
    saving.current = true; setBusy(request.id); setError(""); setMessage("");
    try {
      await updateRequestStatus(supabase, request.id, status, request.status);
      setRequests(previous => previous.map(row => row.id === request.id ? { ...row, status: status as CustomerRequest["status"] } : row));
      setMessage("Request status updated.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update status."); }
    finally { saving.current = false; setBusy(null); }
  }

  const groups = repeatedGameRequests(requests);
  const visible = requests.filter(r => (!filter || r.status === filter) && (!game || r.game_name && normalizedGameName(r.game_name) === game));
  return <main className="admin-polish min-h-screen bg-[#171717] px-5 py-8 text-[#F2F0E9] sm:px-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">Requests & feedback</h1><Link className="text-sm underline" href="/admin">Back to dashboard</Link></header>
      <p className="text-sm text-white/60">Review submissions and update their status. Counts reflect submissions, not unique people.</p>
      {error && <p role="alert" className="rounded-xl border border-red-400/30 p-4 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="text-sm text-[#C6F36B]">{message}</p>}
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">Status<select aria-label="Filter request status" className="mt-2 block rounded-lg border border-white/20 bg-[#262626] p-3" value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option>{requestStatuses.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
        <label className="text-sm">Game requests<select aria-label="Filter requested game" className="mt-2 block max-w-full rounded-lg border border-white/20 bg-[#262626] p-3" value={game} onChange={e => setGame(e.target.value)}><option value="">All submissions</option>{groups.map(group => <option key={group.key} value={group.key}>{group.name} ({group.count})</option>)}</select></label>
        <button type="button" disabled={loading || !!busy} onClick={() => { void load(); }} className="rounded-lg border border-white/20 px-4 py-3 text-sm disabled:opacity-50">Refresh</button>
      </div>
      {groups.some(g => g.count > 1) && <section className="rounded-xl border border-white/15 p-4"><h2 className="font-bold">Repeated game requests</h2><ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">{groups.filter(g => g.count > 1).map(g => <li key={g.key}>{g.name}: {g.count}</li>)}</ul></section>}
      {loading ? <p role="status">Loading requests…</p> : <>
        <p className="text-sm text-white/60">{visible.length} shown / {requests.length} total</p>
        {!visible.length && !error && <p role="status">No matching requests yet.</p>}
        {visible.map(request => <article key={request.id} className="space-y-3 rounded-2xl border border-white/10 bg-[#262626] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs text-[#C6F36B]">{request.request_type === "game_request" ? "Request a Game" : "Feedback"}</p><h2 className="mt-2 break-words text-xl font-bold">{request.game_name ?? request.feedback_category}</h2></div><time className="text-xs text-white/60" dateTime={request.created_at}>{new Date(request.created_at).toLocaleString("en-BN", { timeZone: "Asia/Brunei", dateStyle: "medium", timeStyle: "short" })} BNT</time></div>
          {request.requested_item && <p className="break-words text-sm">Item: {request.requested_item}</p>}
          <p className="break-words text-sm text-white/70">{request.message ? request.message.slice(0, 160) + (request.message.length > 160 ? "…" : "") : "No message provided."}</p>
          {request.message && request.message.length > 160 && <details className="text-sm"><summary className="cursor-pointer text-[#C6F36B]">Full message</summary><p className="mt-3 whitespace-pre-wrap break-words">{request.message}</p></details>}
          {request.contact && <p className="break-words text-sm">Contact: {request.contact}</p>}
          <label className="block text-sm">Status for {request.game_name ?? request.feedback_category}<select aria-label={`Status for request ${request.id}`} disabled={!!busy || loading} value={request.status} onChange={e => { void changeStatus(request, e.target.value); }} className="ml-3 rounded-lg border border-white/20 bg-[#171717] p-3 disabled:opacity-50">{requestStatuses.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
          {busy === request.id && <p role="status" className="text-xs">Saving status…</p>}
        </article>)}
      </>}
    </div>
  </main>;
}
