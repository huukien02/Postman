"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Send, ServerCrash, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import type { ResponseData } from "@/lib/types";
import CodeView, { type CodeLang } from "@/components/common/CodeView";
import { Button, Kbd, Tabs, cx, formatBytes, formatMs } from "@/components/common/ui";

type Tab = "pretty" | "headers" | "preview";

export default function ResponsePanel() {
  const id = useStore((s) => s.activeRequestId);
  const rs = useStore((s) => (id ? s.responses[id] : undefined));
  const cancel = useStore((s) => s.cancel);

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-panel">
      {rs?.missingVars && rs.missingVars.length > 0 && (
        <div className="flex items-center gap-2 border-b border-line bg-warn/10 px-3 py-1.5 text-xs text-warn">
          <AlertTriangle size={13} />
          Biến chưa có giá trị nên được gửi nguyên văn: {rs.missingVars.map((v) => `{{${v}}}`).join(", ")}
        </div>
      )}

      {rs?.data ? (
        <ResponseView key={`${id}-${rs.data.duration}-${rs.data.size}`} data={rs.data} />
      ) : rs?.error && !rs.loading ? (
        <ErrorView message={rs.error.message} hints={rs.error.hints} triedProxy={rs.error.triedProxy} />
      ) : !rs?.loading ? (
        <EmptyView />
      ) : null}

      {/* Đang gửi: phủ lên response cũ (nếu có) */}
      {rs?.loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-panel/80 backdrop-blur-[1px]">
          <Loader2 className="animate-spin text-accent" size={26} />
          <span className="text-sm text-muted">Đang gửi…</span>
          <Button variant="outline" size="sm" onClick={() => cancel()}>
            <X size={13} /> Hủy
          </Button>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function EmptyView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
      <Send size={28} className="opacity-40" />
      <div className="space-y-2">
        <p>
          Nhập URL rồi bấm <Kbd>Enter</Kbd> hoặc <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd>
        </p>
        <p>Có lệnh cURL? Dán thẳng vào ô URL.</p>
      </div>
    </div>
  );
}

function ErrorView({ message, hints, triedProxy }: { message: string; hints: string[]; triedProxy: boolean }) {
  return (
    <div className="flex h-full items-start justify-center overflow-auto p-6">
      <div className="w-full max-w-lg rounded-lg border border-err/30 bg-err/5 p-4">
        <div className="flex items-center gap-2 font-medium text-err">
          <ServerCrash size={17} /> {message}
        </div>
        {triedProxy && <p className="mt-1 text-xs text-muted">Đã thử gọi qua proxy.</p>}
        {hints.length > 0 && (
          <>
            <p className="mt-3 text-xs text-muted">Có thể do:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
              {hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function statusTone(code: number) {
  if (code >= 200 && code < 300) return "bg-ok/15 text-ok";
  if (code >= 300 && code < 400) return "bg-accent/15 text-accent";
  if (code >= 400 && code < 500) return "bg-warn/15 text-warn";
  return "bg-err/15 text-err";
}

function langOf(ct: string): CodeLang {
  if (/json/i.test(ct)) return "json";
  if (/html|xml/i.test(ct)) return "html";
  return "text";
}

function ResponseView({ data }: { data: ResponseData }) {
  const isHtml = /html/i.test(data.contentType);
  const isImage = !!data.dataUrl;
  const [tab, setTab] = useState<Tab>(isImage ? "preview" : "pretty");
  const [copied, setCopied] = useState(false);

  // Pretty: thử parse JSON kể cả khi server không trả content-type json
  const pretty = useMemo(() => {
    const t = data.body.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return { text: JSON.stringify(JSON.parse(t), null, 2), lang: "json" as CodeLang };
      } catch {
        /* không phải JSON hợp lệ */
      }
    }
    return { text: data.body, lang: langOf(data.contentType) };
  }, [data.body, data.contentType]);

  const copy = async () => {
    await navigator.clipboard.writeText(pretty.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Thanh trạng thái */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
        <span className={cx("rounded px-2 py-0.5 font-mono text-[13px] font-semibold", statusTone(data.status))}>
          {data.status} {data.statusText}
        </span>
        <span
          className="text-muted"
          title={data.via === "proxy" ? "Đã gửi qua proxy của server Next.js" : "Đã gửi trực tiếp từ trình duyệt"}
        >
          {formatMs(data.duration)} · {formatBytes(data.size)}
        </span>
        {data.truncated && (
          <span className="text-warn">Response lớn, chỉ hiển thị {formatBytes(5 * 1024 * 1024)} đầu</span>
        )}
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          ...(isImage ? [] : [{ id: "pretty" as Tab, label: "Body" }]),
          { id: "headers", label: "Headers", count: data.headers.length },
          ...(isHtml || isImage ? [{ id: "preview" as Tab, label: "Xem trước" }] : []),
        ]}
        right={
          !isImage &&
          tab === "pretty" && (
            <Button size="sm" className="w-7 px-0" onClick={copy} title={copied ? "Đã copy" : "Copy body"}>
              {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1">
        {tab === "pretty" &&
          (data.body ? (
            <CodeView value={pretty.text} lang={pretty.lang} readOnly wrap={pretty.lang === "text"} />
          ) : (
            <p className="p-6 text-center text-sm text-muted">Response không có body.</p>
          ))}
        {tab === "headers" && (
          <div className="h-full overflow-auto px-3 py-2">
            <table className="w-full text-[13px]">
              <tbody>
                {data.headers.map(([k, v], i) => (
                  <tr key={i} className="border-t border-line align-top first:border-t-0">
                    <td className="w-[35%] py-1.5 pr-3 font-mono text-muted">{k}</td>
                    <td className="py-1.5 font-mono break-all">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.via === "direct" && (
              <p className="mt-3 text-xs text-muted">
                Gọi trực tiếp thì trình duyệt chỉ cho xem một số header. Muốn xem đầy đủ: Cài đặt → Chế độ gửi → Proxy.
              </p>
            )}
          </div>
        )}
        {tab === "preview" &&
          (isImage ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.dataUrl} alt="Response" className="max-h-full max-w-full" />
            </div>
          ) : (
            <iframe title="Preview" sandbox="" srcDoc={data.body} className="h-full w-full bg-white" />
          ))}
      </div>
    </div>
  );
}
