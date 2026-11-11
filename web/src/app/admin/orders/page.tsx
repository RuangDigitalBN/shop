
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type OrderItem = {
  id: string;
  product_name: string;
  product_sku: string | null;
  unit_price: number | string;
  quantity: number;
  line_total: number | string;
  product_details: {
    playerId?: string;
    zoneId?: string;
  } | null;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_contact: string;
  customer_email: string | null;
  payment_status: string;
  order_status: string;
  subtotal: number | string;
  total: number | string;
  payment_proof_path: string | null;
  created_at: string;
  items: OrderItem[];
  receiptUrl?: string | null;
};

type AdminAction =
  | "verify_payment"
  | "reject_payment"
  | "cancel_order"
  | "mark_processing"
  | "complete_order";

const money = (value: number | string) =>
  `BND ${Number(value).toFixed(2)}`;

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-BN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusStyle(status: string) {
  switch (status) {
    case "verified":
    case "completed":
      return "border-[#C6F36B]/30 bg-[#C6F36B]/10 text-[#C6F36B]";
    case "submitted":
    case "processing":
      return "border-blue-400/30 bg-blue-400/10 text-blue-300";
    case "rejected":
    case "cancelled":
      return "border-red-400/30 bg-red-400/10 text-red-300";
    default:
      return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
  }
}

export default function AdminOrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyOrder, setBusyOrder] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/admin/login");
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminError || !admin) {
        router.replace("/admin/login");
        return;
      }

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(
          "id, order_number, customer_name, customer_contact, customer_email, payment_status, order_status, subtotal, total, payment_proof_path, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (orderError) throw orderError;

      const orderIds = (orderData ?? []).map((order) => order.id);

      let itemData: OrderItem[] = [];

      if (orderIds.length > 0) {
        const { data, error: itemError } = await supabase
          .from("order_items")
          .select(
            "id, order_id, product_name, product_sku, unit_price, quantity, line_total, product_details"
          )
          .in("order_id", orderIds);

        if (itemError) throw itemError;

        itemData = (data ?? []) as OrderItem[];
      }

      const itemMap = new Map<string, OrderItem[]>();

      for (const item of itemData) {
        const orderId = (item as OrderItem & { order_id?: string }).order_id;

        if (!orderId) continue;

        const existing = itemMap.get(orderId) ?? [];
        existing.push(item);
        itemMap.set(orderId, existing);
      }

      const result: Order[] = await Promise.all(
        (orderData ?? []).map(async (order) => {
          let receiptUrl: string | null = null;

          if (order.payment_proof_path) {
            const { data } = await supabase.storage
              .from("payment-proofs")
              .createSignedUrl(order.payment_proof_path, 300);

            receiptUrl = data?.signedUrl ?? null;
          }

          return {
            ...order,
            items: itemMap.get(order.id) ?? [],
            receiptUrl,
          } as Order;
        })
      );

      setOrders(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load orders."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function handleAction(order: Order, action: AdminAction) {
    const labels: Record<AdminAction, string> = {
      verify_payment: "verify this payment",
      reject_payment: "reject this payment",
      cancel_order: "cancel this order",
      mark_processing: "move this order to processing",
      complete_order: "mark this order as completed",
    };

    if (!window.confirm(`Are you sure you want to ${labels[action]}?`)) {
      return;
    }

    setBusyOrder(order.id);
    setError("");
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to update order.");
      }

      setMessage(`${order.order_number}: ${result.message}`);
      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update order."
      );
    } finally {
      setBusyOrder(null);
    }
  }

  const filteredOrders = orders.filter((order) => {
    const searchText = search.trim().toLowerCase();

    const matchesSearch =
      !searchText ||
      order.order_number.toLowerCase().includes(searchText) ||
      order.customer_name.toLowerCase().includes(searchText) ||
      order.customer_contact.toLowerCase().includes(searchText);

    const matchesFilter =
      filter === "all" ||
      order.payment_status === filter ||
      order.order_status === filter;

    return matchesSearch && matchesFilter;
  });

  const pendingCount = orders.filter(
    (order) => order.payment_status === "pending"
  ).length;

  const submittedCount = orders.filter(
    (order) => order.payment_status === "submitted"
  ).length;

  const processingCount = orders.filter(
    (order) => order.order_status === "processing"
  ).length;

  return (
    <main className="min-h-screen bg-[#171717] px-4 py-8 text-[#F2F0E9] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="text-xs font-bold uppercase tracking-wider text-white/40 hover:text-[#C6F36B]"
            >
              ← Admin dashboard
            </Link>

            <h1 className="mt-4 text-3xl font-black sm:text-4xl">
              Orders
            </h1>

            <p className="mt-2 text-sm text-white/50">
              Review customer orders and payment receipts.
            </p>
          </div>

          <button
            onClick={() => void loadOrders()}
            disabled={loading}
            className="rounded-full border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-wider hover:border-[#C6F36B] disabled:opacity-40"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#202020] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-white/40">
              Pending payment
            </p>
            <p className="mt-2 text-3xl font-black">{pendingCount}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#202020] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-white/40">
              Receipts submitted
            </p>
            <p className="mt-2 text-3xl font-black">{submittedCount}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#202020] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-white/40">
              Processing
            </p>
            <p className="mt-2 text-3xl font-black">{processingCount}</p>
          </div>
        </div>

        {message && (
          <p className="mt-6 rounded-xl border border-[#C6F36B]/20 bg-[#C6F36B]/10 p-4 text-sm text-[#C6F36B]">
            {message}
          </p>
        )}

        {error && (
          <p className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order number, customer or contact..."
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#202020] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
          />

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-[#202020] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
          >
            <option value="all">All orders</option>
            <option value="pending">Pending</option>
            <option value="submitted">Receipt submitted</option>
            <option value="verified">Verified</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-white/40">
            Loading orders...
          </p>
        ) : filteredOrders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-[#202020] px-6 py-16 text-center">
            <h2 className="text-xl font-black">No orders found</h2>
            <p className="mt-2 text-sm text-white/40">
              Orders will appear here when customers place them.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {filteredOrders.map((order) => {
              const canVerifyPayment =
  order.payment_status === "submitted" &&
  Boolean(order.payment_proof_path);

const canRejectPayment =
  order.payment_status === "pending" ||
  order.payment_status === "submitted";

              const canCancel =
                order.order_status !== "cancelled" &&
                order.order_status !== "completed" &&
                order.payment_status !== "verified";

              const canProcess =
                order.payment_status === "verified" &&
                order.order_status !== "processing" &&
                order.order_status !== "completed" &&
                order.order_status !== "cancelled";

              const canComplete =
                order.payment_status === "verified" &&
                order.order_status === "processing";

              return (
                <article
                  key={order.id}
                  className="rounded-2xl border border-white/10 bg-[#202020] p-5 sm:p-6"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#C6F36B]">
                        {order.order_number}
                      </p>
                      <h2 className="mt-2 text-xl font-black">
                        {order.customer_name}
                      </h2>
                      <p className="mt-1 text-sm text-white/50">
                        {order.customer_contact}
                      </p>
                      {order.customer_email && (
                        <p className="mt-1 text-sm text-white/50">
                          {order.customer_email}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-white/30">
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap content-start gap-2">
                      <span
                        className={`h-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusStyle(order.payment_status)}`}
                      >
                        Payment: {order.payment_status}
                      </span>
                      <span
                        className={`h-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusStyle(order.order_status)}`}
                      >
                        Order: {order.order_status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-white/10 pt-5">
                    <p className="text-xs font-black uppercase tracking-wider text-white/40">
                      Items
                    </p>

                    <div className="mt-3 space-y-3">
                      {order.items.map((item) => {
                        const details = item.product_details ?? {};

                        return (
                          <div
                            key={item.id}
                            className="flex flex-col justify-between gap-2 rounded-xl bg-[#171717] p-4 sm:flex-row"
                          >
                            <div>
                              <p className="font-bold">{item.product_name}</p>
                              {item.product_sku && (
                                <p className="mt-1 text-xs text-white/40">
                                  SKU: {item.product_sku}
                                </p>
                              )}
                              {details.playerId && (
                                <p className="mt-1 text-xs text-white/50">
                                  Player ID: {details.playerId}
                                </p>
                              )}
                              {details.zoneId && (
                                <p className="mt-1 text-xs text-white/50">
                                  Server ID: {details.zoneId}
                                </p>
                              )}
                              <p className="mt-1 text-xs text-white/40">
                                Quantity: {item.quantity}
                              </p>
                            </div>

                            <p className="font-black">
                              {money(item.line_total)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
                    <div>
                      <p className="text-xs text-white/40">Order total</p>
                      <p className="mt-1 text-2xl font-black text-[#C6F36B]">
                        {money(order.total)}
                      </p>
                    </div>

                    {order.receiptUrl ? (
                      <a
                        href={order.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/20 px-4 py-3 text-xs font-black uppercase tracking-wider hover:border-[#C6F36B] hover:text-[#C6F36B]"
                      >
                        View payment receipt ↗
                      </a>
                    ) : (
                      <span className="text-xs text-white/30">
                        No receipt uploaded
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-5">
                    {canVerifyPayment && (
  <button
    onClick={() => void handleAction(order, "verify_payment")}
    disabled={busyOrder === order.id}
    className="rounded-full bg-[#C6F36B] px-4 py-3 text-xs font-black uppercase tracking-wider text-[#171717] hover:bg-white disabled:opacity-40"
  >
    Verify payment
  </button>
)}

{canRejectPayment && (
  <button
    onClick={() => void handleAction(order, "reject_payment")}
    disabled={busyOrder === order.id}
    className="rounded-full border border-red-400/30 px-4 py-3 text-xs font-black uppercase tracking-wider text-red-300 hover:bg-red-400/10 disabled:opacity-40"
  >
    Reject payment
  </button>
)}

                    {canCancel && (
                      <button
                        onClick={() =>
                          void handleAction(order, "cancel_order")
                        }
                        disabled={busyOrder === order.id}
                        className="rounded-full border border-white/15 px-4 py-3 text-xs font-black uppercase tracking-wider text-white/60 hover:border-red-400 hover:text-red-300 disabled:opacity-40"
                      >
                        Cancel order
                      </button>
                    )}

                    {canProcess && (
                      <button
                        onClick={() =>
                          void handleAction(order, "mark_processing")
                        }
                        disabled={busyOrder === order.id}
                        className="rounded-full border border-blue-400/30 px-4 py-3 text-xs font-black uppercase tracking-wider text-blue-300 hover:bg-blue-400/10 disabled:opacity-40"
                      >
                        Mark processing
                      </button>
                    )}

                    {canComplete && (
                      <button
                        onClick={() =>
                          void handleAction(order, "complete_order")
                        }
                        disabled={busyOrder === order.id}
                        className="rounded-full bg-[#C6F36B] px-4 py-3 text-xs font-black uppercase tracking-wider text-[#171717] hover:bg-white disabled:opacity-40"
                      >
                        Complete order
                      </button>
                    )}

                    {busyOrder === order.id && (
                      <span className="self-center text-xs text-white/40">
                        Updating order...
                      </span>
                    )}

                    {!canVerifyPayment &&
                    !canRejectPayment &&
                    !canCancel &&
                    !canProcess &&
                    !canComplete && (
                        <span className="self-center text-xs text-white/30">
                          No further actions available.
                        </span>
                      )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
