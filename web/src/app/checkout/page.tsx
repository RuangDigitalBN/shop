
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "../CartContext";
import { supabase } from "@/lib/supabase";

type PaymentSettings = {
  bank_transfer_enabled: boolean;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  payment_qr_url: string | null;
};

type CheckoutSession = {
  fingerprint: string;
  idempotencyKey: string;
};

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, subtotal, isLoaded, clearCart } = useCart();

  const [step, setStep] = useState<1 | 2>(1);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");

  const [formError, setFormError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");

  const [nameError, setNameError] = useState("");
  const [whatsappError, setWhatsappError] = useState("");
  const [emailError, setEmailError] = useState("");

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [receiptPreview, setReceiptPreview] = useState("");

  const [paymentSettings, setPaymentSettings] =
    useState<PaymentSettings | null>(null);

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");

  const [accountCopied, setAccountCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Load payment settings from Supabase.
  useEffect(() => {
    async function loadPaymentSettings() {
      const { data, error } = await supabase
        .from("payment_settings")
        .select(
          "bank_transfer_enabled, bank_name, account_name, account_number, payment_qr_url"
        )
        .eq("id", true)
        .single();

      if (error) {
        setSettingsError("Unable to load payment information.");
      } else {
        setPaymentSettings(data as PaymentSettings);
      }

      setSettingsLoading(false);
    }

    loadPaymentSettings();
  }, []);

  // Copy bank account number.
  async function handleCopyAccountNumber() {
    if (!paymentSettings?.account_number) return;

    try {
      await navigator.clipboard.writeText(
        paymentSettings.account_number
      );

      setAccountCopied(true);
      setCopyError("");

      window.setTimeout(() => {
        setAccountCopied(false);
      }, 2000);
    } catch {
      setCopyError(
        "Unable to copy. Please copy the number manually."
      );
    }
  }

  // Generate receipt image preview.
  useEffect(() => {
    if (!receiptFile || !receiptFile.type.startsWith("image/")) {
      setReceiptPreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(receiptFile);
    setReceiptPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [receiptFile]);

  function handleContinue() {
    setFormError("");
    setNameError("");
    setWhatsappError("");
    setEmailError("");

    let hasError = false;

    if (!name.trim()) {
      setNameError("Please enter your name.");
      hasError = true;
    }

    const phoneDigits = whatsapp.replace(/\D/g, "");

    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      setWhatsappError("Please enter a valid WhatsApp number.");
      hasError = true;
    }

    if (
      email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setEmailError("Please enter a valid email address.");
      hasError = true;
    }

    if (hasError) {
      setFormError("Please correct the highlighted fields.");
      return;
    }

    sessionStorage.setItem(
      "ruang-checkout-details",
      JSON.stringify({
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim(),
      })
    );

    setStep(2);
    setFormError("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleReceiptChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    setReceiptError("");
    setSubmitError("");

    const file = event.target.files?.[0];

    if (!file) {
      setReceiptFile(null);
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      setReceiptFile(null);
      setReceiptError(
        "Please upload a JPG, PNG, WEBP or PDF file."
      );
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setReceiptFile(null);
      setReceiptError("File size must not exceed 5MB.");
      event.target.value = "";
      return;
    }

    setReceiptFile(file);
  }

  // Reuse the same order key when retrying the same checkout.
  function getCheckoutIdempotencyKey() {
    const customer = {
      name: name.trim(),
      whatsapp: whatsapp.trim(),
      email: email.trim(),
    };

    const items = cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      playerId: item.playerId.trim(),
      zoneId: item.zoneId.trim(),
    }));

    const fingerprint = JSON.stringify({
      customer,
      items,
    });

    const storageKey = "ruang-checkout-session";

    const savedSession = sessionStorage.getItem(storageKey);

    if (savedSession) {
      try {
        const parsed = JSON.parse(
          savedSession
        ) as CheckoutSession;

        if (
          parsed.fingerprint === fingerprint &&
          typeof parsed.idempotencyKey === "string"
        ) {
          return parsed.idempotencyKey;
        }
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    }

    const newSession: CheckoutSession = {
      fingerprint,
      idempotencyKey: crypto.randomUUID(),
    };

    sessionStorage.setItem(
      storageKey,
      JSON.stringify(newSession)
    );

    return newSession.idempotencyKey;
  }

  // Create the order, then upload its payment receipt.
  async function handleSubmitOrder() {
    setSubmitError("");
    setReceiptError("");

    if (!name.trim() || !whatsapp.trim()) {
      setSubmitError(
        "Please return to customer details and check your information."
      );
      return;
    }

    if (!paymentSettings?.bank_transfer_enabled) {
      setSubmitError(
        "Bank transfer is currently unavailable."
      );
      return;
    }

    const hasPaymentDetails =
      Boolean(paymentSettings.bank_name) ||
      Boolean(paymentSettings.account_number) ||
      Boolean(paymentSettings.payment_qr_url);

    if (!hasPaymentDetails) {
      setSubmitError(
        "Payment details have not been configured yet."
      );
      return;
    }

    if (!receiptFile) {
      setReceiptError("Please select your payment receipt.");
      return;
    }

    if (cart.length === 0) {
      setSubmitError("Your cart is empty.");
      return;
    }

    setIsSubmitting(true);

    try {
      const idempotencyKey = getCheckoutIdempotencyKey();

      const customer = {
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim(),
      };

      const items = cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        playerId: item.playerId.trim(),
        zoneId: item.zoneId.trim(),
      }));

      // Step 1: Create or retrieve the order.
      const orderResponse = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey,
          customer,
          items,
        }),
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok || !orderData.success) {
        throw new Error(
          orderData.error || "Unable to create your order."
        );
      }

      if (
        typeof orderData.orderId !== "string" ||
        typeof orderData.orderNumber !== "string"
      ) {
        throw new Error("Invalid order response. Please try again.");
      }

      // Step 2: Upload the receipt to the private storage bucket.
      const uploadData = new FormData();

      uploadData.append("file", receiptFile);
      uploadData.append("idempotencyKey", idempotencyKey);

      const receiptResponse = await fetch(
        `/api/orders/${orderData.orderId}/payment-proof`,
        {
          method: "POST",
          body: uploadData,
        }
      );

      const receiptResult = await receiptResponse.json();

      if (!receiptResponse.ok || !receiptResult.success) {
        throw new Error(
          receiptResult.error ||
            "Your order was created, but the receipt upload failed. Please try again."
        );
      }

      // Both steps succeeded.
      setOrderNumber(orderData.orderNumber);
      setIsSuccess(true);

      sessionStorage.removeItem("ruang-checkout-session");
      sessionStorage.removeItem("ruang-checkout-details");

      clearCart();

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-[#171717] p-8 text-[#F2F0E9]">
        Loading checkout...
      </main>
    );
  }

  // Successful order confirmation.
  if (isSuccess) {
    return (
      <main className="min-h-screen bg-[#171717] px-5 py-16 text-[#F2F0E9]">
        <div className="mx-auto max-w-2xl rounded-2xl border border-[#C6F36B]/20 bg-[#262626] p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#C6F36B]/10 text-3xl text-[#C6F36B]">
            ✓
          </div>

          <p className="mt-6 text-xs font-black uppercase tracking-[0.25em] text-[#C6F36B]">
            Ruang Digital
          </p>

          <h1 className="mt-3 text-3xl font-black">
            Order submitted!
          </h1>

          <p className="mt-4 text-sm leading-6 text-white/60">
            Your order and payment receipt have been received.
            Our team will review your payment and contact you
            through WhatsApp.
          </p>

          <div className="mt-8 rounded-xl border border-white/10 bg-[#171717] p-5">
            <p className="text-xs text-white/40">
              Your order number
            </p>

            <p className="mt-2 text-xl font-black tracking-wide text-[#C6F36B]">
              {orderNumber}
            </p>
          </div>

          <button
            onClick={() => router.push("/")}
            className="mt-8 w-full rounded-full bg-[#C6F36B] px-6 py-4 text-sm font-black uppercase tracking-wider text-[#171717] transition hover:bg-white"
          >
            Back to store
          </button>
        </div>
      </main>
    );
  }

  if (cart.length === 0) {
    return (
      <main className="min-h-screen bg-[#171717] px-5 py-16 text-[#F2F0E9]">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-black">
            Your cart is empty.
          </h1>

          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-full bg-[#C6F36B] px-6 py-3 text-sm font-black text-[#171717]"
          >
            Back to store
          </button>
        </div>
      </main>
    );
  }

  const hasPaymentDetails =
    Boolean(paymentSettings?.bank_name) ||
    Boolean(paymentSettings?.account_number) ||
    Boolean(paymentSettings?.payment_qr_url);

  const canSubmit =
    !settingsLoading &&
    !settingsError &&
    paymentSettings?.bank_transfer_enabled === true &&
    hasPaymentDetails &&
    Boolean(receiptFile) &&
    !isSubmitting;

  return (
    <main className="min-h-screen bg-[#171717] px-5 py-12 text-[#F2F0E9]">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() =>
            step === 2
              ? setStep(1)
              : router.push("/cart")
          }
          disabled={isSubmitting}
          className="mb-8 text-sm text-white/50 transition hover:text-[#C6F36B] disabled:opacity-40"
        >
          ← {step === 2 ? "Back to customer details" : "Back to cart"}
        </button>

        <p className="text-xs font-black uppercase tracking-[0.25em] text-[#C6F36B]">
          Ruang Digital
        </p>

        <h1 className="mt-3 text-4xl font-black tracking-tight">
          Checkout
        </h1>

        <div className="mt-6 flex items-center gap-3">
          <div
            className={`rounded-full px-4 py-2 text-xs font-black ${
              step === 1
                ? "bg-[#C6F36B] text-[#171717]"
                : "bg-white/10 text-white/50"
            }`}
          >
            1. DETAILS
          </div>

          <div className="h-px flex-1 bg-white/10" />

          <div
            className={`rounded-full px-4 py-2 text-xs font-black ${
              step === 2
                ? "bg-[#C6F36B] text-[#171717]"
                : "bg-white/10 text-white/50"
            }`}
          >
            2. PAYMENT
          </div>
        </div>

        {/* ORDER SUMMARY */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-[#262626] p-6">
          <h2 className="text-lg font-black">Order summary</h2>

          <div className="mt-6 space-y-5">
            {cart.map((item) => (
              <div
                key={item.cartItemId}
                className="flex justify-between gap-4 border-b border-white/10 pb-5"
              >
                <div>
                  <p className="font-bold">{item.name}</p>

                  <p className="mt-1 text-xs text-white/50">
                    Player ID: {item.playerId}
                  </p>

                  <p className="text-xs text-white/50">
                    Server ID: {item.zoneId}
                  </p>

                  <p className="mt-1 text-xs text-white/50">
                    Quantity: {item.quantity}
                  </p>
                </div>

                <p className="whitespace-nowrap font-bold">
                  BND {(item.unitPrice * item.quantity).toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-between text-lg font-black">
            <span>Total</span>

            <span className="text-[#C6F36B]">
              BND {subtotal.toFixed(2)}
            </span>
          </div>
        </section>

        {/* CUSTOMER DETAILS */}
        {step === 1 && (
          <>
            <section className="mt-6 rounded-2xl border border-white/10 bg-[#262626] p-6">
              <h2 className="text-lg font-black">
                Customer details
              </h2>

              <div className="mt-6 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Name <span className="text-[#C6F36B]">*</span>
                  </label>

                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameError("");
                    }}
                    placeholder="Enter your name"
                    autoComplete="name"
                    className={`w-full rounded-xl border bg-[#171717] px-4 py-3 text-sm text-white outline-none transition ${
                      nameError
                        ? "border-red-500"
                        : name.trim()
                          ? "border-green-500"
                          : "border-white/10 focus:border-[#C6F36B]"
                    }`}
                  />

                  {nameError && (
                    <p className="mt-2 text-xs text-red-400">
                      {nameError}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold">
                    WhatsApp Number{" "}
                    <span className="text-[#C6F36B]">*</span>
                  </label>

                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => {
                      setWhatsapp(e.target.value);
                      setWhatsappError("");
                    }}
                    placeholder="e.g. +673 8123456"
                    autoComplete="tel"
                    className={`w-full rounded-xl border bg-[#171717] px-4 py-3 text-sm text-white outline-none transition ${
                      whatsappError
                        ? "border-red-500"
                        : whatsapp.replace(/\D/g, "").length >= 7 &&
                            whatsapp.replace(/\D/g, "").length <= 15
                          ? "border-green-500"
                          : "border-white/10 focus:border-[#C6F36B]"
                    }`}
                  />

                  {whatsappError && (
                    <p className="mt-2 text-xs text-red-400">
                      {whatsappError}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Email Address{" "}
                    <span className="text-xs font-normal text-white/40">
                      (Optional)
                    </span>
                  </label>

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError("");
                    }}
                    placeholder="Enter your email address"
                    autoComplete="email"
                    className={`w-full rounded-xl border bg-[#171717] px-4 py-3 text-sm text-white outline-none transition ${
                      emailError
                        ? "border-red-500"
                        : email.trim() &&
                            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
                          ? "border-green-500"
                          : "border-white/10 focus:border-[#C6F36B]"
                    }`}
                  />

                  {emailError && (
                    <p className="mt-2 text-xs text-red-400">
                      {emailError}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {formError && (
              <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {formError}
              </p>
            )}

            <button
              type="button"
              onClick={handleContinue}
              className="mt-6 w-full rounded-full bg-[#C6F36B] px-6 py-4 text-sm font-black uppercase tracking-wider text-[#171717] transition hover:bg-white"
            >
              Continue to Payment →
            </button>
          </>
        )}

        {/* PAYMENT */}
        {step === 2 && (
          <>
            <section className="mt-6 rounded-2xl border border-white/10 bg-[#262626] p-6">
              <h2 className="text-lg font-black">
                Bank transfer
              </h2>

              {settingsLoading ? (
                <p className="mt-4 text-sm text-white/50">
                  Loading payment information...
                </p>
              ) : settingsError ? (
                <p className="mt-4 text-sm text-red-400">
                  {settingsError} Please try again later.
                </p>
              ) : !paymentSettings?.bank_transfer_enabled ? (
                <div className="mt-5 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                  <p className="text-sm font-bold text-yellow-400">
                    Bank transfer is currently unavailable.
                  </p>

                  <p className="mt-2 text-xs text-white/50">
                    Please contact Ruang Digital for assistance.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    Please transfer the exact order amount using
                    the bank details below.
                  </p>

                  {paymentSettings.bank_name && (
                    <div className="mt-6">
                      <p className="text-xs text-white/40">Bank</p>
                      <p className="mt-1 font-bold">
                        {paymentSettings.bank_name}
                      </p>
                    </div>
                  )}

                  {paymentSettings.account_name && (
                    <div className="mt-4">
                      <p className="text-xs text-white/40">
                        Account name
                      </p>
                      <p className="mt-1 font-bold">
                        {paymentSettings.account_name}
                      </p>
                    </div>
                  )}

                  {paymentSettings.account_number && (
                    <div className="mt-4">
                      <p className="text-xs text-white/40">
                        Account number
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <p className="font-bold tracking-wide">
                          {paymentSettings.account_number}
                        </p>

                        <button
                          type="button"
                          onClick={handleCopyAccountNumber}
                          className="rounded-lg border border-[#C6F36B]/30 bg-[#C6F36B]/10 px-3 py-2 text-xs font-bold text-[#C6F36B] transition hover:bg-[#C6F36B] hover:text-[#171717]"
                        >
                          {accountCopied ? "Copied!" : "Copy"}
                        </button>
                      </div>

                      {copyError && (
                        <p className="mt-2 text-xs text-red-400">
                          {copyError}
                        </p>
                      )}
                    </div>
                  )}

                  {paymentSettings.payment_qr_url && (
                    <div className="mt-6">
                      <p className="mb-3 text-xs text-white/40">
                        Scan to pay
                      </p>

                      <img
                        src={paymentSettings.payment_qr_url}
                        alt="Payment QR code"
                        className="max-h-64 rounded-xl bg-white p-3 object-contain"
                      />
                    </div>
                  )}

                  {!hasPaymentDetails && (
                    <div className="mt-6 rounded-xl border border-[#C6F36B]/20 bg-[#C6F36B]/5 p-4">
                      <p className="text-sm font-bold text-[#C6F36B]">
                        Bank details are not configured yet.
                      </p>

                      <p className="mt-2 text-xs leading-5 text-white/50">
                        Payment instructions will appear here once
                        Ruang Digital adds its bank details.
                      </p>
                    </div>
                  )}

                  <div className="mt-6 border-t border-white/10 pt-5">
                    <p className="text-xs text-white/40">
                      Amount to transfer
                    </p>

                    <p className="mt-1 text-2xl font-black text-[#C6F36B]">
                      BND {subtotal.toFixed(2)}
                    </p>
                  </div>
                </>
              )}
            </section>

            {/* RECEIPT UPLOAD */}
            {paymentSettings?.bank_transfer_enabled && (
              <section className="mt-6 rounded-2xl border border-white/10 bg-[#262626] p-6">
                <h2 className="text-lg font-black">
                  Payment receipt
                </h2>

                <p className="mt-2 text-sm leading-6 text-white/50">
                  After making your transfer, upload your payment
                  receipt here.
                </p>

                <label className="mt-6 block cursor-pointer rounded-xl border border-dashed border-white/20 bg-[#171717] p-6 text-center transition hover:border-[#C6F36B]">
                  <span className="text-sm font-bold text-[#C6F36B]">
                    Choose receipt file
                  </span>

                  <span className="mt-2 block text-xs text-white/40">
                    JPG, PNG, WEBP or PDF · Maximum 5MB
                  </span>

                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleReceiptChange}
                    disabled={isSubmitting}
                    className="sr-only"
                  />
                </label>

                {receiptFile && (
                  <div className="mt-4 rounded-xl border border-white/10 p-4">
                    <p className="text-sm font-bold">
                      {receiptFile.name}
                    </p>

                    <p className="mt-1 text-xs text-white/40">
                      {(receiptFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>

                    {receiptPreview && (
                      <img
                        src={receiptPreview}
                        alt="Payment receipt preview"
                        className="mt-4 max-h-64 w-full rounded-lg object-contain"
                      />
                    )}
                  </div>
                )}

                {receiptError && (
                  <p className="mt-3 text-xs text-red-400">
                    {receiptError}
                  </p>
                )}
              </section>
            )}

            {submitError && (
              <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="text-sm font-bold text-red-400">
                  Unable to complete checkout
                </p>

                <p className="mt-2 text-xs leading-5 text-red-300/80">
                  {submitError}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmitOrder}
              disabled={!canSubmit}
              className="mt-6 w-full rounded-full bg-[#C6F36B] px-6 py-4 text-sm font-black uppercase tracking-wider text-[#171717] transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
            >
              {isSubmitting
                ? "Submitting your order..."
                : "Submit Order"}
            </button>

            <p className="mt-4 text-center text-xs leading-5 text-white/40">
              Please ensure your payment receipt is correct before
              submitting. Your payment will be reviewed by our team.
            </p>
          </>
        )}

        <p className="mt-6 text-xs leading-6 text-white/40">
          Your details are used to contact you about your order.
        </p>
      </div>
    </main>
  );
}
