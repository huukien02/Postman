"use client";

import { useRef, useState } from "react";

/** Ô sửa tên tại chỗ: Enter/blur = lưu, Esc = hủy. */
export default function InlineRename({ value, onDone }: { value: string; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(value);
  // Chỉ gọi onDone 1 lần (Esc rồi blur khi bị gỡ khỏi DOM không được lưu đè)
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      value={v}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(v);
        if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      className="h-6 min-w-0 flex-1 rounded border border-accent bg-panel px-1 text-[13px] outline-none"
    />
  );
}
