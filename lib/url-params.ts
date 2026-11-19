import type { KeyValue } from "./types";
import { kv } from "./id";

/*
 * Đồng bộ 2 chiều URL <-> bảng Params.
 * Làm thủ công (không dùng URL/URLSearchParams) để giữ nguyên {{var}}
 * và không encode lại những gì người dùng gõ.
 */

function splitUrl(url: string): { base: string; query: string; hash: string } {
  let hash = "";
  const h = url.indexOf("#");
  if (h >= 0) {
    hash = url.slice(h);
    url = url.slice(0, h);
  }
  const q = url.indexOf("?");
  if (q < 0) return { base: url, query: "", hash };
  return { base: url.slice(0, q), query: url.slice(q + 1), hash };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/** URL -> params. Giữ lại id/disabled params cũ nếu khớp vị trí để UI không nhảy. */
export function paramsFromUrl(url: string, prev: KeyValue[] = []): KeyValue[] {
  const { query } = splitUrl(url);
  const enabledPrev = prev.filter((p) => p.enabled);
  const disabled = prev.filter((p) => !p.enabled);
  const parsed = query
    ? query
        .split("&")
        .filter((part) => part.length > 0)
        .map((part, i) => {
          const eq = part.indexOf("=");
          const key = safeDecode(eq < 0 ? part : part.slice(0, eq));
          const value = eq < 0 ? "" : safeDecode(part.slice(eq + 1));
          const old = enabledPrev[i];
          return old ? { ...old, key, value } : kv(key, value);
        })
    : [];
  return [...parsed, ...disabled];
}

/** Encode nhẹ: chỉ ký tự phá cấu trúc query, giữ nguyên {{var}}. */
function enc(s: string): string {
  return s.replace(/[&#=+ ]/g, (c) => (c === " " ? "%20" : encodeURIComponent(c)));
}

/** params -> URL (thay phần query, giữ base + hash). */
export function urlWithParams(url: string, params: KeyValue[]): string {
  const { base, hash } = splitUrl(url);
  const q = params
    .filter((p) => p.enabled && (p.key || p.value))
    .map((p) => (p.value === "" ? enc(p.key) : `${enc(p.key)}=${enc(p.value)}`))
    .join("&");
  return base + (q ? `?${q}` : "") + hash;
}

/** Đường dẫn ngắn để đặt tên request mặc định: "GET /users/1". */
export function shortPath(url: string): string {
  const { base } = splitUrl(url.trim());
  const noProto = base.replace(/^[a-z]+:\/\//i, "");
  const slash = noProto.indexOf("/");
  const path = slash >= 0 ? noProto.slice(slash) : "/";
  // URL kiểu "{{baseUrl}}/users" -> "/users"
  const cleaned = path.replace(/^\{\{[^}]+\}\}/, "") || "/";
  if (!noProto) return "";
  return cleaned.length > 40 ? cleaned.slice(0, 39) + "…" : cleaned;
}
