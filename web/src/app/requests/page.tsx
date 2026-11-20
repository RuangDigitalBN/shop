"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import StoreBrand from "../StoreBrand";
import { feedbackCategories } from "@/lib/customer-requests";
import "./requests.css";

const emptyForm = { request_type: "game_request", game_name: "", requested_item: "", feedback_category: "General", message: "", contact: "", website: "" };

export default function RequestsPage() {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const key = useRef<string | null>(null);
  const inFlight = useRef(false);
  const game = form.request_type === "game_request";
  const update = (name: keyof typeof emptyForm, value: string) => { setForm(previous => ({ ...previous, [name]: value })); key.current = null; setErrors({}); };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setErrors({});
    try {
      key.current ??= crypto.randomUUID();
      const response = await fetch("/api/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, submission_key: key.current }),
      });
      const result = await response.json();
      if (!response.ok || result?.success !== true) {
        setErrors({ ...(result.errors ?? {}), form: result.error ?? "Could not send your message. Please try again." });
        return;
      }
      setSuccess(true);
    } catch { setErrors({ form: "We couldn’t confirm your submission. Please try again; your message is still here." }); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const field = (name: "game_name" | "requested_item" | "message" | "contact", label: string, limit: number, required = false) => <label className="request-field" htmlFor={`request-${name}`}>
    <span>{label}{required ? " *" : " (optional)"}</span>
    {name === "message" ? <textarea id={`request-${name}`} name={name} rows={5} value={form[name]} maxLength={limit} required={required} onChange={e => update(name, e.target.value)} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `error-${name}` : undefined} /> :
      <input id={`request-${name}`} name={name} value={form[name]} maxLength={limit} required={required} autoComplete={name === "contact" ? "tel" : "off"} onChange={e => update(name, e.target.value)} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `error-${name}` : undefined} />}
    {errors[name] && <small id={`error-${name}`} className="request-error">{errors[name]}</small>}
  </label>;

  return <main className="request-page">
    <header className="request-header"><StoreBrand /><Link href="/">Back to store</Link></header>
    <section className="request-panel">
      <p className="request-eyebrow">Help shape your space</p>
      <h1>What’s on your mind?</h1>
      <p className="request-copy">Suggest your next game or share a little feedback. No account needed.</p>
      {success ? <div className="request-success" role="status" tabIndex={-1}>
        <h2>Thanks for sharing.</h2><p>Your message has been received. We’ll review it soon.</p><Link href="/#games">Explore games <span aria-hidden="true">→</span></Link>
      </div> : <form onSubmit={submit} className="request-form">
        <fieldset disabled={busy}>
          <legend className="sr-only">Request or feedback details</legend>
          <label className="request-field" htmlFor="request-type"><span>I’d like to</span><select id="request-type" value={form.request_type} onChange={e => update("request_type", e.target.value)}><option value="game_request">Request a Game</option><option value="feedback">Give Feedback</option></select></label>
          {game ? <>{field("game_name", "Game name", 120, true)}{field("requested_item", "Requested item / product", 160)}</> :
            <label className="request-field" htmlFor="feedback-category"><span>Feedback category</span><select id="feedback-category" value={form.feedback_category} onChange={e => update("feedback_category", e.target.value)} aria-invalid={!!errors.feedback_category} aria-describedby={errors.feedback_category ? "error-feedback-category" : undefined}>{feedbackCategories.map(category => <option key={category}>{category}</option>)}</select>{errors.feedback_category && <small id="error-feedback-category" className="request-error">{errors.feedback_category}</small>}</label>}
          {field("message", game ? "Note / message" : "Message", 2000, !game)}
          {field("contact", "WhatsApp / contact", 120)}
          <p className="request-hint">Plain text, up to 2,000 characters. Leave a contact if you’d like us to follow up.</p>
          <div className="request-honeypot" aria-hidden="true"><label htmlFor="request-website">Leave this blank<input id="request-website" name="website" autoComplete="off" tabIndex={-1} value={form.website} onChange={e => update("website", e.target.value)} /></label></div>
          {errors.form && <p role="alert" className="request-error">{errors.form}</p>}
          <button type="submit">{busy ? "Sending…" : game ? "Send game request" : "Send feedback"}</button>
          {busy && <p role="status">Sending your message…</p>}
        </fieldset>
      </form>}
    </section>
  </main>;
}
