
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 100_000;

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

class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function readBoundedFormData(
  request: Request
): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";

  if (
    !contentType.toLowerCase().startsWith("multipart/form-data;") ||
    !contentType.toLowerCase().includes("boundary=")
  ) {
    throw new RequestBodyError("Invalid receipt upload.", 400);
  }

  const declaredLength = request.headers.get("content-length");

  if (declaredLength !== null) {
    const length = Number(declaredLength);

    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RequestBodyError("Invalid request size.", 400);
    }

    if (length > MAX_REQUEST_SIZE) {
      throw new RequestBodyError(
        "File is too large. Maximum size is 5 MB.",
        413
      );
    }
  }

  if (!request.body) {
    throw new RequestBodyError("Missing receipt upload.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      received += value.byteLength;

      if (received > MAX_REQUEST_SIZE) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyError(
          "File is too large. Maximum size is 5 MB.",
          413
        );
      }

      chunks.push(value.slice());
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Response(bytes, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new RequestBodyError("Invalid receipt upload.", 400);
  }
}

type FinalizeResult = {
  ok: boolean;
  code: string;
  orderId?: string;
  orderNumber?: string;
  paymentStatus?: string | null;
  orderStatus?: string | null;
  receiptAlreadyAttached?: boolean;
  receiptAccepted?: boolean;
  orderClosed?: boolean;
};

function isFinalizeResult(value: unknown): value is FinalizeResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean" &&
    "code" in value &&
    typeof value.code === "string"
  );
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const { id: orderId } = await context.params;

    if (!UUID_REGEX.test(orderId)) {
      return errorResponse("Invalid order.", 400);
    }

    const formData = await readBoundedFormData(request);
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

    const { data, error: finalizeError } =
      await supabaseAdmin.rpc("finalize_order_receipt", {
        p_order_id: orderId,
        p_idempotency_key: idempotencyKey,
        p_file_path: filePath,
        p_expected_proof_path: order.payment_proof_path,
      });

    if (finalizeError || !isFinalizeResult(data)) {
      // The RPC may have committed despite a lost response. Never delete the
      // immutable upload; checkout will recover using actual order state.
      console.error("Receipt finalization outcome is unknown", {
        orderId,
        filePath,
        databaseCode: finalizeError?.code,
      });

      return NextResponse.json(
        {
          success: false,
          code: "FINALIZATION_UNKNOWN",
          error:
            "Unable to confirm your receipt. Retry using the same checkout session.",
        },
        { status: 503 }
      );
    }

    const commonResponse = {
      code: data.code,
      orderId: data.orderId ?? orderId,
      orderNumber: data.orderNumber ?? order.order_number,
      paymentStatus: data.paymentStatus ?? null,
      orderStatus: data.orderStatus ?? null,
      receiptAlreadyAttached:
        data.receiptAlreadyAttached === true,
      receiptAccepted: data.receiptAccepted === true,
      orderClosed: data.orderClosed === true,
    };

    if (!data.ok) {
      const status =
        data.code === "ORDER_NOT_FOUND" ? 404 :
        data.code === "ORDER_EXPIRED" ? 410 :
        data.code === "INVALID_RECEIPT_PATH" ? 400 :
        data.code === "RECEIPT_OBJECT_MISSING" ? 503 :
        409;

      const messages: Record<string, string> = {
        ORDER_EXPIRED:
          "The 30-minute deadline for this order has passed.",
        ORDER_CLOSED: "This order is already closed.",
        ORDER_CLOSED_RECEIPT_ALREADY_ATTACHED:
          "The receipt was attached, but this order is already closed.",
        ORDER_CHANGED:
          "This order changed during the upload. Retry using the same checkout session.",
        RECEIPT_NOT_ALLOWED:
          "This order can no longer accept payment receipts.",
        RECEIPT_TIME_UNKNOWN:
          "This order requires manual review. Contact Ruang Digital with the order number.",
        ORDER_STATE_CONFLICT:
          "This order requires manual review.",
        RECEIPT_OBJECT_MISSING:
          "The receipt upload could not be confirmed. Retry using the same checkout session.",
      };

      return NextResponse.json(
        {
          success: false,
          ...commonResponse,
          error:
            messages[data.code] ??
            "This receipt could not be attached to the order.",
        },
        { status }
      );
    }

    if (
      data.orderClosed === true ||
      !["ATTACHED", "ALREADY_ATTACHED"].includes(data.code)
    ) {
      return NextResponse.json(
        {
          success: false,
          code: "FINALIZATION_UNKNOWN",
          error:
            "The receipt result could not be confirmed. Retry using the same checkout session.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      ...commonResponse,
      message:
        data.code === "ALREADY_ATTACHED"
          ? "Payment receipt was already attached."
          : "Payment receipt uploaded successfully.",
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(error.message, error.status);
    }

    // An upload or finalization may have succeeded. Never delete here.
    return NextResponse.json(
      {
        success: false,
        code: "UPLOAD_OUTCOME_UNKNOWN",
        error:
          "Unable to confirm the upload. Retry using the same checkout session.",
      },
      { status: 503 }
    );
  }
}
