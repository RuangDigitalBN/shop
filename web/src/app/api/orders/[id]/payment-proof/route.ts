
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: RouteContext
) {
  let uploadedFilePath: string | null = null;

  try {
    const { id: orderId } = await context.params;

    if (!UUID_REGEX.test(orderId)) {
      return errorResponse("Invalid order.", 400);
    }

    const contentLength = Number(
      request.headers.get("content-length") ?? 0
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_FILE_SIZE + 100_000
    ) {
      return errorResponse(
        "File is too large. Maximum size is 5 MB.",
        413
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const idempotencyKey = formData.get("idempotencyKey");

    if (!(file instanceof File)) {
      return errorResponse(
        "Please select a payment receipt.",
        400
      );
    }

    if (
      typeof idempotencyKey !== "string" ||
      !UUID_REGEX.test(idempotencyKey)
    ) {
      return errorResponse(
        "Invalid checkout session.",
        400
      );
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return errorResponse(
        "Receipt must be between 1 byte and 5 MB.",
        400
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return errorResponse(
        "Only JPG, PNG, WEBP and PDF receipts are accepted.",
        400
      );
    }

    // Verify the order and checkout session.
    const { data: order, error: orderError } =
      await supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, payment_status, order_status, payment_proof_path"
        )
        .eq("id", orderId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

    if (orderError) {
      return errorResponse(
        "Unable to verify your order.",
        500
      );
    }

    if (!order) {
      return errorResponse("Order not found.", 404);
    }

    if (
      order.payment_status !== "pending" &&
      order.payment_status !== "submitted"
    ) {
      return errorResponse(
        "This order can no longer accept payment receipts.",
        409
      );
    }

    if (
      order.order_status === "cancelled" ||
      order.order_status === "completed"
    ) {
      return errorResponse(
        "This order is already closed.",
        409
      );
    }

    // Validate the actual file signature.
    const header = new Uint8Array(
      await file.slice(0, 12).arrayBuffer()
    );

    const isJpeg =
      header[0] === 0xff &&
      header[1] === 0xd8 &&
      header[2] === 0xff;

    const isPng =
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47;

    const isWebp =
      header[0] === 0x52 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x46 &&
      header[8] === 0x57 &&
      header[9] === 0x45 &&
      header[10] === 0x42 &&
      header[11] === 0x50;

    const isPdf =
      header[0] === 0x25 &&
      header[1] === 0x50 &&
      header[2] === 0x44 &&
      header[3] === 0x46 &&
      header[4] === 0x2d;

    const validSignature =
      (file.type === "image/jpeg" && isJpeg) ||
      (file.type === "image/png" && isPng) ||
      (file.type === "image/webp" && isWebp) ||
      (file.type === "application/pdf" && isPdf);

    if (!validSignature) {
      return errorResponse(
        "The selected file does not match its file type.",
        400
      );
    }

    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "application/pdf": "pdf",
    }[file.type];

    const filePath = `${orderId}/${randomUUID()}.${extension}`;

    const fileBuffer = Buffer.from(
      await file.arrayBuffer()
    );

    // Upload to the private payment-proofs bucket.
    const { error: uploadError } = await supabaseAdmin.storage
      .from("payment-proofs")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return errorResponse(
        "Unable to upload your receipt. Please try again.",
        500
      );
    }

    uploadedFilePath = filePath;

    // Update only if the order is still eligible.
    // This prevents a late upload from replacing a verified
    // or cancelled order's payment receipt.
    const { data: updatedOrder, error: updateError } =
      await supabaseAdmin
        .from("orders")
        .update({
          payment_proof_path: filePath,
          payment_status: "submitted",
        })
        .eq("id", orderId)
        .eq("idempotency_key", idempotencyKey)
        .in("payment_status", ["pending", "submitted"])
        .neq("order_status", "cancelled")
        .neq("order_status", "completed")
        .select("id")
        .maybeSingle();

    if (updateError || !updatedOrder) {
      await supabaseAdmin.storage
        .from("payment-proofs")
        .remove([filePath]);

      uploadedFilePath = null;

      if (updateError) {
        return errorResponse(
          "Your receipt could not be attached to the order. Please try again.",
          500
        );
      }

      return errorResponse(
        "This order can no longer accept payment receipts.",
        409
      );
    }

    // The new receipt is saved. Remove the previous one.
    if (order.payment_proof_path) {
      await supabaseAdmin.storage
        .from("payment-proofs")
        .remove([order.payment_proof_path]);
    }

    uploadedFilePath = null;

    return NextResponse.json({
      success: true,
      orderId,
      orderNumber: order.order_number,
      message: "Payment receipt uploaded successfully.",
    });
  } catch {
    // Clean up a newly uploaded file if an unexpected error occurs.
    if (uploadedFilePath) {
      await supabaseAdmin.storage
        .from("payment-proofs")
        .remove([uploadedFilePath]);
    }

    return errorResponse(
      "Something went wrong while uploading your receipt.",
      500
    );
  }
}
