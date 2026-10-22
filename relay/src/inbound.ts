// Forwards mail sent to the site's corrections address (frontend help/report.ts)
// to the volunteer's own inbox. Resend receives the domain's mail and POSTs a
// signed "email.received" notice here; this checks the signature, fetches the
// message from Resend and sends a copy to FORWARD_TO, with Reply-To set to the
// sender so answering goes straight back to them.
//   POST /api/inbound   (Resend webhook, signed the Svix way)
//
// Privacy: nothing is stored, and only error messages are logged; the message
// just passes through. The volunteer's address lives in the project's
// environment (FORWARD_TO), never in this public code.
// Environment: RESEND_API_KEY, RESEND_WEBHOOK_SECRET ("whsec_…"), FORWARD_TO,
// FORWARD_FROM (an address on the verified domain, e.g. "Name <forwarding@…>"),
// and optionally FORWARD_FOR (comma-separated: forward only mail sent to these).
//
// Safety: mail whose sender fails DMARC (or can't be checked) is marked
// "[UNVERIFIED SENDER]" in the subject (the one place the sender's HTML can't
// restyle), sent as text only and with no Reply-To. Auto-replies are skipped
// (RFC 3834), and our copies say Auto-Submitted, so two robots can't loop.

const RESEND = "https://api.resend.com";
/** Signed notices older or newer than this are refused (replays). */
const TOLERANCE_SECONDS = 5 * 60;
/** The notice is metadata only; anything bigger isn't from Resend. */
const MAX_BODY = 64 * 1024;

export interface InboundConfig {
  apiKey: string;
  webhookSecret: string;
  forwardTo: string;
  forwardFrom: string;
  /** Forward only mail addressed to these (lowercase); empty means all. */
  forwardFor?: string[];
}

/** The configuration from the environment, or null when any part is missing. */
export function inboundFromEnv(env: Record<string, string | undefined>): InboundConfig | null {
  const c = { apiKey: env.RESEND_API_KEY, webhookSecret: env.RESEND_WEBHOOK_SECRET, forwardTo: env.FORWARD_TO, forwardFrom: env.FORWARD_FROM };
  if (!(c.apiKey && c.webhookSecret && c.forwardTo && c.forwardFrom)) return null;
  const forwardFor = (env.FORWARD_FOR ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  return { ...(c as InboundConfig), forwardFor };
}

function fromBase64(s: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Compare in constant time (for equal lengths). */
function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Svix signatures: HMAC-SHA256 over "<id>.<timestamp>.<body>" with the base64
 *  key after "whsec_"; the header lists "v1,<base64>" entries separated by spaces. */
export async function verifySignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowMs: number,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret.startsWith("whsec_")) return false;
  const t = Number(timestamp);
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(nowMs / 1000 - t) > TOLERANCE_SECONDS) return false;
  const raw = fromBase64(secret.slice("whsec_".length));
  if (!raw || raw.length === 0) return false;
  const key = await crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return signature.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    const bytes = version === "v1" && sig ? fromBase64(sig) : null;
    return bytes !== null && same(bytes, mac);
  });
}

/** The plain address in "Name <a@b.c>" or "a@b.c", or null if it isn't one. */
export function address(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = /<([^<>\s]+)>\s*$/.exec(s);
  const a = (m ? m[1]! : s).trim();
  return /^[^\s@<>"',;]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/.test(a) ? a : null;
}

/** One line, without control or invisible formatting characters (bidi overrides
 *  could make a display name read as something else). */
const oneLine = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\p{Cf}+/gu, "")
    .trim();
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface Received {
  from?: unknown;
  to?: unknown;
  cc?: unknown;
  received_for?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  attachments?: unknown;
  headers?: unknown;
  authentication?: { spf?: unknown; dkim?: unknown; dmarc?: unknown } | null;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** An automatic reply or bulk mail (RFC 3834 and common headers): not forwarded. */
export function isAutomatic(headers: unknown): boolean {
  if (!headers || typeof headers !== "object") return false;
  const h = Object.fromEntries(Object.entries(headers as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), String(v ?? "").toLowerCase()]));
  return (
    (h["auto-submitted"] !== undefined && h["auto-submitted"].trim() !== "no") ||
    /^(bulk|list|junk|auto_reply)$/.test((h["precedence"] ?? "").trim()) ||
    "x-autoreply" in h ||
    "x-autorespond" in h
  );
}

/** Did the sender's domain vouch for the From address (DMARC pass)? */
export const verifiedSender = (auth: Received["authentication"]) => auth?.dmarc === "pass";

export function createInbound(config: InboundConfig | null, fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  const empty = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  const authHeader: Record<string, string> = config ? { Authorization: `Bearer ${config.apiKey}` } : {};

  return async function inbound(request: Request): Promise<Response> {
    if (!config) return empty(503);
    if (Number(request.headers.get("Content-Length") ?? "0") > MAX_BODY) return empty(413);
    const body = await request.text();
    if (body.length > MAX_BODY) return empty(413);
    const signed = await verifySignature(
      config.webhookSecret,
      { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") },
      body,
      now(),
    );
    if (!signed) return empty(401);

    let event: { type?: unknown; data?: { email_id?: unknown } };
    try {
      event = JSON.parse(body);
    } catch {
      return empty(400);
    }
    // Other event types are fine to receive; there's nothing to do for them.
    if (event.type !== "email.received") return empty(204);
    const id = event.data?.email_id;
    if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(id)) return empty(400);

    try {
      const got = await fetchImpl(`${RESEND}/emails/receiving/${id}`, { headers: authHeader });
      if (got.status === 404) return empty(204); // gone: nothing to forward, and retrying won't help
      if (!got.ok) throw new Error(`fetch ${got.status}`);
      const mail = (await got.json()) as Received;
      const sender = address(mail.from);
      // Never forward our own forwards (a loop if FORWARD_TO ever pointed back here), or robots.
      if (sender && sender.toLowerCase() === address(config.forwardFrom)?.toLowerCase()) return empty(204);
      if (isAutomatic(mail.headers)) return empty(204);
      if (config.forwardFor?.length) {
        const rcpts = [...list(mail.to), ...list(mail.cc), ...list(mail.received_for)].map((a) => address(a)?.toLowerCase());
        if (!rcpts.some((a) => a && config.forwardFor!.includes(a))) return empty(204);
      }
      const trusted = verifiedSender(mail.authentication);
      const auth = mail.authentication ?? {};
      const checks = `SPF ${String(auth.spf ?? "unknown")}, DKIM ${String(auth.dkim ?? "unknown")}, DMARC ${String(auth.dmarc ?? "unknown")}`;

      const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).map(address).filter(Boolean).join(", ") || "the site";
      const files = Array.isArray(mail.attachments) ? mail.attachments.length : 0;
      const note =
        `Forwarded from ${to}. Sender address: ${sender ?? "unknown"} (name shown: "${typeof mail.from === "string" ? oneLine(mail.from).slice(0, 120) : ""}"). ${checks}.` +
        (trusted
          ? sender
            ? " Reply to answer the sender directly."
            : ""
          : " UNVERIFIED SENDER: the sender's domain didn't confirm this address, so it may be forged. Don't click links or trust what it claims to be.") +
        (files ? ` ${files} attachment(s) not forwarded: open the email in Resend (Emails, Receiving).` : "");
      const subject = oneLine(typeof mail.subject === "string" && mail.subject ? mail.subject : "(no subject)").slice(0, 200);
      const text = typeof mail.text === "string" ? mail.text : "";
      const html = typeof mail.html === "string" ? mail.html : "";

      const send = (replyTo: string | null, key: string) =>
        fetchImpl(`${RESEND}/emails`, {
          method: "POST",
          // Resend may deliver a notice twice; the same key sends the copy once.
          headers: { ...authHeader, "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({
            from: config.forwardFrom,
            to: [config.forwardTo],
            ...(replyTo ? { reply_to: replyTo } : {}),
            subject: `${trusted ? "" : "[UNVERIFIED SENDER] "}Fwd: ${subject}`,
            // RFC 3834: our copy is automatic, so auto-responders won't answer it.
            headers: { "Auto-Submitted": "auto-forwarded" },
            text: `${note}\n\n${text || (html ? "(This message has only an HTML version; open it in Resend to see it.)" : "(empty message)")}`,
            ...(html && trusted ? { html: `<p style="font:14px sans-serif;color:#555">${escapeHtml(note)}</p><hr>${html}` } : {}),
          }),
        });
      let sent = await send(trusted ? sender : null, `inbound-${id}`);
      // Resend refused something about the message (often an odd Reply-To): try once without it.
      if (sent.status === 422 && trusted && sender) sent = await send(null, `inbound-${id}-plain`);
      if (sent.ok) return empty(204);
      // Other refusals won't change on a retry; server trouble and rate limits will.
      if (sent.status >= 400 && sent.status < 500 && sent.status !== 429) {
        console.warn(`inbound not forwarded: send ${sent.status}`);
        return empty(204);
      }
      throw new Error(`send ${sent.status}`);
    } catch (err) {
      // Only the error itself, never the message. A 502 makes Resend retry later.
      console.warn(`inbound not forwarded: ${err instanceof Error ? err.message : "error"}`);
      return empty(502);
    }
  };
}
