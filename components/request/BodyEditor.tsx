"use client";

import { useMemo, useState } from "react";
import { fixAndFormatJson } from "@/lib/json-fix";
import { jsonToFormRows } from "@/lib/json-table";
import type { BodyType, KeyValue, Method } from "@/lib/types";
import CodeView from "@/components/common/CodeView";
import { cx } from "@/components/common/ui";
import { useStore } from "@/store/useStore";
import KeyValueEditor from "./KeyValueEditor";
import JsonTableEditor from "./JsonTableEditor";

interface Props {
  method: Method;
  bodyType: BodyType;
  body: string;
  form: KeyValue[];
  onChange: (patch: { bodyType?: BodyType; body?: string; form?: KeyValue[] }) => void;
}

/** Kiểm tra JSON, bỏ qua {{var}} đứng một mình làm giá trị (vd "id": {{id}}). */
function jsonError(text: string): string | null {
  if (!text.trim()) return null;
  try {
    JSON.parse(text.replace(/\{\{\s*[\w.-]+\s*\}\}/g, "0"));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** "… at position 4 (line 2 column 3)" -> "JSON sai cú pháp ở dòng 2, cột 3" */
function friendlyError(msg: string): string {
  const m = /line (\d+) column (\d+)/.exec(msg);
  return m ? `JSON sai cú pháp ở dòng ${m[1]}, cột ${m[2]}` : "JSON sai cú pháp";
}

const MODES: { id: Exclude<BodyType, "none">; label: string; title: string }[] = [
  { id: "json", label: "JSON", title: "application/json" },
  { id: "form", label: "Form", title: "application/x-www-form-urlencoded" },
  { id: "text", label: "Text", title: "text/plain (XML, văn bản thô…)" },
];

/**
 * Body: không có lựa chọn "None". Để trống = không gửi body.
 * Gõ vào là có body (method GET tự chuyển POST ở RequestPanel).
 */
export default function BodyEditor({ method, bodyType, body, form, onChange }: Props) {
  const mode: Exclude<BodyType, "none"> = bodyType === "none" ? "json" : bodyType;
  const err = useMemo(() => (mode === "json" ? jsonError(body) : null), [mode, body]);
  const noBody = (method === "GET" || method === "HEAD") && (mode === "form" ? form.length > 0 : body.trim() !== "");

  // Kết quả sau khi tự sửa lỗi + format. Nút chỉ hiện khi có gì để sửa/format (đỡ rối).
  const fixed = useMemo(() => (mode === "json" ? fixAndFormatJson(body) : null), [mode, body]);
  const canFix = fixed !== null && fixed !== body.trim();
  const [fixFailed, setFixFailed] = useState(false);

  // JSON: nhập dạng bảng (mặc định) hoặc code. Nhớ lựa chọn lần trước.
  const jsonView = useStore((s) => s.jsonView);
  const setJsonView = useStore((s) => s.setJsonView);
  const notify = useStore((s) => s.notify);
  const asTable = mode === "json" && jsonView === "table";

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-8 items-center gap-3 px-3 py-1 text-xs">
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.title}
              onClick={() => {
                // Sang Form khi form còn trống: tự điền từ payload JSON đang có
                if (m.id === "form" && mode !== "form" && !form.some((f) => f.key.trim())) {
                  const rows = jsonToFormRows(body);
                  if (rows?.length) {
                    onChange({ bodyType: "form", form: rows });
                    notify(`Đã điền ${rows.length} trường từ JSON`);
                    return;
                  }
                }
                onChange({ bodyType: m.id });
              }}
              className={cx(
                "rounded px-2.5 py-0.5 transition-colors",
                mode === m.id ? "bg-accent font-semibold text-accent-fg" : "text-muted hover:bg-subtle hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {err && !asTable && (
          <span className="truncate text-err" title={err}>
            {friendlyError(err)}
          </span>
        )}
        {noBody && <span className="text-warn">{method} không gửi body. Đổi method để gửi.</span>}
        {mode === "json" && !asTable && body.trim() && (err || canFix) && (
          <button
            type="button"
            onClick={() => {
              if (fixed) {
                setFixFailed(false);
                onChange({ bodyType: "json", body: fixed });
              } else {
                setFixFailed(true);
              }
            }}
            title="Tự thêm nháy kép cho key, sửa nháy đơn, dấu phẩy thừa/thiếu, bỏ comment… rồi format"
            className={cx(
              "ml-auto shrink-0 rounded px-2 py-0.5",
              err ? "bg-accent text-accent-fg hover:opacity-90" : "text-muted hover:text-accent",
            )}
          >
            {err ? "Sửa lỗi & Format" : "Format JSON"}
          </button>
        )}
        {fixFailed && err && !asTable && <span className="shrink-0 text-err">Không tự sửa được, xem lại cú pháp</span>}
        {mode === "json" && (
          <div className={cx("flex shrink-0 gap-1 border-l border-line pl-3", !(err || canFix) || asTable ? "ml-auto" : "")}>
            {(["table", "code"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  // Sang bảng: sửa lỗi + format trước (nếu được) để bảng đọc được
                  if (v === "table" && err && fixed) onChange({ bodyType: "json", body: fixed });
                  setJsonView(v);
                }}
                title={v === "table" ? "Nhập từng dòng key - giá trị, không cần gõ nháy kép/dấu phẩy" : "Sửa trực tiếp JSON"}
                className={cx(
                  "rounded px-2 py-0.5",
                  jsonView === v ? "bg-accent font-semibold text-accent-fg" : "text-muted hover:bg-subtle hover:text-fg",
                )}
              >
                {v === "table" ? "Bảng" : "Code"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {mode === "form" ? (
          <KeyValueEditor rows={form} onChange={(f) => onChange({ bodyType: "form", form: f })} separator="=" />
        ) : asTable ? (
          <JsonTableEditor
            key={jsonView}
            body={body}
            onChange={(b) => onChange({ bodyType: "json", body: b })}
            onNeedCode={() => setJsonView("code")}
          />
        ) : (
          <div className="mx-3 mb-3 h-[calc(100%-0.75rem)] overflow-hidden rounded-md border border-line">
            <CodeView
              value={body}
              onChange={(v) => onChange({ bodyType: mode, body: v })}
              lang={mode === "json" ? "json" : "text"}
              placeholder={mode === "json" ? "Để trống nếu không gửi body. Dán JSON vào đây…" : "Nội dung…"}
              wrap={mode === "text"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
