"use client";

import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { useStore } from "@/store/useStore";
import Modal from "./Modal";
import type { SendMode } from "@/lib/types";
import { firebaseEnabled } from "@/lib/firebase-config";
import { Button, Segmented } from "./ui";

export default function SettingsModal() {
  const open = useStore((s) => s.modal === "settings");
  const setModal = useStore((s) => s.setModal);
  return (
    <Modal open={open} onClose={() => setModal(null)} title="Cài đặt" className="max-w-lg">
      {open && <Body />}
    </Modal>
  );
}

function Body() {
  const s = useStore();
  const file = useRef<HTMLInputElement>(null);

  const exportFile = () => {
    const blob = new Blob([s.exportData()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `postman-mini-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6 overflow-auto p-4 text-sm">
      <section className="space-y-2">
        <h3 className="font-medium">Chế độ gửi</h3>
        <Segmented<SendMode>
          value={s.sendMode}
          onChange={s.setSendMode}
          options={[
            { id: "auto", label: "Tự động (nên dùng)" },
            { id: "direct", label: "Trực tiếp" },
            { id: "proxy", label: "Qua proxy" },
          ]}
        />
        <p className="text-xs text-muted">
          {s.sendMode === "auto" && "Gọi thẳng từ trình duyệt; nếu bị chặn (CORS, http, mạng nội bộ) thì tự gọi lại qua proxy."}
          {s.sendMode === "direct" && "Chỉ gọi từ trình duyệt. API không bật CORS sẽ lỗi."}
          {s.sendMode === "proxy" && "Luôn gọi qua server Next.js. Xem được đầy đủ response headers."}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Bố cục</h3>
        <Segmented<"vertical" | "horizontal">
          value={s.layout}
          onChange={s.setLayout}
          options={[
            { id: "vertical", label: "Response bên dưới" },
            { id: "horizontal", label: "Response bên phải" },
          ]}
        />
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Sao lưu / chuyển máy</h3>
        <p className="text-xs text-muted">
          {firebaseEnabled
            ? "Requests, collections, môi trường lưu trên Firestore (dùng chung mọi trình duyệt/máy); lịch sử lưu trên máy. "
            : "Dữ liệu chỉ lưu trên trình duyệt này. "}
          Export ra file JSON (requests, collections, môi trường) để sao lưu hoặc mang sang máy khác. Import sẽ gộp,
          bản trùng id được ghi đè.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportFile}>
            <Download size={14} /> Export
          </Button>
          <Button variant="outline" onClick={() => file.current?.click()}>
            <Upload size={14} /> Import
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) s.importData(await f.text());
            }}
          />
        </div>
        <p className="text-xs text-warn">File export có chứa token/biến môi trường, đừng chia sẻ công khai.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Proxy token</h3>
        <p className="text-xs text-muted">
          Chỉ cần nếu bạn đặt <code className="font-mono">PROXY_TOKEN</code> trong file{" "}
          <code className="font-mono">.env.local</code> để khóa proxy (khi deploy lên server). Chạy local thì để trống.
        </p>
        <input
          type="password"
          value={s.proxyToken}
          onChange={(e) => s.setProxyToken(e.target.value)}
          placeholder="Để trống nếu không dùng"
          className="h-9 w-full rounded-md border border-line bg-transparent px-3 font-mono text-[13px] outline-none focus:border-accent"
        />
      </section>

      <section className="space-y-1 text-xs text-muted">
        <h3 className="text-sm font-medium text-fg">Phím tắt</h3>
        <p>Ctrl+Enter: gửi · Enter trong ô URL: gửi · Esc: hủy request</p>
        <p>Ctrl+K: tìm · Alt+N: request mới · Ctrl+B: ẩn/hiện sidebar</p>
        <p>Dán lệnh cURL vào ô URL để nhập nhanh · Double-click tên trong sidebar để đổi tên</p>
        <p>Copy cURL, nhân bản, chuyển collection: nút ⋯ cạnh request trong sidebar</p>
      </section>
    </div>
  );
}
