// Vercel Function (Node.js runtime on AWS: the ADS-B feeds refuse Cloudflare's
// network, which is also where Vercel's Edge runtime runs).
import { createRelay } from "../src/relay.js"; // .js: Node ESM needs the extension

const relay = createRelay();

export function GET(request: Request): Promise<Response> {
  return relay(request);
}
