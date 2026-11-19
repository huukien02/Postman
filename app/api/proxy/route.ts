import { METHODS, LIMITS, type ProxyPayload, type ProxyResult } from "@/lib/types";

/*
 * Proxy cho Postman Mini: browser không gọi trực tiếp được (CORS, mixed content,
 * API nội bộ) thì gửi qua đây, server Next.js gọi hộ.
 *
 * CẢNH BÁO: đây là proxy mở. Chỉ chạy local (npm run dev) hoặc deploy riêng tư.
 * Muốn khóa lại: đặt PROXY_TOKEN trong .env.local, client sẽ gửi header x-proxy-token.
 */

// Header do runtime tự quản lý, không chuyển tiếp.
const HOP_BY_HOP = new Set([
  "host", "connection", "content-length", "transfer-encoding", "keep-alive",
  "upgrade", "proxy-connection", "te", "trailer",
]);

const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

function fail(error: string, status = 200) {
  return Response.json({ ok: false, error } satisfies ProxyResult, { status });
}

export async function POST(request: Request) {
  const required = process.env.PROXY_TOKEN;
  if (required && request.headers.get("x-proxy-token") !== required) {
    return fail("Sai hoặc thiếu PROXY_TOKEN", 401);
  }

  let p: ProxyPayload;
  try {
    p = await request.json();
  } catch {
    return fail("Payload không hợp lệ", 400);
  }

  if (!(METHODS as readonly string[]).includes(p.method)) return fail(`Method không hỗ trợ: ${p.method}`, 400);

  let target: URL;
  try {
    target = new URL(p.url);
  } catch {
    return fail(`URL không hợp lệ: ${p.url}`);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return fail("Chỉ hỗ trợ http/https");
  }

  const headers = new Headers();
  for (const [k, v] of p.headers ?? []) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) {
      try {
        headers.append(k, v);
      } catch {
        return fail(`Header không hợp lệ: ${k}`);
      }
    }
  }

  const timeout = Math.min(p.timeoutMs ?? LIMITS.TIMEOUT_MS, 120_000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  // Client bấm Cancel -> hủy luôn request phía server
  request.signal.addEventListener("abort", () => ac.abort());

  try {
    const res = await fetch(target, {
      method: p.method,
      headers,
      body: p.method === "GET" || p.method === "HEAD" ? undefined : p.body,
      redirect: "follow",
      signal: ac.signal,
      cache: "no-store",
    });

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_RESPONSE_BYTES) {
      return fail(`Response quá lớn (${(buf.byteLength / 1048576).toFixed(1)}MB > 50MB)`);
    }

    // fetch của Node đã tự giải nén -> bỏ content-encoding/length để khỏi hiểu nhầm
    const resHeaders = [...res.headers.entries()].filter(
      ([k]) => k !== "content-encoding" && k !== "content-length",
    );

    return Response.json({
      ok: true,
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      bodyBase64: buf.toString("base64"),
    } satisfies ProxyResult);
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    if (err.name === "AbortError") {
      return fail(request.signal.aborted ? "Đã hủy" : `Quá thời gian chờ (${timeout / 1000}s)`);
    }
    const code = err.cause?.code;
    const detail =
      code === "ENOTFOUND" ? `Không tìm thấy tên miền ${target.hostname}` :
      code === "ECONNREFUSED" ? `Không kết nối được ${target.host} (server chưa chạy?)` :
      code === "ECONNRESET" ? "Kết nối bị ngắt giữa chừng" :
      code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" ? `Kết nối tới ${target.host} quá lâu` :
      code?.startsWith("CERT_") || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "SELF_SIGNED_CERT_IN_CHAIN"
        ? `Lỗi chứng chỉ SSL (${code})` :
      err.cause?.message ?? err.message;
    return fail(detail);
  } finally {
    clearTimeout(timer);
  }
}
