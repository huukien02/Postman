import { jsonrepair } from "jsonrepair";

const VAR_RE = /\{\{\s*[\w.-]+\s*\}\}/g;

/**
 * Kiểm tra đầu/cuối, thiếu ngoặc thì thêm:
 *   email: "a", pass: "b"     -> { email: "a", pass: "b" }
 *   email: "a" }              -> { email: "a" }
 *   { email: "a"              -> { email: "a" }
 *   1, 2, 3 ]                 -> [ 1, 2, 3 ]
 */
export function addMissingBraces(text: string): string {
  const t = text.trim();
  if (!t) return text;
  const first = t[0];
  const last = t[t.length - 1];
  const opens = first === "{" || first === "[";
  const closes = last === "}" || last === "]";

  // Đã đủ cả hai đầu
  if (opens && closes) return t;

  // Có mở, thiếu đóng: thêm ngoặc đóng tương ứng
  if (opens && !closes) return t + (first === "{" ? "}" : "]");

  // Thiếu mở, có đóng: thêm ngoặc mở tương ứng
  if (!opens && closes) return (last === "}" ? "{" : "[") + t;

  // Thiếu cả hai: nếu trông giống "key: value" thì bọc { }
  if (/^["']?[\w$.-]+["']?\s*:/.test(t)) return `{${t}}`;
  return t; // vd chỉ là 1 chuỗi/số -> để nguyên
}

/**
 * Tự sửa lỗi JSON hay gặp rồi format đẹp (2 dấu cách):
 * - key không có nháy kép: { email: "a" }      -> { "email": "a" }
 * - nháy đơn: { 'a': 'b' }                     -> { "a": "b" }
 * - dấu phẩy thừa ở cuối, thiếu dấu phẩy giữa các phần tử
 * - comment // và /* *\/, True/False/None (kiểu Python)
 * Giữ nguyên biến {{var}}: cả khi đứng một mình ("id": {{id}}) lẫn nằm trong chuỗi.
 *
 * Trả về null nếu không sửa được.
 */
export function fixAndFormatJson(text: string): string | null {
  if (!text.trim()) return null;

  // 1. Thay {{var}} bằng token tạm. Ghi nhớ biến nào đứng ngoài chuỗi (giá trị trần).
  const vars: { raw: string; bare: boolean }[] = [];
  let inStr: '"' | "'" | null = null;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") {
        out += c + (text[i + 1] ?? "");
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'") {
      inStr = c;
    }
    if (c === "{" && text[i + 1] === "{") {
      VAR_RE.lastIndex = i;
      const m = VAR_RE.exec(text);
      if (m && m.index === i) {
        const n = vars.push({ raw: m[0], bare: inStr === null }) - 1;
        out += inStr ? `__PMVAR${n}__` : `"__PMVAR${n}__"`;
        i += m[0].length - 1;
        continue;
      }
    }
    out += c;
  }

  // 2. Thiếu { } ở đầu/cuối -> tự thêm
  out = addMissingBraces(out);

  // 3. Sửa + format
  let pretty: string;
  try {
    pretty = JSON.stringify(JSON.parse(jsonrepair(out)), null, 2);
  } catch {
    return null;
  }

  // 4. Trả biến về chỗ cũ
  return pretty
    .replace(/"__PMVAR(\d+)__"/g, (whole, n: string) => (vars[+n]?.bare ? vars[+n].raw : whole))
    .replace(/__PMVAR(\d+)__/g, (_w, n: string) => vars[+n]?.raw ?? _w);
}
