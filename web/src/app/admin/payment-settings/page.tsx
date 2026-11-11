
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PaymentSettings = {
  bank_transfer_enabled: boolean;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  payment_qr_url: string | null;
};

export default function PaymentSettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const [bankEnabled, setBankEnabled] = useState(true);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    async function loadSettings() {
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

      const { data, error } = await supabase
        .from("payment_settings")
        .select("*")
        .eq("id", true)
        .single();

      if (error) {
        setMessage(error.message);
        setIsSuccess(false);
        setLoading(false);
        return;
      }

      const settings = data as PaymentSettings;

      setBankEnabled(settings.bank_transfer_enabled);
      setBankName(settings.bank_name ?? "");
      setAccountName(settings.account_name ?? "");
      setAccountNumber(settings.account_number ?? "");
      setQrUrl(settings.payment_qr_url ?? "");

      setLoading(false);
    }

    loadSettings();
  }, [router]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("payment_settings")
      .update({
        bank_transfer_enabled: bankEnabled,
        bank_name: bankName.trim() || null,
        account_name: accountName.trim() || null,
        account_number: accountNumber.trim() || null,
        payment_qr_url: qrUrl.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);

    if (error) {
      setMessage(error.message);
      setIsSuccess(false);
    } else {
      setMessage("Payment settings saved successfully!");
      setIsSuccess(true);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#171717] p-8 text-[#F2F0E9]">
        Loading payment settings...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#171717] px-5 py-10 text-[#F2F0E9]">
      <div className="mx-auto max-w-3xl">

        <button
          onClick={() => router.push("/admin")}
          className="mb-8 text-sm text-white/50 transition hover:text-[#C6F36B]"
        >
          ← Back to dashboard
        </button>

        <p className="text-xs font-black uppercase tracking-[0.25em] text-[#C6F36B]">
          Ruang Digital Admin
        </p>

        <h1 className="mt-3 text-3xl font-black">
          Payment Settings
        </h1>

        <p className="mt-3 text-sm text-white/50">
          Manage the payment information displayed to your customers.
        </p>

        <form onSubmit={handleSave}>

          <section className="mt-8 rounded-2xl border border-white/10 bg-[#262626] p-6">

            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-black">Bank Transfer</h2>
                <p className="mt-1 text-xs text-white/40">
                  Enable or disable bank transfer payments.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setBankEnabled(!bankEnabled)}
                className={`rounded-full px-4 py-2 text-xs font-black ${
                  bankEnabled
                    ? "bg-[#C6F36B] text-[#171717]"
                    : "bg-white/10 text-white/50"
                }`}
              >
                {bankEnabled ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            <div className="mt-8 space-y-5">

              <div>
                <label className="mb-2 block text-sm font-bold">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Enter bank name"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm text-white outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  Account Holder Name
                  <span className="ml-2 text-xs font-normal text-white/40">
                    Optional
                  </span>
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Enter account holder name"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm text-white outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  Account Number
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Enter account number"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm text-white outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  Payment QR Code URL
                  <span className="ml-2 text-xs font-normal text-white/40">
                    Optional
                  </span>
                </label>
                <input
                  type="url"
                  value={qrUrl}
                  onChange={(e) => setQrUrl(e.target.value)}
                  placeholder="Paste QR code image URL"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm text-white outline-none focus:border-[#C6F36B]"
                />
                <p className="mt-2 text-xs text-white/40">
                  We will add QR code image uploading in a later step.
                </p>
              </div>

            </div>
          </section>

          {message && (
            <p
              className={`mt-4 rounded-xl border p-3 text-sm ${
                isSuccess
                  ? "border-green-500/20 bg-green-500/10 text-green-400"
                  : "border-red-500/20 bg-red-500/10 text-red-400"
              }`}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-6 w-full rounded-full bg-[#C6F36B] px-6 py-4 text-sm font-black uppercase tracking-wider text-[#171717] transition hover:bg-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Payment Settings"}
          </button>

        </form>
      </div>
    </main>
  );
}
