import axios from "axios";

// =============================================================================
// Axios Base Client
// =============================================================================
// Vite injects environment variables via import.meta.env (NOT process.env).
// Set VITE_API_URL and VITE_ADMIN_API_KEY in a .env file or at build time.
// =============================================================================

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": import.meta.env.VITE_ADMIN_API_KEY || "dev_admin_secret_key_987654321",
  },
});

export default apiClient;
