
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type SubmittedItem = {
  productId: string;
  quantity: number;
  playerId: string;
  zoneId: string;
};

type CheckoutRequest = {
  idempotencyKey: string;
  customer: {
    name: string;
    whatsapp: string;
    email?: string;
  };
  items: SubmittedItem[];
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const contentLength = Number(
      request.headers.get("content-length") ?? 0
    );

    if (contentLength > 100_000) {
      return errorResponse("Request is too large.", 413);
    }

    const body = (await request.json()) as CheckoutRequest;

    if (!body || typeof body !== "object") {
      return errorResponse("Invalid checkout information.", 400);
    }

    const { idempotencyKey, customer, items } = body;

    if (
      typeof idempotencyKey !== "string" ||
      !UUID_REGEX.test(idempotencyKey)
    ) {
      return errorResponse("Invalid checkout session.", 400);
    }

    if (
      !customer ||
      typeof customer.name !== "string" ||
      typeof customer.whatsapp !== "string"
    ) {
      return errorResponse("Please provide your customer details.", 400);
    }

    const customerName = customer.name.trim();
    const customerContact = customer.whatsapp.trim();

    const customerEmail =
      typeof customer.email === "string"
        ? customer.email.trim()
        : "";

    const phoneDigits = customerContact.replace(/\D/g, "");

    if (!customerName || customerName.length > 120) {
      return errorResponse("Please enter a valid name.", 400);
    }

    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return errorResponse("Please enter a valid WhatsApp number.", 400);
    }

    if (
      customerEmail &&
      (
        customerEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
      )
    ) {
      return errorResponse("Please enter a valid email address.", 400);
    }

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 50
    ) {
      return errorResponse("Your cart is empty or invalid.", 400);
    }

    // Prevent access to an existing order using a reused checkout key.
    const { data: existingOrder, error: existingError } =
      await supabaseAdmin
        .from("orders")
        .select("id, order_number, customer_contact")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

   if (existingError) {
  console.error("Order lookup failed:", existingError);

  return errorResponse(
    "Unable to check your order. Please try again.",
    500
  );
}

    if (existingOrder) {
      if (existingOrder.customer_contact !== customerContact) {
        return errorResponse(
          "This checkout session cannot be used.",
          409
        );
      }

      return NextResponse.json({
        success: true,
        orderId: existingOrder.id,
        orderNumber: existingOrder.order_number,
        alreadySubmitted: true,
      });
    }

    // Enforce bank transfer availability on the server.
    const { data: paymentSettings, error: settingsError } =
      await supabaseAdmin
        .from("payment_settings")
        .select("bank_transfer_enabled")
        .eq("id", true)
        .single();

    if (settingsError || !paymentSettings) {
      return errorResponse(
        "Unable to verify payment settings. Please try again.",
        500
      );
    }

    if (!paymentSettings.bank_transfer_enabled) {
      return errorResponse(
        "Bank transfer checkout is currently unavailable.",
        403
      );
    }

    // Validate cart items.
    const productIds: string[] = [];

    for (const item of items) {
      if (
        !item ||
        typeof item.productId !== "string" ||
        !UUID_REGEX.test(item.productId) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100 ||
        typeof item.playerId !== "string" ||
        !item.playerId.trim() ||
        item.playerId.trim().length > 64 ||
        typeof item.zoneId !== "string" ||
        !item.zoneId.trim() ||
        item.zoneId.trim().length > 32
      ) {
        return errorResponse(
          "One or more cart items are invalid.",
          400
        );
      }

      productIds.push(item.productId);
    }

    const uniqueProductIds = [...new Set(productIds)];

    // Fetch current product prices and availability.
    const { data: products, error: productError } =
      await supabaseAdmin
        .from("products")
        .select(
          "id, name, slug, sku, price, is_active, track_stock, stock_quantity"
        )
        .in("id", uniqueProductIds)
        .eq("is_active", true);

    if (productError || !products) {
      return errorResponse(
        "Unable to verify your cart. Please try again.",
        500
      );
    }

    if (products.length !== uniqueProductIds.length) {
      return errorResponse(
        "One or more products are no longer available.",
        400
      );
    }

    const productMap = new Map(
      products.map((product) => [product.id, product])
    );

    // Check combined quantities for duplicate cart entries.
    const totalQuantities = new Map<string, number>();

    for (const item of items) {
      totalQuantities.set(
        item.productId,
        (totalQuantities.get(item.productId) ?? 0) + item.quantity
      );
    }

    for (const [productId, quantity] of totalQuantities) {
      const product = productMap.get(productId);

      if (!product) {
        return errorResponse(
          "A product could not be verified.",
          400
        );
      }

      if (
        product.track_stock === true &&
        quantity > Number(product.stock_quantity ?? 0)
      ) {
        return errorResponse(
          `${product.name} does not have enough stock available.`,
          400
        );
      }
    }

    // Calculate all prices using trusted database values.
    let subtotalCents = 0;

    const orderItems = items.map((item) => {
      const product = productMap.get(item.productId)!;

      const rawPrice = Number(product.price);

      if (
        !Number.isFinite(rawPrice) ||
        rawPrice < 0 ||
        Math.abs(rawPrice * 100 - Math.round(rawPrice * 100)) > 0.000001
      ) {
        throw new Error("Invalid product price.");
      }

      const unitPriceCents = Math.round(rawPrice * 100);
      const lineTotalCents = unitPriceCents * item.quantity;

      if (!Number.isSafeInteger(lineTotalCents)) {
        throw new Error("Invalid order total.");
      }

      subtotalCents += lineTotalCents;

      return {
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        unit_price: unitPriceCents / 100,
        quantity: item.quantity,
        line_total: lineTotalCents / 100,
        product_details: {
          product_slug: product.slug,
          player_id: item.playerId.trim(),
          server_id: item.zoneId.trim(),
        },
      };
    });

    if (!Number.isSafeInteger(subtotalCents)) {
      return errorResponse("Invalid order total.", 400);
    }

    const subtotal = subtotalCents / 100;

    const orderNumber =
      `RD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6).toUpperCase()}`;

    // Create the order and reserve tracked stock atomically.
    const { data: orderId, error: orderError } =
      await supabaseAdmin.rpc("create_order_with_items", {
        p_order_number: orderNumber,
        p_idempotency_key: idempotencyKey,
        p_customer_name: customerName,
        p_customer_contact: customerContact,
        p_customer_email: customerEmail || null,
        p_subtotal: subtotal,
        p_discount_amount: 0,
        p_total: subtotal,
        p_customer_details: {},
        p_items: orderItems,
      });

    if (orderError) {
      // Handle simultaneous submissions with the same checkout key.
      const { data: duplicateOrder } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, customer_contact")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (duplicateOrder) {
        if (duplicateOrder.customer_contact !== customerContact) {
          return errorResponse(
            "This checkout session cannot be used.",
            409
          );
        }

        return NextResponse.json({
          success: true,
          orderId: duplicateOrder.id,
          orderNumber: duplicateOrder.order_number,
          alreadySubmitted: true,
        });
      }

      if (orderError.message.includes("Insufficient stock")) {
        return errorResponse(
          "Stock has changed. Please review your cart and try again.",
          409
        );
      }

      if (orderError.message.includes("no longer available")) {
        return errorResponse(
          "One or more products are no longer available.",
          409
        );
      }

      return errorResponse(
        "Unable to create your order. Please try again.",
        500
      );
    }

    return NextResponse.json({
      success: true,
      orderId,
      orderNumber,
      alreadySubmitted: false,
    });
  } catch {
    return errorResponse(
      "Something went wrong while processing your order.",
      500
    );
  }
}
