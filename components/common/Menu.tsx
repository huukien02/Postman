"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  /** Tiêu đề nhóm (không bấm được). */
  header?: boolean;
}

type Pos = { top?: number; bottom?: number; left?: number; right?: number };

/** Vị trí menu mở bằng chuột phải: tại con trỏ, lật lên/sang trái nếu sát mép màn hình. */
function posAtPoint(x: number, y: number): Pos {
  const v: Pos = y + 260 > window.innerHeight ? { bottom: window.innerHeight - y } : { top: y };
  return x + 200 > window.innerWidth ? { ...v, right: window.innerWidth - x } : { ...v, left: x };
}

/**
 * Menu thả xuống đơn giản: bấm ra ngoài hoặc Esc để đóng.
 * Mở bằng nút (trigger) hoặc chuột phải (truyền `contextPoint` = toạ độ chuột).
 */
export default function Menu({
  trigger,
  items,
  align = "right",
  contextPoint,
  onContextClose,
}: {
  trigger: (props: { onClick: (e: React.MouseEvent) => void; open: boolean }) => ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  contextPoint?: { x: number; y: number } | null;
  onContextClose?: () => void;
}) {
  const [btnPos, setBtnPos] = useState<Pos | null>(null);
  const pos = contextPoint ? posAtPoint(contextPoint.x, contextPoint.y) : btnPos;
  const open = pos !== null;
  // Đóng cả 2 kiểu mở (nút và chuột phải)
  const setPos = (p: null) => {
    setBtnPos(p);
    onContextClose?.();
  };
  const openAt = (r: DOMRect) => {
    // fixed để không bị cắt bởi khung cuộn (sidebar); lật lên trên nếu sát đáy màn hình
    const vertical: Pos =
      r.bottom + 240 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 };
    onContextClose?.();
    setBtnPos(align === "right" ? { ...vertical, right: window.innerWidth - r.right } : { ...vertical, left: r.left });
  };
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setPos(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPos(null);
      }
    };
    const onScroll = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setPos(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPos chỉ gọi setState + callback đóng
  }, [open]);

  return (
    <div ref={box} className="relative">
      {trigger({
        open,
        onClick: (e) => {
          e.stopPropagation();
          if (open) setPos(null);
          else openAt((e.currentTarget as HTMLElement).getBoundingClientRect());
        },
      })}
      {pos && (
        <div
          style={pos}
          className="fixed z-50 max-h-80 min-w-44 overflow-auto rounded-lg border border-line bg-panel py-1 shadow-xl"
        >
          {items.map((it, i) =>
            it.header ? (
              <div key={i} className="px-3 pt-2 pb-1 text-[11px] tracking-wide text-muted uppercase">
                {it.label}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPos(null);
                  it.onClick();
                }}
                className={cx(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-subtle",
                  it.danger ? "text-err" : "text-fg",
                )}
              >
                {it.icon && <span className="text-muted">{it.icon}</span>}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
