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
// FORWARD_FROM (an address on the verified domain, e.g. "Name <forwarding@…>").

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
}

/** The configuration from the environment, or null when any part is missing. */
export function inboundFromEnv(env: Record<string, string | undefined>): InboundConfig | null {
  const c = { apiKey: env.RESEND_API_KEY, webhookSecret: env.RESEND_WEBHOOK_SECRET, forwardTo: env.FORWARD_TO, forwardFrom: env.FORWARD_FROM };
  return c.apiKey && c.webhookSecret && c.forwardTo && c.forwardFrom ? (c as InboundConfig) : null;
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> | null {
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
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
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

/** One line, no control characters (for the subject). */
const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface Received {
  from?: unknown;
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  attachments?: unknown;
}

export function createInbound(config: InboundConfig | null, fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  const empty = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  const auth: Record<string, string> = config ? { Authorization: `Bearer ${config.apiKey}` } : {};

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
      const got = await fetchImpl(`${RESEND}/emails/receiving/${id}`, { headers: auth });
      if (!got.ok) throw new Error(`fetch ${got.status}`);
      const mail = (await got.json()) as Received;
      const sender = address(mail.from);
      // Never forward our own forwards (a loop if FORWARD_TO ever pointed back here).
      if (sender && sender.toLowerCase() === address(config.forwardFrom)?.toLowerCase()) return empty(204);

      const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).map(address).filter(Boolean).join(", ") || "the site";
      const files = Array.isArray(mail.attachments) ? mail.attachments.length : 0;
      const note =
        `Forwarded from ${to}. From: ${typeof mail.from === "string" ? oneLine(mail.from) : "unknown"}.` +
        (files ? ` ${files} attachment(s) not forwarded: open the email in Resend (Emails, Receiving).` : "") +
        (sender ? " Reply to answer the sender directly." : "");
      const subject = oneLine(typeof mail.subject === "string" && mail.subject ? mail.subject : "(no subject)").slice(0, 200);
      const text = typeof mail.text === "string" ? mail.text : "";
      const html = typeof mail.html === "string" ? mail.html : "";

      const sent = await fetchImpl(`${RESEND}/emails`, {
        method: "POST",
        // Resend may deliver a notice twice; the same key sends the copy once.
        headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": `inbound-${id}` },
        body: JSON.stringify({
          from: config.forwardFrom,
          to: [config.forwardTo],
          ...(sender ? { reply_to: sender } : {}),
          subject: `Fwd: ${subject}`,
          text: `${note}\n\n${text || "(no plain-text version; see the HTML)"}`,
          ...(html ? { html: `<p style="font:14px sans-serif;color:#555">${escapeHtml(note)}</p><hr>${html}` } : {}),
        }),
      });
      if (!sent.ok) throw new Error(`send ${sent.status}`);
      return empty(204);
    } catch (err) {
      // Only the error itself, never the message. A 502 makes Resend retry later.
      console.warn(`inbound not forwarded: ${err instanceof Error ? err.message : "error"}`);
      return empty(502);
    }
  };
}
