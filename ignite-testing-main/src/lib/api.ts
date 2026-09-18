// Shared backend base URL. Single source of truth so the WS URL is derived
// consistently instead of each route hardcoding its own API_URL constant.
//
// The value comes from VITE_API_URL in ignite-testing-main/.env (see
// .env.example). Vite only exposes variables prefixed with VITE_ to the
// browser, and reads them at dev-server start / build time, so restart
// `npm run dev` after changing it.
const rawApiUrl = (import.meta.env.VITE_API_URL ?? "").trim();

if (!rawApiUrl) {
  console.error(
    "VITE_API_URL is not set. Copy ignite-testing-main/.env.example to .env, " +
      "set VITE_API_URL to your backend URL, and restart `npm run dev`.",
  );
}

// Strip a trailing slash so callers can always write `${API_URL}/path`.
export const API_URL = rawApiUrl.replace(/\/+$/, "");

export function wsUrl(path: string) {
  const base = API_URL.replace(/^http/, "ws");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
