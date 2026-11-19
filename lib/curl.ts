import { METHODS, type BodyType, type KeyValue, type Method } from "./types";
import { kv } from "./id";
import { paramsFromUrl } from "./url-params";

export interface ParsedCurl {
  method: Method;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyType: BodyType;
  body: string;
  form: KeyValue[];
  /** Các option không hỗ trợ (vd -F multipart) để UI báo. */
  warnings: string[];
}

/** Có phải chuỗi cURL không (để quyết định khi paste vào ô URL). */
export function looksLikeCurl(text: string): boolean {
  return /^\s*curl(\.exe)?\s/i.test(text);
}

/* ------------------------------------------------------------------ */
/* Tokenizer: hỗ trợ bash (' " $'' \) và Windows cmd (^ ^" ^\^")       */
/* ------------------------------------------------------------------ */

function normalizeCmd(input: string): string {
  // "Copy as cURL (cmd)" của Chrome: ^ là ký tự escape, ^ cuối dòng = nối dòng.
  // Nhận diện: có ^" hoặc dòng kết thúc bằng ^
  if (!/\^"|\^\s*\r?\n/.test(input)) return input;
  return input
    .replace(/\^\s*\r?\n/g, " ")
    .replace(/\^\\\^"/g, '\\"') // ^\^" -> \"  (dấu " bên trong chuỗi)
    .replace(/\^(.)/g, "$1");
}

export function tokenize(input: string): string[] {
  const s = normalizeCmd(input).replace(/\\\r?\n/g, " "); // bash line continuation
  const tokens: string[] = [];
  let cur = "";
  let inToken = false;
  let i = 0;

  const push = () => {
    if (inToken) tokens.push(cur);
    cur = "";
    inToken = false;
  };

  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      push();
      i++;
      continue;
    }
    inToken = true;
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      const stop = end < 0 ? s.length : end;
      cur += s.slice(i + 1, stop);
      i = stop + 1;
    } else if (c === "$" && s[i + 1] === "'") {
      // ANSI-C quoting: $'...\n...'
      i += 2;
      while (i < s.length && s[i] !== "'") {
        if (s[i] === "\\" && i + 1 < s.length) {
          const n = s[i + 1];
          const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"' };
          if (n === "u" || n === "x") {
            const len = n === "u" ? 4 : 2;
            const hex = s.slice(i + 2, i + 2 + len);
            cur += String.fromCharCode(parseInt(hex, 16));
            i += 2 + len;
          } else {
            cur += map[n] ?? n;
            i += 2;
          }
        } else {
          cur += s[i++];
        }
      }
      i++;
    } else if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) {
          cur += s[i + 1];
          i += 2;
        } else {
          cur += s[i++];
        }
      }
      i++;
    } else if (c === "\\" && i + 1 < s.length) {
      cur += s[i + 1];
      i += 2;
    } else {
      cur += c;
      i++;
    }
  }
  push();
  return tokens;
}

/* ------------------------------------------------------------------ */
/* Parser                                                               */
/* ------------------------------------------------------------------ */

const LONG_WITH_ARG = new Set([
  "--request", "--header", "--data", "--data-raw", "--data-binary", "--data-ascii",
  "--data-urlencode", "--user", "--cookie", "--user-agent", "--referer", "--url",
  "--form", "--form-string", "--json", "--connect-timeout", "--max-time", "--output",
  "--proxy", "--cert", "--key", "--cacert", "--write-out", "--retry", "--resolve",
]);
// Short flags nhận tham số
const SHORT_WITH_ARG = new Set(["X", "H", "d", "u", "b", "A", "e", "F", "m", "o", "x", "w"]);

function utf8Base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function parseFormBody(body: string): KeyValue[] {
  return body
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const dec = (x: string) => {
        try {
          return decodeURIComponent(x.replace(/\+/g, " "));
        } catch {
          return x;
        }
      };
      return eq < 0 ? kv(dec(pair), "") : kv(dec(pair.slice(0, eq)), dec(pair.slice(eq + 1)));
    });
}

export function parseCurl(input: string): ParsedCurl {
  const tokens = tokenize(input.trim());
  if (!tokens.length || !/^curl(\.exe)?$/i.test(tokens[0])) {
    throw new Error("Không phải lệnh cURL");
  }

  let method: Method | null = null;
  let url = "";
  const headers: KeyValue[] = [];
  const data: string[] = [];
  let forceGet = false;
  let isJsonFlag = false;
  const warnings: string[] = [];

  const handle = (flag: string, arg: string | undefined) => {
    switch (flag) {
      case "-X":
      case "--request": {
        const m = (arg ?? "").toUpperCase();
        if ((METHODS as readonly string[]).includes(m)) method = m as Method;
        else warnings.push(`Method không hỗ trợ: ${arg}`);
        break;
      }
      case "-H":
      case "--header": {
        if (!arg) break;
        const idx = arg.indexOf(":");
        if (idx > 0) headers.push(kv(arg.slice(0, idx).trim(), arg.slice(idx + 1).trim()));
        break;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-ascii":
        if (arg !== undefined) {
          if (arg.startsWith("@") && flag !== "--data-raw") warnings.push(`Không đọc được file ${arg}`);
          data.push(arg);
        }
        break;
      case "--json":
        if (arg !== undefined) data.push(arg);
        isJsonFlag = true;
        break;
      case "--data-urlencode":
        if (arg !== undefined) {
          const eq = arg.indexOf("=");
          data.push(eq < 0 ? encodeURIComponent(arg) : `${arg.slice(0, eq + 1)}${encodeURIComponent(arg.slice(eq + 1))}`);
        }
        break;
      case "-u":
      case "--user":
        if (arg) headers.push(kv("Authorization", `Basic ${utf8Base64(arg)}`));
        break;
      case "-b":
      case "--cookie":
        if (arg) headers.push(kv("Cookie", arg));
        break;
      case "-A":
      case "--user-agent":
        if (arg) headers.push(kv("User-Agent", arg));
        break;
      case "-e":
      case "--referer":
        if (arg) headers.push(kv("Referer", arg));
        break;
      case "--url":
        if (arg) url = arg;
        break;
      case "-G":
      case "--get":
        forceGet = true;
        break;
      case "-I":
      case "--head":
        method = "HEAD";
        break;
      case "-F":
      case "--form":
      case "--form-string":
        warnings.push("multipart/form-data (-F) chưa hỗ trợ, đã bỏ qua");
        break;
      default:
        // -s, -S, -L, -k, -v, -i, --compressed, --insecure... bỏ qua
        break;
    }
  };

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      if (eq > 0 && LONG_WITH_ARG.has(t.slice(0, eq))) {
        handle(t.slice(0, eq), t.slice(eq + 1));
      } else if (LONG_WITH_ARG.has(t)) {
        handle(t, tokens[++i]);
      } else {
        handle(t, undefined);
      }
    } else if (t.startsWith("-") && t.length > 1) {
      // Gom cờ ngắn: -sSL, -XPOST, -H'a: b'
      for (let j = 1; j < t.length; j++) {
        const f = t[j];
        if (SHORT_WITH_ARG.has(f)) {
          const rest = t.slice(j + 1);
          handle(`-${f}`, rest.length ? rest : tokens[++i]);
          break;
        }
        handle(`-${f}`, undefined);
      }
    } else if (!url) {
      url = t;
    }
  }

  let body = data.join("&");
  let bodyType: BodyType = "none";
  let form: KeyValue[] = [];

  if (forceGet && body) {
    url += (url.includes("?") ? "&" : "?") + body;
    body = "";
    method = method ?? "GET";
  }

  const ctHeader = headers.find((h) => h.key.toLowerCase() === "content-type");
  const ct = ctHeader?.value.toLowerCase() ?? "";

  if (body) {
    let isJson = isJsonFlag || ct.includes("json");
    if (!isJson) {
      try {
        const v = JSON.parse(body);
        isJson = typeof v === "object" && v !== null;
      } catch {
        /* not json */
      }
    }
    if (isJson) {
      bodyType = "json";
      try {
        body = JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        /* giữ nguyên nếu JSON lỗi */
      }
      if (isJsonFlag && !ctHeader) headers.push(kv("Content-Type", "application/json"));
    } else if (ct.includes("x-www-form-urlencoded") || (!ct && /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(body))) {
      bodyType = "form";
      form = parseFormBody(body);
      body = "";
    } else {
      bodyType = "text";
    }
    method = method ?? "POST";
  }

  if (!url) throw new Error("Không tìm thấy URL trong lệnh cURL");

  return {
    method: method ?? "GET",
    url,
    params: paramsFromUrl(url),
    headers,
    bodyType,
    body,
    form,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Xuất cURL (bash)                                                     */
/* ------------------------------------------------------------------ */

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function toCurl(req: {
  method: Method;
  url: string;
  headers: [string, string][];
  body?: string;
}): string {
  const parts = ["curl"];
  if (req.method !== "GET" || req.body) parts.push(`-X ${req.method}`);
  parts.push(q(req.url));
  for (const [k, v] of req.headers) parts.push(`-H ${q(`${k}: ${v}`)}`);
  if (req.body) parts.push(`--data-raw ${q(req.body)}`);
  return parts.join(" \\\n  ");
}
