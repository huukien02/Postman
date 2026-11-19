import type { Method, RequestItem } from "./types";
import { replaceVars, type VarMap } from "./env-resolver";

export interface BuiltRequest {
  method: Method;
  url: string;
  headers: [string, string][];
  body?: string;
  /** Tên các biến {{x}} không tìm thấy trong env. */
  missingVars: string[];
}

/**
 * RequestItem + biến env -> request sẵn sàng gửi.
 * URL là nguồn chính (params đã được đồng bộ vào URL).
 */
export function buildRequest(req: RequestItem, vars: VarMap): BuiltRequest {
  const missing = new Set<string>();
  const r = (s: string) => replaceVars(s, vars, missing);

  let url = r(req.url.trim());
  if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    // Người dùng gõ "localhost:3000/x" hoặc "api.com/x" -> tự thêm scheme
    url = (/^(localhost|127\.|\[::1\]|192\.168\.|10\.)/i.test(url) ? "http://" : "https://") + url;
  }

  const headers: [string, string][] = req.headers
    .filter((h) => h.enabled && h.key.trim())
    .map((h) => [r(h.key.trim()), r(h.value)]);

  const has = (name: string) => headers.some(([k]) => k.toLowerCase() === name.toLowerCase());

  if (req.auth.type === "bearer" && req.auth.token.trim() && !has("authorization")) {
    headers.push(["Authorization", `Bearer ${r(req.auth.token.trim())}`]);
  }
  let body: string | undefined;
  const canHaveBody = req.method !== "GET" && req.method !== "HEAD";
  if (canHaveBody) {
    if (req.bodyType === "json" && req.body.trim()) {
      body = r(req.body);
      if (!has("content-type")) headers.push(["Content-Type", "application/json"]);
    } else if (req.bodyType === "text" && req.body) {
      body = r(req.body);
      if (!has("content-type")) headers.push(["Content-Type", "text/plain"]);
    } else if (req.bodyType === "form") {
      const sp = new URLSearchParams();
      for (const f of req.form) if (f.enabled && f.key.trim()) sp.append(r(f.key.trim()), r(f.value));
      if ([...sp.keys()].length) {
        body = sp.toString();
        if (!has("content-type")) headers.push(["Content-Type", "application/x-www-form-urlencoded"]);
      }
    }
  }

  return { method: req.method, url, headers, body, missingVars: [...missing] };
}
