
import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AdminAction =
  | "verify_payment"
  | "reject_payment"
  | "cancel_order"
  | "mark_processing"
  | "complete_order";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const { id: orderId } = await context.params;

    if (!UUID_REGEX.test(orderId)) {
      return errorResponse("Invalid order ID.", 400);
    }

    // Require an authenticated Supabase user.
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return errorResponse(
        "Please sign in as an administrator.",
        401
      );
    }

    const accessToken = authorization.slice(7).trim();

    if (!accessToken) {
      return errorResponse(
        "Invalid authentication token.",
        401
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
      return errorResponse("Server configuration error.", 500);
    }

    const supabaseAuth = createClient(
      supabaseUrl,
      publishableKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(accessToken);

    if (authError || !user) {
      return errorResponse(
        "Your session is invalid or expired.",
        401
      );
    }

    // Confirm administrator access.
    const { data: adminRecord, error: adminError } =
      await supabaseAdmin
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (adminError) {
      return errorResponse(
        "Unable to verify administrator access.",
        500
      );
    }

    if (!adminRecord) {
      return errorResponse(
        "Administrator access required.",
        403
      );
    }

    // Validate request body.
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid request body.", 400);
    }

    const action =
      typeof body === "object" &&
      body !== null &&
      "action" in body
        ? body.action
        : null;

    const allowedActions: AdminAction[] = [
      "verify_payment",
      "reject_payment",
      "cancel_order",
      "mark_processing",
      "complete_order",
    ];

    if (
      typeof action !== "string" ||
      !allowedActions.includes(action as AdminAction)
    ) {
      return errorResponse("Invalid order action.", 400);
    }

    // Retrieve current order information.
    const { data: order, error: orderError } =
      await supabaseAdmin
        .from("orders")
        .select("id, order_number, payment_status, order_status, payment_proof_path")
        .eq("id", orderId)
        .maybeSingle();

    if (orderError) {
      return errorResponse(
        "Unable to retrieve this order.",
        500
      );
    }

    if (!order) {
      return errorResponse("Order not found.", 404);
    }

    let newPaymentStatus = order.payment_status ?? "pending";
    let newOrderStatus = order.order_status ?? "pending";

    switch (action as AdminAction) {
      case "verify_payment":
        if (newPaymentStatus !== "submitted") {
          return errorResponse(
            "A payment receipt must be submitted before verification.",
            409
          );
        }

        if (!order.payment_proof_path) {
          return errorResponse(
            "No payment receipt was found for this order.",
            409
          );
        }

        if (
          newOrderStatus === "cancelled" ||
          newOrderStatus === "completed"
        ) {
          return errorResponse(
            "This order can no longer be verified.",
            409
          );
        }

        newPaymentStatus = "verified";
        newOrderStatus = "processing";
        break;

      case "reject_payment":
        if (
          newPaymentStatus !== "pending" &&
          newPaymentStatus !== "submitted"
        ) {
          return errorResponse(
            "Only pending or submitted payments can be rejected.",
            409
          );
        }

        if (
          newOrderStatus === "cancelled" ||
          newOrderStatus === "completed"
        ) {
          return errorResponse(
            "This order can no longer be rejected.",
            409
          );
        }

        newPaymentStatus = "rejected";
        newOrderStatus = "cancelled";
        break;

      case "cancel_order":
        if (
          newOrderStatus === "cancelled" ||
          newOrderStatus === "completed"
        ) {
          return errorResponse(
            "This order is already closed.",
            409
          );
        }

        if (newPaymentStatus === "verified") {
          return errorResponse(
            "Verified orders require a separate refund process before cancellation.",
            409
          );
        }

        newOrderStatus = "cancelled";
        break;

      case "mark_processing":
        if (newPaymentStatus !== "verified") {
          return errorResponse(
            "Payment must be verified before processing.",
            409
          );
        }

        if (
          newOrderStatus === "cancelled" ||
          newOrderStatus === "completed"
        ) {
          return errorResponse(
            "This order cannot be moved to processing.",
            409
          );
        }

        newOrderStatus = "processing";
        break;

      case "complete_order":
        if (newPaymentStatus !== "verified") {
          return errorResponse(
            "Payment must be verified before completing an order.",
            409
          );
        }

        if (
          newOrderStatus !== "processing"
        ) {
          return errorResponse(
            "Only processing orders can be completed.",
            409
          );
        }

        newOrderStatus = "completed";
        break;
    }

    // Update order through the protected database function.
    const { error: updateError } = await supabaseAdmin.rpc(
      "release_order_stock",
      {
        p_order_id: orderId,
        p_new_order_status: newOrderStatus,
        p_new_payment_status: newPaymentStatus,
      }
    );

    if (updateError) {
      const isConflict =
        updateError.message.includes("already closed") ||
        updateError.message.includes("cannot") ||
        updateError.message.includes("must be") ||
        updateError.message.includes("current state");

      return errorResponse(
        isConflict
          ? "This order has changed or can no longer accept that action. Refresh and try again."
          : "Unable to update this order. Please try again.",
        isConflict ? 409 : 500
      );
    }

    return NextResponse.json({
      success: true,
      orderId,
      orderNumber: order.order_number,
      paymentStatus: newPaymentStatus,
      orderStatus: newOrderStatus,
      message: "Order updated successfully.",
    });
  } catch {
    return errorResponse(
      "Something went wrong while updating the order.",
      500
    );
  }
}
