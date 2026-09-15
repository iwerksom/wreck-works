// Reading request bodies with a ceiling.
//
// Next route handlers put no limit on req.json(), and the panel has no
// authentication, so any route that accepts free text bounds it here before
// parsing. Reads the text rather than trusting content-length, which a caller
// can omit or lie about.
export async function readJson(req, maxBytes = 64 * 1024) {
  const text = await req.text();
  if (text.length > maxBytes) {
    const e = new Error(`request body too large (limit ${maxBytes} bytes)`);
    e.status = 413;
    throw e;
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    const e = new Error("bad request body");
    e.status = 400;
    throw e;
  }
}
