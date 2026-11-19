"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { KeyValue } from "@/lib/types";
import { kv } from "@/lib/id";
import { cx } from "@/components/common/ui";

interface Props {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  /** Ký tự ngăn cách trong chế độ văn bản: ":" cho headers, "=" cho params/form. */
  separator?: ":" | "=";
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Gợi ý key (datalist), vd tên header phổ biến. */
  suggestions?: string[];
}

/* ---------- Văn bản <-> rows ---------- */
export function rowsToText(rows: KeyValue[], sep: string): string {
  return rows
    .filter((r) => r.key || r.value)
    .map((r) => `${r.enabled ? "" : "// "}${r.key}${sep === ":" ? ": " : "="}${r.value}`)
    .join("\n");
}

export function textToRows(text: string, sep: string, prev: KeyValue[]): KeyValue[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const disabled = line.startsWith("//");
      const body = disabled ? line.replace(/^\/\/\s*/, "") : line;
      const idx = body.indexOf(sep);
      const key = (idx < 0 ? body : body.slice(0, idx)).trim();
      const value = idx < 0 ? "" : body.slice(idx + 1).trim();
      return { ...(prev[i] ?? kv()), key, value, enabled: !disabled };
    });
}

/**
 * Bảng key-value tối giản:
 * - Không có dòng tiêu đề, không có nút "Thêm": dòng trống cuối gõ vào là thành dòng mới.
 * - Nút tắt/xóa chỉ hiện khi rê chuột vào dòng.
 */
export default function KeyValueEditor({
  rows,
  onChange,
  separator = "=",
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  suggestions,
}: Props) {
  const [asText, setAsText] = useState(false);
  const [text, setText] = useState("");
  const [ghost, setGhost] = useState(() => kv());

  /** Tab ở ô cuối -> về ô đầu; Shift+Tab ở ô đầu -> về ô cuối (đi vòng trong bảng). */
  const cycleTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const cells = [...e.currentTarget.querySelectorAll<HTMLInputElement>("input:not([type=checkbox])")];
    const i = cells.indexOf(e.target as HTMLInputElement);
    if (i < 0 || cells.length < 2) return;
    const wrapTo = !e.shiftKey && i === cells.length - 1 ? cells[0] : e.shiftKey && i === 0 ? cells.at(-1) : null;
    if (wrapTo) {
      e.preventDefault();
      wrapTo.focus();
      wrapTo.select();
    }
  };
  const listId = suggestions ? `kv-sugg-${ghost.id}` : undefined;

  const update = (id: string, patch: Partial<KeyValue>) => {
    if (id === ghost.id) {
      onChange([...rows, { ...ghost, ...patch }]);
      setGhost(kv());
    } else {
      onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    }
  };

  const toggleText = () => {
    if (!asText) setText(rowsToText(rows, separator));
    setAsText(!asText);
  };

  const input =
    "h-8 rounded bg-transparent px-2 font-mono text-[13px] outline-none placeholder:text-muted/50 focus:bg-subtle";

  return (
    <div className="flex h-full flex-col">
      {asText ? (
        <textarea
          autoFocus
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(textToRows(e.target.value, separator, rows));
          }}
          placeholder={separator === ":" ? "Content-Type: application/json\nAuthorization: Bearer {{token}}" : "page=1\nlimit=20"}
          className="mx-3 mt-2 min-h-24 flex-1 resize-none rounded-md border border-line bg-transparent p-2 font-mono text-[13px] outline-none focus:border-accent"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-3 pt-1" onKeyDown={cycleTab}>
          {listId && (
            <datalist id={listId}>
              {suggestions!.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
          {[...rows, ghost].map((r) => {
            const isGhost = r.id === ghost.id;
            return (
              <div key={r.id} className="group flex items-center gap-1 border-b border-line/60">
                <input
                  spellCheck={false}
                  list={listId}
                  value={r.key}
                  placeholder={isGhost ? keyPlaceholder : ""}
                  onChange={(e) => update(r.id, { key: e.target.value })}
                  onDoubleClick={(e) => e.currentTarget.select()}
                  className={cx(input, "w-[38%] shrink-0", !r.enabled && "text-muted line-through")}
                />
                <input
                  spellCheck={false}
                  value={r.value}
                  placeholder={isGhost ? valuePlaceholder : ""}
                  onChange={(e) => update(r.id, { value: e.target.value })}
                  // Double-click chọn cả ô (vd cả email), thay vì chỉ 1 từ
                  onDoubleClick={(e) => e.currentTarget.select()}
                  className={cx(input, "min-w-0 flex-1", !r.enabled && "text-muted line-through")}
                />
                {/* Nút tắt/xóa: chỉ hiện khi rê chuột. Dòng trống cũng render (ẩn) để các cột thẳng hàng. */}
                <div
                  className={cx(
                    "flex shrink-0 items-center gap-1",
                    isGhost ? "invisible" : r.enabled && "invisible group-hover:visible group-focus-within:visible",
                  )}
                >
                  {/* tabIndex -1: Tab chỉ đi key -> giá trị -> key dòng dưới (bỏ qua checkbox / nút xóa) */}
                  <input
                    type="checkbox"
                    tabIndex={-1}
                    title={r.enabled ? "Tạm tắt dòng này" : "Bật lại"}
                    className="accent-[var(--accent)]"
                    checked={r.enabled}
                    onChange={(e) => update(r.id, { enabled: e.target.checked })}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    title="Xóa dòng"
                    onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                    className="rounded p-1 text-muted hover:text-err"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="px-3 py-1.5 text-right">
        <button type="button" onClick={toggleText} className="text-[11px] text-muted hover:text-accent">
          {asText ? "Sửa dạng bảng" : "Sửa dạng văn bản"}
        </button>
      </div>
    </div>
  );
}
