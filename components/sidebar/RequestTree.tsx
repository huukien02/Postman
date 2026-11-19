"use client";

import { createContext, useContext, useRef, useState, type DragEvent } from "react";
import {
  ChevronRight, Copy, CopyPlus, Laptop, Folder, FolderInput, FolderOpen, FolderPlus, Loader2, MoreHorizontal,
  Pencil, Plus, Search, Trash2,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { firebaseEnabled } from "@/lib/firebase-config";
import type { Collection, RequestItem } from "@/lib/types";
import Menu, { type MenuItem } from "@/components/common/Menu";
import { Button, MethodTag, cx } from "@/components/common/ui";
import InlineRename from "./InlineRename";

/* ------------------------------------------------------------------ */
/* Kéo-thả request giữa các collection                                  */
/* ------------------------------------------------------------------ */

const DRAG_TYPE = "application/x-postman-mini-request";

/** Request đang được kéo (để các vùng thả biết có hiện/sáng lên không). */
const DragCtx = createContext<{
  dragging: RequestItem | null;
  setDragging: (r: RequestItem | null) => void;
}>({ dragging: null, setDragging: () => {} });

/**
 * Biến 1 phần tử thành vùng thả request.
 * `accept(r)` = request này có thả vào đây được không (vd không thả vào chính collection đang chứa nó).
 */
function useDropZone(accept: (r: RequestItem) => boolean, onDrop: (r: RequestItem) => void) {
  const { dragging, setDragging } = useContext(DragCtx);
  // Đếm enter/leave: đi qua phần tử con không làm mất trạng thái "đang ở trên"
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const ok = !!dragging && accept(dragging);

  const props = {
    onDragEnter: (e: DragEvent) => {
      if (!ok) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!ok) return;
      e.preventDefault(); // bắt buộc để cho phép thả
      e.dataTransfer.dropEffect = "move";
    },
    onDragLeave: () => {
      if (!ok) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      depth.current = 0;
      setOver(false);
      if (!ok || !dragging) return;
      e.preventDefault();
      e.stopPropagation();
      onDrop(dragging);
      setDragging(null);
    },
  };
  return { props, over: ok && over, active: ok };
}

export default function RequestTree() {
  const [dragging, setDragging] = useState<RequestItem | null>(null);
  return (
    <DragCtx.Provider value={{ dragging, setDragging }}>
      <Tree />
    </DragCtx.Provider>
  );
}

function Tree() {
  const requests = useStore((s) => s.requests);
  const collections = useStore((s) => s.collections);
  const newRequest = useStore((s) => s.newRequest);
  const createCollection = useStore((s) => s.createCollection);
  const setModal = useStore((s) => s.setModal);
  const [renamingCol, setRenamingCol] = useState<string | null>(null);

  /** Tạo collection mới, chuyển request vào, rồi cho đặt tên ngay. */
  const newCollectionFor = (requestId: string) => {
    const id = createCollection();
    useStore.getState().moveRequest(requestId, id);
    setRenamingCol(id);
  };

  const loose = requests.filter((r) => !r.collectionId || !collections.some((c) => c.id === r.collectionId));
  const { dragging } = useContext(DragCtx);
  const inCollection = (r: RequestItem) => !!r.collectionId && collections.some((c) => c.id === r.collectionId);

  // Thả ra ngoài (bỏ khỏi collection)
  const looseZone = useDropZone(inCollection, (r) => {
    useStore.getState().moveRequest(r.id, null);
    useStore.getState().notify(`Đã bỏ "${r.name}" khỏi collection`);
  });
  // Thả để tạo collection mới
  const newColZone = useDropZone(() => true, (r) => newCollectionFor(r.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          onClick={() => setModal("palette")}
          title="Tìm (Ctrl+K)"
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line px-2 text-[13px] text-muted hover:border-accent/50 hover:text-fg"
        >
          <Search size={14} />
          <span className="flex-1 truncate text-left">Tìm…</span>
        </button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 shrink-0 px-0"
          title="Collection mới"
          onClick={() => setRenamingCol(createCollection())}
        >
          <FolderPlus size={15} />
        </Button>
        <Button variant="outline" size="sm" className="h-8 shrink-0 px-2.5" title="Request mới (Alt+N)" onClick={() => newRequest()}>
          <Plus size={15} /> Mới
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {collections.map((c) => (
          <CollectionNode
            key={c.id}
            col={c}
            items={requests.filter((r) => r.collectionId === c.id)}
            renaming={renamingCol === c.id}
            onRenameStart={() => setRenamingCol(c.id)}
            onRenameEnd={() => setRenamingCol(null)}
          />
        ))}

        {/* Vùng "chưa phân loại": thả vào đây = bỏ khỏi collection */}
        <div {...looseZone.props} className={cx("rounded-md", looseZone.over && "bg-accent/10 ring-1 ring-accent")}>
          {collections.length > 0 && loose.length > 0 && (
            <div className="px-2 pt-3 pb-1 text-[11px] tracking-wide text-muted uppercase">Chưa phân loại</div>
          )}
          {loose.map((r) => (
            <RequestRow key={r.id} req={r} />
          ))}
          {looseZone.active && (
            <DropHint over={looseZone.over} icon={<FolderInput size={14} />}>
              Thả vào đây để bỏ khỏi collection
            </DropHint>
          )}
        </div>

        {dragging && (
          <div {...newColZone.props} className="mt-1">
            <DropHint over={newColZone.over} icon={<FolderPlus size={14} />}>
              Thả vào đây để tạo collection mới
            </DropHint>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ô gạch đứt chỉ hiện khi đang kéo. */
function DropHint({ over, icon, children }: { over: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className={cx(
        "pointer-events-none mx-1 my-1 flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs",
        over ? "border-accent bg-accent/10 text-accent" : "border-line text-muted",
      )}
    >
      {icon}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CollectionNode({
  col,
  items,
  renaming,
  onRenameStart,
  onRenameEnd,
}: {
  col: Collection;
  items: RequestItem[];
  renaming: boolean;
  onRenameStart: () => void;
  onRenameEnd: () => void;
}) {
  const s = useStore();
  const open = !col.collapsed;
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  // Thả request (từ ngoài hoặc từ collection khác) vào collection này
  const zone = useDropZone(
    (r) => r.collectionId !== col.id,
    (r) => {
      s.moveRequest(r.id, col.id);
      if (col.collapsed) s.toggleCollection(col.id); // mở ra để thấy request vừa thả
      s.notify(`Đã chuyển "${r.name}" vào ${col.name}`);
    },
  );

  return (
    <div {...zone.props} className={cx("mb-0.5 rounded-md", zone.over && "bg-accent/10 ring-1 ring-accent")}>
      <div
        onClick={() => !renaming && s.toggleCollection(col.id)}
        onDoubleClick={onRenameStart}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({ x: e.clientX, y: e.clientY });
        }}
        className="group flex h-8 cursor-pointer items-center gap-1 rounded-md px-1.5 hover:bg-subtle"
      >
        <ChevronRight size={14} className={cx("shrink-0 text-muted transition-transform", open && "rotate-90")} />
        {open ? <FolderOpen size={15} className="shrink-0 text-muted" /> : <Folder size={15} className="shrink-0 text-muted" />}
        {renaming ? (
          <InlineRename
            value={col.name}
            onDone={(name) => {
              if (name !== null) s.renameCollection(col.id, name);
              onRenameEnd();
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{col.name}</span>
        )}
        <span className="text-[11px] text-muted group-hover:hidden">{items.length || ""}</span>
        <button
          type="button"
          title="Thêm request vào collection"
          onClick={(e) => {
            e.stopPropagation();
            if (col.collapsed) s.toggleCollection(col.id);
            s.newRequest(col.id);
          }}
          className="hidden rounded p-0.5 text-muted group-hover:block hover:text-fg"
        >
          <Plus size={14} />
        </button>
        <Menu
          contextPoint={ctx}
          onContextClose={() => setCtx(null)}
          trigger={({ onClick, open: menuOpen }) => (
            <button
              type="button"
              aria-label="Tùy chọn collection"
              onClick={onClick}
              className={cx("rounded p-0.5 text-muted hover:text-fg", menuOpen ? "block" : "hidden group-hover:block")}
            >
              <MoreHorizontal size={14} />
            </button>
          )}
          items={[
            { label: "Đổi tên", icon: <Pencil size={13} />, onClick: onRenameStart },
            {
              label: "Xóa collection (giữ request)",
              icon: <Trash2 size={13} />,
              danger: true,
              onClick: () => {
                s.deleteCollection(col.id);
                s.notify(`Đã xóa collection "${col.name}", ${items.length} request chuyển ra ngoài`);
              },
            },
          ]}
        />
      </div>
      {open && (
        <div className="ml-3 border-l border-line pl-1">
          {items.map((r) => (
            <RequestRow key={r.id} req={r} />
          ))}
          {items.length === 0 && <div className="px-2 py-1 text-xs text-muted">Trống</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RequestRow({ req }: { req: RequestItem }) {
  const active = useStore((s) => s.activeRequestId === req.id);
  const loading = useStore((s) => s.responses[req.id]?.loading ?? false);
  const renaming = useStore((s) => s.renamingId === req.id);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const collections = useStore((s) => s.collections);
  const { openRequest, setRenaming, renameRequest, duplicateRequest, deleteRequest, moveRequest, copyCurl } =
    useStore.getState();
  const { dragging, setDragging } = useContext(DragCtx);

  // Chuyển nhanh sang collection có sẵn (tạo mới / bỏ ra ngoài: dùng nút trên thanh tìm kiếm hoặc kéo-thả)
  const others = collections.filter((c) => c.id !== req.collectionId);
  const moveItems: MenuItem[] = others.length
    ? [
        { header: true, label: "Chuyển tới", onClick: () => {} },
        ...others.map((c) => ({ label: c.name, icon: <Folder size={13} />, onClick: () => moveRequest(req.id, c.id) })),
      ]
    : [];

  return (
    <div
      onClick={() => openRequest(req.id)}
      onDoubleClick={() => setRenaming(req.id)}
      onContextMenu={(e) => {
        // Chuột phải: mở menu ngay tại con trỏ (giống bấm ⋯)
        e.preventDefault();
        setCtx({ x: e.clientX, y: e.clientY });
      }}
      // Kéo-thả sang collection khác / ra ngoài
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, req.id);
        e.dataTransfer.effectAllowed = "move";
        // Đợi trình duyệt chụp ảnh kéo xong rồi mới đổi state (tránh ảnh kéo bị mờ)
        requestAnimationFrame(() => setDragging(req));
      }}
      onDragEnd={() => setDragging(null)}
      title={req.url || undefined}
      className={cx(
        "group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2",
        active ? "bg-accent/10" : "hover:bg-subtle",
        dragging?.id === req.id && "opacity-40",
      )}
    >
      <MethodTag method={req.method} className="w-9 shrink-0" />
      {renaming ? (
        <InlineRename
          value={req.name}
          onDone={(name) => {
            if (name !== null && name !== req.name) renameRequest(req.id, name);
            setRenaming(null);
          }}
        />
      ) : (
        <span className={cx("min-w-0 flex-1 truncate text-[13px]", active && "font-medium")}>{req.name}</span>
      )}
      {req.localOnly && firebaseEnabled && (
        <span title="Chỉ lưu trên máy, không lên Firestore" className="shrink-0 text-warn">
          <Laptop size={13} />
        </span>
      )}
      {loading && <Loader2 size={13} className="shrink-0 animate-spin text-muted" />}
      <Menu
        contextPoint={ctx}
        onContextClose={() => setCtx(null)}
        trigger={({ onClick, open }) => (
          <button
            type="button"
            aria-label="Tùy chọn request"
            onClick={onClick}
            className={cx("rounded p-0.5 text-muted hover:text-fg", open ? "block" : "hidden group-hover:block")}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
        items={[
          { label: "Đổi tên", icon: <Pencil size={13} />, onClick: () => setRenaming(req.id) },
          { label: "Nhân bản", icon: <CopyPlus size={13} />, onClick: () => duplicateRequest(req.id) },
          { label: "Copy dạng cURL", icon: <Copy size={13} />, onClick: () => void copyCurl(req.id) },
          ...moveItems,
          { label: "Xóa", icon: <Trash2 size={13} />, danger: true, onClick: () => deleteRequest(req.id) },
        ]}
      />
    </div>
  );
}
