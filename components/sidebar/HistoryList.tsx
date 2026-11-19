"use client";

import { History, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { shortPath } from "@/lib/url-params";
import type { HistoryItem } from "@/lib/types";
import { Button, MethodTag, cx } from "@/components/common/ui";

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
}

function statusClass(h: HistoryItem) {
  if (h.status === null) return "text-err";
  if (h.status < 300) return "text-ok";
  if (h.status < 400) return "text-accent";
  if (h.status < 500) return "text-warn";
  return "text-err";
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export default function HistoryList() {
  const history = useStore((s) => s.history);
  const openHistory = useStore((s) => s.openHistory);

  const clear = () => {
    const { history: prev, clearHistory, notify } = useStore.getState();
    clearHistory();
    notify(`Đã xóa ${prev.length} mục lịch sử`, "info", {
      label: "Hoàn tác",
      run: () => useStore.setState({ history: prev }),
    });
  };

  if (!history.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
        <History size={22} className="opacity-50" />
        Chưa có lịch sử. Mỗi lần gửi request sẽ được ghi lại ở đây.
      </div>
    );
  }

  // Nhóm theo ngày, giữ thứ tự mới nhất trước
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const h of history) {
    const label = dayLabel(h.at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(h);
    else groups.push({ label, items: [h] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted">
        <span>{history.length} lần gửi gần nhất</span>
        <Button size="sm" onClick={clear} title="Xóa toàn bộ lịch sử">
          <Trash2 size={13} /> Xóa
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-2 pt-2 pb-1 text-[11px] tracking-wide text-muted uppercase">{g.label}</div>
            {g.items.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => openHistory(h.id)}
                title={h.error ? `${h.resolvedUrl}\n${h.error}` : h.resolvedUrl}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-subtle"
              >
                <MethodTag method={h.request.method} className="w-9 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{shortPath(h.resolvedUrl) || h.resolvedUrl}</span>
                  <span className="block truncate text-[11px] text-muted">{hostOf(h.resolvedUrl)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className={cx("font-mono text-[11px] font-semibold", statusClass(h))}>{h.status ?? "LỖI"}</span>
                  <span className="text-[11px] text-muted">
                    {new Date(h.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
