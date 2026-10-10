/**
 * Where the Express API lives. Same origin by default; set VITE_API_BASE_URL at build
 * time when the UI is served from a static host such as GitHub Pages.
 */
export const API_BASE = (import.meta.env?.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

export const apiUrl = (path: string) => `${API_BASE}${path}`;

export const BACKEND_MISSING =
  "Live market data and the AI thesis come from the app's Node server, which isn't reachable from this page. GitHub Pages only hosts the interface (see README: Deploy).";

/** Error text from an API response, or a clear message when no API answered (static host 404 page, etc.). */
export async function readApiError(response: Response, fallback: string): Promise<string> {
  if (!response.headers.get("content-type")?.includes("application/json")) return BACKEND_MISSING;
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}
