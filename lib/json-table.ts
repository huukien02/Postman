import type { KeyValue } from "./types";
import { kv } from "./id";
import { fixAndFormatJson } from "./json-fix";

/*
 * Chuyển qua lại giữa body JSON (object 1 cấp) và bảng key-value,
 * để nhập nhiều key mà không phải gõ nháy kép, dấu phẩy, ngoặc.
 */

/** Giá trị JSON -> chữ trong ô bảng. */
export function valueToText(v: unknown): string {
  if (typeof v === "string") {
    // Chuỗi trông giống số/true/null -> giữ nháy để không bị hiểu nhầm kiểu khi đổi ngược
    return /^(-?\d+(\.\d+)?|true|false|null)$/.test(v) ? `"${v}"` : v;
  }
  if (v === null || typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Chữ trong ô bảng -> giá trị JSON (tự đoán kiểu). */
export function textToValue(s: string): unknown {
  const t = s.trim();
  // "..." -> ép là chuỗi
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  // Số (không nhận số 0 ở đầu như 0912345678: giữ là chuỗi để không mất số 0)
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(t) && t.length <= 15) return Number(t);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      return JSON.parse(t);
    } catch {
      /* không phải JSON -> chuỗi */
    }
  }
  return s;
}

/** Body JSON -> rows. Trả null nếu body không phải object (vd mảng, JSON lỗi). */
export function jsonToRows(body: string): KeyValue[] | null {
  if (!body.trim()) return [];
  try {
    // {{var}} đứng trần -> tạm coi là chuỗi để parse được
    const v = JSON.parse(body.replace(/(:\s*)(\{\{\s*[\w.-]+\s*\}\})/g, '$1"$2"'));
    if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
    return Object.entries(v).map(([k, val]) => kv(k, valueToText(val)));
  } catch {
    return null;
  }
}

/**
 * Body JSON -> các dòng của Form (x-www-form-urlencoded). Giá trị form luôn là chuỗi thô:
 * chuỗi giữ nguyên, số/true/false/null -> String(v), object/mảng -> JSON.
 * JSON lỗi nhẹ (key thiếu nháy…) thì tự sửa trước. Không phải object -> null.
 */
export function jsonToFormRows(body: string): KeyValue[] | null {
  if (!body.trim()) return null;
  const parse = (text: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(text.replace(/(:\s*)(\{\{\s*[\w.-]+\s*\}\})/g, '$1"$2"'));
      return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  let obj = parse(body);
  if (!obj) {
    const fixed = fixAndFormatJson(body);
    obj = fixed ? parse(fixed) : null;
  }
  if (!obj) return null;
  return Object.entries(obj).map(([k, v]) =>
    kv(k, typeof v === "string" ? v : v === null || typeof v !== "object" ? String(v) : JSON.stringify(v)),
  );
}

/** Rows -> body JSON đã format. Dòng đang tắt hoặc chưa có key thì bỏ qua. */
export function rowsToJson(rows: KeyValue[]): string {
  const obj: Record<string, unknown> = {};
  for (const r of rows) if (r.enabled && r.key.trim()) obj[r.key.trim()] = textToValue(r.value);
  return Object.keys(obj).length ? JSON.stringify(obj, null, 2) : "";
}
