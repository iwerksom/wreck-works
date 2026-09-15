// Which requests the API answers. Used by web/proxy.js on every /api request.
//
// Pure on purpose — no Next imports — so the decision can be tested directly.
// checkRequest returns null to allow a request, or { reason, hint } to refuse it.
//
// Two checks, in order:
//
// 1. The request must be addressed to a hostname the panel expects. DNS
//    rebinding works by pointing an attacker's *domain* at this machine: the
//    browser then treats the attacker's page as same-origin with the panel,
//    sends same-origin fetch metadata, and can read the responses. What it
//    cannot change is the Host it addresses, which is still the attacker's
//    domain. localhost and IP literals cannot be rebound that way; any other
//    name has to be listed in FACTORY_ALLOWED_HOSTS. This applies to reads too.
//
// 2. A state-changing request from a browser must come from the panel's own
//    page. Every API route parses JSON without checking the content-type, so
//    each is a "simple" request any page can send without a CORS preflight.
//    Browsers mark where a request came from; page script cannot forge it.
//    Clients that are not browsers (the worker, curl) send neither header.
//
// Neither is authentication. Anything that reaches the port directly, with a
// plausible Host, is unaffected; see docs/CLOUD-SANDBOX.md.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:.]+$/;

// "localhost:3100" -> "localhost", "[::1]:3100" -> "::1".
export function hostnameOf(hostHeader) {
  const h = String(hostHeader || "").trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end > 1 ? h.slice(1, end) : "";
  }
  const colon = h.indexOf(":");
  return colon === -1 ? h : h.slice(0, colon);
}

export function parseAllowedHosts(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowedHostname(name, allowed) {
  if (!name) return false;
  // Browsers resolve *.localhost to loopback themselves and never ask DNS.
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (IPV4.test(name)) return true;
  if (name.includes(":") && IPV6.test(name)) return true;
  return allowed.has(name);
}

const HOST_HINT =
  "If this is your own tunnel, LAN or deployment name, add it to FACTORY_ALLOWED_HOSTS " +
  "on the machine running the panel.";
const SITE_HINT = "The panel only accepts state-changing requests from its own page.";

export function checkRequest({ method, headers, env = {} }) {
  const allowed = parseAllowedHosts(env.FACTORY_ALLOWED_HOSTS);
  const host = headers.get("host") || "";

  const name = hostnameOf(host);
  if (!isAllowedHostname(name, allowed)) {
    return { reason: `host "${name || host}" is not an allowed panel hostname`, hint: HOST_HINT };
  }

  // Only a reverse proxy that is known to be there may speak for the host. A
  // same-origin page can set X-Forwarded-Host on its own requests.
  let effectiveHost = host;
  if (env.FACTORY_TRUST_PROXY === "1") {
    const forwarded = headers.get("x-forwarded-host");
    if (forwarded) {
      const fname = hostnameOf(forwarded.split(",")[0]);
      if (!isAllowedHostname(fname, allowed)) {
        return { reason: `forwarded host "${fname}" is not an allowed panel hostname`, hint: HOST_HINT };
      }
      effectiveHost = forwarded.split(",")[0].trim();
    }
  }

  if (SAFE_METHODS.has(method)) return null;

  // "same-site" is deliberately not accepted: any other dev server on
  // localhost:<port> is same-site with the panel. "none" means the user
  // initiated the request directly rather than another page.
  const site = headers.get("sec-fetch-site");
  if (site) {
    return site === "same-origin" || site === "none"
      ? null
      : { reason: `sec-fetch-site: ${site}`, hint: SITE_HINT };
  }

  // Older browsers send Origin without Sec-Fetch-Site. No Origin at all means
  // the caller is not a browser.
  const origin = headers.get("origin");
  if (!origin) return null;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return { reason: `origin: ${origin}`, hint: SITE_HINT }; // "null" from sandboxed frames
  }
  return originHost.toLowerCase() === effectiveHost.toLowerCase()
    ? null
    : { reason: `origin: ${origin}`, hint: SITE_HINT };
}
