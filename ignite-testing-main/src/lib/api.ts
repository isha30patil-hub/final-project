// Shared backend base URL. Single source of truth so the WS URL is derived
// consistently instead of each route hardcoding its own API_URL constant.
export const API_URL = "http://127.0.0.1:8000";

export function wsUrl(path: string) {
  const base = API_URL.replace(/^http/, "ws");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
