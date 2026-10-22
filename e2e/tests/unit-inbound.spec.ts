// Unit tests for the corrections-mail forwarder (relay/src/inbound.ts), with no
// network: only correctly signed, fresh Resend notices are acted on; the copy
// goes to the volunteer with Reply-To set to the sender; nothing loops, and
// nothing from the message is logged.
import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { address, createInbound, inboundFromEnv, isAutomatic, verifySignature, type InboundConfig } from "../../relay/src/inbound";

const KEY = Buffer.from("test-signing-key-0123456789abcdef");
const SECRET = `whsec_${KEY.toString("base64")}`;
const NOW = Date.UTC(2026, 9, 22, 21, 0, 0);
const CONFIG: InboundConfig = { apiKey: "re_test", webhookSecret: SECRET, forwardTo: "volunteer@example.org", forwardFrom: "Corrections <forwarding@example.com>" };

const sign = (id: string, ts: string, body: string, key = KEY) => `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;

function notice(body: string, opts: { id?: string; ts?: number; signature?: string } = {}) {
  const id = opts.id ?? "msg_1";
  const ts = String(opts.ts ?? NOW / 1000);
  return new Request("https://relay.example/api/inbound", {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": opts.signature ?? sign(id, ts, body), "Content-Type": "application/json" },
    body,
  });
}

const received = (emailId = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c") => JSON.stringify({ type: "email.received", data: { email_id: emailId } });

/** A fake Resend API: the received email, then the send. */
function fakeResend(mail: Record<string, unknown>, sendStatus: number | number[] = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const statuses = Array.isArray(sendStatus) ? [...sendStatus] : null;
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("/emails/receiving/")) return Response.json(mail);
    return new Response("{}", { status: statuses ? (statuses.shift() ?? 200) : (sendStatus as number) });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const MAIL = {
  from: "María López <maria@example.net>",
  to: ["enrique@enriquecorado.com"],
  subject: "Correction: Free tax help (checked October 22, 2026)",
  text: "The VITA site moved.",
  html: "<p>The VITA site moved.</p>",
  attachments: [],
  headers: { "mime-version": "1.0" },
  authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
};

const lastSent = (calls: { url: string; init?: RequestInit }[]) => JSON.parse(String(calls[calls.length - 1]!.init!.body));

test.describe("signature", () => {
  test("accepts Resend's signature and refuses anything else", async () => {
    const body = received();
    const h = (signature: string | null, ts = String(NOW / 1000), id: string | null = "msg_1") => ({ id, timestamp: ts, signature });
    expect(await verifySignature(SECRET, h(sign("msg_1", String(NOW / 1000), body)), body, NOW)).toBe(true);
    // Several signatures (during a secret rotation): one valid is enough.
    expect(await verifySignature(SECRET, h(`v1,AAAA ${sign("msg_1", String(NOW / 1000), body)}`), body, NOW)).toBe(true);
    for (const [why, ok] of [
      ["wrong key", await verifySignature(SECRET, h(sign("msg_1", String(NOW / 1000), body, Buffer.from("other"))), body, NOW)],
      ["body changed", await verifySignature(SECRET, h(sign("msg_1", String(NOW / 1000), body)), body + " ", NOW)],
      ["id changed", await verifySignature(SECRET, h(sign("msg_2", String(NOW / 1000), body)), body, NOW)],
      ["v2 scheme", await verifySignature(SECRET, h(sign("msg_1", String(NOW / 1000), body).replace("v1,", "v2,")), body, NOW)],
      ["no signature", await verifySignature(SECRET, h(null), body, NOW)],
      ["no id", await verifySignature(SECRET, h(sign("msg_1", String(NOW / 1000), body), String(NOW / 1000), null), body, NOW)],
      ["too old (replay)", await verifySignature(SECRET, h(sign("msg_1", String(NOW / 1000 - 301), body), String(NOW / 1000 - 301)), body, NOW)],
      ["from the future", await verifySignature(SECRET, h(sign("msg_1", String(NOW / 1000 + 301), body), String(NOW / 1000 + 301)), body, NOW)],
      ["bad timestamp", await verifySignature(SECRET, h(sign("msg_1", "1e9", body), "1e9"), body, NOW)],
      ["garbage", await verifySignature(SECRET, h("v1,%%%"), body, NOW)],
      ["secret without prefix", await verifySignature(KEY.toString("base64"), h(sign("msg_1", String(NOW / 1000), body)), body, NOW)],
    ] as const) {
      expect(ok, why).toBe(false);
    }
  });
});

test("addresses: the plain address, or nothing", () => {
  expect(address("María López <maria@example.net>")).toBe("maria@example.net");
  expect(address("maria@example.net")).toBe("maria@example.net");
  for (const bad of ["", "maria", "a@b", "a b@c.org", "x@y.org\r\nBcc: z@w.org", 42, null]) expect(address(bad), String(bad)).toBeNull();
});

test("needs every setting, or it does nothing", async () => {
  expect(inboundFromEnv({ RESEND_API_KEY: "re_x", RESEND_WEBHOOK_SECRET: SECRET, FORWARD_TO: "a@b.org" })).toBeNull();
  expect(inboundFromEnv({ RESEND_API_KEY: "re_x", RESEND_WEBHOOK_SECRET: SECRET, FORWARD_TO: "a@b.org", FORWARD_FROM: "c@d.org" })?.forwardFor).toEqual([]);
  expect(inboundFromEnv({ RESEND_API_KEY: "re_x", RESEND_WEBHOOK_SECRET: SECRET, FORWARD_TO: "a@b.org", FORWARD_FROM: "c@d.org", FORWARD_FOR: " Help@X.org, ,b@y.org" })?.forwardFor).toEqual(["help@x.org", "b@y.org"]);
  const { calls, impl } = fakeResend(MAIL);
  expect((await createInbound(null, impl, () => NOW)(notice(received()))).status).toBe(503);
  expect(calls).toEqual([]);
});

test("a signed notice forwards the email once, Reply-To the sender, nothing logged", async () => {
  const { calls, impl } = fakeResend(MAIL);
  const logged: string[] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => logged.push(a.join(" "));
  try {
    const res = await createInbound(CONFIG, impl, () => NOW)(notice(received()));
    expect(res.status).toBe(204);
  } finally {
    console.warn = warn;
  }
  expect(calls.map((c) => c.url)).toEqual(["https://api.resend.com/emails/receiving/4ef9a417-02e9-4d39-ad75-9611e0fcc33c", "https://api.resend.com/emails"]);
  const headers = calls[1]!.init!.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer re_test");
  // Resend may deliver the same notice twice: the same key sends one copy.
  expect(headers["Idempotency-Key"]).toBe("inbound-4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
  const sent = JSON.parse(String(calls[1]!.init!.body));
  expect(sent.from).toBe(CONFIG.forwardFrom);
  expect(sent.to).toEqual(["volunteer@example.org"]);
  expect(sent.reply_to).toBe("maria@example.net");
  expect(sent.subject).toBe("Fwd: Correction: Free tax help (checked October 22, 2026)");
  expect(sent.headers).toEqual({ "Auto-Submitted": "auto-forwarded" });
  expect(sent.text).toContain("The VITA site moved.");
  expect(sent.text).toContain("Sender address: maria@example.net");
  expect(sent.text).toContain("DMARC pass");
  expect(sent.html).toContain("<p>The VITA site moved.</p>");
  expect(logged).toEqual([]);
});

test("unsigned, stale or other notices do nothing", async () => {
  const { calls, impl } = fakeResend(MAIL);
  const inbound = createInbound(CONFIG, impl, () => NOW);
  expect((await inbound(notice(received(), { signature: "v1,AAAA" }))).status).toBe(401);
  expect((await inbound(notice(received(), { ts: NOW / 1000 - 3600 }))).status).toBe(401);
  expect((await inbound(notice(JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } })))).status).toBe(204);
  expect((await inbound(notice(received("../../domains"))))).toMatchObject({ status: 400 });
  expect((await inbound(notice("not json"))).status).toBe(400);
  const big = "x".repeat(70 * 1024);
  expect((await inbound(notice(big))).status).toBe(413);
  expect(calls).toEqual([]);
});

test("never forwards its own forwards, cleans the subject, and makes Resend retry on failure", async () => {
  const self = fakeResend({ ...MAIL, from: "Corrections <forwarding@example.com>" });
  expect((await createInbound(CONFIG, self.impl, () => NOW)(notice(received()))).status).toBe(204);
  expect(self.calls).toHaveLength(1); // fetched, not sent

  const odd = fakeResend({ ...MAIL, from: "not an address", subject: "Hi\r\nBcc: x@y.org\u202e", html: undefined, attachments: [{ id: "a" }] });
  await createInbound(CONFIG, odd.impl, () => NOW)(notice(received()));
  const sent = JSON.parse(String(odd.calls[1]!.init!.body));
  expect(sent.subject).toBe("Fwd: Hi Bcc: x@y.org");
  expect(sent.reply_to).toBeUndefined();
  expect(sent.html).toBeUndefined();
  expect(sent.text).toContain("1 attachment(s) not forwarded");

  // A refusal (e.g. an odd Reply-To) is tried once more without it; other refusals aren't retried.
  const picky = fakeResend(MAIL, [422, 200]);
  expect((await createInbound(CONFIG, picky.impl, () => NOW)(notice(received()))).status).toBe(204);
  expect(picky.calls).toHaveLength(3);
  expect(lastSent(picky.calls).reply_to).toBeUndefined();
  const refused = fakeResend(MAIL, 403);
  const quiet = console.warn;
  console.warn = () => {};
  try {
    expect((await createInbound(CONFIG, refused.impl, () => NOW)(notice(received()))).status).toBe(204);
  } finally {
    console.warn = quiet;
  }

  const down = fakeResend(MAIL, 500);
  const logged: string[] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => logged.push(a.join(" "));
  try {
    expect((await createInbound(CONFIG, down.impl, () => NOW)(notice(received()))).status).toBe(502);
  } finally {
    console.warn = warn;
  }
  expect(logged).toEqual(["inbound not forwarded: send 500"]);
});

test("a sender their domain doesn't vouch for is marked, sent as text only, with no Reply-To", async () => {
  for (const authentication of [{ spf: "pass", dkim: "fail", dmarc: "fail" }, null, { dmarc: "unknown" }]) {
    const spoof = fakeResend({ ...MAIL, from: "USCIS <alerts@uscis.gov>", html: "<style>p{display:none}</style><p>Click here</p>", authentication });
    expect((await createInbound(CONFIG, spoof.impl, () => NOW)(notice(received()))).status).toBe(204);
    const sent = lastSent(spoof.calls);
    expect(sent.subject.startsWith("[UNVERIFIED SENDER] Fwd: "), JSON.stringify(authentication)).toBe(true);
    expect(sent.reply_to).toBeUndefined();
    expect(sent.html).toBeUndefined();
    expect(sent.text).toContain("UNVERIFIED SENDER");
  }
});

test("auto-replies and mail for other addresses aren't forwarded", async () => {
  expect(isAutomatic({ "Auto-Submitted": "auto-replied" })).toBe(true);
  expect(isAutomatic({ "auto-submitted": "no" })).toBe(false);
  expect(isAutomatic({ Precedence: "bulk" })).toBe(true);
  expect(isAutomatic({ "X-Autoreply": "yes" })).toBe(true);
  expect(isAutomatic({ "mime-version": "1.0" })).toBe(false);
  expect(isAutomatic(null)).toBe(false);
  const robot = fakeResend({ ...MAIL, headers: { "auto-submitted": "auto-replied" } });
  expect((await createInbound(CONFIG, robot.impl, () => NOW)(notice(received()))).status).toBe(204);
  expect(robot.calls).toHaveLength(1);

  const only = { ...CONFIG, forwardFor: ["corrections@example.com"] };
  const other = fakeResend({ ...MAIL, to: ["sales@example.com"] });
  await createInbound(only, other.impl, () => NOW)(notice(received()));
  expect(other.calls).toHaveLength(1);
  const ours = fakeResend({ ...MAIL, to: ["Sales <sales@example.com>"], cc: ["Corrections@Example.com"] });
  await createInbound(only, ours.impl, () => NOW)(notice(received()));
  expect(ours.calls).toHaveLength(2);
});
