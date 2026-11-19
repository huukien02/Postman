import type { BuiltRequest } from "./build-request";
import { LIMITS, type ProxyResult, type ResponseData, type SendError, type SendMode } from "./types";

export type SendResult = { ok: true; data: ResponseData } | { ok: false; error: SendError };

export interface SendOptions {
  mode: SendMode;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Tùy chọn: khớp với PROXY_TOKEN phía server. */
  proxyToken?: string;
}

/** Header trình duyệt không cho JS đặt -> phải đi qua proxy mới gửi được. */
const FORBIDDEN = /^(cookie|host|origin|referer|user-agent|connection|content-length|accept-encoding|proxy-.*|sec-.*)$/i;

const DIRECT_HINTS = [
  "API không bật CORS cho trang này (lỗi hay gặp nhất).",
  "Trang đang chạy https nhưng API là http (mixed content bị chặn).",
  "Mất mạng, sai tên miền, hoặc server chưa chạy.",
  "Chứng chỉ SSL tự ký / không hợp lệ.",
];

class CancelledError extends Error {}
class TimeoutError extends Error {}

/* ------------------------------------------------------------------ */

function isImage(ct: string) {
  return /^image\//i.test(ct);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function charsetOf(ct: string): string {
  const m = /charset=([^;]+)/i.exec(ct);
  return m ? m[1].trim().replace(/"/g, "") : "utf-8";
}

function toResponseData(
  bytes: Uint8Array,
  meta: { status: number; statusText: string; headers: [string, string][] },
  duration: number,
  via: "direct" | "proxy",
): ResponseData {
  const contentType = meta.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  const truncated = bytes.byteLength > LIMITS.DISPLAY_BYTES;
  const shown = truncated ? bytes.subarray(0, LIMITS.DISPLAY_BYTES) : bytes;

  let body = "";
  let dataUrl: string | undefined;
  if (isImage(contentType) && !truncated) {
    dataUrl = `data:${contentType.split(";")[0]};base64,${bytesToBase64(bytes)}`;
  } else {
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(charsetOf(contentType));
    } catch {
      decoder = new TextDecoder("utf-8");
    }
    body = decoder.decode(shown);
  }

  return {
    status: meta.status,
    statusText: meta.statusText,
    headers: meta.headers,
    body,
    dataUrl,
    contentType,
    duration: Math.round(duration),
    size: bytes.byteLength,
    via,
    truncated,
  };
}

/* ------------------------------------------------------------------ */

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, ms);
  const onAbort = () => ac.abort();
  signal?.addEventListener("abort", onAbort);
  return {
    signal: ac.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function sendDirect(req: BuiltRequest, opts: SendOptions): Promise<ResponseData> {
  const t = withTimeout(opts.signal, opts.timeoutMs ?? LIMITS.TIMEOUT_MS);
  const start = performance.now();
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      mode: "cors",
      redirect: "follow",
      cache: "no-store",
      credentials: "omit",
      signal: t.signal,
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const duration = performance.now() - start;
    return toResponseData(
      bytes,
      { status: res.status, statusText: res.statusText, headers: [...res.headers.entries()] },
      duration,
      "direct",
    );
  } catch (e) {
    if (opts.signal?.aborted) throw new CancelledError();
    if (t.timedOut()) throw new TimeoutError();
    throw e;
  } finally {
    t.done();
  }
}

async function sendViaProxy(req: BuiltRequest, opts: SendOptions): Promise<ResponseData> {
  const timeoutMs = opts.timeoutMs ?? LIMITS.TIMEOUT_MS;
  // client chờ lâu hơn server 2s để nhận được thông báo timeout từ server
  const t = withTimeout(opts.signal, timeoutMs + 2000);
  const start = performance.now();
  let res: Response;
  try {
    res = await fetch("/api/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.proxyToken ? { "x-proxy-token": opts.proxyToken } : {}),
      },
      body: JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body: req.body, timeoutMs }),
      signal: t.signal,
    });
  } catch {
    if (opts.signal?.aborted) throw new CancelledError();
    if (t.timedOut()) throw new TimeoutError();
    throw new Error("Không kết nối được proxy (/api/proxy). Server Next.js có đang chạy không?");
  } finally {
    t.done();
  }

  let result: ProxyResult;
  try {
    result = await res.json();
  } catch {
    throw new Error(`Proxy không khả dụng (HTTP ${res.status}). App có thể đang chạy trên static hosting.`);
  }
  const duration = performance.now() - start;
  if (!result.ok) throw new Error(result.error ?? "Proxy lỗi không rõ");

  return toResponseData(
    base64ToBytes(result.bodyBase64 ?? ""),
    { status: result.status ?? 0, statusText: result.statusText ?? "", headers: result.headers ?? [] },
    duration,
    "proxy",
  );
}

/** Lý do nên đi thẳng qua proxy, không cần thử direct. */
function proxyFirstReason(req: BuiltRequest): string | null {
  if (typeof window !== "undefined" && window.location.protocol === "https:" && req.url.startsWith("http:")) {
    return "mixed content";
  }
  const bad = req.headers.find(([k]) => FORBIDDEN.test(k));
  if (bad) return `header ${bad[0]}`;
  return null;
}

export async function sendRequest(req: BuiltRequest, opts: SendOptions): Promise<SendResult> {
  if (!req.url) {
    return { ok: false, error: { message: "Chưa nhập URL", hints: [], triedProxy: false } };
  }
  try {
    new URL(req.url);
  } catch {
    return { ok: false, error: { message: `URL không hợp lệ: ${req.url}`, hints: [], triedProxy: false } };
  }

  const errorOf = (e: unknown, triedProxy: boolean, hints: string[] = []): SendResult => {
    if (e instanceof CancelledError) return { ok: false, error: { message: "Đã hủy", hints: [], triedProxy } };
    if (e instanceof TimeoutError) {
      return { ok: false, error: { message: `Quá thời gian chờ (${(opts.timeoutMs ?? LIMITS.TIMEOUT_MS) / 1000}s)`, hints: [], triedProxy } };
    }
    return { ok: false, error: { message: (e as Error).message || String(e), hints, triedProxy } };
  };

  const goProxy = async (): Promise<SendResult> => {
    try {
      return { ok: true, data: await sendViaProxy(req, opts) };
    } catch (e) {
      return errorOf(e, true);
    }
  };

  if (opts.mode === "proxy") return goProxy();
  if (opts.mode === "auto" && proxyFirstReason(req)) return goProxy();

  try {
    return { ok: true, data: await sendDirect(req, opts) };
  } catch (e) {
    if (e instanceof CancelledError || e instanceof TimeoutError) return errorOf(e, false);
    if (opts.mode === "auto") return goProxy();
    return errorOf(new Error("Không gọi được API trực tiếp từ trình duyệt"), false, [
      ...DIRECT_HINTS,
      "Thử chuyển chế độ gửi sang Auto hoặc Proxy.",
    ]);
  }
}
