"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";

/**
 * Phím tắt toàn cục:
 *   Ctrl/Cmd+Enter  gửi request đang mở
 *   Ctrl/Cmd+S      (đã tự lưu) chặn hộp thoại "Save page" của trình duyệt
 *   Alt+N           request mới (Ctrl+N bị trình duyệt giữ, không chặn được)
 *   Ctrl/Cmd+K      tìm request / lệnh
 *   Ctrl/Cmd+B      ẩn/hiện sidebar
 *   Esc             hủy request đang gửi
 */
export function useGlobalHotkeys(extra?: (e: KeyboardEvent) => boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Ctrl+Enter luôn gửi, kể cả khi đang gõ trong CodeMirror (editor chỉ chặn hành vi mặc định)
      if (mod && e.key === "Enter") {
        e.preventDefault();
        void s.send();
        return;
      }
      // Các phím khác: editor đã xử lý (vd Esc đóng ô tìm kiếm) thì bỏ qua
      if (e.defaultPrevented) return;
      if (extra?.(e)) return;

      if (mod && key === "s") {
        e.preventDefault();
        s.notify("Đã tự động lưu, không cần bấm Ctrl+S");
      } else if (e.altKey && !mod && (key === "n" || e.code === "KeyN")) {
        e.preventDefault();
        s.newRequest();
      } else if (mod && key === "k") {
        e.preventDefault();
        s.setModal(s.modal === "palette" ? null : "palette");
      } else if (mod && key === "b") {
        e.preventDefault();
        s.toggleSidebar();
      } else if (e.key === "Escape") {
        const id = s.activeRequestId;
        if (id && s.responses[id]?.loading) s.cancel(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [extra]);
}
