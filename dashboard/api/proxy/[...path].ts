// =============================================================================
// Admin API Proxy — Vercel Serverless Function
// =============================================================================
// The dashboard calls this same-origin endpoint instead of the RateLockr API
// directly for admin operations (rules CRUD, stats). The ADMIN_API_KEY is
// attached server-side here, so it never ships in the public JS bundle.
//
// Required environment variables (dashboard Vercel project):
//   ADMIN_API_KEY — must match the key configured on the API project
//   API_URL       — base URL of the RateLockr API (no trailing slash)
// =============================================================================

const API_URL = (process.env["API_URL"] || "https://rate-lockr-5z23.vercel.app").replace(/\/+$/, "");

// Only admin surfaces are proxied. Everything else is rejected.
const ALLOWED_PREFIXES = ["api/rules", "api/stats"];

export default async function handler(req: any, res: any) {
  const adminKey = process.env["ADMIN_API_KEY"];
  if (!adminKey) {
    res.status(503).json({
      error: "Proxy misconfigured",
      message: "ADMIN_API_KEY environment variable is not set on the dashboard project.",
    });
    return;
  }

  const segments = req.query["path"];
  const path = Array.isArray(segments) ? segments.join("/") : String(segments || "");

  if (!ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Rebuild the query string, excluding Vercel's injected `path` param.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query as Record<string, string | string[]>)) {
    if (key === "path") continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const qs = query.toString();
  const target = `${API_URL}/${path}${qs ? `?${qs}` : ""}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": adminKey,
      },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err: any) {
    res.status(502).json({ error: "Bad gateway", message: err?.message || String(err) });
  }
}
