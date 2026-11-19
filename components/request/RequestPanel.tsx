"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CloudCheck, Laptop, Send, X } from "lucide-react";
import { checkUrl } from "@/lib/url-check";
import { firebaseEnabled } from "@/lib/firebase-config";
import { useStore, useActiveRequest } from "@/store/useStore";
import { findVars, toVarMap } from "@/lib/env-resolver";
import type { RequestItem } from "@/lib/types";
import { Button, Tabs, cx } from "@/components/common/ui";
import MethodSelect from "./MethodSelect";
import UrlInput from "./UrlInput";
import KeyValueEditor from "./KeyValueEditor";
import BodyEditor from "./BodyEditor";
import AuthEditor from "./AuthEditor";

type Tab = "params" | "headers" | "body" | "auth";

const HEADER_SUGGESTIONS = [
  "Accept", "Accept-Language", "Authorization", "Cache-Control", "Content-Type",
  "Cookie", "If-None-Match", "Origin", "User-Agent", "X-API-Key", "X-Request-ID",
];

export default function RequestPanel() {
  const req = useActiveRequest();
  if (!req) return null;
  // key: đổi request -> reset state cục bộ (tab đang chọn...)
  return <Panel key={req.id} req={req} />;
}

function Panel({ req }: { req: RequestItem }) {
  const s = useStore();
  const vars = toVarMap(s.envs.find((e) => e.id === s.activeEnvId)?.vars);
  const loading = s.responses[req.id]?.loading ?? false;
  const hasBody = req.bodyType === "form" ? req.form.length > 0 : req.body.trim() !== "";
  const [tab, setTab] = useState<Tab>(() => (hasBody ? "body" : "params"));

  // Chỉ báo biến THIẾU (biến có giá trị đã được tô xanh trong ô URL)
  const missing = findVars(
    [req.url, req.auth.type === "bearer" ? req.auth.token : "", ...req.headers.map((h) => h.key + h.value)].join(" "),
  ).filter((v) => !Object.prototype.hasOwnProperty.call(vars, v));

  // Kiểm tra link sai (khoảng trắng, http//, // thừa…). Chỉ báo khi ngừng gõ ~0,6s để không nhấp nháy lúc đang gõ dở.
  const [settledUrl, setSettledUrl] = useState(req.url);
  useEffect(() => {
    const t = setTimeout(() => setSettledUrl(req.url), 600);
    return () => clearTimeout(t);
  }, [req.url]);
  const urlCheck = useMemo(
    () => (settledUrl === req.url ? checkUrl(req.url) : { issues: [], fixed: null }),
    [settledUrl, req.url],
  );

  // Tab Auth chỉ hiện khi request đang dùng (vd từ dữ liệu cũ). Bình thường thêm header Authorization.
  const showAuth = req.auth.type !== "none";

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex gap-2 px-3 pt-3 pb-2">
        {firebaseEnabled && (
          <Button
            variant="outline"
            className={cx(
              // Cố định độ rộng (vừa chữ dài nhất "Trên máy") để bấm chuyển không làm ô URL xô lệch
              "h-10 w-[6.5rem] shrink-0 px-0 text-xs whitespace-nowrap",
              req.localOnly ? "border-warn/50 bg-warn/10 text-warn" : "border-ok/40 bg-ok/10 text-ok",
            )}
            onClick={() => {
              const localOnly = !req.localOnly;
              s.updateRequest(req.id, { localOnly });
              s.notify(localOnly ? "Request này chỉ lưu trên máy, không lên Firestore" : "Request này sẽ lưu lên Firestore");
            }}
            title={
              req.localOnly
                ? "Chỉ lưu trên máy (không lên Firestore). Bấm để lưu lên Firestore"
                : "Đang lưu lên Firestore. Bấm để chỉ lưu trên máy (test nháp)"
            }
          >
            {req.localOnly ? (
              <>
                <Laptop size={15} /> Trên máy
              </>
            ) : (
              <>
                <CloudCheck size={15} /> Cloud
              </>
            )}
          </Button>
        )}
        <div className="flex h-10 min-w-0 flex-1 items-stretch rounded-md border border-line bg-panel focus-within:border-accent">
          <MethodSelect value={req.method} onChange={(method) => s.updateRequest(req.id, { method })} />
          <UrlInput
            value={req.url}
            vars={vars}
            onChange={(url) => s.setUrl(req.id, url)}
            onPasteCurl={(text) => {
              if (s.applyCurl(req.id, text)) {
                const p = useStore.getState().requests.find((r) => r.id === req.id);
                setTab(p && (p.body.trim() || p.form.length) ? "body" : "headers");
              }
            }}
            onEnter={() => s.send(req.id)}
          />
        </div>
        {loading ? (
          <Button variant="outline" className="h-10 w-24" onClick={() => s.cancel(req.id)} title="Hủy (Esc)">
            <X size={15} /> Hủy
          </Button>
        ) : (
          <Button variant="primary" className="h-10 w-24" onClick={() => s.send(req.id)} title="Gửi (Enter / Ctrl+Enter)">
            <Send size={15} /> Gửi
          </Button>
        )}
      </div>

      {urlCheck.fixed && (
        <div className="flex items-center gap-2 px-3 pb-2 text-xs text-warn">
          <AlertTriangle size={13} className="shrink-0" />
          <span className="min-w-0 truncate" title={urlCheck.issues.join("\n")}>
            Link có vấn đề: {urlCheck.issues.join("; ")}
          </span>
          <button
            type="button"
            onClick={() => s.setUrl(req.id, urlCheck.fixed!)}
            title={`Sửa thành: ${urlCheck.fixed}`}
            className="shrink-0 rounded bg-accent px-2 py-0.5 text-accent-fg hover:opacity-90"
          >
            Sửa link
          </button>
        </div>
      )}
      {missing.length > 0 && (
        <p className="px-3 pb-2 text-xs text-err">
          Chưa có giá trị cho {missing.map((v) => `{{${v}}}`).join(", ")}. Chọn môi trường ở góc trên bên phải.
        </p>
      )}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "params", label: "Params", count: req.params.filter((p) => p.enabled && p.key).length },
          { id: "headers", label: "Headers", count: req.headers.filter((h) => h.enabled && h.key).length },
          { id: "body", label: "Body", dot: hasBody },
          ...(showAuth ? [{ id: "auth" as Tab, label: "Auth", dot: true }] : []),
        ]}
      />

      <div className="min-h-0 flex-1">
        {tab === "params" && (
          <KeyValueEditor rows={req.params} onChange={(p) => s.setParams(req.id, p)} separator="=" />
        )}
        {tab === "headers" && (
          <KeyValueEditor
            rows={req.headers}
            onChange={(headers) => s.updateRequest(req.id, { headers })}
            separator=":"
            keyPlaceholder="Header"
            suggestions={HEADER_SUGGESTIONS}
          />
        )}
        {tab === "body" && (
          <BodyEditor
            method={req.method}
            bodyType={req.bodyType}
            body={req.body}
            form={req.form}
            onChange={(patch) => {
              // Gõ body khi đang GET -> tự đổi sang POST (bớt 1 thao tác)
              const willHaveBody =
                (patch.body !== undefined && patch.body.trim() !== "") || (patch.form && patch.form.length > 0);
              const method = willHaveBody && req.method === "GET" ? "POST" : req.method;
              s.updateRequest(req.id, { ...patch, method });
            }}
          />
        )}
        {tab === "auth" && showAuth && (
          <AuthEditor
            auth={req.auth}
            hasAuthHeader={req.headers.some((h) => h.enabled && h.key.toLowerCase() === "authorization")}
            onChange={(auth) => s.updateRequest(req.id, { auth })}
          />
        )}
      </div>
    </section>
  );
}
