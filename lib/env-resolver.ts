import type { KeyValue } from "./types";

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

export type VarMap = Record<string, string>;

/** Chuyển danh sách biến (chỉ biến enabled, có key) thành map. */
export function toVarMap(vars: KeyValue[] | undefined): VarMap {
  const map: VarMap = {};
  for (const v of vars ?? []) {
    if (v.enabled && v.key.trim()) map[v.key.trim()] = v.value;
  }
  return map;
}

/** Tên các biến {{x}} xuất hiện trong chuỗi (không trùng lặp). */
export function findVars(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) names.add(m[1]);
  return [...names];
}

/**
 * Thay {{var}} bằng giá trị. Biến không tồn tại giữ nguyên "{{var}}"
 * và được đưa vào `missing` để UI cảnh báo.
 */
export function replaceVars(template: string, vars: VarMap, missing?: Set<string>): string {
  if (!template) return template;
  return template.replace(VAR_RE, (whole, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    missing?.add(name);
    return whole;
  });
}

/** Tách chuỗi thành các đoạn text / biến để UI tô màu. */
export type Segment = { text: string; varName?: string; known?: boolean; value?: string };

export function segmentVars(template: string, vars: VarMap): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of template.matchAll(VAR_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: template.slice(last, i) });
    const name = m[1];
    const known = Object.prototype.hasOwnProperty.call(vars, name);
    out.push({ text: m[0], varName: name, known, value: known ? vars[name] : undefined });
    last = i + m[0].length;
  }
  if (last < template.length) out.push({ text: template.slice(last) });
  return out;
}
