// Vercel Function: forward mail for the corrections address to the volunteer (src/inbound.ts).
import { createInbound, inboundFromEnv } from "../src/inbound.js"; // .js: Node ESM needs the extension

declare const process: { env: Record<string, string | undefined> }; // (no Node types in this project)

const inbound = createInbound(inboundFromEnv(process.env));

export function POST(request: Request): Promise<Response> {
  return inbound(request);
}
