/*
 * Kiểm tra link hay gõ sai + tự sửa. Giữ nguyên biến {{var}}.
 * Trả về danh sách lỗi (tiếng Việt) và link đã sửa (null nếu không có gì để sửa).
 */

export interface UrlCheck {
  issues: string[];
  fixed: string | null;
}

const VAR_RE = /\{\{\s*[\w.-]+\s*\}\}/g;

export function checkUrl(input: string): UrlCheck {
  if (!input.trim()) return { issues: [], fixed: null };

  // Tạm thay {{var}} bằng token để không sửa nhầm bên trong biến
  const vars: string[] = [];
  let u = input.replace(VAR_RE, (m) => `\u0000${vars.push(m) - 1}\u0000`);
  const issues = new Set<string>();
  const step = (re: RegExp, to: string | ((...a: string[]) => string), msg: string) => {
    const next = u.replace(re, to as never);
    if (next !== u) {
      issues.add(msg);
      u = next;
    }
  };

  // 1. Bọc trong nháy / ngoặc nhọn, khoảng trắng đầu cuối
  step(/^\s*["'`<“”‘’]+|["'`>“”‘’]+\s*$/g, "", "Link bị bọc trong dấu nháy/ngoặc");
  step(/^\s+|\s+$/g, "", "Có khoảng trắng ở đầu/cuối link");

  // 2. Ký tự full-width (gõ bằng bộ gõ tiếng Việt/Nhật)
  step(/[：／？＆＝]/g, (c: string) => String.fromCharCode(c.charCodeAt(0) - 0xfee0), "Có ký tự full-width (：／？…)");

  // 3. Dấu \ không bao giờ hợp lệ trong URL -> / (làm trước khi tách host/path)
  step(/^([^?#]*)/, (whole: string) => whole.replace(/\\/g, "/"), "Dùng dấu \\ thay cho /");

  // 4. Scheme gõ sai: http//, http:/, htp://, https://, http;// ...
  step(/^(h?t{1,3}p)(s?)\s*[:;]*\s*[/\\]+\s*/i, (_m: string, _h: string, s: string) => `http${s.toLowerCase()}://`, "Sai phần http://");
  // Lặp scheme: http://http://
  step(/^(https?:\/\/)+(https?:\/\/)/i, "$2", "Bị lặp http://");

  // Tách phần: scheme | host | path | query | hash
  const m = /^([a-z][a-z0-9+.-]*:\/\/)?([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(u);
  if (m) {
    const scheme = m[1] ?? "";
    let host = m[2] ?? "";
    let path = m[3] ?? "";
    let query = m[4] ?? "";
    const hash = m[5] ?? "";

    // 4. Host: khoảng trắng, dấu phẩy thay dấu chấm (103,159,51,199)
    const host0 = host;
    host = host.replace(/\s+/g, "");
    if (host !== host0) issues.add("Có khoảng trắng trong tên miền/IP");
    if (/^[\w-]+(,[\w-]+)+(:\d+)?$/.test(host) || /\d,\d/.test(host)) {
      host = host.replace(/,/g, ".");
      issues.add("Dùng dấu phẩy thay cho dấu chấm trong tên miền/IP");
    }
    if (/:\s*$/.test(host) || /::/.test(host.replace(/^\[.*\]/, ""))) {
      host = host.replace(/:+$/, "").replace(/::+/g, ":");
      issues.add("Thừa dấu : sau tên miền/IP");
    }

    // Path: khoảng trắng, // thừa
    const path1 = path;
    path = path.replace(/\s+/g, "");
    if (path !== path1) issues.add("Có khoảng trắng trong đường dẫn");
    const path2 = path;
    path = path.replace(/\/{2,}/g, "/");
    if (path !== path2) issues.add("Thừa dấu / trong đường dẫn");

    // 6. Query: nhiều dấu ?, &&, ?& , ? hoặc & ở cuối, khoảng trắng
    if (query) {
      const q0 = query;
      let q = "?" + query.slice(1).replace(/\?/g, "&");
      if (q !== q0) issues.add("Thừa dấu ? (chỉ được 1 dấu ?)");
      const q1 = q;
      q = q.replace(/&{2,}/g, "&").replace(/^\?&+/, "?").replace(/[?&]+$/, "");
      if (q !== q1) issues.add("Thừa dấu & hoặc ? trong query");
      const q2 = q;
      q = q.replace(/\s*([=&])\s*/g, "$1").replace(/\s+/g, "%20");
      if (q !== q2) issues.add("Có khoảng trắng trong query");
      query = q;
    }

    u = scheme + host + path + query + hash;
  }

  const restore = (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_w, n: string) => vars[+n]);
  const fixed = restore(u);
  return issues.size && fixed !== input ? { issues: [...issues], fixed } : { issues: [], fixed: null };
}
