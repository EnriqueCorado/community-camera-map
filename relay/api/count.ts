// Vercel Function: the anonymous usage counter (src/counter.ts).
import { createCounter, storeFromEnv } from "../src/counter.js"; // .js: Node ESM needs the extension

declare const process: { env: Record<string, string | undefined> }; // (no Node types in this project)

const counter = createCounter(storeFromEnv(process.env));

export function POST(request: Request): Promise<Response> {
  return counter.count(request);
}

export function GET(request: Request): Promise<Response> {
  return counter.totals(request);
}
