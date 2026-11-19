"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Columns2, Copy, FolderPlus, Layers, PanelLeft, Plus, Search, Settings, Settings2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import type { Method } from "@/lib/types";
import Modal from "./Modal";
import { Kbd, MethodTag, cx } from "./ui";

interface Item {
  id: string;
  title: string;
  sub?: string;
  method?: Method;
  icon?: ReactNode;
  group: "Requests" | "Lệnh";
  /** Chuỗi dùng để tìm (đã lowercase). */
  haystack: string;
  run: () => void;
}

/** Bỏ dấu tiếng Việt để gõ "moi truong" vẫn ra "Môi trường". */
const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

export default function CommandPalette() {
  const open = useStore((s) => s.modal === "palette");
  const setModal = useStore((s) => s.setModal);
  return (
    <Modal open={open} onClose={() => setModal(null)} top className="max-w-xl">
      {open && <Palette close={() => setModal(null)} />}
    </Modal>
  );
}

function Palette({ close }: { close: () => void }) {
  const s = useStore();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const all = useMemo<Item[]>(() => {
    const colName = new Map(s.collections.map((c) => [c.id, c.name]));
    const requests: Item[] = [...s.requests]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((r) => {
        const col = r.collectionId ? colName.get(r.collectionId) : undefined;
        return {
          id: `r-${r.id}`,
          title: r.name,
          sub: [col, r.url].filter(Boolean).join(" · "),
          method: r.method,
          group: "Requests",
          haystack: fold(`${r.name} ${r.method} ${r.url} ${col ?? ""}`),
          run: () => s.openRequest(r.id),
        };
      });

    const cmd = (id: string, title: string, icon: ReactNode, run: () => void, sub?: string): Item => ({
      id: `c-${id}`, title, sub, icon, group: "Lệnh", haystack: fold(`${title} ${sub ?? ""}`), run,
    });
    const commands: Item[] = [
      cmd("new", "Request mới", <Plus size={15} />, () => s.newRequest(), "Alt+N"),
      cmd("curl", "Copy request đang mở dạng cURL", <Copy size={15} />, () => void s.copyCurl()),
      cmd("col", "Collection mới", <FolderPlus size={15} />, () => s.createCollection()),
      ...s.envs
        .filter((e) => e.id !== s.activeEnvId)
        .map((e) => cmd(`env-${e.id}`, `Dùng môi trường: ${e.name}`, <Layers size={15} />, () => s.setActiveEnv(e.id))),
      cmd("envs", "Quản lý môi trường", <Settings2 size={15} />, () => s.setModal("env")),
      cmd("sidebar", "Ẩn/hiện sidebar", <PanelLeft size={15} />, () => s.toggleSidebar(), "Ctrl+B"),
      cmd("layout", "Đổi bố cục Request/Response", <Columns2 size={15} />, () =>
        s.setLayout(s.layout === "vertical" ? "horizontal" : "vertical"),
      ),
      cmd("settings", "Cài đặt, Export / Import", <Settings size={15} />, () => s.setModal("settings")),
    ];
    return [...requests, ...commands];
  }, [s]);

  const results = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) {
      // Chưa gõ gì: 8 request sửa gần nhất + các lệnh
      return [...all.filter((i) => i.group === "Requests").slice(0, 8), ...all.filter((i) => i.group === "Lệnh")];
    }
    return all
      .filter((i) => words.every((w) => i.haystack.includes(w)))
      .map((i) => ({ i, score: (fold(i.title).startsWith(words[0]) ? 2 : 0) + (fold(i.title).includes(words[0]) ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.i)
      .slice(0, 50);
  }, [all, q]);

  const current = Math.min(cursor, Math.max(0, results.length - 1));

  const runItem = (item: Item | undefined) => {
    if (!item) return;
    close();
    // Chạy sau khi đóng modal (vd mở modal khác)
    setTimeout(item.run, 0);
  };

  const move = (d: number) => {
    const next = (current + d + results.length) % Math.max(1, results.length);
    setCursor(next);
    list.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search size={16} className="text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              runItem(results[current]);
            }
          }}
          placeholder="Tìm request theo tên, URL… hoặc gõ lệnh"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>
      <div ref={list} className="max-h-[50vh] overflow-auto py-1">
        {results.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted">Không tìm thấy</div>}
        {results.map((item, idx) => {
          const header = results[idx - 1]?.group !== item.group ? item.group : null;
          return (
            <div key={item.id}>
              {header && (
                <div className="px-4 pt-2 pb-1 text-[11px] tracking-wide text-muted uppercase">{header}</div>
              )}
              <button
                type="button"
                data-idx={idx}
                onMouseMove={() => idx !== current && setCursor(idx)}
                onClick={() => runItem(item)}
                className={cx(
                  "flex w-full items-center gap-3 px-4 py-2 text-left",
                  idx === current && "bg-accent/10",
                )}
              >
                <span className="flex w-9 shrink-0 justify-center text-muted">
                  {item.method ? <MethodTag method={item.method} /> : item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{item.title}</span>
                  {item.sub && <span className="block truncate font-mono text-[11px] text-muted">{item.sub}</span>}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 border-t border-line px-4 py-2 text-[11px] text-muted">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> chọn</span>
        <span><Kbd>Enter</Kbd> mở</span>
        <span><Kbd>Esc</Kbd> đóng</span>
      </div>
    </>
  );
}
