import { NextResponse } from "next/server";

// Refuse cross-site browser requests to the API.
//
// The panel has no authentication (docs/CLOUD-SANDBOX.md), and its API routes
// change state: they queue gate runs, spend the Anthropic key, and sign off or
// reset steps. Every one of them parses its JSON body without looking at the
// content-type, which makes each a "simple" request that a browser sends from
// any page without a CORS preflight. A site open in another tab can fire them
// at localhost:3100. It cannot read the responses, but the side effects happen
// — including marking a human gate as passed.
//
// Browsers say where a request came from, and page script cannot forge it.
// Anything that is not the panel's own page is refused. Clients that are not
// browsers (the worker, curl) send neither header and pass through: they are
// not what this closes, and refusing them would stop the worker.
//
// This is not authentication. Anyone who can reach the port directly can still
// call the API; keeping it off untrusted networks remains the defence for that.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function refuse(reason) {
  return NextResponse.json(
    {
      error:
        `Cross-site request refused (${reason}). ` +
        "The panel only accepts state-changing requests from its own page.",
    },
    { status: 403 }
  );
}

export function proxy(request) {
  // Reads stay open: without CORS headers a foreign page cannot see the answer.
  if (SAFE_METHODS.has(request.method)) return NextResponse.next();

  // Sec-Fetch-Site is set by the browser itself. "same-site" is deliberately
  // not accepted: any other dev server on localhost:<port> is same-site with
  // the panel. "none" means the user initiated it directly, not another page.
  const site = request.headers.get("sec-fetch-site");
  if (site) {
    return site === "same-origin" || site === "none"
      ? NextResponse.next()
      : refuse(`sec-fetch-site: ${site}`);
  }

  // Older browsers send Origin without Sec-Fetch-Site; compare it to the host
  // the request was addressed to. No Origin at all means not a browser.
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.next();
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return refuse(`origin: ${origin}`); // "null" from sandboxed frames and file://
  }
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  return originHost === host ? NextResponse.next() : refuse(`origin: ${origin}`);
}

export const config = {
  matcher: "/api/:path*",
};
