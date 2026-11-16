
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

    const expected =
      typeof body === "object" &&
      body !== null &&
      "expected" in body
        ? body.expected
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

    if (
      typeof expected !== "object" ||
      expected === null ||
      Array.isArray(expected)
    ) {
      return errorResponse(
        "Refresh the order before taking this action.",
        400
      );
    }

    const snapshot = expected as Record<string, unknown>;

    if (
      typeof snapshot.paymentStatus !== "string" ||
      snapshot.paymentStatus.length === 0 ||
      snapshot.paymentStatus.length > 50 ||
      typeof snapshot.orderStatus !== "string" ||
      snapshot.orderStatus.length === 0 ||
      snapshot.orderStatus.length > 50 ||
      !Object.prototype.hasOwnProperty.call(snapshot, "proofPath") ||
      (
        snapshot.proofPath !== null &&
        (
          typeof snapshot.proofPath !== "string" ||
          snapshot.proofPath.length === 0 ||
          snapshot.proofPath.length > 512
        )
      )
    ) {
      return errorResponse(
        "Invalid order snapshot. Refresh and try again.",
        400
      );
    }

    if (
      action === "verify_payment" &&
      typeof snapshot.proofPath !== "string"
    ) {
      return errorResponse(
        "Open the current receipt before verifying payment.",
        409
      );
    }

    const { data: transition, error: transitionError } =
      await supabaseAdmin.rpc("apply_admin_order_action", {
        p_order_id: orderId,
        p_action: action,
        p_expected_payment_status: snapshot.paymentStatus,
        p_expected_order_status: snapshot.orderStatus,
        p_expected_proof_path: snapshot.proofPath,
      });

    if (
      transitionError ||
      typeof transition !== "object" ||
      transition === null ||
      !("ok" in transition) ||
      typeof transition.ok !== "boolean" ||
      !("code" in transition) ||
      typeof transition.code !== "string"
    ) {
      // The RPC may have committed. Never retry the action automatically.
      return NextResponse.json(
        {
          success: false,
          code: "ADMIN_ACTION_OUTCOME_UNKNOWN",
          error:
            "Unable to confirm the update. Refresh the order before trying again.",
        },
        { status: 503 }
      );
    }

    if (!transition.ok) {
      const status =
        transition.code === "ORDER_NOT_FOUND" ? 404 :
        transition.code === "INVALID_ADMIN_REQUEST" ? 400 :
        409;

      const messages: Record<string, string> = {
        ORDER_CHANGED:
          "This order or receipt changed. Refresh and review the current receipt before trying again.",
        ORDER_CLOSED: "This order is already closed.",
        ORDER_STATE_CONFLICT:
          "This order requires manual review.",
        INVALID_TRANSITION:
          "This order can no longer accept that action.",
        INVALID_ADMIN_REQUEST: "Invalid order action.",
      };

      return NextResponse.json(
        {
          success: false,
          code: transition.code,
          error:
            messages[transition.code] ??
            "This order could not be updated.",
        },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      code: transition.code,
      orderId: transition.orderId,
      orderNumber: transition.orderNumber,
      paymentStatus: transition.paymentStatus,
      orderStatus: transition.orderStatus,
      message: "Order updated successfully.",
    });
  } catch {
    return errorResponse(
      "Something went wrong while updating the order.",
      500
    );
  }
}
