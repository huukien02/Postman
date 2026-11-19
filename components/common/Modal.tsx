"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Đặt modal sát phía trên (kiểu command palette). */
  top?: boolean;
}

export default function Modal({ open, onClose, title, children, className, top }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={cx("fixed inset-0 z-40 flex justify-center bg-black/40 p-4", top ? "items-start pt-[12vh]" : "items-center")}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        className={cx("flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl", className)}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button type="button" aria-label="Đóng" onClick={onClose} className="rounded p-1 text-muted hover:bg-subtle hover:text-fg">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
