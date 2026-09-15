import { NextResponse } from "next/server";
import { checkRequest } from "./lib/request-guard";

// Guard every API request against other websites: DNS rebinding and
// cross-site requests. The rules, and why each exists, are in
// lib/request-guard.js. This is not authentication — see docs/CLOUD-SANDBOX.md.
//
// Proxy runs in the Node.js runtime in Next 16, so FACTORY_ALLOWED_HOSTS and
// FACTORY_TRUST_PROXY are read per request rather than baked in at build time.
export function proxy(request) {
  const refusal = checkRequest({
    method: request.method,
    headers: request.headers,
    env: process.env,
  });
  if (!refusal) return NextResponse.next();
  return NextResponse.json(
    { error: `Request refused: ${refusal.reason}. ${refusal.hint}` },
    { status: 403 }
  );
}

export const config = {
  matcher: "/api/:path*",
};
