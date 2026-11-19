"use client";

import { useEffect } from "react";
import { CloudOff, Loader2, PanelLeft, Settings } from "lucide-react";
import { useStore } from "@/store/useStore";
import { firebaseEnabled } from "@/lib/firebase-config";
import { useGlobalHotkeys } from "@/lib/hotkeys";
import RequestPanel from "@/components/request/RequestPanel";
import ResponsePanel from "@/components/response/ResponsePanel";
import Sidebar from "@/components/sidebar/Sidebar";
import EnvSelector from "@/components/env/EnvSelector";
import EnvManager from "@/components/env/EnvManager";
import CommandPalette from "@/components/common/CommandPalette";
import SettingsModal from "@/components/common/SettingsModal";
import SplitPane from "@/components/common/SplitPane";
import Toast from "@/components/common/Toast";
import { Button } from "@/components/common/ui";

export default function Home() {
  const hydrated = useStore((s) => s.hydrated);
  const cloud = useStore((s) => s.cloud);
  const layout = useStore((s) => s.layout);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const { toggleSidebar, setModal } = useStore.getState();
  useGlobalHotkeys();
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void useStore.persist.rehydrate()?.then(async () => {
      if (!firebaseEnabled || cancelled) return;
      // Tải Firebase SDK động: không cấu hình Firebase thì không tải
      const { startCloudSync } = await import("@/lib/cloud-sync");
      if (!cancelled) stop = startCloudSync();
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  if (cloud.status === "error") return <CloudError message={cloud.error ?? "Lỗi không rõ"} />;
  if (!hydrated || cloud.status === "connecting") {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-panel text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Đang tải dữ liệu…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <Button
          size="sm"
          className="h-8 w-8 px-0"
          onClick={toggleSidebar}
          title={sidebarOpen ? "Ẩn sidebar (Ctrl+B)" : "Hiện sidebar (Ctrl+B)"}
        >
          <PanelLeft size={16} />
        </Button>
        <AppIcon />
        <span className="text-sm font-semibold">Postman Mini</span>

        <div className="ml-auto flex items-center gap-1.5">
          <EnvSelector />
          <Button size="sm" className="h-8 w-8 px-0" onClick={() => setModal("settings")} title="Cài đặt">
            <Settings size={16} />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-h-0 min-w-0 flex-1">
          <SplitPane
            key={layout}
            direction={layout}
            initial={layout === "vertical" ? 0.45 : 0.5}
            first={<RequestPanel />}
            second={<ResponsePanel />}
          />
        </main>
      </div>

      <CommandPalette />
      <EnvManager />
      <SettingsModal />
      <Toast />
    </div>
  );
}

/** Không kết nối được Firestore: nói rõ lỗi + cách sửa. */
function CloudError({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-bg p-6">
      <div className="w-full max-w-lg space-y-3 rounded-xl border border-err/30 bg-panel p-5">
        <div className="flex items-center gap-2 font-medium text-err">
          <CloudOff size={18} /> Không kết nối được Firestore
        </div>
        <p className="text-sm">{message}</p>
        <p className="text-xs text-muted">
          Sửa xong thì tải lại trang. Muốn tạm dùng offline: để apiKey rỗng trong lib/firebase-config.ts (dữ liệu
          khi đó lưu trên trình duyệt).
        </p>
        <Button variant="outline" onClick={() => location.reload()}>
          Tải lại
        </Button>
      </div>
    </div>
  );
}

/** Logo nhỏ trên header, giống app/icon.svg (favicon). */
function AppIcon() {
  return (
    <svg viewBox="0 0 64 64" width="20" height="20" aria-hidden>
      <circle cx="32" cy="32" r="32" fill="#FF6C37" />
      <path d="M47 17 15 30.5l13 4.5 4.5 13z" fill="#fff" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
      <path d="M47 17 28 35" stroke="#FF6C37" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
