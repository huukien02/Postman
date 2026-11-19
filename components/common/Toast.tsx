"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { cx } from "./ui";

export default function Toast() {
  const notice = useStore((s) => s.notice);
  const [hiddenId, setHiddenId] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    // Có nút hành động (Hoàn tác) -> để lâu hơn cho kịp bấm
    const ms = notice.action ? 6000 : notice.tone === "info" ? 2200 : 4500;
    const t = setTimeout(() => setHiddenId(notice.id), ms);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice || hiddenId === notice.id) return null;
  return (
    <div
      role="status"
      className={cx(
        "fixed bottom-5 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-lg border bg-panel px-4 py-2 text-sm shadow-lg",
        notice.tone === "info" && "border-line",
        notice.tone === "warn" && "border-warn/50 text-warn",
        notice.tone === "error" && "border-err/50 text-err",
      )}
    >
      <span className="cursor-pointer" onClick={() => setHiddenId(notice.id)}>
        {notice.text}
      </span>
      {notice.action && (
        <button
          type="button"
          onClick={() => {
            notice.action!.run();
            setHiddenId(notice.id);
          }}
          className="font-medium text-accent hover:underline"
        >
          {notice.action.label}
        </button>
      )}
    </div>
  );
}
