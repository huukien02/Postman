"use client";

import { useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

interface Props {
  direction: "vertical" | "horizontal";
  first: ReactNode;
  second: ReactNode;
  /** Tỉ lệ ban đầu của phần đầu (0..1). */
  initial?: number;
}

/** Chia 2 khung, kéo thanh giữa để đổi kích thước. Double-click để về mặc định. */
export default function SplitPane({ direction, first, second, initial = 0.45 }: Props) {
  const [ratio, setRatio] = useState(initial);
  const box = useRef<HTMLDivElement>(null);
  const vertical = direction === "vertical";

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const r = vertical ? (ev.clientY - rect.top) / rect.height : (ev.clientX - rect.left) / rect.width;
      setRatio(Math.min(0.85, Math.max(0.15, r)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div ref={box} className={cx("flex h-full min-h-0 min-w-0", vertical ? "flex-col" : "flex-row")}>
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flexBasis: `${ratio * 100}%`, flexShrink: 0 }}>
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={vertical ? "horizontal" : "vertical"}
        onPointerDown={onPointerDown}
        onDoubleClick={() => setRatio(initial)}
        className={cx(
          "group relative shrink-0 bg-line",
          vertical ? "h-px cursor-row-resize" : "w-px cursor-col-resize",
        )}
      >
        {/* vùng bắt chuột rộng hơn đường kẻ */}
        <div className={cx("absolute z-10 group-hover:bg-accent/40", vertical ? "inset-x-0 -inset-y-1" : "inset-y-0 -inset-x-1")} />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{second}</div>
    </div>
  );
}
