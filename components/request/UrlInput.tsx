"use client";

import { useRef } from "react";
import { segmentVars, type VarMap } from "@/lib/env-resolver";
import { looksLikeCurl } from "@/lib/curl";
import { cx } from "@/components/common/ui";

interface Props {
  value: string;
  vars: VarMap;
  onChange: (v: string) => void;
  onPasteCurl: (text: string) => void;
  onEnter: () => void;
}

/**
 * Ô URL có tô màu {{var}}:
 * input trong suốt nằm trên 1 lớp "mirror" hiển thị cùng nội dung có màu.
 * Hai lớp phải cùng font, padding và cuộn ngang cùng nhau.
 */
export default function UrlInput({ value, vars, onChange, onPasteCurl, onEnter }: Props) {
  const mirror = useRef<HTMLDivElement>(null);
  const segments = segmentVars(value, vars);
  const syncScroll = (el: HTMLInputElement) => {
    if (mirror.current) mirror.current.scrollLeft = el.scrollLeft;
  };

  const base = "absolute inset-0 px-3 font-mono text-[13px] leading-[38px] whitespace-pre";

  return (
    <div className="relative h-full min-w-0 flex-1">
      <div ref={mirror} aria-hidden className={cx(base, "pointer-events-none overflow-hidden")}>
        {segments.map((s, i) =>
          s.varName ? (
            <span
              key={i}
              className={cx("rounded-sm", s.known ? "bg-accent/15 text-accent" : "bg-err/15 text-err")}
            >
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
      <input
        autoFocus
        spellCheck={false}
        autoComplete="off"
        value={value}
        placeholder="Nhập URL hoặc dán lệnh cURL…"
        onChange={(e) => {
          onChange(e.target.value);
          syncScroll(e.target);
        }}
        onScroll={(e) => syncScroll(e.currentTarget)}
        onSelect={(e) => syncScroll(e.currentTarget)}
        onKeyDown={(e) => {
          // Enter (không kèm Ctrl -> Ctrl+Enter do phím tắt toàn cục xử lý)
          if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onEnter();
          }
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (looksLikeCurl(text)) {
            e.preventDefault();
            onPasteCurl(text);
            return;
          }
          // Dán URL nhiều dòng -> gộp lại 1 dòng
          if (/\r?\n/.test(text)) {
            e.preventDefault();
            const el = e.currentTarget;
            const clean = text.replace(/\s*\r?\n\s*/g, "").trim();
            const s = el.selectionStart ?? value.length;
            const en = el.selectionEnd ?? value.length;
            onChange(value.slice(0, s) + clean + value.slice(en));
          }
        }}
        className={cx(
          base,
          "w-full bg-transparent text-transparent caret-[var(--fg)] outline-none placeholder:text-muted",
          "selection:bg-accent/25 selection:text-transparent",
        )}
      />
    </div>
  );
}
