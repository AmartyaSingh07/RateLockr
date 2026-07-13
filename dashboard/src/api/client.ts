import axios from "axios";

// =============================================================================
// Axios Base Client
// =============================================================================
// Production: admin calls go through the same-origin serverless proxy
// (/api/proxy/*), which attaches the ADMIN_API_KEY server-side. The key
// never reaches the browser bundle.
//
// Development: calls go directly to the local API. Set VITE_ADMIN_API_KEY
// in dashboard/.env.development.local (gitignored) to match your local
// API's ADMIN_API_KEY. There is intentionally no default key.
// =============================================================================

const isDev = import.meta.env.DEV;

const apiClient = axios.create({
  baseURL: isDev ? import.meta.env.VITE_API_URL || "http://localhost:3000" : "/api/proxy",
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    ...(isDev && import.meta.env.VITE_ADMIN_API_KEY
      ? { "X-API-Key": import.meta.env.VITE_ADMIN_API_KEY }
      : {}),
  },
});

export default apiClient;
